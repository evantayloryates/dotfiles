#!/usr/bin/env node
// harness-memory: a zero-dependency MCP stdio server giving the ZDR harness a
// durable place to keep what it learns. Sessions are pruned after 14 days; this
// is not, so an agent can improve at Kickoff's data over time.
//
// Notes are plain Markdown under ~/.zdr-harness/memory/, one file per topic.
// Because memory outlives the data it came from, every note is scrubbed on the
// way in: emails, phone numbers and long opaque identifiers are replaced with
// placeholders. The agents are told to record the pattern, not the person; this
// is the mechanical backstop for when they forget.
//
// Transport: MCP stdio (spec 2025-06-18) — newline-delimited JSON-RPC 2.0.

import { createInterface } from 'node:readline'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, appendFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DIR = process.env.ZDR_MEMORY_DIR || join(homedir(), '.zdr-harness/memory')
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05']
const MAX_NOTE = 4000
const MAX_FILE = 200_000
const MAX_TOPICS = 200
const TOPIC = /^[a-z0-9][a-z0-9-]{1,48}$/

const log = (...args) => console.error('[harness-memory]', ...args)

class ToolError extends Error {}

mkdirSync(DIR, { recursive: true, mode: 0o700 })

// Identifiers that would pin a note to one person never belong in memory.
function scrub(text) {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>')
    .replace(/(?<![\w.])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\w.])/g, '<phone>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b(?:user|distinct|device|session|person)[_-]?id\s*[:=]\s*[A-Za-z0-9_-]{4,}/gi, (m) =>
      `${m.split(/[:=]/)[0].trim()}: <id>`
    )
}

const fileFor = (topic) => join(DIR, `${topic}.md`)

function topics() {
  try {
    return readdirSync(DIR)
      .filter((f) => f.endsWith('.md'))
      .map((f) => {
        const path = join(DIR, f)
        const stat = statSync(path)
        const body = readFileSync(path, 'utf8')
        return {
          topic: f.replace(/\.md$/, ''),
          entries: (body.match(/^## /gm) || []).length,
          updated: stat.mtime.toISOString().slice(0, 10),
          bytes: stat.size,
        }
      })
      .sort((a, b) => (a.updated < b.updated ? 1 : -1))
  } catch {
    return []
  }
}

function write({ topic, note }) {
  if (typeof topic !== 'string' || !TOPIC.test(topic)) {
    throw new ToolError('"topic" must be a short kebab-case slug, e.g. "bugsnag-query-shapes"')
  }
  if (typeof note !== 'string' || !note.trim()) throw new ToolError('"note" is required')
  if (note.length > MAX_NOTE) throw new ToolError(`"note" is capped at ${MAX_NOTE} characters; summarise it`)

  const existing = topics()
  if (!existing.some((t) => t.topic === topic) && existing.length >= MAX_TOPICS) {
    throw new ToolError(`memory already holds ${MAX_TOPICS} topics; add to one of them instead`)
  }
  const path = fileFor(topic)
  let size = 0
  try {
    size = statSync(path).size
  } catch {
    writeFileSync(path, `# ${topic}\n`, { mode: 0o600 })
  }
  if (size > MAX_FILE) throw new ToolError(`${topic} is full (${MAX_FILE} bytes); start a narrower topic`)

  const cleaned = scrub(note.trim())
  const stamp = new Date().toISOString().slice(0, 10)
  appendFileSync(path, `\n## ${stamp}\n\n${cleaned}\n`)
  const redacted = cleaned !== note.trim()
  return `Saved to ${topic}.md${redacted ? ' (identifiers replaced with placeholders)' : ''}.`
}

function read({ topic }) {
  if (typeof topic !== 'string' || !TOPIC.test(topic)) throw new ToolError('"topic" must be a kebab-case slug')
  try {
    return readFileSync(fileFor(topic), 'utf8')
  } catch {
    throw new ToolError(`No memory for "${topic}". ${list()}`)
  }
}

function list() {
  const all = topics()
  if (!all.length) return 'Memory is empty.'
  return [
    `${all.length} topic(s):`,
    ...all.map((t) => `  ${t.topic}  ${t.entries} entr${t.entries === 1 ? 'y' : 'ies'}  updated ${t.updated}`),
  ].join('\n')
}

function search({ query, limit = 12 }) {
  if (typeof query !== 'string' || !query.trim()) throw new ToolError('"query" is required')
  let re
  try {
    re = new RegExp(query, 'i')
  } catch {
    re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  }
  const hits = []
  for (const { topic } of topics()) {
    const body = readFileSync(fileFor(topic), 'utf8')
    for (const block of body.split(/^## /m).slice(1)) {
      const [date, ...rest] = block.split('\n')
      const text = rest.join('\n').trim()
      if (re.test(text) || re.test(topic)) hits.push(`${topic} (${date.trim()}): ${text.slice(0, 600)}`)
      if (hits.length >= limit) break
    }
    if (hits.length >= limit) break
  }
  return hits.length ? hits.join('\n\n') : `Nothing in memory matches ${JSON.stringify(query)}. ${list()}`
}

const TOOLS = [
  {
    name: 'memory_write',
    title: 'Remember something durable',
    description:
      'Save a lasting lesson to the harness memory: a query shape that works, which service logs where, a field ' +
      'that is always null, a tool gotcha. Memory outlives the data it came from, so record the pattern rather ' +
      'than the person — identifiers are replaced with placeholders automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Short kebab-case slug, e.g. "bugsnag-query-shapes"' },
        note: { type: 'string', description: 'What was learned, in a few sentences.' },
      },
      required: ['topic', 'note'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, openWorldHint: false },
  },
  {
    name: 'memory_search',
    title: 'Search what the harness has learned',
    description: 'Search harness memory before re-deriving something. Matches a regex or plain text across all topics.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text or regex to look for.' },
        limit: { type: 'number', description: 'Maximum entries (default 12).' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'memory_list',
    title: 'List memory topics',
    description: 'List every memory topic with its entry count and when it was last updated.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'memory_read',
    title: 'Read one memory topic',
    description: 'Read every entry saved under one topic.',
    inputSchema: {
      type: 'object',
      properties: { topic: { type: 'string', description: 'The topic slug.' } },
      required: ['topic'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
]

const HANDLERS = {
  memory_write: write,
  memory_search: search,
  memory_list: list,
  memory_read: read,
}

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)
const reply = (id, result) => send({ jsonrpc: '2.0', id, result })
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } })

createInterface({ input: process.stdin }).on('line', (line) => {
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
      serverInfo: { name: 'harness-memory', version: '1.0.0' },
      instructions:
        'Durable memory for this harness. Search it before re-deriving something, and write down what should ' +
        'outlast a session. Keep entries free of client detail.',
    })
  } else if (method === 'tools/list') {
    reply(id, { tools: TOOLS })
  } else if (method === 'tools/call') {
    const { name, arguments: args = {} } = params || {}
    const handler = HANDLERS[name]
    if (!handler) return fail(id, -32602, `Unknown tool: ${name}`)
    try {
      reply(id, { content: [{ type: 'text', text: handler(args) }], isError: false })
    } catch (err) {
      if (!(err instanceof ToolError)) log(err)
      const message = err instanceof ToolError ? err.message : `harness-memory internal error: ${err.message}`
      reply(id, { content: [{ type: 'text', text: message }], isError: true })
    }
  } else if (method === 'ping') {
    reply(id, {})
  } else if (id !== undefined) {
    fail(id, -32601, `Unsupported method: ${method}`)
  }
})
