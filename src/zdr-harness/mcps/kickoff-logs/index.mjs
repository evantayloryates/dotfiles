#!/usr/bin/env node
// kickoff-logs: a zero-dependency MCP stdio server giving the ZDR harness
// read-only access to Kickoff's production Lambda logs in CloudWatch.
//
// Harness-only. These logs carry request payloads and client free text, so this
// server must never be registered in Claude Code, Codex or any other non-ZDR
// client. See ../../README.md.
//
// Only four read APIs are implemented, so the blast radius is this file rather
// than whatever the credential happens to allow: DescribeLogGroups,
// DescribeLogStreams, FilterLogEvents and Logs Insights
// (StartQuery/GetQueryResults/StopQuery). Nothing here can write.
//
// Transport: MCP stdio (spec 2025-06-18) — newline-delimited JSON-RPC 2.0 on
// stdin/stdout. Logs go to stderr only.

import { createHash, createHmac } from 'node:crypto'
import { createInterface } from 'node:readline'

const REGION = process.env.KICKOFF_ZDR_AWS_REGION || 'us-west-1'
const ACCESS_KEY_ID = process.env.KICKOFF_ZDR_AWS_ACCESS_KEY_ID
const SECRET_ACCESS_KEY = process.env.KICKOFF_ZDR_AWS_SECRET_ACCESS_KEY
const SESSION_TOKEN = process.env.KICKOFF_ZDR_AWS_SESSION_TOKEN
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05']

// The credential is scoped to production groups in IAM as well; this is the
// second wall, so a mistyped group name fails here rather than at AWS.
const ALLOWED_GROUP = /^\/aws\/lambda\/(kickoff|kudos)-[a-z0-9-]*production(-|$)/

// Guardrails. Insights bills per GB scanned and kudos-node-production-graphql
// alone holds ~500 GB, so an unbounded window is a real bill, not a typo.
const MAX_RANGE_MINUTES = 7 * 24 * 60
const DEFAULT_RANGE_MINUTES = 60
const MAX_EVENTS = 1000
const DEFAULT_EVENTS = 100
const MAX_QUERY_ROWS = 1000
const MAX_MESSAGE_CHARS = 4000
const QUERY_TIMEOUT_MS = 90 * 1000

const log = (...args) => console.error('[kickoff-logs]', ...args)

class ToolError extends Error {}

// ---------------------------------------------------------------------------
// SigV4, from node stdlib

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const hmac = (key, value) => createHmac('sha256', key).update(value).digest()

async function cloudwatch(action, payload) {
  if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
    throw new ToolError(
      'No AWS credentials: set KICKOFF_ZDR_AWS_ACCESS_KEY_ID and KICKOFF_ZDR_AWS_SECRET_ACCESS_KEY ' +
        'in src/zdr-harness/.env, then run: zdr-harness reload-auth'
    )
  }
  const host = `logs.${REGION}.amazonaws.com`
  const body = JSON.stringify(payload)
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)

  const headers = {
    host,
    'content-type': 'application/x-amz-json-1.1',
    'x-amz-date': amzDate,
    'x-amz-target': `Logs_20140328.${action}`,
  }
  if (SESSION_TOKEN) headers['x-amz-security-token'] = SESSION_TOKEN

  const names = Object.keys(headers).sort()
  const signedHeaders = names.join(';')
  const canonicalHeaders = names.map((k) => `${k}:${headers[k].trim()}\n`).join('')
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, sha256(body)].join('\n')
  const scope = `${dateStamp}/${REGION}/logs/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n')

  let key = hmac(`AWS4${SECRET_ACCESS_KEY}`, dateStamp)
  for (const part of [REGION, 'logs', 'aws4_request']) key = hmac(key, part)
  const signature = createHmac('sha256', key).update(stringToSign).digest('hex')
  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  let res
  try {
    res = await fetch(`https://${host}/`, { method: 'POST', headers, body })
  } catch (err) {
    throw new ToolError(`CloudWatch Logs is not reachable (${err.cause?.code || err.message})`)
  }
  const text = await res.text()
  if (!res.ok) {
    const type = (text.match(/"__type"\s*:\s*"([^"]+)"/) || [])[1] || `HTTP ${res.status}`
    const message = (text.match(/"[Mm]essage"\s*:\s*"([^"]+)"/) || [])[1] || text.slice(0, 200)
    throw new ToolError(`${action} failed: ${type}: ${message}`)
  }
  return text ? JSON.parse(text) : {}
}

