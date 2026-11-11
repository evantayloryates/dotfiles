import test from 'node:test'
import assert from 'node:assert/strict'
import { createPool, PoolBusyError } from '../db-pool.mjs'

// Fake connections: count opens, live connections and destroys.
function fakes() {
  const state = { opened: 0, live: 0, peak: 0, destroyed: 0, ended: 0 }
  const open = async () => {
    state.opened++
    state.live++
    state.peak = Math.max(state.peak, state.live)
    return {
      id: state.opened,
      on() {},
      destroy() { state.destroyed++; state.live-- },
      end() { state.ended++; state.live--; return Promise.resolve() },
    }
  }
  return { state, open }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

test('calls run in parallel up to the cap, the rest wait their turn', async () => {
  const { state, open } = fakes()
  const pool = createPool({ open, max: 3, acquireMs: 1000 })
  let running = 0
  let peak = 0
  await Promise.all(
    Array.from({ length: 8 }, () =>
      pool.run(async () => {
        await pool.connection()
        running++
        peak = Math.max(peak, running)
        await sleep(20)
        running--
      })
    )
  )
  assert.equal(peak, 3)
  assert.equal(state.opened, 3)
  assert.deepEqual(pool.stats(), { opened: 3, idle: 3, waiting: 0, max: 3 })
  pool.closeAll()
})

test('one call keeps one connection across statements', async () => {
  const { open } = fakes()
  const pool = createPool({ open, max: 2 })
  await pool.run(async () => {
    const a = await pool.connection()
    const b = await pool.connection()
    assert.equal(a, b)
  })
  pool.closeAll()
})

test('a waiter gives up with a clear message instead of queueing past the tool limit', async () => {
  const { open } = fakes()
  const pool = createPool({ open, max: 1, acquireMs: 30 })
  let release
  const holder = pool.run(async () => {
    await pool.connection()
    await new Promise((r) => (release = r))
  })
  await sleep(5)
  await assert.rejects(pool.run(() => pool.connection()), (err) => err instanceof PoolBusyError && /busy with 1 other/.test(err.message))
  release()
  await holder
  assert.equal(pool.stats().waiting, 0)
  pool.closeAll()
})

test('a broken connection is destroyed, frees its slot and is never reused', async () => {
  const { state, open } = fakes()
  const pool = createPool({ open, max: 1, acquireMs: 500 })
  let first
  const waiter = sleep(5).then(() => pool.run(async () => (await pool.connection()).id))
  await pool.run(async () => {
    first = (await pool.connection()).id
    await sleep(20)
    pool.forget()
    const again = await pool.connection()
    assert.notEqual(again.id, first)
  })
  assert.notEqual(await waiter, first)
  assert.equal(state.destroyed, 1)
  assert.equal(state.peak, 1)
  pool.closeAll()
})

test('a failed open frees its slot', async () => {
  let fail = true
  const { open } = fakes()
  const pool = createPool({ open: () => (fail ? Promise.reject(new Error('ECONNREFUSED')) : open()), max: 1 })
  await assert.rejects(pool.run(() => pool.connection()), /ECONNREFUSED/)
  fail = false
  await pool.run(() => pool.connection())
  assert.equal(pool.stats().opened, 1)
  pool.closeAll()
})

test('idle connections close after the idle timeout', async () => {
  const { state, open } = fakes()
  const pool = createPool({ open, max: 2, idleMs: 20 })
  await pool.run(() => pool.connection())
  await sleep(40)
  assert.equal(state.ended, 1)
  assert.equal(pool.stats().opened, 0)
})

test('connection() outside a lease is a programming error', async () => {
  const { open } = fakes()
  const pool = createPool({ open })
  await assert.rejects(pool.connection(), /outside a pool lease/)
})

test('done() hands the connection back mid-call', async () => {
  const { state, open } = fakes()
  const pool = createPool({ open, max: 1, acquireMs: 200 })
  let release
  const exporter = pool.run(async () => {
    await pool.connection()
    pool.done()
    await new Promise((r) => (release = r))
  })
  await sleep(5)
  await pool.run(() => pool.connection())
  release()
  await exporter
  assert.equal(state.opened, 1)
  pool.closeAll()
})
