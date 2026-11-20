import test from 'node:test'
import assert from 'node:assert/strict'
import { retryConnect } from '../db-pool.mjs'

function clock() {
  let t = 0
  return { now: () => t, sleep: async (ms) => { t += ms } }
}
const err = (code) => Object.assign(new Error(code), { code })

test('retries a refused connection while the tunnel restarts', async () => {
  const c = clock()
  const codes = ['ECONNREFUSED', 'ETIMEDOUT']
  const conn = await retryConnect(async () => {
    if (codes.length) throw err(codes.shift())
    return 'conn'
  }, c)
  assert.equal(conn, 'conn')
  assert.equal(c.now(), 7_000)
})

test('gives up at the deadline with the last error', async () => {
  const c = clock()
  await assert.rejects(retryConnect(async () => { throw err('ECONNREFUSED') }, { ...c, deadlineMs: 12_000 }), { code: 'ECONNREFUSED' })
  assert.equal(c.now(), 12_000)
})

test('does not retry an authentication error', async () => {
  const c = clock()
  let n = 0
  await assert.rejects(retryConnect(async () => { n++; throw err('ER_ACCESS_DENIED_ERROR') }, c), { code: 'ER_ACCESS_DENIED_ERROR' })
  assert.equal(n, 1)
})
