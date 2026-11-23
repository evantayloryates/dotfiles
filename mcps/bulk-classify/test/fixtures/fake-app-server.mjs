// A stand-in for `codex app-server --listen stdio://` in tests. Speaks the
// v2 JSON-RPC shape the classifier uses. First argument is the mode:
//   ok          answers every item with the first label (or "none")
//   crash       streams two answers, then exits mid-turn
//   hang        accepts the turn and never completes it
//   garble      streams one answer, then a non-JSON line
//   apikey      account/read says an API-key login
//   noauth      account/read says no account
//   mcp         config/read keeps an MCP server enabled whatever the flags say
//   sandbox     config/read reports a writable sandbox
//   unauth      turns fail with codexErrorInfo "unauthorized"
//   limit       turns stream one answer then fail with "usageLimitExceeded"
//   skip        answers all but the last item
//   tool        the turn starts a commandExecution item
// The last two arguments are the mode and a file its pid is appended to.
import { appendFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

const [mode = 'ok', pidFile] = process.argv.slice(-2) // the test's wrapper appends them
if (pidFile) appendFileSync(pidFile, `${process.pid}\n`)
const disabled = new Set()
const argv = process.argv
for (let i = 0; i < argv.length; i++) if (argv[i] === '-c' && /^mcp_servers\.([^.]+)\.enabled=false$/.test(argv[i + 1] || '')) disabled.add(argv[i + 1].split('.')[1])
const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`)
let n = 0
const threads = new Map()
createInterface({ input: process.stdin }).on('line', (line) => {
  const m = JSON.parse(line)
  if (m.method === undefined) return // client responses
  const reply = (result) => out({ id: m.id, result })
  switch (m.method) {
    case 'initialize':
      return reply({ userAgent: 'fake' })
    case 'initialized':
      return
    case 'account/read':
      if (mode === 'apikey') return reply({ account: { type: 'apiKey' }, requiresOpenaiAuth: true })
      if (mode === 'noauth') return reply({ account: null, requiresOpenaiAuth: true })
      return reply({ account: { type: 'chatgpt', email: null, planType: 'pro' }, requiresOpenaiAuth: true })
    case 'config/read': {
      const mcp = { alpha: { command: 'x', enabled: !disabled.has('alpha') } }
      if (mode === 'mcp') mcp.alpha.enabled = true
      const servers = mode === 'nomcp' ? undefined : mode === 'reshaped' ? [mcp.alpha] : mode === 'boolmcp' ? true : mcp
      return reply({ config: { sandbox_mode: mode === 'sandbox' ? 'workspace-write' : 'read-only', approval_policy: 'never', notify: [], features: { memories: false }, memories: { generate_memories: false, use_memories: false }, history: { persistence: 'none' }, ...(servers !== undefined && { mcp_servers: servers }) } })
    }
    case 'thread/start': {
      const id = `t${++n}`
      threads.set(id, m.params)
      return reply({ thread: { id } })
    }
    case 'thread/unsubscribe':
    case 'turn/interrupt':
      return reply({})
    case 'turn/start': {
      const threadId = m.params.threadId
      const turnId = `u${++n}`
      reply({ turn: { id: turnId, status: 'inProgress', items: [] } })
      const text = m.params.input[0].text
      const items = JSON.parse(text.slice(text.indexOf('Items:\n') + 7).split('\n')[0])
      const label = m.params.outputSchema.properties.answers.items.properties.label.enum[0]
      let answers = items.map((it) => ({ key: it.key, label }))
      if (mode === 'skip') answers = answers.slice(0, -1)
      const body = JSON.stringify({ answers })
      const delta = (d) => out({ method: 'item/agentMessage/delta', params: { threadId, turnId, itemId: 'm', delta: d } })
      const firstTwo = `{"answers":[${answers.slice(0, 2).map((a) => JSON.stringify(a)).join(',')},`
      const fail = (info) => out({ method: 'turn/completed', params: { threadId, turn: { id: turnId, status: 'failed', items: [], error: { message: 'fake failure', codexErrorInfo: info } } } })
      setTimeout(() => {
        if (mode === 'hang') return
        if (mode === 'crash') {
          delta(firstTwo)
          return setTimeout(() => process.exit(1), 20)
        }
        if (mode === 'garble') {
          delta(firstTwo)
          return process.stdout.write('this is not json\n')
        }
        if (mode === 'unauth') return fail('unauthorized')
        if (mode === 'limit') {
          delta(`{"answers":[${JSON.stringify(answers[0])},`)
          return fail('usageLimitExceeded')
        }
        if (mode === 'tool') out({ method: 'item/started', params: { threadId, turnId, item: { type: 'commandExecution', id: 'c' } } })
        delta(body)
        out({ method: 'item/completed', params: { threadId, turnId, item: { type: 'agentMessage', id: 'm', text: body } } })
        out({ method: 'thread/tokenUsage/updated', params: { threadId, turnId, tokenUsage: { last: { inputTokens: 100, cachedInputTokens: 50, outputTokens: 10, reasoningOutputTokens: 0, totalTokens: 110 }, total: {} } } })
        out({ method: 'turn/completed', params: { threadId, turn: { id: turnId, status: 'completed', items: [] } } })
      }, 5)
      return
    }
    default:
      return out({ id: m.id, error: { code: -32601, message: 'unknown method' } })
  }
})
process.stdin.on('end', () => process.exit(0))
