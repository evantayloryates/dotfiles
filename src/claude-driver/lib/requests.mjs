// Durable broker lifecycle. Cancellation before dispatch is definitive;
// cancellation after the dispatch checkpoint is explicitly an unknown outcome.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { BROKER_DIR, ensureDir, readJson, withLock, writeJsonAtomic } from './state.mjs'
import { DriverError } from './paths.mjs'

export const requestFile = id => join(BROKER_DIR, 'requests', `${validId(id)}.json`)
export const resultFile = id => join(BROKER_DIR, 'results', `${validId(id)}.json`)
const controlFile = id => join(BROKER_DIR, 'controls', `${validId(id)}.json`)
export function validId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new DriverError('invalid request id', { category: 'bad_args' })
  return id
}
const locked = (id, fn) => withLock(`request-${validId(id)}`, fn, { timeoutMs: 5000 })
export const control = id => readJson(controlFile(id), {})
export function enqueue(request) {
  if (existsSync(requestFile(request.id))) throw new DriverError('request already exists', { category: 'request_conflict' })
  // Publish the request last: a waiter must never see a half-initialized request.
  writeJsonAtomic(controlFile(request.id), { id: request.id, state: 'pending', dispatched: [], at: Date.now() })
  writeJsonAtomic(requestFile(request.id), request)
}
const expiry = r => Number(r.expiresAt) || (Date.parse(r.createdAt) + 90_000)
const expired = r => !Number.isFinite(expiry(r)) || Date.now() >= expiry(r)
function rejectPending(r, c, state) {
  writeJsonAtomic(controlFile(r.id), { ...c, state, at: Date.now() })
  if (!(c.dispatched || []).length && !existsSync(resultFile(r.id))) {
    writeJsonAtomic(resultFile(r.id), { id: r.id, state, results: r.ops.map(o => ({ op: o.op, ok: false, error: `${state} before dispatch` })) })
  }
}
export async function cancelRequest(id, reason = 'cancelled') {
  return locked(id, () => {
    const r = readJson(requestFile(id), null)
    if (!r) return { id, state: 'not_found', dispatched: false }
    const c = control(id)
    const result = readJson(resultFile(id), null)
    if (result?.id === id && Array.isArray(result.results)) return { id, state: result.state || 'completed', dispatched: !!c.dispatched?.length, resultAvailable: true }
    const state = c.dispatched?.length ? 'outcome_unknown' : reason
    rejectPending(r, { ...c, cancelRequested: true, reason }, state)
    return { id, state, dispatched: !!c.dispatched?.length }
  })
}
export async function pickupPending() {
  const dir = ensureDir(join(BROKER_DIR, 'requests'))
  const files = readdirSync(dir).filter(f => /^[A-Za-z0-9_-]+\.json$/.test(f))
    .map(f => ({ f, at: statSync(join(dir, f)).mtimeMs })).sort((a, b) => a.at - b.at)
  for (const { f } of files) {
    const id = f.slice(0, -5)
    if (existsSync(resultFile(id))) continue
    const r = readJson(requestFile(id), null)
    if (!r || r.id !== id || !Array.isArray(r.ops) || !r.ops.length) continue
    const picked = await locked(id, () => {
      const c = control(id)
      if (existsSync(resultFile(id))) return null
      if (c.cancelRequested || expired(r)) { rejectPending(r, c, c.cancelRequested ? 'cancelled' : 'expired'); return null }
      // Never replay something a broker already picked up. A crash after
      // pickup needs reconciliation, not an automatic second execution.
      if (c.state && c.state !== 'pending') return null
      writeJsonAtomic(controlFile(id), { ...c, state: 'picked_up', at: Date.now() })
      return r
    })
    if (picked) return picked
  }
  return null
}
// Called immediately before each ccd tool. This is the irreversible boundary.
export async function authorizeDispatch(id, index) {
  return locked(id, () => {
    const r = readJson(requestFile(id), null)
    const c = control(id)
    if (!r || !Number.isInteger(index) || index < 0 || index >= r.ops.length) return { dispatch: false, reason: 'invalid_request' }
    if (c.cancelRequested || expired(r)) { rejectPending(r, c, c.cancelRequested ? 'cancelled' : 'expired'); return { dispatch: false, reason: c.cancelRequested ? 'cancelled' : 'expired' } }
    if (!['picked_up', 'dispatched'].includes(c.state) || (c.dispatched || []).includes(index)) return { dispatch: false, reason: 'already_dispatched_or_unclaimed' }
    writeJsonAtomic(controlFile(id), { ...c, state: 'dispatched', dispatched: [...(c.dispatched || []), index], at: Date.now() })
    return { dispatch: true, op: r.ops[index].op, args: r.ops[index].args }
  })
}
export function validatedResult(request) {
  const res = readJson(resultFile(request.id), null)
  if (!res) return null
  if (res.id !== request.id || !Array.isArray(res.results) || res.results.length !== request.ops.length ||
      res.results.some((x, i) => x.op !== request.ops[i].op || typeof x.ok !== 'boolean')) {
    throw new DriverError(`invalid broker result for ${request.id}; reconcile before retrying`, { category: 'broker_bad_result', detail: { requestId: request.id } })
  }
  return res
}
