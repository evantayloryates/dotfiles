#!/usr/bin/env node
// kickoff-db: an MCP stdio server giving the ZDR harness read-only access to
// Kickoff's LIVE production database (the read replica) and to the archived
// call transcripts in S3 that its rows point at.
//
// Harness-only. This is raw PHI: names, emails, health details, and the full
// text of coaching calls. It must never be registered in Claude Code, Codex or
// any other non-ZDR client. The sanitized copy exists for those. See
// ../../README.md.
//
// Walls, in order:
//   1. The credential: kudos_ro has SELECT and SHOW VIEW on kudos_production and
//      nothing else, on a replica that is itself read_only=1.
//   2. This file: one statement per call, only SELECT/WITH/SHOW/EXPLAIN/DESCRIBE,
//      inside a READ ONLY transaction with a server-side execution timeout,
//      rows and bytes capped. Transcripts come only from the one archive bucket
//      and only by way of a database row that names the object.
//   3. The answer rule in the prompts governs what leaves the harness.
//
// Transport: MCP stdio (spec 2025-06-18) — newline-delimited JSON-RPC 2.0.
// The database driver is mysql2, pinned into ~/.zdr-harness/opt like OpenCode.

import { createHash, createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { checkServerIdentity } from 'node:tls'
import { gunzipSync } from 'node:zlib'

const OPT = process.env.ZDR_HARNESS_OPT
if (!OPT) {
  console.error('[kickoff-db] ZDR_HARNESS_OPT is not set; start this server through kickoff-db-mcp')
  process.exit(1)
}
const mysql = createRequire(join(OPT, 'noop.js'))('mysql2/promise')

const DB_URL = process.env.KICKOFF_ZDR_DB_URL
const TUNNEL_PORT = Number(process.env.KICKOFF_ZDR_DB_TUNNEL_PORT || 0)
const RDS_CA = process.env.ZDR_HARNESS_RDS_CA
const REGION = process.env.KICKOFF_ZDR_AWS_REGION || 'us-west-1'
const ACCESS_KEY_ID = process.env.KICKOFF_ZDR_AWS_ACCESS_KEY_ID
const SECRET_ACCESS_KEY = process.env.KICKOFF_ZDR_AWS_SECRET_ACCESS_KEY
const SESSION_TOKEN = process.env.KICKOFF_ZDR_AWS_SESSION_TOKEN
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05']

// Second wall for transcripts: the only bucket this server will ever read,
// regardless of what a row or the credential says.
const ALLOWED_BUCKET = 'kickoff-transcript-archive-production'
const ALLOWED_KEY = /^transcripts\/v1\/\d+\/\d+\/assemblyai\.json\.gz$/

// Guardrails. The replica serves the product too, so a runaway query is a
// production incident, not a slow answer.
const STATEMENT_TIMEOUT_MS = 30 * 1000
const DEFAULT_ROWS = 200
const MAX_ROWS = 1000
const MAX_RESULT_BYTES = 250_000
const MAX_CELL_CHARS = 2000
const DEFAULT_TRANSCRIPT_CHARS = 20_000
const MAX_TRANSCRIPT_CHARS = 80_000
const MAX_TRANSCRIPT_LIST = 200

const log = (...args) => console.error('[kickoff-db]', ...args)

class ToolError extends Error {}

// ---------------------------------------------------------------------------
// Database connection: one lazily opened, read-only session

let conn = null
let target = null

function parseUrl() {
  if (!DB_URL) {
    throw new ToolError(
      'No database URL: set KICKOFF_ZDR_DB_URL in src/zdr-harness/.env (1Password: personal account, ' +
        'Kickoff vault, KICKOFF_ZDR_DB_URL), then run: zdr-harness reload-auth'
    )
  }
  let u
  try {
    u = new URL(DB_URL)
  } catch {
    throw new ToolError('KICKOFF_ZDR_DB_URL is not a valid mysql:// URL')
  }
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
  }
}

