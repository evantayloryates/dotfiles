#!/usr/bin/env node
// zdr-ask: a zero-dependency MCP stdio server that lets non-ZDR agents (Claude
// Code, Codex) ask questions of the local ZDR harness without loading raw
// Amplitude/BugSnag data into their own context. Only the harness's final answer
// text comes back. See ../../zdr-harness/README.md.
//
// Transport: MCP stdio (spec 2025-06-18) — newline-delimited JSON-RPC 2.0 on
// stdin/stdout. Logs go to stderr only.

import { createInterface } from 'node:readline'

const BASE_URL = process.env.ZDR_HARNESS_URL || 'http://127.0.0.1:4096'
const PASSWORD = process.env.ZDR_HARNESS_PASSWORD
const WORK_DIR = process.env.ZDR_HARNESS_WORK_DIR || `${process.env.HOME}/.zdr-harness/work`
const ASK_TIMEOUT_MS = Number(process.env.ZDR_ASK_TIMEOUT_MS || 10 * 60 * 1000)
const MCP_SERVERS = ['amplitude', 'bugsnag']
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05']

const log = (...args) => console.error('[zdr-ask]', ...args)

if (!PASSWORD) {
  log('ZDR_HARNESS_PASSWORD is not set; refusing to start')
  process.exit(1)
}

const AUTH = `Basic ${Buffer.from(`opencode:${PASSWORD}`).toString('base64')}`

// ---------------------------------------------------------------------------
// Harness HTTP client

class HarnessError extends Error {}

