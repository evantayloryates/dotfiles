// Keep stop → replacement indivisible relative to other controls for the
// same recipient. Nested controls inherit the lock; other requests do not.
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import { withLock } from './state.mjs'

const held = new AsyncLocalStorage()
export async function withSessionControl(session, fn, { signal } = {}) {
  if (held.getStore() === session) return fn()
  const key = createHash('sha256').update(session).digest('hex')
  return withLock(`control-${key}`, () => held.run(session, fn), { signal })
}