async function connection() {
  if (conn) return conn
  target = parseUrl()
  const ca = RDS_CA ? readFileSync(RDS_CA, 'utf8') : undefined
  const ssl = {
    ca,
    rejectUnauthorized: true,
    // Through the SSM tunnel the socket says 127.0.0.1; the certificate still
    // has to be the replica's, so verify it against the real hostname.
    checkServerIdentity: (_host, cert) => checkServerIdentity(target.host, cert),
  }
  const c = await mysql.createConnection({
    host: TUNNEL_PORT ? '127.0.0.1' : target.host,
    port: TUNNEL_PORT || target.port,
    user: target.user,
    password: target.password,
    database: target.database,
    ssl,
    connectTimeout: 15_000,
    decimalNumbers: true,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
  }).catch((err) => {
    const hint = TUNNEL_PORT
      ? ` (tunnel on 127.0.0.1:${TUNNEL_PORT}: is it up? zdr-harness tunnel status)`
      : ' (the replica is private: set KICKOFF_ZDR_DB_TUNNEL_PORT and start the tunnel)'
    throw new ToolError(`Cannot connect to the production read replica: ${err.code || err.message}${hint}`)
  })
  // Belt and braces on top of kudos_ro's grants and the replica's read_only.
  await c.query('SET SESSION TRANSACTION READ ONLY')
  await c.query(`SET SESSION MAX_EXECUTION_TIME=${STATEMENT_TIMEOUT_MS}`)
  await c.query("SET SESSION sql_mode=CONCAT(@@sql_mode,',NO_ENGINE_SUBSTITUTION')")
  c.on('error', (err) => {
    log('connection lost:', err.code || err.message)
    conn = null
  })
  conn = c
  return c
}

// ---------------------------------------------------------------------------
// SQL checking

const READ_START = /^(SELECT|WITH|SHOW|EXPLAIN|DESCRIBE|DESC)\b/i
const FORBIDDEN = /\b(INTO\s+(OUTFILE|DUMPFILE)|FOR\s+UPDATE|LOCK\s+IN\s+SHARE\s+MODE|FOR\s+SHARE|LOAD_FILE\s*\(|SLEEP\s*\(|BENCHMARK\s*\()/i

function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/#[^\n]*/g, ' ')
}

// True when a semicolon appears outside quotes: a second statement.
function hasStatementBreak(sql) {
  let q = null
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    if (q) {
      if (ch === '\\') i++
      else if (ch === q) q = null
    } else if (ch === "'" || ch === '"' || ch === '`') q = ch
    else if (ch === ';') return true
  }
  return false
}

function checkSql(sql) {
  if (typeof sql !== 'string' || !sql.trim()) throw new ToolError('"sql" is required')
  let s = stripComments(sql).trim().replace(/;\s*$/, '')
  if (!s) throw new ToolError('"sql" is empty after removing comments')
  if (!READ_START.test(s)) {
    throw new ToolError('Only SELECT, WITH, SHOW, EXPLAIN and DESCRIBE statements run here; this server cannot write')
  }
  if (hasStatementBreak(s)) throw new ToolError('One statement per call')
  const bad = s.match(FORBIDDEN)
  if (bad) throw new ToolError(`${bad[1]} is not allowed here`)
  return s
}

function checkLimit(value, fallback, max, name) {
  if (value === undefined || value === null) return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > max) throw new ToolError(`"${name}" must be a whole number from 1 to ${max}`)
  return n
}

function checkInt(value, name) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) throw new ToolError(`"${name}" must be a positive whole number`)
  return n
}

const IDENT = /^[A-Za-z0-9_]{1,64}$/
function checkIdent(value, name) {
  if (typeof value !== 'string' || !IDENT.test(value)) throw new ToolError(`"${name}" must be a plain table name`)
  return value
}

// ---------------------------------------------------------------------------
// Result shaping

