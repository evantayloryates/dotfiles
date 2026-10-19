// Detached job worker: `node worker.mjs <job_id>`. Started by the server or
// the CLI, outlives them, and can be started again on the same job at any
// time: finished items are read back from results.jsonl and skipped.

import { randomBytes } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { buildBank } from './lib/bank.mjs'
import { classifyItems } from './lib/classify.mjs'
import { jobDir, liveWorker, readInput, readJson, readResults, writeJson } from './lib/jobs.mjs'
import { newUsage } from './lib/openai.mjs'
import { loadProfile, recordRun } from './lib/profiles.mjs'
import { summarize } from './lib/summary.mjs'
import { writeOutput } from './lib/output.mjs'
import { buildTaxonomy } from './lib/taxonomy.mjs'

const id = process.argv[2]
const dir = jobDir(id)
const statePath = join(dir, 'state.json')
const lockPath = join(dir, 'lock')
const token = randomBytes(8).toString('hex')
const log = (...a) => console.error(new Date().toISOString(), ...a)

// ---- lock: exactly one worker per job. A live worker is never displaced,
// however slow; only a dead holder's lock is taken over.
function acquire() {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fd = openSync(lockPath, 'wx', 0o600)
      writeSync(fd, JSON.stringify({ pid: process.pid, token, at: Date.now() }))
      closeSync(fd)
      return true
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      if (liveWorker(id)) return false
      try {
        renameSync(lockPath, `${lockPath}.stale.${Date.now()}`)
      } catch {}
    }
  }
  return false
}
const holdsLock = () => {
  try {
    return JSON.parse(readFileSync(lockPath, 'utf8')).token === token
  } catch {
    return false
  }
}
function release() {
  try {
    const holder = JSON.parse(readFileSync(lockPath, 'utf8'))
    if (holder.token === token) rmSync(lockPath)
  } catch {}
}

let state
function save(patch = {}) {
  state = { ...state, ...patch, heartbeatAt: Date.now() }
  writeJson(statePath, state)
}

