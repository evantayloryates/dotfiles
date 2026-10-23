import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { queueMessage } from './queue.mjs'

const threadId = '01a14203-a320-73f1-bfdc-a486e7e4b359'

test('fast desktop consumption is reconciled and a repeated intent is not resent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-fleet-queue-'))
  let adds = 0, reads = 0, clientId
  const peer = { request: async (method, params) => {
    if (method === 'thread/read') {
      reads += 1
      return { thread: { status: { type: 'idle' }, turns: reads > 3 && clientId
        ? [{ id: 'turn-1', status: 'completed', items: [{ type: 'userMessage', clientId }] }] : [] } }
    }
    if (method === 'thread/queue/list') return { data: [] }
    if (method === 'thread/queue/add') { adds += 1; clientId = params.clientUserMessageId; return { queuedSubmission: { id: 'queue-1' } } }
    throw new Error(`unexpected ${method}`)
  } }
  try {
    const input = { threadId, key: 'event-1', message: 'Test message', stateDir: dir, peer }
    assert.equal((await queueMessage(input)).turnId, 'turn-1')
    assert.equal((await queueMessage(input)).turnId, 'turn-1')
    assert.equal(adds, 1)
    await assert.rejects(queueMessage({ ...input, message: 'Changed message' }), /already bound/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('unknown submission is never replayed under the same key', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-fleet-queue-'))
  let adds = 0
  const peer = { request: async method => {
    if (method === 'thread/read') return { thread: { status: { type: 'idle' }, turns: [] } }
    if (method === 'thread/queue/list') return { data: [] }
    if (method === 'thread/queue/add') { adds += 1; throw new Error('lost reply') }
    throw new Error(`unexpected ${method}`)
  } }
  try {
    const input = { threadId, key: 'event-2', message: 'Test message', stateDir: dir, peer }
    await assert.rejects(queueMessage(input), /lost reply/)
    await assert.rejects(queueMessage(input), /submission uncertain/)
    assert.equal(adds, 1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