function shapeRows(rows, limit) {
  const truncatedRows = rows.length > limit
  const kept = truncatedRows ? rows.slice(0, limit) : rows
  let bytes = 0
  let truncatedCells = 0
  const out = []
  for (const row of kept) {
    const shaped = {}
    for (const [k, v] of Object.entries(row)) {
      let val = v
      if (Buffer.isBuffer(val)) val = `<${val.length} bytes>`
      else if (typeof val === 'string' && val.length > MAX_CELL_CHARS) {
        val = `${val.slice(0, MAX_CELL_CHARS)}… <truncated ${val.length - MAX_CELL_CHARS} chars>`
        truncatedCells++
      }
      shaped[k] = val
    }
    const line = JSON.stringify(shaped)
    bytes += line.length + 1
    if (bytes > MAX_RESULT_BYTES) return { rows: out, truncatedRows: true, truncatedCells, bytesCapped: true }
    out.push(shaped)
  }
  return { rows: out, truncatedRows, truncatedCells, bytesCapped: false }
}

// ---------------------------------------------------------------------------
// Tools

const GUIDE = `Kickoff production database (LIVE, read replica) — kudos_production, MySQL 8.4, ~400 tables.
This is the real data, not the sanitized copy: every client row is a person. Aggregate before you answer.

Physical names are snake_case (clients.coach_id, created_at). Objection models in the codebase use camelCase for the same columns.
Core: clients (the customer; clients.user_id -> users, clients.coach_id -> coaches), coaches, users (login/person accounts),
workouts + workout_programs, sms + sms_conversations (client<->coach messaging), kickoff_calls + meeting_rooms (video calls),
files (uploads; files.user_id), client memory / nutrition / insurance / payment tables by name.
Discovery: use list_tables with a LIKE pattern, then describe_table on a short named list. Do not scan information_schema.columns broadly.
Time: *_at columns are UTC datetimes; date columns are local calendar dates. Say which timestamp defines an event and whether ranges are inclusive.
Counting traps: soft deletes (deleted_at), status history tables, test accounts, and one-to-many joins that multiply rows.

Call transcripts: a video call is meeting_rooms (kickoff_call_id, room_started_at). meeting_room_file_transcripts links a room to
file_transcripts (status, provider). file_transcript_artifacts (is_canonical=1, status='completed') holds the archived object:
storage_bucket/storage_key/storage_version_id/sha256/bytes. Use transcript_list to find them and transcript_get to read one;
transcript_get verifies the sha256 and renders speaker turns. ~175k archived transcripts, ~23 GB. Transcripts are verbatim
client speech: quote nothing outside the harness, summarise themes with cell-size protection.

Every query runs as kudos_ro (SELECT only) inside a READ ONLY transaction with a ${STATEMENT_TIMEOUT_MS / 1000}s server timeout,
capped at ${MAX_ROWS} rows / ${Math.round(MAX_RESULT_BYTES / 1000)} KB. Prefer aggregates and LIMIT; the replica also serves the product.`

async function guide() {
  return GUIDE
}

async function listTables({ like, limit } = {}) {
  const c = await connection()
  const n = checkLimit(limit, 100, 500, 'limit')
  const params = [target.database]
  let where = ''
  if (like !== undefined) {
    if (typeof like !== 'string' || like.length > 64) throw new ToolError('"like" must be a short LIKE pattern, e.g. %client%')
    where = ' AND table_name LIKE ?'
    params.push(like)
  }
  const [rows] = await c.query(
    `SELECT table_name, table_rows AS approx_rows, ROUND(data_length/1048576) AS data_mb FROM information_schema.tables ` +
      `WHERE table_schema=?${where} ORDER BY table_name LIMIT ${n}`,
    params
  )
  if (!rows.length) return like ? `No tables match ${like}.` : 'No tables.'
  return rows.map((r) => `${r.table_name}  ~${r.approx_rows} rows  ${r.data_mb} MB`).join('\n')
}

