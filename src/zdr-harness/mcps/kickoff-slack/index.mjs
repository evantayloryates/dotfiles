#!/usr/bin/env node
// kickoff-slack: a zero-dependency MCP stdio server giving the ZDR harness
// read-only access to the Slack channels the Field Notes bot has been
// invited to — coach support conversations, which are client PHI.
//
// Harness-only. The bot token must never be registered in Claude Code, Codex
// or any other non-ZDR client; the answer rule is what makes reading these
// channels acceptable. See ../../README.md.
//
// Only four read methods are called: users.conversations, conversations.history,
// conversations.replies, users.list. The app's scopes allow nothing else, and
// this file cannot post regardless. Reads are live; the never-pruned local
// cache the plan calls for is a later, separate decision.
//
// Transport: MCP stdio (spec 2025-06-18) — newline-delimited JSON-RPC 2.0.

import { createInterface } from 'node:readline'

const TOKEN = process.env.KICKOFF_SLACK_ZDR_BOT_TOKEN
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05']

// Guardrails: conversations.history is Tier 3 (~50/min) for internal apps, and
// one channel can hold years. Every read is bounded and paged explicitly.
const MAX_MESSAGES = 200
const DEFAULT_MESSAGES = 50
const MAX_TEXT_CHARS = 1500
const USER_CACHE_MS = 30 * 60 * 1000

const log = (...args) => console.error('[kickoff-slack]', ...args)

class ToolError extends Error {}

// ---------------------------------------------------------------------------
// Slack Web API, with the one retry a 429 asks for

