// Background jobs. A job is a directory in the scope's job store; a detached
// worker process does the work and outlives whoever started it. Tested
// properties this layout keeps (2026-10-01): survives its parent exiting and
// repeated SIGKILLs with nothing lost or duplicated, recovers a torn last
// line, and only one of several racing workers runs.
//
//   job.json      what to do (immutable)
//   input.jsonl   the items, normalised, one per line
//   results.jsonl one line per finished item, appended (first line per item wins)
//   state.json    status, progress, heartbeat (rewritten atomically)
//   lock          {pid, token} of the running worker (created exclusively)
//   cancel        present when a cancel was requested
//   worker.log    the worker's own output

import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { closeSync, existsSync, ftruncateSync, fstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JOBS_DIR, RETENTION_DAYS, SCOPE } from './paths.mjs'
import { UserError } from './taxonomy.mjs'
import { clip } from './text.mjs'
import { pruneCache } from './cache.mjs'

export const MAX_RESUMES = 3
const STALE_HEARTBEAT_MS = 15_000
const ID = /^cls_[0-9a-f]{8}$/

export const jobDir = (id) => join(JOBS_DIR, id)

export function newJobId() {
  for (;;) {
    const id = `cls_${randomBytes(4).toString('hex')}`
    if (!existsSync(jobDir(id))) return id
  }
}

export function writeJson(path, value) {
  const tmp = `${path}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`
  writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 })
  renameSync(tmp, path)
}
export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

export function createJob(id, job, items) {
  const dir = jobDir(id)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  writeFileSync(join(dir, 'input.jsonl'), items.map((it) => JSON.stringify(it)).join('\n') + (items.length ? '\n' : ''), { mode: 0o600 })
  writeJson(join(dir, 'job.json'), job)
  writeJson(join(dir, 'state.json'), { status: 'queued', total: items.length, done: 0, resumes: 0, createdAt: Date.now() })
}

export function startWorker(id) {
  const dir = jobDir(id)
  const log = openSync(join(dir, 'worker.log'), 'a', 0o600)
  const worker = fileURLToPath(new URL('../worker.mjs', import.meta.url))
  const child = spawn(process.execPath, [worker, id], {
    detached: true,
    stdio: ['ignore', log, log],
    env: workerEnv(),
    cwd: dir,
  })
  child.unref()
  closeSync(log)
}

function workerEnv() {
  const keep = ['HOME', 'PATH', 'TMPDIR', 'LANG', 'CLASSIFIER_OPENAI_KEY', 'CLASSIFIER_SCOPE', 'CLASSIFIER_REAL_HOME', 'CLASSIFIER_JOBS_DIR', 'CLASSIFIER_PROFILES_DIR', 'CLASSIFIER_RETENTION_DAYS', 'CLASSIFIER_CHAT_MODEL', 'CLASSIFIER_FAULTS', 'CLASSIFIER_CANDIDATES', 'CLASSIFIER_NO_CACHE', 'CLASSIFIER_BATCH', 'CLASSIFIER_HINTS', 'CLASSIFIER_WINDOW', 'CLASSIFIER_WINDOW_ABOVE', 'CLASSIFIER_TIER']
  return Object.fromEntries(keep.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]))
}

const alive = (pid) => {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}

// ---------------------------------------------------------------------------
// Finding jobs

export function findJob(id, caller) {
  if (typeof id !== 'string' || !ID.test(id.trim())) throw new UserError(`"${clip(String(id), 30)}" is not a job id. Job ids look like cls_8f2a91c4.${hint(caller)}`)
  id = id.trim()
  if (!existsSync(join(jobDir(id), 'job.json'))) {
    const mine = recentJobs(caller)
    const near = mine.find((j) => distance(j.id, id) <= 2)
    throw new UserError(`No job "${id}" here.${near ? ` Did you mean ${near.id} (${near.summary})?` : ''}${hint(caller, near?.id)}`)
  }
  return { id, dir: jobDir(id), job: readJson(join(jobDir(id), 'job.json')) }
}

function hint(caller, skip) {
  const mine = recentJobs(caller).filter((j) => j.id !== skip).slice(0, 3)
  return mine.length ? ` Your recent jobs: ${mine.map((j) => `${j.id} (${j.summary})`).join('; ')}.` : ''
}

export function recentJobs(caller, limit = 5) {
  if (!existsSync(JOBS_DIR)) return []
  const out = []
  for (const id of readdirSync(JOBS_DIR)) {
    if (!ID.test(id)) continue
    try {
      const job = readJson(join(jobDir(id), 'job.json'))
      if (caller && job.caller?.key !== caller.key) continue
      const st = readState(id)
      out.push({ id, created: job.created, summary: `${st.status}, ${st.total.toLocaleString()} items, ${ago(job.created)}` })
    } catch {}
  }
  return out.sort((a, b) => b.created - a.created).slice(0, limit)
}

export function findDuplicate(fingerprint, caller) {
  if (!existsSync(JOBS_DIR)) return null
  for (const id of readdirSync(JOBS_DIR)) {
    if (!ID.test(id)) continue
    try {
      const job = readJson(join(jobDir(id), 'job.json'))
      if (job.fingerprint !== fingerprint || job.caller?.key !== caller.key) continue
      const st = readState(id)
      if (st.status === 'running' || st.status === 'queued') return { id, state: st }
    } catch {}
  }
  return null
}

function distance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[a.length][b.length]
}