async function describeTable({ table }) {
  const c = await connection()
  const t = checkIdent(table, 'table')
  const [cols] = await c.query(
    'SELECT column_name, column_type, is_nullable, column_key, column_default, extra FROM information_schema.columns ' +
      'WHERE table_schema=? AND table_name=? ORDER BY ordinal_position',
    [target.database, t]
  )
  if (!cols.length) throw new ToolError(`No table named ${t}. Try list_tables with a LIKE pattern.`)
  const [idx] = await c.query(
    'SELECT index_name, non_unique, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols FROM information_schema.statistics ' +
      'WHERE table_schema=? AND table_name=? GROUP BY index_name, non_unique ORDER BY index_name',
    [target.database, t]
  )
  const [fks] = await c.query(
    'SELECT column_name, referenced_table_name, referenced_column_name FROM information_schema.key_column_usage ' +
      'WHERE table_schema=? AND table_name=? AND referenced_table_name IS NOT NULL ORDER BY column_name',
    [target.database, t]
  )
  const lines = [`${t}`, 'columns:']
  for (const col of cols) {
    lines.push(
      `  ${col.column_name}  ${col.column_type}${col.is_nullable === 'NO' ? ' NOT NULL' : ''}` +
        `${col.column_key ? ` [${col.column_key}]` : ''}${col.extra ? ` ${col.extra}` : ''}`
    )
  }
  if (idx.length) {
    lines.push('indexes:')
    for (const i of idx) lines.push(`  ${i.index_name}${i.non_unique ? '' : ' (unique)'}: ${i.cols}`)
  }
  if (fks.length) {
    lines.push('foreign keys:')
    for (const f of fks) lines.push(`  ${f.column_name} -> ${f.referenced_table_name}.${f.referenced_column_name}`)
  }
  return lines.join('\n')
}

async function query({ sql, limit } = {}) {
  const c = await connection()
  const statement = checkSql(sql)
  const rowLimit = checkLimit(limit, DEFAULT_ROWS, MAX_ROWS, 'limit')
  const started = Date.now()
  await c.query('START TRANSACTION READ ONLY')
  let rows
  try {
    ;[rows] = await c.query({ sql: statement, rowsAsArray: false })
  } catch (err) {
    if (err.code === 'ER_QUERY_TIMEOUT') {
      throw new ToolError(`Query exceeded the ${STATEMENT_TIMEOUT_MS / 1000}s limit. Narrow the range or aggregate in SQL.`)
    }
    throw new ToolError(`${err.code || 'query failed'}: ${err.sqlMessage || err.message}`)
  } finally {
    await c.query('ROLLBACK').catch(() => {})
  }
  const elapsed = Date.now() - started
  if (!Array.isArray(rows)) return `OK (${elapsed} ms)`
  const shaped = shapeRows(rows, rowLimit)
  const notes = []
  if (shaped.truncatedRows) notes.push(`showing ${shaped.rows.length} of ${rows.length >= rowLimit ? `${rows.length}+` : rows.length} rows`)
  if (shaped.bytesCapped) notes.push(`result capped at ${Math.round(MAX_RESULT_BYTES / 1000)} KB`)
  if (shaped.truncatedCells) notes.push(`${shaped.truncatedCells} long cell(s) truncated`)
  return JSON.stringify(
    { rows: shaped.rows, row_count: shaped.rows.length, elapsed_ms: elapsed, note: notes.join('; ') || undefined },
    null,
    1
  )
}

// ---------------------------------------------------------------------------
// Transcripts: database row -> S3 object -> text