// ---------------------------------------------------------------------------
// Argument checking

function checkGroup(name) {
  if (typeof name !== 'string' || !name) throw new ToolError('"log_group" is required')
  if (!ALLOWED_GROUP.test(name)) {
    throw new ToolError(
      `${name} is outside this harness's scope. Only production Lambda groups are readable: ` +
        '/aws/lambda/kickoff-*-production-* and /aws/lambda/kudos-*-production-*'
    )
  }
  return name
}

function checkWindow(args) {
  const minutes = args.minutes === undefined ? DEFAULT_RANGE_MINUTES : Number(args.minutes)
  if (!Number.isFinite(minutes) || minutes <= 0) throw new ToolError('"minutes" must be a positive number')
  if (minutes > MAX_RANGE_MINUTES) {
    throw new ToolError(`"minutes" is capped at ${MAX_RANGE_MINUTES} (7 days) to bound the bytes scanned`)
  }
  const endsAgo = args.ends_minutes_ago === undefined ? 0 : Number(args.ends_minutes_ago)
  if (!Number.isFinite(endsAgo) || endsAgo < 0) throw new ToolError('"ends_minutes_ago" must be >= 0')
  const end = Date.now() - endsAgo * 60_000
  return { start: Math.floor(end - minutes * 60_000), end: Math.floor(end), minutes }
}

function checkLimit(value, fallback, cap, label) {
  const limit = value === undefined ? fallback : Number(value)
  if (!Number.isFinite(limit) || limit <= 0) throw new ToolError(`"${label}" must be a positive number`)
  return Math.min(Math.floor(limit), cap)
}

const clip = (text) =>
  typeof text === 'string' && text.length > MAX_MESSAGE_CHARS
    ? `${text.slice(0, MAX_MESSAGE_CHARS)}…[truncated ${text.length - MAX_MESSAGE_CHARS} chars]`
    : text

// ---------------------------------------------------------------------------
// Tools

async function listGroups(args) {
  const prefix = args.name_prefix === undefined ? '/aws/lambda/' : String(args.name_prefix)
  const limit = checkLimit(args.limit, 50, 200, 'limit')
  const out = []
  let nextToken
  do {
    const page = await cloudwatch('DescribeLogGroups', {
      logGroupNamePrefix: prefix,
      limit: 50,
      ...(nextToken ? { nextToken } : {}),
    })
    for (const group of page.logGroups || []) {
      if (ALLOWED_GROUP.test(group.logGroupName)) out.push(group)
    }
    nextToken = page.nextToken
  } while (nextToken && out.length < limit)

  if (!out.length) return `No readable production log groups match prefix ${prefix}.`
  return out
    .slice(0, limit)
    .map((g) => {
      const mb = (g.storedBytes || 0) / 1e6
      const retention = g.retentionInDays ? `${g.retentionInDays}d` : 'never expires'
      return `${g.logGroupName}\t${mb.toFixed(1)} MB\tretention: ${retention}`
    })
    .join('\n')
}

async function describeStreams(args) {
  const logGroupName = checkGroup(args.log_group)
  const limit = checkLimit(args.limit, 20, 50, 'limit')
  const page = await cloudwatch('DescribeLogStreams', {
    logGroupName,
    orderBy: 'LastEventTime',
    descending: true,
    limit,
  })
  const streams = page.logStreams || []
  if (!streams.length) return `${logGroupName} has no streams.`
  return streams
    .map((s) => {
      const last = s.lastEventTimestamp ? new Date(s.lastEventTimestamp).toISOString() : 'never'
      return `${s.logStreamName}\tlast event: ${last}`
    })
    .join('\n')
}