async function slack(method, params = {}) {
  if (!TOKEN) {
    throw new ToolError(
      'No Slack token: set KICKOFF_SLACK_ZDR_BOT_TOKEN in src/zdr-harness/.env (1Password: personal account, Kickoff vault, ' +
        '"Field Notes Slack Bot" → bot token), then run: zdr-harness reload-auth'
    )
  }
  const body = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) body.set(k, String(v))
  for (let attempt = 0; attempt < 2; attempt++) {
    let res
    try {
      res = await fetch(`https://slack.com/api/${method}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/x-www-form-urlencoded' },
        body,
      })
    } catch (err) {
      throw new ToolError(`Slack is not reachable (${err.cause?.code || err.message})`)
    }
    if (res.status === 429 && attempt === 0) {
      const wait = Math.min(Number(res.headers.get('retry-after') || 5), 30)
      log(`${method} rate limited; waiting ${wait}s`)
      await new Promise((r) => setTimeout(r, wait * 1000))
      continue
    }
    const data = await res.json().catch(() => ({}))
    if (!data.ok) {
      const hint =
        data.error === 'not_in_channel' ? ' (the bot has not been invited to that channel: /invite @Field Notes)' :
        data.error === 'channel_not_found' ? ' (no such channel, or the bot cannot see it)' :
        data.error === 'invalid_auth' || data.error === 'token_revoked' ? ' (the bot token is invalid; reinstall the app and set-token)' : ''
      throw new ToolError(`Slack ${method} failed: ${data.error || `HTTP ${res.status}`}${hint}`)
    }
    return data
  }
  throw new ToolError(`Slack ${method}: still rate limited`)
}

async function paged(method, params, key, want) {
  const out = []
  let cursor
  while (out.length < want) {
    const data = await slack(method, { ...params, limit: Math.min(200, want - out.length), cursor })
    out.push(...(data[key] || []))
    cursor = data.response_metadata?.next_cursor
    if (!cursor) break
  }
  return out.slice(0, want)
}

// ---------------------------------------------------------------------------
// Users: id -> display name, cached; the answer rule decides what leaves

let userCache = { at: 0, map: new Map() }
async function users() {
  if (Date.now() - userCache.at < USER_CACHE_MS && userCache.map.size) return userCache.map
  const members = await paged('users.list', {}, 'members', 5000)
  const map = new Map()
  for (const m of members) {
    map.set(m.id, {
      name: m.real_name || m.profile?.real_name || m.name || m.id,
      is_bot: Boolean(m.is_bot || m.id === 'USLACKBOT'),
      deleted: Boolean(m.deleted),
      title: m.profile?.title || '',
    })
  }
  userCache = { at: Date.now(), map }
  return map
}

// ---------------------------------------------------------------------------
// Argument checking

const CHANNEL_ID = /^[CG][A-Z0-9]{8,}$/
function checkChannel(value) {
  if (typeof value !== 'string' || !CHANNEL_ID.test(value)) throw new ToolError('"channel" must be a Slack channel id like C0ABC123DEF (use channels to find it)')
  return value
}
function checkLimit(value, fallback, max, name) {
  if (value === undefined || value === null) return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > max) throw new ToolError(`"${name}" must be a whole number from 1 to ${max}`)
  return n
}
function checkTime(value, name) {
  if (value === undefined) return undefined
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string' && /^\d{9,10}(\.\d+)?$/.test(value)) return value
  const t = Date.parse(value)
  if (Number.isNaN(t)) throw new ToolError(`"${name}" must be an ISO date/time or a Slack ts`)
  return String(t / 1000)
}
const TS = /^\d{10}\.\d{6}$/
function checkTs(value) {
  if (typeof value !== 'string' || !TS.test(value)) throw new ToolError('"thread_ts" must be a Slack message ts like 1726000000.123456')
  return value
}

// ---------------------------------------------------------------------------
// Rendering: one compact line per message

function fmtTs(ts) {
  return new Date(Number(ts) * 1000).toISOString().replace('T', ' ').slice(0, 16) + 'Z'
}

async function render(messages, channel) {
  const map = await users()
  return messages.map((m) => {
    const who = m.user ? (map.get(m.user)?.name || m.user) : (m.bot_id ? `bot:${m.username || m.bot_id}` : 'unknown')
    let text = (m.text || '').replace(/\s+/g, ' ').trim()
    if (text.length > MAX_TEXT_CHARS) text = `${text.slice(0, MAX_TEXT_CHARS)}… <${m.text.length - MAX_TEXT_CHARS} more chars>`
    const extras = []
    if (m.reply_count) extras.push(`${m.reply_count} replies, thread_ts=${m.ts}`)
    if (m.files?.length) extras.push(`${m.files.length} file(s)`)
    if (m.reactions?.length) extras.push(`reactions: ${m.reactions.map((r) => `${r.name}×${r.count}`).join(' ')}`)
    if (m.subtype) extras.push(m.subtype)
    return `[${fmtTs(m.ts)}] ${who}: ${text}${extras.length ? ` (${extras.join('; ')})` : ''}`
  })
}

// ---------------------------------------------------------------------------
// Tools

async function channels() {
  const list = await paged('users.conversations', { types: 'public_channel,private_channel', exclude_archived: true }, 'channels', 1000)
  if (!list.length) return 'The bot is not in any channel yet. Someone in each target channel must run: /invite @Field Notes'
  const lines = list
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => `${c.id}  #${c.name}  ${c.is_private ? 'private' : 'public'}  members=${c.num_members ?? '?'}${c.purpose?.value ? `  purpose: ${c.purpose.value.slice(0, 80)}` : ''}`)
  return `${list.length} channel(s):\n${lines.join('\n')}`
}

async function history({ channel, since, until, limit, include_threads } = {}) {
  const id = checkChannel(channel)
  const n = checkLimit(limit, DEFAULT_MESSAGES, MAX_MESSAGES, 'limit')
  const oldest = checkTime(since, 'since')
  const latest = checkTime(until, 'until')
  const msgs = await paged('conversations.history', { channel: id, oldest, latest, inclusive: true }, 'messages', n)
  if (!msgs.length) return 'No messages in that window.'
  const lines = await render(msgs.reverse(), id)
  const threads = msgs.filter((m) => m.reply_count).length
  const head = `${msgs.length} message(s)${msgs.length >= n ? ` (capped at ${n}; use since/until to page)` : ''}, oldest first` +
    (threads ? `; ${threads} start threads${include_threads === false ? '' : ' — read one with thread'}` : '')
  return `${head}\n${lines.join('\n')}`
}

async function thread({ channel, thread_ts, limit } = {}) {
  const id = checkChannel(channel)
  const ts = checkTs(thread_ts)
  const n = checkLimit(limit, DEFAULT_MESSAGES, MAX_MESSAGES, 'limit')
  const msgs = await paged('conversations.replies', { channel: id, ts }, 'messages', n)
  if (!msgs.length) return 'No such thread.'
  const lines = await render(msgs, id)
  return `${msgs.length} message(s) in thread (parent first)\n${lines.join('\n')}`
}

async function members({ channel } = {}) {
  const id = checkChannel(channel)
  const ids = await paged('conversations.members', { channel: id }, 'members', 2000)
  const map = await users()
  const rows = ids.map((u) => map.get(u) || { name: u, is_bot: false, deleted: false, title: '' })
  const humans = rows.filter((r) => !r.is_bot && !r.deleted)
  return `${ids.length} member(s), ${humans.length} active humans\n${rows.map((r) => `${r.name}${r.title ? ` — ${r.title}` : ''}${r.is_bot ? ' (bot)' : ''}${r.deleted ? ' (deactivated)' : ''}`).join('\n')}`
}

const TOOLS = [
  {
    name: 'channels',
    title: 'Channels the bot can read',
    description: 'List the Slack channels the bot has been invited to, with ids, privacy and member counts. Start here.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'history',
    title: 'Read channel messages',
    description:
      `Messages in one channel, oldest first, one line each: [time] name: text. Bounded: default ${DEFAULT_MESSAGES}, max ${MAX_MESSAGES}; ` +
      'use since/until (ISO or Slack ts) to page a window. Thread starters show reply counts; read a thread with the thread tool. ' +
      'This is coach and client free text: patterns and counts leave the harness, never a quote.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel id from channels' },
        since: { type: 'string', description: 'ISO date/time or Slack ts (inclusive)' },
        until: { type: 'string', description: 'ISO date/time or Slack ts (inclusive)' },
        limit: { type: 'number' },
      },
      required: ['channel'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'thread',
    title: 'Read one thread',
    description: 'All replies under one message (parent first). Same rules as history.',
    inputSchema: {
      type: 'object',
      properties: { channel: { type: 'string' }, thread_ts: { type: 'string', description: 'The parent message ts' }, limit: { type: 'number' } },
      required: ['channel', 'thread_ts'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'members',
    title: 'Who is in a channel',
    description: 'Members of one channel with titles, bots and deactivated accounts marked. Names are identifiers under the answer rule.',
    inputSchema: { type: 'object', properties: { channel: { type: 'string' } }, required: ['channel'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
]

const HANDLERS = { channels, history, thread, members }

// ---------------------------------------------------------------------------
// MCP stdio loop

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)
const reply = (id, result) => send({ jsonrpc: '2.0', id, result })
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } })

createInterface({ input: process.stdin }).on('line', async (line) => {
  if (!line.trim()) return
  let request
  try {
    request = JSON.parse(line)
  } catch {
    return
  }
  const { id, method, params } = request
  if (method === 'initialize') {
    const requested = params?.protocolVersion
    reply(id, {
      protocolVersion: SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'kickoff-slack', version: '1.0.0' },
      instructions:
        'Read-only Slack channels the Field Notes bot is in: coach support conversations. Call channels first. ' +
        'Messages are client free text: report patterns and counts, never a quote or a name outside the harness.',
    })
  } else if (method === 'tools/list') {
    reply(id, { tools: TOOLS })
  } else if (method === 'tools/call') {
    const { name, arguments: args = {} } = params || {}
    const handler = HANDLERS[name]
    if (!handler) return fail(id, -32602, `Unknown tool: ${name}`)
    try {
      const text = await handler(args)
      reply(id, { content: [{ type: 'text', text }], isError: false })
    } catch (err) {
      if (!(err instanceof ToolError)) log(err)
      const message = err instanceof ToolError ? err.message : `kickoff-slack internal error: ${err.message}`
      reply(id, { content: [{ type: 'text', text: message }], isError: true })
    }
  } else if (method === 'ping') {
    reply(id, {})
  } else if (id !== undefined) {
    fail(id, -32601, `Unsupported method: ${method}`)
  }
})