async function transcriptList({ kickoff_call_id, meeting_room_id, client_id, coach_id, since, until, limit } = {}) {
  const c = await connection()
  const n = checkLimit(limit, 20, MAX_TRANSCRIPT_LIST, 'limit')
  const where = ["a.is_canonical=1", "a.status='completed'"]
  const params = []
  if (kickoff_call_id !== undefined) { where.push('mr.kickoff_call_id=?'); params.push(checkInt(kickoff_call_id, 'kickoff_call_id')) }
  if (meeting_room_id !== undefined) { where.push('mr.id=?'); params.push(checkInt(meeting_room_id, 'meeting_room_id')) }
  if (client_id !== undefined) { where.push('kc.client_id=?'); params.push(checkInt(client_id, 'client_id')) }
  if (coach_id !== undefined) { where.push('kc.coach_id=?'); params.push(checkInt(coach_id, 'coach_id')) }
  for (const [name, val, op] of [['since', since, '>='], ['until', until, '<']]) {
    if (val === undefined) continue
    if (typeof val !== 'string' || !/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/.test(val)) throw new ToolError(`"${name}" must be YYYY-MM-DD or YYYY-MM-DD HH:MM`)
    where.push(`mr.room_started_at ${op} ?`)
    params.push(val)
  }
  const [rows] = await c.query(
    `SELECT a.file_transcript_id, a.bytes, a.archived_at, mr.id AS meeting_room_id, mr.kickoff_call_id, mr.room_started_at, mr.room_ended_at,
            kc.client_id, kc.coach_id
       FROM file_transcript_artifacts a
       JOIN meeting_room_file_transcripts mft ON mft.file_transcript_id = a.file_transcript_id
       JOIN meeting_rooms mr ON mr.id = mft.meeting_room_id
       LEFT JOIN kickoff_calls kc ON kc.id = mr.kickoff_call_id
      WHERE ${where.join(' AND ')}
      ORDER BY mr.room_started_at DESC
      LIMIT ${n}`,
    params
  )
  if (!rows.length) return 'No archived transcripts match.'
  return JSON.stringify({ transcripts: rows, count: rows.length }, null, 1)
}

const sha256hex = (value) => createHash('sha256').update(value).digest('hex')
const hmac = (key, value) => createHmac('sha256', key).update(value).digest()
const encodeSegment = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)

async function s3Get(bucket, key, versionId) {
  if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
    throw new ToolError(
      'No AWS credentials for S3: set KICKOFF_ZDR_AWS_ACCESS_KEY_ID and KICKOFF_ZDR_AWS_SECRET_ACCESS_KEY in src/zdr-harness/.env'
    )
  }
  if (bucket !== ALLOWED_BUCKET) throw new ToolError(`Refusing to read from ${bucket}: only ${ALLOWED_BUCKET} is readable here`)
  if (!ALLOWED_KEY.test(key)) throw new ToolError('Refusing an object key outside transcripts/v1/<id>/<generation>/assemblyai.json.gz')
  const host = `${bucket}.s3.${REGION}.amazonaws.com`
  const path = '/' + key.split('/').map(encodeSegment).join('/')
  const queryString = versionId ? `versionId=${encodeSegment(versionId)}` : ''
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = sha256hex('')
  const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate }
  if (SESSION_TOKEN) headers['x-amz-security-token'] = SESSION_TOKEN
  const names = Object.keys(headers).sort()
  const signedHeaders = names.join(';')
  const canonicalHeaders = names.map((k) => `${k}:${headers[k].trim()}\n`).join('')
  const canonicalRequest = ['GET', path, queryString, canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const scope = `${dateStamp}/${REGION}/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n')
  let k = hmac(`AWS4${SECRET_ACCESS_KEY}`, dateStamp)
  for (const part of [REGION, 's3', 'aws4_request']) k = hmac(k, part)
  const signature = createHmac('sha256', k).update(stringToSign).digest('hex')
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  let res
  try {
    res = await fetch(`https://${host}${path}${queryString ? `?${queryString}` : ''}`, { headers })
  } catch (err) {
    throw new ToolError(`S3 is not reachable (${err.cause?.code || err.message})`)
  }
  if (!res.ok) {
    const text = await res.text()
    const code = (text.match(/<Code>([^<]+)<\/Code>/) || [])[1] || `HTTP ${res.status}`
    const msg = (text.match(/<Message>([^<]+)<\/Message>/) || [])[1] || ''
    if (code === 'AccessDenied') {
      throw new ToolError(
        'S3 AccessDenied: the zdr-harness IAM user needs s3:GetObject/GetObjectVersion on the archive bucket and kms:Decrypt on ' +
          'its key. Apply src/zdr-harness/iam/zdr-harness-policy.json (see iam/README.md).'
      )
    }
    throw new ToolError(`S3 GetObject failed: ${code} ${msg}`.trim())
  }
  return Buffer.from(await res.arrayBuffer())
}