export function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 90) return `${s}s ago`
  if (s < 5400) return `${Math.round(s / 60)} min ago`
  if (s < 129600) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} days ago`
}

// ---------------------------------------------------------------------------
// State, with liveness. The lock names the worker; a job is "running" only
// while that process is alive and really is this job's worker (PIDs get
// reused). A worker that is merely slow or paused (a sleeping Mac) is never
// replaced: replacing one once produced two workers and 20,000 duplicates.

export function liveWorker(id) {
  let holder
  try {
    holder = JSON.parse(readFileSync(join(jobDir(id), 'lock'), 'utf8'))
  } catch {
    return null
  }
  if (!alive(holder.pid)) return null
  try {
    const cmd = execFileSync('/bin/ps', ['-p', String(holder.pid), '-o', 'command='], { encoding: 'utf8', timeout: 2000 })
    return cmd.includes('worker.mjs') && cmd.includes(id) ? holder : null
  } catch {
    return null
  }
}

function lineCount(path) {
  try {
    return readFileSync(path, 'utf8').split('\n').filter(Boolean).length
  } catch {
    return 0
  }
}

export function readState(id) {
  let st
  try {
    st = readJson(join(jobDir(id), 'state.json'))
  } catch {
    // Missing or damaged: rebuild what the files can tell.
    st = { status: 'crashed', total: lineCount(join(jobDir(id), 'input.jsonl')), done: readResults(id).size, resumes: 0, createdAt: 0, rebuilt: true }
  }
  if (['running', 'queued', 'starting', 'crashed'].includes(st.status)) {
    if (liveWorker(id)) return { ...st, status: 'running', stalled: Date.now() - (st.heartbeatAt || 0) > 60_000 }
    if (st.status === 'queued' && Date.now() - (st.createdAt || 0) < 15_000) return st
    return { ...st, status: 'crashed' }
  }
  return st
}

// Restarts a crashed job. The limit counts restarts without progress, so a
// job that keeps moving is never given up on.
export function ensureRunning(id) {
  const st = readState(id)
  if (st.status !== 'crashed') return st
  const resumes = st.done > (st.doneAtResume ?? -1) ? 0 : st.resumes || 0
  if (resumes >= MAX_RESUMES) return { ...st, resumes }
  try {
    restart(id, st, resumes + 1)
  } catch (e) {
    // The job's own files cannot be written (a full disk, a locked folder):
    // say so instead of failing every call with a bare error code.
    return { ...st, status: 'failed', errorKind: 'fatal', error: `the job's working files cannot be written (${e.code || 'error'}); the disk may be full or the folder locked` }
  }
  return readState(id)
}

export function restart(id, st, resumes = 0) {
  const { stalled, rebuilt, ...rest } = st
  writeJson(join(jobDir(id), 'state.json'), { ...rest, status: 'queued', resumes, doneAtResume: st.done, createdAt: Date.now(), heartbeatAt: 0, error: undefined, errorKind: undefined })
  startWorker(id)
}

export async function waitFor(id, seconds, { signal, onProgress } = {}) {
  const until = Date.now() + Math.max(0, Math.min(50, seconds)) * 1000
  let last = -1
  for (;;) {
    const st = ensureRunning(id)
    if (['done', 'failed', 'cancelled', 'crashed'].includes(st.status)) return st
    if (st.done !== last) {
      last = st.done
      onProgress?.(st)
    }
    if (Date.now() >= until || signal?.aborted) return st
    await new Promise((r) => setTimeout(r, 250))
  }
}

export function requestCancel(id) {
  writeFileSync(join(jobDir(id), 'cancel'), String(Date.now()))
}

// ---------------------------------------------------------------------------
// Results files

// Reads results.jsonl; the first line per item wins. Drops a torn last line.
export function readResults(id, { repair = false } = {}) {
  const path = join(jobDir(id), 'results.jsonl')
  const byN = new Map()
  if (!existsSync(path)) return byN
  const fd = openSync(path, repair ? 'r+' : 'r')
  try {
    const size = fstatSync(fd).size
    const buf = Buffer.alloc(size)
    readSync(fd, buf, 0, size, 0)
    let text = buf.toString('utf8')
    const lastNl = text.lastIndexOf('\n')
    if (lastNl !== text.length - 1) {
      if (repair) ftruncateSync(fd, Buffer.byteLength(text.slice(0, lastNl + 1)))
      text = text.slice(0, lastNl + 1)
    }
    for (const line of text.split('\n')) {
      if (!line) continue
      try {
        const r = JSON.parse(line)
        if (!byN.has(r.n)) byN.set(r.n, r)
      } catch {}
    }
  } finally {
    closeSync(fd)
  }
  return byN
}

export function readInput(id) {
  return readFileSync(join(jobDir(id), 'input.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}

// ---------------------------------------------------------------------------
// Retention: jobs older than the window go, whatever their state (a running
// worker past the window is stopped first).

export function prune(days = RETENTION_DAYS, { dryRun = false } = {}) {
  if (!dryRun) pruneCache(days)
  if (!existsSync(JOBS_DIR)) return { removed: 0, kept: 0, scope: SCOPE, days }
  const cutoff = Date.now() - days * 86_400_000
  let removed = 0
  let kept = 0
  for (const id of readdirSync(JOBS_DIR)) {
    if (!ID.test(id)) continue
    const dir = jobDir(id)
    let t
    try {
      t = statSync(dir).mtimeMs
      const st = readJson(join(dir, 'state.json'))
      t = Math.max(st.finishedAt || 0, st.createdAt || 0, st.heartbeatAt || 0) || t
    } catch {}
    // A job still being worked on is left for the next prune.
    if (t !== undefined && t < cutoff && liveWorker(id)) {
      kept++
      continue
    }
    if (t !== undefined && t < cutoff) {
      if (!dryRun) rmSync(dir, { recursive: true, force: true })
      removed++
    } else kept++
  }
  return { removed, kept, scope: SCOPE, days }
}
