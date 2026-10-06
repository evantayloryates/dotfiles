#!/usr/bin/env node
import { jobFile, lockedJob, TERMINAL } from '../lib/jobs.mjs'
import { readJson, writeJsonAtomic } from '../lib/state.mjs'
import { OPS, runOp } from '../lib/driver.mjs'
const id = process.argv[2]
const controller = new AbortController()
let timer
let progressWrites = Promise.resolve()
const update = fn => lockedJob(id, () => { const j = readJson(jobFile(id), null); if (j) writeJsonAtomic(jobFile(id), fn(j)) })
let initial
await update(j => {
  if (TERMINAL.has(j.state)) return j
  if (j.cancelRequestedAt || Date.now() >= j.expiresAt) return { ...j, state: 'cancelled', finishedAt: Date.now() }
  initial = j
  return { ...j, state: 'running', workerPid: process.pid, startedAt: Date.now() }
})
if (initial) {
  let watching = false
  timer = setInterval(async () => {
    if (watching) return
    watching = true
    try { const j = readJson(jobFile(id), null); if (j?.cancelRequestedAt || Date.now() >= initial.expiresAt) controller.abort() } finally { watching = false }
  }, 100)
  try {
    const result = await runOp(initial.operation, initial.args, { harness: `job:${initial.harness}`, signal: controller.signal,
      progress: message => { progressWrites = progressWrites.then(() => update(j=>({ ...j, progress: [...(j.progress || []).slice(-19), { at: Date.now(), message }] }))) } })
    await progressWrites
    await update(j => ({ ...j, state: result?.handedBack ? 'handed_back' : result?.verified === false ? 'unverified' : 'completed', result, finishedAt: Date.now() }))
  } catch (err) {
    await progressWrites.catch(() => {})
    const readOnly = OPS.find(o => o.name === initial.operation)?.readOnly
    const outcome = err.category === 'outcome_unknown' ? 'outcome_unknown'
      : err.category === 'partial_effect' ? 'failed'
      : err.category === 'cancelled' ? 'cancelled'
      : controller.signal.aborted ? readOnly ? 'cancelled' : 'outcome_unknown' : 'failed'
    await update(j => ({ ...j, state: outcome,
      error: { category: err.category || 'internal', message: String(err.message).slice(0, 500), detail: err.detail }, finishedAt: Date.now() }))
  } finally { clearInterval(timer) }
}