function renderTranscript(t) {
  const utterances = Array.isArray(t.utterances) ? t.utterances : []
  const turns = []
  for (const u of utterances) {
    if (!u || typeof u.text !== 'string' || !u.text.trim()) continue
    const label = u.speaker === undefined || u.speaker === null ? 'Speaker' : `Speaker ${u.speaker}`
    turns.push(`${label}: ${u.text.trim()}`)
  }
  if (turns.length) return { text: turns.join('\n\n'), turns: turns.length, speakers: new Set(utterances.map((u) => u?.speaker)).size }
  return { text: typeof t.text === 'string' ? t.text : '', turns: 0, speakers: 0 }
}

async function transcriptGet({ file_transcript_id, max_chars, offset } = {}) {
  const c = await connection()
  const id = checkInt(file_transcript_id, 'file_transcript_id')
  const cap = checkLimit(max_chars, DEFAULT_TRANSCRIPT_CHARS, MAX_TRANSCRIPT_CHARS, 'max_chars')
  const start = offset === undefined ? 0 : checkLimit(offset, 0, 10_000_000, 'offset')
  const [rows] = await c.query(
    'SELECT storage_bucket, storage_key, storage_version_id, sha256, bytes, archived_at FROM file_transcript_artifacts ' +
      "WHERE file_transcript_id=? AND is_canonical=1 AND status='completed' LIMIT 1",
    [id]
  )
  const row = rows[0]
  if (!row) throw new ToolError(`No archived canonical transcript for file_transcript_id ${id}`)
  const body = await s3Get(row.storage_bucket, row.storage_key, row.storage_version_id)
  // The archive stores gzip with Content-Encoding: gzip, and fetch() honours
  // that header by decompressing for us; a body that still starts with the
  // gzip magic bytes was not touched, so inflate it here.
  const raw = body[0] === 0x1f && body[1] === 0x8b ? gunzipSync(body) : body
  const digest = sha256hex(raw)
  if (row.sha256 && digest !== row.sha256) throw new ToolError('Archived transcript checksum does not match the database row')
  const envelope = JSON.parse(raw.toString('utf8'))
  const transcript = envelope && typeof envelope === 'object' && envelope.transcript ? envelope.transcript : envelope
  const rendered = renderTranscript(transcript)
  const slice = rendered.text.slice(start, start + cap)
  const meta = {
    file_transcript_id: id,
    archived_at: row.archived_at,
    audio_duration_s: typeof transcript.audio_duration === 'number' ? transcript.audio_duration : undefined,
    speakers: rendered.speakers,
    turns: rendered.turns,
    total_chars: rendered.text.length,
    offset: start,
    returned_chars: slice.length,
    more: start + slice.length < rendered.text.length ? `call again with offset=${start + slice.length}` : undefined,
  }
  return `${JSON.stringify(meta)}\n\n${slice}`
}