async function search(args) {
  const logGroupName = checkGroup(args.log_group)
  const { start, end, minutes } = checkWindow(args)
  const limit = checkLimit(args.limit, DEFAULT_EVENTS, MAX_EVENTS, 'limit')
  const page = await cloudwatch('FilterLogEvents', {
    logGroupName,
    startTime: start,
    endTime: end,
    limit,
    ...(args.pattern ? { filterPattern: String(args.pattern) } : {}),
  })
  const events = page.events || []
  const header =
    `${events.length} event(s) from ${logGroupName}, last ${minutes} min` +
    (args.pattern ? `, pattern ${JSON.stringify(String(args.pattern))}` : '') +
    (events.length === limit ? ` (capped at ${limit})` : '')
  if (!events.length) return header
  const lines = events.map((e) => `${new Date(e.timestamp).toISOString()}\t${e.logStreamName}\t${clip(e.message).trimEnd()}`)
  return `${header}\n\n${lines.join('\n')}`
}

async function insights(args) {
  const groups = Array.isArray(args.log_groups) ? args.log_groups.map(checkGroup) : [checkGroup(args.log_group)]
  if (!groups.length) throw new ToolError('name at least one log group; wildcards are not accepted')
  if (groups.length > 5) throw new ToolError('at most 5 log groups per query')
  if (typeof args.query !== 'string' || !args.query.trim()) throw new ToolError('"query" (Logs Insights syntax) is required')
  const { start, end, minutes } = checkWindow(args)
  const limit = checkLimit(args.limit, 100, MAX_QUERY_ROWS, 'limit')

  const { queryId } = await cloudwatch('StartQuery', {
    logGroupNames: groups,
    startTime: Math.floor(start / 1000),
    endTime: Math.floor(end / 1000),
    queryString: args.query,
    limit,
  })

  const deadline = Date.now() + QUERY_TIMEOUT_MS
  let result
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500))
    result = await cloudwatch('GetQueryResults', { queryId })
    if (['Complete', 'Failed', 'Cancelled', 'Timeout'].includes(result.status)) break
  }
  if (!result || !['Complete', 'Failed', 'Cancelled', 'Timeout'].includes(result.status)) {
    await cloudwatch('StopQuery', { queryId }).catch(() => {})
    throw new ToolError(`query still running after ${QUERY_TIMEOUT_MS / 1000}s; stopped it. Narrow the window or the groups.`)
  }
  if (result.status !== 'Complete') throw new ToolError(`query ${result.status.toLowerCase()}`)

  const stats = result.statistics || {}
  const scanned = stats.bytesScanned ? `${(stats.bytesScanned / 1e9).toFixed(3)} GB scanned` : 'scan size unknown'
  const header =
    `${(result.results || []).length} row(s) over ${groups.length} group(s), last ${minutes} min; ` +
    `${scanned}, ${stats.recordsMatched ?? '?'} records matched`
  if (!result.results?.length) return header
  const rows = result.results.map((row) =>
    row
      .filter((f) => f.field !== '@ptr')
      .map((f) => `${f.field}=${clip(f.value)}`)
      .join('\t')
  )
  return `${header}\n\n${rows.join('\n')}`
}

// ---------------------------------------------------------------------------
// MCP protocol