async function main() {
  if (!acquire()) {
    log('exit: locked by another worker')
    process.exit(0)
  }
  const ctrl = new AbortController()
  let fd = null
  let dirty = false
  let stop = null // 'cancel' | 'budget' | 'lost_lock'
  let usage = null
  let maxUsd = Infinity
  const heartbeat = setInterval(() => {
    try {
      // Never keep writing once another worker owns the job.
      if (!holdsLock()) {
        stop = 'lost_lock'
        ctrl.abort()
        log('lock lost; stopping without writing state')
        process.exit(0)
      }
      if (!stop && existsSync(join(dir, 'cancel'))) {
        stop = 'cancel'
        ctrl.abort()
      }
      if (!stop && usage && usage.usd > maxUsd) {
        stop = 'budget'
        ctrl.abort()
      }
      if (usage) state.usage = usage
      save()
      if (fd !== null && dirty) {
        fsyncSync(fd)
        dirty = false
      }
    } catch (e) {
      log('heartbeat', e.message)
    }
  }, 500)

  try {
    state = { ...readJson(statePath), status: 'running', pid: process.pid, token, startedAt: Date.now(), error: undefined }
    save()
    const job = readJson(join(dir, 'job.json'))
    const items = readInput(id)
    const results = readResults(id, { repair: true })
    fd = openSync(join(dir, 'results.jsonl'), 'a', 0o600)
    const write = (n, r) => {
      // Cancelled requests and transient model failures are not results:
      // the item stays pending for the retry passes or a resume. Saving them
      // turned an API outage into a "finished" job full of errors.
      if (results.has(n) || ctrl.signal.aborted || (r.status === 'error' && n !== undefined && r.final !== true)) return
      const { final, ...rest } = r
      const line = { n, ...rest }
      results.set(n, line)
      writeSync(fd, `${JSON.stringify(line)}\n`)
      dirty = true
      state.done = results.size
    }
    // Items that never needed classifying.
    for (const it of items) if (it.status !== 'ok') write(it.n, { status: it.status, reason: it.reason })
    save({ done: results.size })

    const profile = job.spec.profile ? loadProfile(job.spec.profile) : null
    const taxonomy = buildTaxonomy({ labels: profile ? profile.labels : job.spec.labels, examples: job.spec.examples })
    usage = { ...newUsage(), ...(state.usage || {}) }
    maxUsd = Number(job.spec.max_usd) > 0 ? Number(job.spec.max_usd) : Infinity
    const bank = await buildBank(taxonomy, profile, { usage, signal: ctrl.signal })
    // Up to three passes: items whose model calls failed transiently are
    // retried after a pause instead of being recorded as errors.
    for (let pass = 0; pass < 3 && !ctrl.signal.aborted; pass++) {
      const pending = items.filter((it) => it.status === 'ok' && !results.has(it.n))
      if (!pending.length) break
      if (pass) await new Promise((r) => setTimeout(r, pass * 10_000))
      log(`pass ${pass + 1}: ${pending.length} pending of ${items.length}, bank ${bank.n} rows (${bank.mode})`)
      await classifyItems(pending, bank, (i, r) => write(pending[i].n, r), { maxLabels: job.spec.max_labels, prefer: job.spec.prefer, tier: job.spec.tier, usage, signal: ctrl.signal })
    }
    state.usage = usage

    if (stop === 'cancel') return save({ status: 'cancelled', finishedAt: Date.now() })
    if (stop === 'budget') return save({ status: 'failed', finishedAt: Date.now(), errorKind: 'budget', error: `the spending limit of $${maxUsd} was reached` })
    // A handful of items that fail every pass are recorded as errors so the
    // job can finish; more than that means the backend is failing.
    const left = items.filter((it) => !results.has(it.n))
    if (left.length && left.length <= Math.max(5, items.length * 0.005)) for (const it of left) write(it.n, { status: 'error', reason: 'model_error', final: true })
    else if (left.length) return save({ status: 'failed', finishedAt: Date.now(), errorKind: 'transient', error: `OpenAI kept failing for ${left.length.toLocaleString()} items after three tries` })
    fsyncSync(fd)

    const summary = summarize(items, results, taxonomy, usage, Date.now() - state.startedAt)
    let outputError
    if (job.output?.abs) outputError = writeOutput(job.output, job.spec, items, results)
    if (job.spec.profile) recordRun(job.spec.profile, summary, job.content_fp || job.fingerprint)
    save({ status: 'done', finishedAt: Date.now(), summary, outputError, usage })
  } catch (err) {
    log('failed', err.stack || err.message)
    // kind tells the caller what to do: transient (resume once later), fatal
    // (retrying will not help), input (fix the request).
    const kind = err.expected ? 'input' : ['quota', 'auth', 'no_key'].includes(err.code) ? 'fatal' : 'transient'
    const reason = err.expected || kind === 'fatal' ? err.message : err.code === 'rate_limit' ? 'OpenAI kept rate limiting the requests' : ['api', 'network', 'timeout'].includes(err.code) ? 'OpenAI kept failing or timing out' : `an internal error (${err.code || err.name})`
    try {
      save({ status: 'failed', finishedAt: Date.now(), error: reason, errorKind: kind })
    } catch {}
  } finally {
    clearInterval(heartbeat)
    if (fd !== null) closeSync(fd)
    release()
  }
}

// A worker must never die silently: anything uncaught is recorded first.
process.on('uncaughtException', (e) => {
  log('uncaught', e.stack || e.message)
  try {
    save({ status: 'failed', finishedAt: Date.now(), error: `an internal error (${e.code || e.name})`, errorKind: 'transient' })
  } catch {}
  release()
  process.exit(1)
})
process.on('SIGTERM', () => {
  try {
    save({ status: 'cancelled', finishedAt: Date.now() })
  } catch {}
  release()
  process.exit(0)
})

if (!/^cls_[0-9a-f]{8}$/.test(id || '')) {
  console.error('usage: worker.mjs <job_id>')
  process.exit(2)
}
main().then(() => process.exit(0))