const TOOLS = [
  {
    name: 'guide',
    title: 'How to use the production database',
    description: 'Read first: what the live database holds, naming conventions, the transcript join path, limits and counting traps.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'list_tables',
    title: 'List tables',
    description: 'List tables in kudos_production with approximate row counts. Pass a LIKE pattern to narrow, e.g. %client%.',
    inputSchema: {
      type: 'object',
      properties: { like: { type: 'string', description: 'SQL LIKE pattern on the table name' }, limit: { type: 'number' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'describe_table',
    title: 'Describe a table',
    description: 'Columns, indexes and foreign keys of one table.',
    inputSchema: { type: 'object', properties: { table: { type: 'string' } }, required: ['table'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'query',
    title: 'Run one read-only SQL statement',
    description:
      `One SELECT/WITH/SHOW/EXPLAIN/DESCRIBE against the live production read replica, in a READ ONLY transaction with a ` +
      `${STATEMENT_TIMEOUT_MS / 1000}s timeout; up to ${MAX_ROWS} rows. Every row is a real person: aggregate in SQL where you can.`,
    inputSchema: {
      type: 'object',
      properties: { sql: { type: 'string' }, limit: { type: 'number', description: `Rows to return (default ${DEFAULT_ROWS}, max ${MAX_ROWS})` } },
      required: ['sql'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'transcript_list',
    title: 'Find archived call transcripts',
    description:
      'List archived canonical call transcripts (newest first) with their meeting room, call, client and coach ids. ' +
      'Filter by kickoff_call_id, meeting_room_id, client_id, coach_id, since/until (room start, UTC).',
    inputSchema: {
      type: 'object',
      properties: {
        kickoff_call_id: { type: 'number' },
        meeting_room_id: { type: 'number' },
        client_id: { type: 'number' },
        coach_id: { type: 'number' },
        since: { type: 'string', description: 'YYYY-MM-DD or YYYY-MM-DD HH:MM (UTC)' },
        until: { type: 'string' },
        limit: { type: 'number', description: `default 20, max ${MAX_TRANSCRIPT_LIST}` },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'transcript_get',
    title: 'Read one archived call transcript',
    description:
      'Fetch a transcript from the archive by file_transcript_id, verify its checksum, and return speaker turns as text. ' +
      `Returns ${DEFAULT_TRANSCRIPT_CHARS} chars by default (max ${MAX_TRANSCRIPT_CHARS}); use offset to page. Verbatim client speech: never quote it outside the harness.`,
    inputSchema: {
      type: 'object',
      properties: { file_transcript_id: { type: 'number' }, max_chars: { type: 'number' }, offset: { type: 'number' } },
      required: ['file_transcript_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
]

const HANDLERS = { guide, list_tables: listTables, describe_table: describeTable, query, transcript_list: transcriptList, transcript_get: transcriptGet }

// ---------------------------------------------------------------------------
// MCP stdio loop

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)
const reply = (id, result) => send({ jsonrpc: '2.0', id, result })
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } })

const rl = createInterface({ input: process.stdin })
// The open database socket would otherwise keep the process alive after the
// client goes away; a probe piping a few requests must be able to finish, but
// only once the requests it piped have been answered.
let inflight = 0
let closing = false
const maybeExit = () => {
  if (!closing || inflight > 0) return
  conn?.end().catch(() => {})
  setTimeout(() => process.exit(0), 100).unref()
}
rl.on('close', () => { closing = true; maybeExit() })
rl.on('line', async (line) => {
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
      serverInfo: { name: 'kickoff-db', version: '1.0.0' },
      instructions:
        'Live production database (read replica) and archived call transcripts. Read the guide tool first. Every row is a ' +
        'real person; aggregate before answering, and never quote transcript text outside the harness.',
    })
  } else if (method === 'tools/list') {
    reply(id, { tools: TOOLS })
  } else if (method === 'tools/call') {
    const { name, arguments: args = {} } = params || {}
    const handler = HANDLERS[name]
    if (!handler) return fail(id, -32602, `Unknown tool: ${name}`)
    inflight++
    try {
      const text = await handler(args)
      reply(id, { content: [{ type: 'text', text }], isError: false })
    } catch (err) {
      if (!(err instanceof ToolError)) log(err)
      const message = err instanceof ToolError ? err.message : `kickoff-db internal error: ${err.message}`
      reply(id, { content: [{ type: 'text', text: message }], isError: true })
    } finally {
      inflight--
      maybeExit()
    }
  } else if (method === 'ping') {
    reply(id, {})
  } else if (id !== undefined) {
    fail(id, -32601, `Unsupported method: ${method}`)
  }
})

process.on('SIGTERM', () => { conn?.end().catch(() => {}); process.exit(0) })
