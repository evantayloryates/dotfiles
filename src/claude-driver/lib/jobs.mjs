// Cross-harness jobs survive MCP disconnects. Idempotency prevents replay,
// including after a worker crash; waiting never implicitly cancels an op.
import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DriverError, sleep } from './paths.mjs'
import { STATE_DIR, ensureDir, readJson, redactArgs, withLock, writeJsonAtomic } from './state.mjs'
import {RUNTIME_BUILD} from './build.mjs'

export const JOB_DIR = join(STATE_DIR, 'jobs')
export const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'outcome_unknown', 'handed_back', 'unverified'])
const EXCLUDED = new Set(['driver_submit', 'driver_job', 'driver_wait', 'driver_cancel', 'driver_request', 'driver_memory_record', 'driver_memory_query', 'delete_sessions', 'archive_project'])
export const jobFile = id => {
  if (!/^j[a-f0-9]{32}$/.test(id || '')) throw new DriverError('invalid job id', { category: 'bad_args' })
  return join(JOB_DIR, `${id}.json`)
}
const canonical = x => Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])) : x
export const lockedJob = (id, fn) => withLock(`job-${id}`, fn, { timeoutMs: 5000 })
function alive(pid) { try { process.kill(pid, 0); return true } catch (e) { return e.code !== 'ESRCH' } }
export async function submitJob({ operation, arguments: args = {}, idempotency_key, timeout_sec = 180 }, ctx = {}) {
  const { OPS, validateOp } = await import('./driver.mjs')
  const { callerHostSession, resolveSession } = await import('./sessions.mjs')
  const op = OPS.find(o => o.name === operation)
  if (!op || EXCLUDED.has(operation)) throw new DriverError('operation is not submit-capable', { category: 'bad_args' })
  validateOp(operation, args)
  const fingerprint = createHash('sha256').update(JSON.stringify(canonical({ operation, args, timeout_sec }))).digest('hex')
  const key = idempotency_key || randomUUID()
  if (typeof key !== 'string' || !key.length || key.length > 200) throw new DriverError('idempotency_key must be 1–200 characters', { category: 'bad_args' })
  const index = join(ensureDir(join(JOB_DIR, 'keys')), `${createHash('sha256').update(key).digest('hex')}.json`)
  return withLock('job-submit', async () => {
    const old = readJson(index, null)
    if (old) {
      if (old.fingerprint !== fingerprint) throw new DriverError('idempotency key already belongs to different arguments', { category: 'idempotency_conflict' })
      return { ...(await inspectJob(old.jobId)), reused: true }
    }
    const id = `j${randomUUID().replaceAll('-', '')}`
    // Resolve mutable titles and "self" once at submission. An idempotent
    // reattach uses the original fingerprint and does not re-resolve aliases.
    const boundArgs = { ...args }
    if (typeof boundArgs.session === 'string') boundArgs.session = resolveSession(boundArgs.session).sessionId
    if (Array.isArray(boundArgs.sessions)) boundArgs.sessions = boundArgs.sessions.map(s => resolveSession(s).sessionId)
    const callerSession = callerHostSession()
    const job = { id, operation, args: boundArgs, callerSession, fingerprint, runtimeBuild:RUNTIME_BUILD, harness: ctx.harness || 'cli', state: 'queued', createdAt: Date.now(), expiresAt: Date.now() + timeout_sec * 1000 }
    writeJsonAtomic(jobFile(id), job)
    writeJsonAtomic(index, { jobId: id, fingerprint })
    const child = spawn(process.execPath, [fileURLToPath(new URL('../scripts/job-worker.mjs', import.meta.url)), id], {
      detached: true, stdio: 'ignore', env: { ...process.env, CLAUDE_DRIVER_CALLER_SESSION: callerSession || '', CLAUDE_CODE_ENTRYPOINT: '', CLAUDE_DRIVER_STATE_DIR: STATE_DIR },
    })
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject) }).catch(err => {
      writeJsonAtomic(jobFile(id), { ...job, state: 'failed', error: { category: 'worker_start_failed', message: err.message }, finishedAt: Date.now() })
      throw err
    })
    // Never overwrite a worker's first transition with its parent's queued state.
    await lockedJob(id, () => { const current = readJson(jobFile(id), job); writeJsonAtomic(jobFile(id), { ...current, workerPid: current.workerPid??child.pid }) })
    child.unref()
    return { jobId: id, operation, state: 'queued', reused: false }
  }, { signal: ctx.signal })
}
export async function inspectJob(id, { includeResult = false } = {}) {
  return lockedJob(id, () => {
    let j = readJson(jobFile(id), null)
    if (!j) throw new DriverError('job not found', { category: 'not_found' })
    // A dead/abandoned worker is never restarted automatically: its op could
    // have landed before it persisted the outcome. A delayed startup is safe
    // only until its own expiry; the worker checks state before doing anything.
    if (!TERMINAL.has(j.state) && ((j.workerPid && !alive(j.workerPid)) || Date.now() > j.expiresAt + 5000)) {
      j = { ...j, state: j.startedAt ? 'outcome_unknown' : 'cancelled', finishedAt: Date.now(), error: { category: 'worker_lost', message: 'worker lost; reconcile before resubmitting' } }
      writeJsonAtomic(jobFile(id), j)
    }
    return { jobId: id, operation: j.operation, state: j.state, runtimeBuild:j.runtimeBuild, args: redactArgs(j.args), createdAt: j.createdAt, startedAt: j.startedAt, finishedAt: j.finishedAt,
      cancelRequested: !!j.cancelRequestedAt, progress: j.progress || [], error: j.error,
      ...(includeResult && j.result !== undefined ? { result: j.result } : {}) }
  })
}
export async function cancelJob(id) {
  await lockedJob(id, () => {
    const j = readJson(jobFile(id), null)
    if (!j) throw new DriverError('job not found', { category: 'not_found' })
    if (TERMINAL.has(j.state)) return
    writeJsonAtomic(jobFile(id), { ...j, cancelRequestedAt: Date.now(), ...(j.state === 'queued' ? { state: 'cancelled', finishedAt: Date.now() } : {}) })
  })
  return inspectJob(id)
}
export async function waitJob(id, { timeoutSec = 30, includeResult = true, signal } = {}) {
  const end = Date.now() + timeoutSec * 1000
  for (;;) {
    if (signal?.aborted) throw new DriverError('wait cancelled; job still exists', { category: 'cancelled' })
    const j = await inspectJob(id, { includeResult })
    if (TERMINAL.has(j.state) || Date.now() >= end) return j
    await sleep(200)
  }
}