async function harness(method, path, { body, signal } = {}) {
  let res
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      signal,
      headers: {
        authorization: AUTH,
        'x-opencode-directory': WORK_DIR,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') throw err
    throw new HarnessError(
      `ZDR harness is not reachable at ${BASE_URL} (${err.cause?.code || err.message}). ` +
        'Check it with: zdr-harness status'
    )
  }
  const text = await res.text()
  if (res.status === 401) throw new HarnessError('ZDR harness rejected the password (401).')
  if (!res.ok) throw new HarnessError(`ZDR harness ${method} ${path} failed: HTTP ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

async function ensureMcpConnected(signal) {
  let status = await harness('GET', '/mcp', { signal })
  const broken = MCP_SERVERS.filter((name) => status?.[name]?.status !== 'connected')
  for (const name of broken) {
    if (status?.[name]?.status === 'needs_auth') continue
    await harness('POST', `/mcp/${name}/connect`, { signal }).catch((err) => log(`reconnect ${name} failed:`, err.message))
  }
  if (broken.length) status = await harness('GET', '/mcp', { signal })
  const down = MCP_SERVERS.filter((name) => status?.[name]?.status !== 'connected').map(
    (name) => `${name}: ${status?.[name]?.status || 'missing'}${status?.[name]?.error ? ` (${status[name].error})` : ''}`
  )
  if (down.length) {
    throw new HarnessError(
      `ZDR harness MCP servers are not connected — ${down.join('; ')}. ` +
        'Fix with: zdr-harness mcp auth <name> && zdr-harness restart'
    )
  }
}

// Second layer behind the harness agent's answer rule. Only obvious contact
// details are scrubbed; issue/chart IDs are deliberately left intact.
function scrub(text) {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[redacted-email]')
    .replace(/(?<![\w.])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\w.])/g, '[redacted-phone]')
}

async function ask({ question, session_id }, signal) {
  await ensureMcpConnected(signal)
  let sessionId = session_id
  if (!sessionId) {
    const session = await harness('POST', '/session', {
      body: { title: `zdr-ask: ${question.slice(0, 60)}` },
      signal,
    })
    sessionId = session.id
  }

  const timeout = AbortSignal.timeout(ASK_TIMEOUT_MS)
  const combined = AbortSignal.any([signal, timeout])
  let reply
  try {
    reply = await harness('POST', `/session/${encodeURIComponent(sessionId)}/message`, {
      body: { agent: 'zdr', parts: [{ type: 'text', text: question }] },
      signal: combined,
    })
  } catch (err) {
    if (timeout.aborted) {
      throw new HarnessError(
        `ZDR harness did not answer within ${Math.round(ASK_TIMEOUT_MS / 1000)}s. ` +
          `It may still be working; ask a follow-up with session_id ${sessionId}.`
      )
    }
    throw err
  }

  if (reply?.info?.error) {
    const e = reply.info.error
    throw new HarnessError(`ZDR harness error (session ${sessionId}): ${e.data?.message || e.name || JSON.stringify(e)}`)
  }
  const answer = (reply?.parts || [])
    .filter((part) => part.type === 'text' && !part.synthetic && !part.ignored)
    .map((part) => part.text)
    .join('\n')
    .trim()
  return `${scrub(answer || '(the harness returned no text)')}\n\nsession_id: ${sessionId}`
}

async function listSessions(signal) {
  const sessions = await harness('GET', '/session?limit=20', { signal })
  if (!sessions?.length) return 'No ZDR harness sessions yet.'
  return sessions
    .map((s) => `${s.id}  ${new Date(s.time?.updated || s.time?.created).toISOString()}  ${s.title || ''}`)
    .join('\n')
}

// ---------------------------------------------------------------------------
// MCP protocol

const TOOLS = [
  {
    name: 'zdr_ask',
    title: 'Ask the ZDR harness',
    description:
      "Ask Kickoff's zero-data-retention harness a question about Amplitude analytics or BugSnag errors. " +
      'The harness runs the tool calls on a ZDR OpenAI key and returns only an aggregate answer ' +
      '(counts, rates, error classes, IDs, links; never user identifiers or raw payloads). ' +
      'Pass session_id from a previous answer to ask a follow-up in the same conversation. ' +
      'Answers can take a few minutes.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question. Include the project, date range and any filters.' },
        session_id: { type: 'string', description: 'Optional session_id from a previous zdr_ask answer.' },
      },
      required: ['question'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'zdr_sessions',
    title: 'List ZDR harness sessions',
    description: 'List the 20 most recent ZDR harness sessions (id, last update, title).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
]

const inflight = new Map()

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

const reply = (id, result) => send({ jsonrpc: '2.0', id, result })
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } })

async function callTool(id, params) {
  const { name, arguments: args = {} } = params || {}
  const controller = new AbortController()
  inflight.set(id, controller)
  try {
    let text
    if (name === 'zdr_ask') {
      if (typeof args.question !== 'string' || !args.question.trim()) {
        return fail(id, -32602, 'zdr_ask requires a non-empty "question" string')
      }
      if (args.session_id !== undefined && typeof args.session_id !== 'string') {
        return fail(id, -32602, '"session_id" must be a string')
      }
      text = await ask(args, controller.signal)
    } else if (name === 'zdr_sessions') {
      text = await listSessions(controller.signal)
    } else {
      return fail(id, -32602, `Unknown tool: ${name}`)
    }
    reply(id, { content: [{ type: 'text', text }], isError: false })
  } catch (err) {
    if (controller.signal.aborted) return // cancelled: the client expects no response
    const message = err instanceof HarnessError ? err.message : `zdr-ask internal error: ${err.message}`
    if (!(err instanceof HarnessError)) log(err)
    reply(id, { content: [{ type: 'text', text: message }], isError: true })
  } finally {
    inflight.delete(id)
  }
}

function handle(message) {
  if (Array.isArray(message) || typeof message !== 'object' || message === null || message.jsonrpc !== '2.0') {
    return fail(message?.id ?? null, -32600, 'Invalid Request')
  }
  const { id, method, params } = message
  const isNotification = id === undefined

  if (isNotification) {
    if (method === 'notifications/cancelled') inflight.get(params?.requestId)?.abort()
    return
  }

  switch (method) {
    case 'initialize': {
      const requested = params?.protocolVersion
      return reply(id, {
        protocolVersion: SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'zdr-ask', version: '1.0.0' },
        instructions:
          'Use zdr_ask for any question that needs Amplitude or BugSnag data. Never try to fetch that data another way.',
      })
    }
    case 'ping':
      return reply(id, {})
    case 'tools/list':
      return reply(id, { tools: TOOLS })
    case 'tools/call':
      return void callTool(id, params)
    default:
      return fail(id, -32601, `Method not found: ${method}`)
  }
}

const rl = createInterface({ input: process.stdin })
rl.on('line', (line) => {
  if (!line.trim()) return
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return fail(null, -32700, 'Parse error')
  }
  try {
    handle(message)
  } catch (err) {
    log(err)
    if (message?.id !== undefined) fail(message.id, -32603, 'Internal error')
  }
})
rl.on('close', () => {
  for (const controller of inflight.values()) controller.abort()
  process.exit(0)
})
