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
      assert.equal(params.includeTurns, false)
      reads += 1
      return { thread: { status: { type: 'idle' } } }
    }
    if (method === 'thread/turns/list') {
      assert.equal(params.itemsView, 'summary')
      return { data: reads > 3 && clientId
        ? [{ id: 'turn-1', status: 'completed', items: [{ type: 'userMessage', clientId }] }] : [] } }
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
    if (method === 'thread/read') return { thread: { status: { type: 'idle' } } }
    if (method === 'thread/turns/list') return { data: [] }
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

test('a privately resumed turn is held until completion before its backend can close', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-fleet-queue-'))
  let reads = 0, clientId, resumed = false, started = false, adds = 0, closedAtRead = null
  const peer = { close: () => { closedAtRead = reads }, request: async (method, params) => {
    if (method === 'thread/read') {
      assert.equal(params.includeTurns, false)
      reads += 1
      return { thread: { status: { type: 'notLoaded' } } }
    }
    if (method === 'thread/queue/list') return { data: clientId ? [{ id: 'queue-1', clientUserMessageId: clientId }] : [] }
    if (method === 'thread/turns/list') return { data: started
      ? [{ id: 'turn-1', status: reads >= 4 ? 'completed' : 'inProgress', items: [{ type: 'userMessage', clientId }] }] : [] }
    if (method === 'thread/queue/add') { adds += 1; clientId = params.clientUserMessageId; return { queuedSubmission: { id: 'queue-1' } } }
    if (method === 'thread/resume') { assert.equal(params.excludeTurns, true); resumed = true; return { thread: {} } }
    if (method === 'thread/queue/start') { assert.equal(resumed, true); assert.equal(params.queuedSubmissionId, 'queue-1'); started = true; return {} }
    throw new Error(`unexpected ${method}`)
  } }
  try {
    const result = await queueMessage({ threadId, key: 'event-3', message: 'Test message', stateDir: dir, connect: async () => peer, waitIntervalMs: 0 })
    assert.equal(result.turnStatus, 'completed')
    assert.ok(reads >= 4)
    assert.ok(closedAtRead >= 4)
    assert.equal(adds, 1)
    assert.equal((await queueMessage({ threadId, key: 'event-3', message: 'Test message', stateDir: dir, peer })).turnStatus, 'completed')
    assert.equal(adds, 1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a desktop writer keeps its queued item without a second resume or replay', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-fleet-queue-'))
  let clientId, adds = 0, resumes = 0
  const peer = { request: async (method, params) => {
    if (method === 'thread/read') return { thread: { status: { type: 'notLoaded' } } }
    if (method === 'thread/queue/list') return { data: clientId ? [{ id: 'queue-1', clientUserMessageId: clientId }] : [] }
    if (method === 'thread/turns/list') return { data: [] }
    if (method === 'thread/queue/add') { adds += 1; clientId = params.clientUserMessageId; return { queuedSubmission: { id: 'queue-1' } } }
    if (method === 'thread/resume') { resumes += 1; throw new Error('already has an active writer') }
    throw new Error(`unexpected ${method}`)
  } }
  try {
    const input = { threadId, key: 'event-4', message: 'Test message', stateDir: dir, peer }
    assert.equal((await queueMessage(input)).phase, 'queued')
    assert.equal((await queueMessage(input)).phase, 'queued')
    assert.equal(adds, 1)
    assert.equal(resumes, 2)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('an interrupted owned turn is retained for inspection and never replayed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-fleet-queue-'))
  let clientId, adds = 0, started = false, closed = false
  const peer = { close: () => { closed = true }, request: async (method, params) => {
    if (method === 'thread/read') return { thread: { status: { type: 'notLoaded' } } }
    if (method === 'thread/queue/list') return { data: clientId ? [{ id: 'queue-1', clientUserMessageId: clientId }] : [] }
    if (method === 'thread/turns/list') return { data: started
      ? [{ id: 'turn-1', status: 'interrupted', items: [{ type: 'userMessage', clientId }] }] : [] }
    if (method === 'thread/queue/add') { adds += 1; clientId = params.clientUserMessageId; return { queuedSubmission: { id: 'queue-1' } } }
    if (method === 'thread/resume') return { thread: {} }
    if (method === 'thread/queue/start') { started = true; return {} }
    throw new Error(`unexpected ${method}`)
  } }
  try {
    const input = { threadId, key: 'event-interrupted', message: 'Test message', stateDir: dir, connect: async () => peer, waitIntervalMs: 0 }
    await assert.rejects(queueMessage(input), /interrupted.*no replay/)
    assert.equal(closed, true)
    await assert.rejects(queueMessage(input), /interrupted.*no replay/)
    assert.equal(adds, 1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