const TOOLS = [
  {
    name: 'list_groups',
    title: 'List production Lambda log groups',
    description:
      "List Kickoff's production Lambda log groups in CloudWatch with their stored size and retention. " +
      'Only /aws/lambda/kickoff-*-production-* and /aws/lambda/kudos-*-production-* are readable.',
    inputSchema: {
      type: 'object',
      properties: {
        name_prefix: { type: 'string', description: 'Log group name prefix, e.g. /aws/lambda/kickoff-jobs-production-' },
        limit: { type: 'number', description: 'Maximum groups to return (default 50, max 200)' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'list_streams',
    title: 'List log streams',
    description: 'List the most recently active log streams in one production Lambda log group, newest first.',
    inputSchema: {
      type: 'object',
      properties: {
        log_group: { type: 'string', description: 'Full log group name' },
        limit: { type: 'number', description: 'Maximum streams (default 20, max 50)' },
      },
      required: ['log_group'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'search',
    title: 'Search log events',
    description:
      'Read log events from one production Lambda log group in a bounded time window, optionally filtered by a ' +
      'CloudWatch filter pattern (e.g. "ERROR" or "?Timeout ?ECONNRESET"). Returns raw log lines, so treat the ' +
      'output as sensitive: summarise, never quote identifiers back.',
    inputSchema: {
      type: 'object',
      properties: {
        log_group: { type: 'string', description: 'Full log group name' },
        pattern: { type: 'string', description: 'CloudWatch Logs filter pattern' },
        minutes: { type: 'number', description: `Window length in minutes (default ${DEFAULT_RANGE_MINUTES}, max ${MAX_RANGE_MINUTES})` },
        ends_minutes_ago: { type: 'number', description: 'Shift the window back by this many minutes (default 0 = now)' },
        limit: { type: 'number', description: `Maximum events (default ${DEFAULT_EVENTS}, max ${MAX_EVENTS})` },
      },
      required: ['log_group'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'query',
    title: 'Run a Logs Insights query',
    description:
      'Run a CloudWatch Logs Insights query over up to 5 named production Lambda log groups in a bounded window. ' +
      'Best for aggregates: counts by error class, latency percentiles, request volume. Reports bytes scanned, ' +
      'which is what the query costs.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Logs Insights query, e.g. "fields @message | filter @message like /ERROR/ | stats count() by bin(1h)"' },
        log_groups: { type: 'array', items: { type: 'string' }, description: 'Up to 5 full log group names' },
        log_group: { type: 'string', description: 'A single log group, if you only need one' },
        minutes: { type: 'number', description: `Window length in minutes (default ${DEFAULT_RANGE_MINUTES}, max ${MAX_RANGE_MINUTES})` },
        ends_minutes_ago: { type: 'number', description: 'Shift the window back by this many minutes (default 0 = now)' },
        limit: { type: 'number', description: `Maximum rows (default 100, max ${MAX_QUERY_ROWS})` },
      },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
]

const HANDLERS = { list_groups: listGroups, list_streams: describeStreams, search, query: insights }

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)
const reply = (id, result) => send({ jsonrpc: '2.0', id, result })
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } })

async function callTool(id, params) {
  const { name, arguments: args = {} } = params || {}
  const handler = HANDLERS[name]
  if (!handler) return fail(id, -32602, `Unknown tool: ${name}`)
  try {
    reply(id, { content: [{ type: 'text', text: await handler(args) }], isError: false })
  } catch (err) {
    if (!(err instanceof ToolError)) log(err)
    const message = err instanceof ToolError ? err.message : `kickoff-logs internal error: ${err.message}`
    reply(id, { content: [{ type: 'text', text: message }], isError: true })
  }
}

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
      serverInfo: { name: 'kickoff-logs', version: '1.0.0' },
      instructions:
        "Read-only access to Kickoff's production Lambda logs. Windows and result counts are capped; " +
        'name an exact log group. Log lines carry client data: report aggregates and error classes, not identifiers.',
    })
  } else if (method === 'tools/list') {
    reply(id, { tools: TOOLS })
  } else if (method === 'tools/call') {
    callTool(id, params)
  } else if (method === 'ping') {
    reply(id, {})
  } else if (id !== undefined) {
    fail(id, -32601, `Unsupported method: ${method}`)
  }
})
