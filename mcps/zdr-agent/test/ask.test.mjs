import { test } from 'node:test'
import assert from 'node:assert/strict'

// A fake harness: every test scripts its session's status and messages.
async function fakeHarness() {
  const { createServer } = await import('node:http')
  const state = { busy: {}, messages: {}, session: {}, calls: [], onPrompt: null, failNext: 0 }
  const server = createServer((req, res) => {
    const send = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json' })
      res.end(body === undefined ? '' : JSON.stringify(body))
    }
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const path = req.url
      state.calls.push(`${req.method} ${path}`)
      if (path === '/mcp') return send(200, { kickoffdb: { status: 'connected' } })
      if (path === '/session' && req.method === 'POST') return send(200, { id: 'ses_new' })
      if (path === '/session/status') {
        if (state.failNext > 0) {
          state.failNext -= 1
          return send(500, { name: 'boom' })
        }
        return send(200, Object.fromEntries(Object.entries(state.busy).map(([id, n]) => [id, { type: state.busy[id]-- > 0 ? 'busy' : 'idle' }])))
      }
      const m = path.match(/^\/session\/(ses_\w+)(\/.*)?$/)
      if (m && m[2] === '/prompt_async') {
        state.onPrompt?.(m[1], JSON.parse(raw))
        return send(204)
      }
      if (m && m[2] === '/message' && req.method === 'POST') return send(500, { name: 'held-open requests are not allowed' })
      if (m && m[2] === '/message') return send(200, state.messages[m[1]] || [])
      if (m) return send(200, state.session[m[1]] || { id: m[1], agent: 'zdr' })
      send(404, {})
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { state, server, url: `http://127.0.0.1:${server.address().port}` }
}

const user = (id) => ({ info: { id, role: 'user' }, parts: [{ type: 'text', text: 'the question' }] })
const assistant = (id, parentID, text, info = {}) => ({
  info: { id, role: 'assistant', parentID, agent: 'zdr', time: { created: 1, completed: 2 }, finish: 'stop', ...info },
  parts: [{ type: 'tool', tool: 'query', state: { output: 'raw tool output' } }, { type: 'text', text }],
})

test('ask and read against a harness that takes its time', async (t) => {
  const { state, server, url } = await fakeHarness()
  t.after(() => server.close())
  // harness.mjs reads these when first imported, so this file must be the
  // first to import it: its own process, never the real harness on :4096.
  process.env.ZDR_HARNESS_URL = url
  process.env.ZDR_POLL_MS = '5'
  process.env.ZDR_SETTLE_MS = '60'
  process.env.ZDR_ASK_TIMEOUT_MS = '500'
  const { ask, readSession } = await import('../src/harness.mjs')
  const signal = new AbortController().signal
  const finish = (reply) => (id) => {
    state.busy[id] = 3
    state.messages[id] = [user('msg_u1'), assistant('msg_a1', 'msg_u1', 'let me look'), reply]
  }

  await t.test('returns the final step only, over short requests', async () => {
    state.calls.length = 0
    state.failNext = 2
    state.onPrompt = finish(assistant('msg_a2', 'msg_u1', 'the answer, mail a@b.co'))
    const out = await ask({ question: 'q' }, signal)
    assert.match(out, /^the answer, mail \[redacted-email\]/)
    assert.doesNotMatch(out, /let me look|raw tool output/)
    assert.match(out, /session_id: ses_new/)
    assert.ok(!state.calls.some((c) => c === 'POST /session/ses_new/message'))
  })

  await t.test('running past the budget is not an error', async () => {
    state.onPrompt = (id) => {
      state.busy[id] = 1e9
      state.messages[id] = [user('msg_u1')]
    }
    const out = await ask({ question: 'q' }, signal)
    assert.match(out, /^Still running after/)
    assert.match(out, /zdr_read/)
    assert.match(out, /session_id: ses_new/)
    state.busy = {}
  })

  await t.test('a follow-up on a busy session is refused and sends nothing', async () => {
    state.busy.ses_old = 1e9
    let sent = false
    state.onPrompt = () => (sent = true)
    await assert.rejects(ask({ question: 'q', session_id: 'ses_old' }, signal), /still working/)
    assert.equal(sent, false)
    state.busy = {}
  })

  await t.test('a follow-up waits for its own reply, not the earlier one', async () => {
    state.messages.ses_two = [user('msg_u1'), assistant('msg_a1', 'msg_u1', 'first answer')]
    state.onPrompt = (id) => {
      state.messages[id] = [...state.messages[id], user('msg_u2')]
      setTimeout(() => state.messages[id].push(assistant('msg_a2', 'msg_u2', 'second answer')), 20)
    }
    assert.match(await ask({ question: 'q', session_id: 'ses_two' }, signal), /^second answer/)
  })

  await t.test('a reply from another agent is not relayed', async () => {
    state.onPrompt = finish(assistant('msg_a2', 'msg_u1', 'client detail', { agent: 'analyst' }))
    const out = await ask({ question: 'q' }, signal)
    assert.doesNotMatch(out, /client detail/)
    assert.match(out, /not relayed/)
  })

  await t.test('a run that ends with no answer fails instead of hanging', async () => {
    state.onPrompt = (id) => (state.messages[id] = [user('msg_u1'), assistant('msg_a1', 'msg_u1', 'partway', { time: { created: 1 }, finish: undefined })])
    await assert.rejects(ask({ question: 'q' }, signal), /stopped without a final answer/)
    state.onPrompt = (id) => (state.messages[id] = [user('msg_u1'), assistant('msg_a1', 'msg_u1', 'partway', { finish: 'tool-calls' })])
    await assert.rejects(ask({ question: 'q' }, signal), /stopped without a final answer/)
  })

  await t.test('a harness error on the reply is reported', async () => {
    state.onPrompt = finish(assistant('msg_a2', 'msg_u1', '', { error: { name: 'ProviderError', data: { message: 'rate limited' } } }))
    await assert.rejects(ask({ question: 'q' }, signal), /rate limited/)
  })

  await t.test('read: narration from a running session is not the answer', async () => {
    state.busy.ses_r = 1e9
    state.messages.ses_r = [user('msg_u1'), assistant('msg_a1', 'msg_u1', 'let me look')]
    const out = await readSession('ses_r', signal)
    assert.match(out, /^state: running/)
    assert.doesNotMatch(out, /let me look/)
    state.busy = {}
  })

  await t.test('read: wait_seconds collects the answer', async () => {
    state.busy.ses_w = 3
    state.messages.ses_w = [user('msg_u1'), assistant('msg_a1', 'msg_u1', 'the answer')]
    const out = await readSession('ses_w', signal, { waitSeconds: 5 })
    assert.match(out, /^state: finished/)
    assert.match(out, /answer: the answer/)
    state.busy = {}
  })

  await t.test('read: still refuses another agent, even after waiting', async () => {
    state.session.ses_a = { id: 'ses_a', agent: 'analyst' }
    await assert.rejects(readSession('ses_a', signal), /cannot be read here/)
    state.busy.ses_b = 2
    state.messages.ses_b = [user('msg_u1'), assistant('msg_a1', 'msg_u1', 'ok', { agent: 'analyst' })]
    await assert.rejects(readSession('ses_b', signal, { waitSeconds: 1 }), /cannot be read here/)
    state.busy = {}
  })
})
