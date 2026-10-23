import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { eventMessage, processEventsOnce, sweepOnce } from './watcher.mjs'

test('event delivery intent stays identical when a card title or column changes', () => {
  const config = { boardUrl: 'http://127.0.0.1:4879' }
  const event = { id: 7, type: 'commented', at: '2026-10-23T17:00:00Z', actor: 'worker',
    card: { id: 1, title: 'Before', col: 'active', url: 'http://127.0.0.1:4879/c/1' } }
  assert.equal(eventMessage(config, event), eventMessage(config,
    { ...event, card: { ...event.card, title: 'After', col: 'released' } }))
})

test('watcher skips manager writes and does not ack an unconsumed worker event', async () => {
  let cursor = 0
  const events = [
    { id: 1, type: 'commented', actor: 'fleet', at: 'now', card: { id: 1 } },
    { id: 2, type: 'commented', actor: 'worker', at: 'now', card: { id: 1 } },
  ]
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    if (req.url.startsWith('/api/feed?')) {
      res.end(JSON.stringify({ events: events.filter(e => e.id > cursor), latest: 2 }))
      return
    }
    if (req.url === '/api/feed/ack') {
      cursor = JSON.parse(body).through
      res.end(JSON.stringify({ cursor }))
      return
    }
    res.statusCode = 404; res.end()
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const config = { boardUrl: `http://127.0.0.1:${server.address().port}`, fleetId: 'fixture',
    consumer: 'fixture', managerThreadId: '01a14203-a320-73f1-bfdc-a486e7e4b359' }
  const calls = []
  try {
    const result = await processEventsOnce(config, { deliver: async args => { calls.push(args); return { phase: 'queued' } } })
    assert.deepEqual(result, { seen: 2, acknowledged: 1, latest: 2 })
    assert.equal(cursor, 1)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].key, 'board:fixture:event:2')
  } finally { server.close() }
})

test('watcher retains an event until its manager turn completes', async () => {
  let cursor = 0
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    if (req.url.startsWith('/api/feed?')) return res.end(JSON.stringify({ events: cursor ? [] :
      [{ id: 1, type: 'answered', actor: 'worker', at: 'now', card: { id: 2 } }], latest: 1 }))
    if (req.url === '/api/feed/ack') { cursor = JSON.parse(body).through; return res.end('{}') }
    res.statusCode = 404; res.end()
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const config = { boardUrl: `http://127.0.0.1:${server.address().port}`, fleetId: 'fixture',
    consumer: 'fixture', managerThreadId: '01a14203-a320-73f1-bfdc-a486e7e4b359' }
  try {
    assert.equal((await processEventsOnce(config, { deliver: async () => ({ phase: 'consumed', turnStatus: 'interrupted' }) })).acknowledged, 0)
    assert.equal(cursor, 0)
    assert.equal((await processEventsOnce(config, { deliver: async () => ({ phase: 'consumed', turnStatus: 'completed' }) })).acknowledged, 1)
    assert.equal(cursor, 1)
  } finally { server.close() }
})

test('sweep alerts for an unclaimed active card, but leaves a busy worker alone', async () => {
  const card = { id: 3, col: 'active', activity: [{ id: 11, kind: 'moved', created_at: '2026-10-23T16:00:00Z' }], comments: [] }
  const server = createServer((req, res) => {
    if (req.url === '/api/cards?column=active') return res.end(JSON.stringify([{ id: 3 }]))
    if (req.url === '/api/cards/3') return res.end(JSON.stringify(card))
    res.statusCode = 404; res.end()
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const config = { boardUrl: `http://127.0.0.1:${server.address().port}`, fleetId: 'fixture',
    consumer: 'fixture', managerThreadId: '01a14203-a320-73f1-bfdc-a486e7e4b359' }
  const calls = []
  const deliver = async args => { calls.push(args); return { phase: 'consumed', newlyConsumed: true } }
  const now = Date.parse('2026-10-23T17:00:00Z')
  try {
    assert.equal((await sweepOnce(config, { deliver, now })).alerted, 1)
    assert.match(calls[0].key, /NOASSIGNEE:3:11/)
    card.comments = [{ author: 'worker', body: 'Assigned: 01a14203-b1ce-7a03-b868-eaeda7c941c8' }]
    const busy = await sweepOnce(config, { deliver, now,
      readThread: async () => ({ status: { type: 'active' } }) })
    assert.equal(busy.alerted, 0)
    assert.equal(calls.length, 1)
    const idle = await sweepOnce(config, { deliver, now,
      readThread: async () => ({ status: { type: 'idle' } }) })
    assert.equal(idle.alerted, 1)
    assert.match(calls[1].key, /STALL:3:11/)
  } finally { server.close() }
})
