#!/usr/bin/env node
// kickoff-stage-db: read-only access to Kickoff's STAGING database
// (kudos_staging) for Claude Code, Codex and the shell. Not production.
//
// Staging is a production copy (restored about 2025-02-26) plus everything
// staging has done since. Kickoff's CEO cleared it for use outside the ZDR
// harness (2026-10-06). Production questions go elsewhere: Kickoff Sanitized
// DB for production-shaped counts, zdr_ask for live rows and free text.
//
// Walls, in order:
//   1. The credential: kickoff_stage_ro has SELECT and SHOW VIEW on
//      kudos_staging and nothing else, REQUIRE SSL, 12 connections at most.
//   2. Every session is transaction_read_only with a statement time limit.
//   3. This file: one statement per call, read statements only, comments
//      removed before it runs, rows streamed and cut off at the cap.
//
// Two ways in, one implementation:
//   MCP stdio server (no arguments)         kickoff-stage-db-mcp
//   CLI (a command)                         kickoff-stage-db-mcp query "SELECT ..." [--out FILE]
//
// See README.md beside this file.

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { AsyncLocalStorage } from 'node:async_hooks'
import { execFileSync } from 'node:child_process'
import { checkServerIdentity } from 'node:tls'
import { checkSql, IDENT, scan, shape, ToolError } from './lib/sql.mjs'
import { fileFormat, renderRows, uniqueNames } from './lib/format.mjs'
import { ensureVpn, reachable, VPN_DOWN_STATES, vpnState } from './lib/vpn.mjs'

const VERSION = '1.0.0'
const OPT = process.env.KICKOFF_STAGE_DB_OPT
const DB_URL = process.env.KICKOFF_STAGE_DB_URL
const RDS_CA = process.env.KICKOFF_STAGE_DB_CA
const VPN = process.env.KICKOFF_STAGE_DB_VPN || 'taylor-vpn'
const VPN_AUTOCONNECT = process.env.KICKOFF_STAGE_DB_VPN_AUTOCONNECT !== '0'
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05']

const DEFAULT_TIMEOUT_S = 30
const MAX_TIMEOUT_S = 120
const MAX_EXPORT_TIMEOUT_S = 300
const DEFAULT_ROWS = 100
const MAX_ROWS = 1000
const DEFAULT_CELL = 500
const MAX_CELL = 20_000
const MAX_CHARS = 100_000
const MAX_EXPORT_ROWS = 5_000_000
const MAX_EXPORT_BYTES = 1_000_000_000
const SLOW_MS = 5000

// Server mode logs to stderr (the client's MCP log); the CLI stays quiet
// unless KICKOFF_STAGE_DB_DEBUG=1, so a shell caller reads only the answer.
const CLI = process.argv.length > 2
const log = (...a) => { if (!CLI || process.env.KICKOFF_STAGE_DB_DEBUG === '1') console.error('[kickoff-stage-db]', ...a) }
const sha12 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12)

let mysql
function driver() {
  if (mysql) return mysql
  if (!OPT) throw new ToolError('KICKOFF_STAGE_DB_OPT is not set; start this server through kickoff-stage-db-mcp')
  try {
    mysql = createRequire(join(OPT, 'noop.js'))('mysql2')
  } catch {
    throw new ToolError(`mysql2 is missing; run: npm i --prefix ${dirname(OPT)} mysql2@3.24.4`)
  }
  return mysql
}

// ---------------------------------------------------------------------------
// Connection

let target = null
function parseUrl() {
  if (target) return target
  if (!DB_URL) {
    throw new ToolError(
      'KICKOFF_STAGE_DB_URL is not set in dotfiles .env. It is in 1Password (personal account, Kickoff vault, ' +
        '"Kickoff Stage DB (read-only MCP)", field KICKOFF_STAGE_DB_URL). See README.md, Setup.'
    )
  }
  let u
  try {
    u = new URL(DB_URL)
  } catch {
    throw new ToolError('KICKOFF_STAGE_DB_URL is not a valid mysql:// URL')
  }
  target = {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
  }
  if (!/staging/i.test(target.database) || /prod/i.test(target.host + target.database)) {
    throw new ToolError(`KICKOFF_STAGE_DB_URL does not point at a staging database (${target.database}); refusing to connect`)
  }
  return target
}

let pool = null
const timeouts = new WeakMap() // connection -> its current MAX_EXECUTION_TIME

function getPool() {
  if (pool) return pool
  const t = parseUrl()
  const ca = RDS_CA && existsSync(RDS_CA) ? readFileSync(RDS_CA, 'utf8') : undefined
  if (!ca) throw new ToolError(`The RDS CA bundle is missing (${RDS_CA || 'KICKOFF_STAGE_DB_CA unset'})`)
  pool = driver().createPool({
    host: t.host,
    port: t.port,
    user: t.user,
    password: t.password,
    database: t.database,
    ssl: { ca, rejectUnauthorized: true, checkServerIdentity: (_h, cert) => checkServerIdentity(t.host, cert) },
    connectionLimit: 4,
    maxIdle: 2,
    idleTimeout: 120_000,
    queueLimit: 100,
    waitForConnections: true,
    enableKeepAlive: true,
    connectTimeout: 8000,
    dateStrings: true,
    decimalNumbers: true,
    // Numbers stay numbers; only values past 2^53 come back as strings.
    supportBigNumbers: true,
    bigNumberStrings: false,
    multipleStatements: false,
  })
  // Runs before the connection is handed out: commands queue in order.
  pool.on('connection', (c) => {
    c.query('SET SESSION transaction_read_only = ON')
    c.query(`SET SESSION MAX_EXECUTION_TIME = ${DEFAULT_TIMEOUT_S * 1000}`)
    timeouts.set(c, DEFAULT_TIMEOUT_S * 1000)
  })
  return pool
}

const NET_CODES = new Set(['ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'PROTOCOL_CONNECTION_LOST', 'PROTOCOL_SEQUENCE_TIMEOUT', 'STALLED', 'VPN_DOWN', 'HANDSHAKE_NO_SSL_SUPPORT', 'EADDRNOTAVAIL'])
const isNetError = (e) => NET_CODES.has(e?.code) || /ETIMEDOUT|ECONNRESET|read ECONN|socket hang up|Connection lost/i.test(e?.message || '')

function getConnection() {
  return new Promise((res, rej) => getPool().getConnection((err, c) => (err ? rej(err) : res(c))))
}

// A pooled connection, with the network problems of a laptop handled here:
// a dropped VPN is reconnected, a stale socket is replaced, and anything
// else becomes one clear sentence.
async function acquire() {
  await precheckVpn()
  try {
    return await getConnection()
  } catch (err) {
    if (!isNetError(err)) throw explainConnect(err)
    log(`connect failed (${err.code || err.message}); checking the network`)
    await recoverNetwork(err)
    try {
      return await getConnection()
    } catch (e2) {
      throw explainConnect(e2)
    }
  }
}

let lastOk = 0 // last time a statement completed
let vpnSeenUp = false // staging has been reached with the VPN up: watch it during long calls

// After 30 quiet seconds, look at the VPN before connecting (~0.1 s): with the
// tunnel down a connect only fails after its 8 s timeout, and a laptop that
// slept, rebooted or changed networks is exactly that case.
async function precheckVpn() {
  if (!VPN_AUTOCONNECT || Date.now() - lastOk < 30_000) return
  const { state } = await vpnState(VPN)
  if (state === 'CONNECTED') { vpnSeenUp = true; return }
  if (!VPN_DOWN_STATES.has(state)) return // unknown or not ours to fix: let the connect report it
  const t = parseUrl()
  if ((await reachable(t.host, t.port, 1500)).ok) return // another route works
  await recoverNetwork({ code: `VPN ${state}` }, { skipProbe: true })
}

let lastRecovery = null
async function recoverNetwork(err, { skipProbe = false } = {}) {
  const t = parseUrl()
  const probe = skipProbe ? { ok: false, code: err.code } : await reachable(t.host, t.port, 3000)
  if (probe.ok) return // transient: the socket died, the route is fine
  if (probe.code === 'ENOTFOUND' || probe.code === 'EAI_AGAIN') throw explainConnect({ code: probe.code })
  if (!VPN_AUTOCONNECT) {
    throw new ToolError(`Staging is unreachable (${probe.code || err.code}). Connect the "${VPN}" VPN in Tunnelblick, then retry. (Auto-connect is off: KICKOFF_STAGE_DB_VPN_AUTOCONNECT=0)`)
  }
  const r = await ensureVpn(VPN)
  lastRecovery = { at: new Date().toISOString(), ...r }
  if (!r.ok) throw new ToolError(`Staging is unreachable (${probe.code || err.code}). ${r.message}`)
  log(`VPN: ${r.action} in ${r.ms} ms`)
  vpnSeenUp = true
  // Routes can lag the CONNECTED state by a moment.
  for (let i = 0; i < 8; i++) {
    if ((await reachable(t.host, t.port, 2000)).ok) return
    await new Promise((s) => setTimeout(s, 750))
  }
  throw new ToolError(`The "${VPN}" VPN is connected but staging still does not answer on port ${t.port}. Check Tunnelblick's log, or whether the staging database is stopped.`)
}

function explainConnect(err) {
  if (err instanceof ToolError) return err
  const c = err?.code
  if (c === 'ER_ACCESS_DENIED_ERROR') {
    return new ToolError(
      'Staging rejected the kickoff_stage_ro password. Rotate it per README.md "Rotating the password" ' +
        '(1Password: personal account, Kickoff vault, "Kickoff Stage DB (read-only MCP)").'
    )
  }
  if (c === 'ENOTFOUND' || c === 'EAI_AGAIN') {
    return new ToolError('Cannot resolve the staging database host: this Mac is offline, DNS is failing, or staging was rebuilt under a new name (compare SSM mysql-url-staging-encrypted).')
  }
  if (c === 'ER_TOO_MANY_USER_CONNECTIONS' || c === 'ER_CON_COUNT_ERROR') return new ToolError('Staging is at its connection limit for this user; retry in a few seconds.')
  if (c === 'ER_BAD_DB_ERROR') return new ToolError('The kudos_staging schema is gone: staging may be mid-rebuild.')
  if (/Queue limit reached/i.test(err?.message || '')) return new ToolError('Too many staging queries at once; wait for the running ones, then retry.')
  if (isNetError(err)) return new ToolError(`Cannot reach staging (${c || err.message}). Run stage_status for the VPN and network state.`)
  return new ToolError(`Cannot connect to staging: ${c || ''} ${err?.sqlMessage || err?.message || ''}`.trim())
}

async function setTimeoutFor(c, ms) {
  if (timeouts.get(c) === ms) return
  await new Promise((res, rej) => c.query(`SET SESSION MAX_EXECUTION_TIME = ${ms}`, (e) => (e ? rej(e) : res())))
  timeouts.set(c, ms)
}

// Run one statement and stream its rows. onRow returns false to stop: the
// connection is then destroyed, the only clean way to abandon a result set
// mid-stream, and the pool opens a fresh one next time.
// Request id -> the threads running its statements, so a client's
// notifications/cancelled (Esc in Claude, interrupt in Codex) stops the work
// on the server instead of letting it run to the time limit.
const requestCtx = new AsyncLocalStorage()
const running = new Map()

function stream(c, statement, values, { onFields, onRow, stallMs }) {
  const req = requestCtx.getStore()
  if (req !== undefined) {
    if (!running.has(req)) running.set(req, new Set())
    running.get(req).add(c.threadId)
  }
  return new Promise((resolveP, rejectP) => {
    let settled = false
    let stopped = false
    let rows = 0
    let lastData = Date.now()
    let stall
    // While a statement is silent, glance at the VPN every 3 s: a closed
    // tunnel means the socket is dead, so give up now rather than at the
    // stall timer, and let the caller reconnect and rerun.
    const watch = vpnSeenUp && VPN_AUTOCONNECT
      ? setInterval(async () => {
          if (settled || Date.now() - lastData < 4000) return
          const { state } = await vpnState(VPN)
          if (settled || !VPN_DOWN_STATES.has(state)) return
          stopped = true
          c.destroy()
          done(Object.assign(new Error(`the VPN closed (${state}) during the query`), { code: 'VPN_DOWN' }))
        }, 3000)
      : null
    const arm = () => {
      lastData = Date.now()
      clearTimeout(stall)
      stall = setTimeout(() => {
        stopped = true
        const threadId = c.threadId
        c.destroy()
        done(Object.assign(new Error('no data from staging within the time limit'), { code: 'STALLED', threadId, partial: rows > 0 }))
      }, stallMs)
    }
    const done = (err) => {
      if (settled) return
      settled = true
      clearTimeout(stall)
      if (watch) clearInterval(watch)
      if (req !== undefined) running.get(req)?.delete(c.threadId)
      if (err) rejectP(err)
      else resolveP({ rows, stopped })
    }
    arm()
    const q = c.query({ sql: statement, values, rowsAsArray: true })
    q.on('error', (e) => done(e))
    q.on('fields', (f) => { arm(); onFields?.(f || []) })
    q.on('result', (row) => {
      if (stopped) return
      arm()
      if (Array.isArray(row) || (row && typeof row === 'object' && !('affectedRows' in row))) {
        rows++
        if (onRow(row) === false) {
          stopped = true
          c.destroy()
          done()
        }
      }
    })
    q.on('end', () => done())
  })
}

// Best effort: stop our own runaway statement (a user may KILL its own threads).
async function killQuery(threadId) {
  if (!threadId) return
  try {
    const k = await getConnection()
    await new Promise((res) => k.query('KILL QUERY ?', [threadId], () => res()))
    k.release()
    log(`killed query on thread ${threadId}`)
  } catch (e) {
    log(`could not kill thread ${threadId}: ${e.code || e.message}`)
  }
}

const lastUsed = new WeakMap() // connection -> when it was last released

function pingWithin(c, ms) {
  return new Promise((res) => {
    const t = setTimeout(() => res(false), ms)
    c.ping((e) => { clearTimeout(t); res(!e) })
  })
}

// Runs a checked statement with the retry rules: a pooled connection idle
// for a while is pinged first (a socket from before a sleep or a VPN drop
// is dead and would hang), and a connection lost mid-call is replaced (VPN
// checked) and the statement run once more, since reads are safe to repeat.
// run() must start from scratch each time it is called.
async function withConnection(timeoutS, run) {
  let stale = 0
  for (let attempt = 0; ; ) {
    const c = await acquire()
    let released = false
    const release = () => {
      if (released) return
      released = true
      lastUsed.set(c, Date.now())
      try { c.release() } catch {}
    }
    try {
      const idle = lastUsed.has(c) ? Date.now() - lastUsed.get(c) : 0
      if (idle > 15_000 && !(await pingWithin(c, 2500))) {
        released = true
        try { c.destroy() } catch {}
        log(`dropped a pooled connection that was dead after ${Math.round(idle / 1000)} s idle`)
        if (++stale > 5) throw Object.assign(new Error('pooled connections keep failing'), { code: 'PROTOCOL_CONNECTION_LOST' })
        if (stale === 1) await recoverNetwork({ code: 'STALE_SOCKET' })
        continue
      }
      await setTimeoutFor(c, timeoutS * 1000)
      const out = await run(c)
      lastOk = Date.now()
      if (out?.destroyed) released = true
      return out
    } catch (err) {
      if (err?.code === 'STALLED' || isNetError(err)) {
        released = true
        try { c.destroy() } catch {}
        // Silence with a healthy route is a slow statement (one that
        // MAX_EXECUTION_TIME does not cover), not a dead socket: stop it on
        // the server and say so, never run it a second time.
        if (err.code === 'STALLED') {
          const t = parseUrl()
          if ((await reachable(t.host, t.port, 3000)).ok) {
            await killQuery(err.threadId)
            throw new ToolError(`No answer within ${timeoutS + 15} s, so the statement was stopped on the server. Narrow it, aggregate, or raise timeout_seconds.`)
          }
        }
        if (attempt++ === 0) {
          log(`connection lost mid-call (${err.code || err.message}); reconnecting once`)
          await recoverNetwork(err)
          continue
        }
        throw new ToolError(`Lost the staging connection again after reconnecting (${err.code || err.message}); run stage_status, then retry.`)
      }
      throw err
    } finally {
      release()
    }
  }
}

// ---------------------------------------------------------------------------
// Tools

const GUIDE = `Kickoff STAGING database: kudos_staging on the staging RDS instance, MySQL 8.4. NOT production.

What it holds: a copy of production restored about 2025-02-26, plus everything staging has done since (QA accounts, test
sign-ups, staging calls). Its schema follows what is deployed to staging (migrations from develop), so it is the place to
check new columns and indexes against real-sized tables. Rows from before the copy are real people: aggregate, and keep
names, emails, phones, health details and message text out of PRs, commits, Slack and docs.

Use it for: schema, migration and index checks at production-like volume; query plans (EXPLAIN); staging QA fixtures and
the state a staging test left behind; reproducing a staging bug; working out joins and definitions before writing code.
Not for production numbers or anything after early 2025 in production:
  - production-shaped counts, distributions, joins  -> Kickoff Sanitized DB (kickoff_database_query, after its guide)
  - live production rows, free text, transcripts     -> zdr_ask (the ZDR harness)
Never connect tests, migrations, seeds or an application process to this database.

Names: physical tables and columns are snake_case (clients.coach_id); Objection models use camelCase for the same columns
(models in node/models name their table in tableName). Core: clients (clients.user_id -> users, clients.coach_id -> coaches),
coaches, users, workouts + workout_programs, sms + sms_conversations, kickoff_calls + meeting_rooms, files, and client
memory / nutrition / insurance / payment tables by name.
Definitions that hold: clients.signed_up is the sign-up time (no created_at); active client = clients.status = 1; completed
video call = kickoff_calls.method='video' AND completed_at IS NOT NULL AND deleted_at IS NULL. Not every table has
deleted_at or created_at: describe before filtering. Time: *_at columns are UTC; date columns are calendar dates.
Counting traps: soft deletes, test and merged accounts, status-history tables, one-to-many joins that multiply rows.
Size: production-sized core tables (clients ~1M rows, sms tens of millions). sms.created_at is unindexed (MAX takes ~9 s): use sent_at (indexed) or id.
Check stage_describe indexes before filtering a big table.

Calls: stage_tables (LIKE pattern; column_like finds tables with a column), stage_describe (up to 10 tables per call),
stage_query (one read statement; ? placeholders with params). Results are compact: a column list, then one JSON array
per row. Default ${DEFAULT_ROWS} rows (limit up to ${MAX_ROWS}), ${DEFAULT_CELL} chars per cell (max_cell_chars up to ${MAX_CELL}),
about ${MAX_CHARS / 1000} KB per answer, ${DEFAULT_TIMEOUT_S} s per statement (timeout_seconds up to ${MAX_TIMEOUT_S}).
More rows than that: output_path (.csv, .tsv or .jsonl) streams up to ${MAX_EXPORT_ROWS.toLocaleString()} rows to a file
(${MAX_EXPORT_TIMEOUT_S} s) and returns counts and a 3-row sample; never page through a big result in chat. A path inside a git
work tree must be git-ignored.
The user is kickoff_stage_ro (SELECT, SHOW VIEW). Staging is reached over the "${VPN}" VPN, which this server connects
when needed; stage_status shows the VPN, latency, user and the newest migration.`

async function guide() {
  return GUIDE
}

function checkInt(v, name, lo, hi, fallback) {
  if (v === undefined || v === null || v === '') return fallback
  const n = Number(v)
  if (!Number.isInteger(n) || n < lo || n > hi) throw new ToolError(`"${name}" must be a whole number from ${lo} to ${hi}`)
  return n
}

function checkLike(v, name) {
  if (v === undefined) return undefined
  if (typeof v !== 'string' || !v.trim() || v.length > 64) throw new ToolError(`"${name}" must be a short LIKE pattern, e.g. %client%`)
  return v.includes('%') || v.includes('_') ? v : `%${v}%`
}

async function simpleQuery(sql, values) {
  return withConnection(DEFAULT_TIMEOUT_S, (c) => new Promise((res, rej) => c.query({ sql, values }, (e, rows) => (e ? rej(e) : res(rows)))))
}

async function tables({ like, column_like, limit } = {}) {
  const t = parseUrl()
  const n = checkInt(limit, 'limit', 1, 500, 200)
  const l = checkLike(like, 'like')
  const cl = checkLike(column_like, 'column_like')
  const params = [t.database]
  let where = ''
  if (l) { where += ' AND t.table_name LIKE ?'; params.push(l) }
  let sql
  if (cl) {
    params.push(cl)
    sql =
      `SELECT t.table_name AS name, t.table_rows AS approx_rows, GROUP_CONCAT(c.column_name ORDER BY c.ordinal_position) AS cols ` +
      `FROM information_schema.tables t JOIN information_schema.columns c ON c.table_schema=t.table_schema AND c.table_name=t.table_name ` +
      `WHERE t.table_schema=?${where} AND c.column_name LIKE ? GROUP BY t.table_name, t.table_rows ORDER BY t.table_name LIMIT ${n + 1}`
  } else {
    sql = `SELECT t.table_name AS name, t.table_rows AS approx_rows FROM information_schema.tables t WHERE t.table_schema=?${where} ORDER BY t.table_name LIMIT ${n + 1}`
  }
  const rows = await simpleQuery(sql, params)
  if (!rows.length) return `No tables match${l ? ` like ${l}` : ''}${cl ? ` with a column like ${cl}` : ''}.`
  const more = rows.length > n
  const lines = rows.slice(0, n).map((r) => `${r.name}  ~${Number(r.approx_rows || 0).toLocaleString()} rows${r.cols ? `  [${r.cols}]` : ''}`)
  if (more) lines.push(`… more than ${n}; narrow with like/column_like or raise limit`)
  return lines.join('\n')
}

const likeRegex = (pattern) =>
  new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`, 'i')

async function describe({ table, tables: list, column_like } = {}) {
  const names = list ?? (table !== undefined ? [table] : [])
  const colRe = column_like === undefined ? null : likeRegex(checkLike(column_like, 'column_like'))
  if (!Array.isArray(names) || !names.length) throw new ToolError('Pass "table" or "tables" (up to 10 names)')
  if (names.length > 10) throw new ToolError('Up to 10 tables per call')
  for (const n of names) if (typeof n !== 'string' || !IDENT.test(n)) throw new ToolError(`"${n}" is not a plain table name`)
  const t = parseUrl()
  const [cols, idx, fks, sizes] = await withConnection(DEFAULT_TIMEOUT_S, (c) => {
    const q = (sql) => new Promise((res, rej) => c.query({ sql, values: [t.database, names] }, (e, r) => (e ? rej(e) : res(r))))
    return Promise.all([
      q('SELECT table_name AS table_name, column_name AS column_name, column_type AS column_type, is_nullable AS is_nullable, column_key AS column_key, column_default AS column_default, extra AS extra FROM information_schema.columns WHERE table_schema=? AND table_name IN (?) ORDER BY table_name, ordinal_position'),
      q('SELECT table_name AS table_name, index_name AS index_name, non_unique AS non_unique, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols FROM information_schema.statistics WHERE table_schema=? AND table_name IN (?) GROUP BY table_name, index_name, non_unique ORDER BY table_name, index_name'),
      q('SELECT table_name AS table_name, column_name AS column_name, referenced_table_name AS referenced_table_name, referenced_column_name AS referenced_column_name FROM information_schema.key_column_usage WHERE table_schema=? AND table_name IN (?) AND referenced_table_name IS NOT NULL ORDER BY table_name, column_name'),
      q('SELECT table_name AS table_name, table_rows AS table_rows FROM information_schema.tables WHERE table_schema=? AND table_name IN (?)'),
    ])
  })
  const out = []
  const missing = []
  for (const name of names) {
    const cs = cols.filter((r) => r.table_name.toLowerCase() === name.toLowerCase())
    if (!cs.length) { missing.push(name); continue }
    const real = cs[0].table_name
    const rows = sizes.find((r) => r.table_name === real)?.table_rows
    const shown = colRe ? cs.filter((col) => colRe.test(col.column_name)) : cs
    out.push(`${real}  ~${Number(rows || 0).toLocaleString()} rows${colRe ? `  (${shown.length} of ${cs.length} columns match ${column_like})` : ''}`)
    const keep = (cols) => !colRe || cols.split(',').some((x) => colRe.test(x))
    for (const col of shown) {
      const def = col.column_default === null || col.column_default === undefined ? '' : ` default ${String(col.column_default).slice(0, 40)}`
      out.push(`  ${col.column_name} ${col.column_type}${col.is_nullable === 'NO' ? ' NOT NULL' : ''}${col.column_key ? ` [${col.column_key}]` : ''}${def}${col.extra ? ` ${col.extra}` : ''}`)
    }
    const ix = idx.filter((r) => r.table_name === real && keep(r.cols))
    if (ix.length) out.push(`  indexes: ${ix.map((i) => `${i.index_name}${i.non_unique ? '' : '(unique)'}(${i.cols})`).join('; ')}`)
    const fk = fks.filter((r) => r.table_name === real && keep(r.column_name))
    if (fk.length) out.push(`  foreign keys: ${fk.map((f) => `${f.column_name}->${f.referenced_table_name}.${f.referenced_column_name}`).join('; ')}`)
  }
  if (missing.length) out.push(`No table named ${missing.join(', ')}. Try stage_tables with like.`)
  return out.join('\n')
}

// EXPLAIN after the fact, only for slow or timed-out statements: why it was
// slow, in one line, without taxing every fast query with a round trip.
async function planNote(statement, values) {
  if (!/^\(*\s*(SELECT|WITH|TABLE)\b/i.test(statement)) return undefined
  try {
    const rows = await withConnection(15, (c) => new Promise((res, rej) => c.query({ sql: `EXPLAIN FORMAT=JSON ${statement}`, values }, (e, r) => (e ? rej(e) : res(r)))))
    const plan = JSON.parse(Object.values(rows[0] || {})[0] || '{}')
    let worst = { n: 0 }
    const walk = (node) => {
      if (!node || typeof node !== 'object') return
      if (Array.isArray(node)) return node.forEach(walk)
      const tb = node.table
      if (tb && (tb.access_type === 'ALL' || tb.access_type === 'index')) {
        const n = Number(tb.rows_examined_per_scan || 0)
        if (n > worst.n) worst = { n, table: tb.table_name, type: tb.access_type }
      }
      for (const v of Object.values(node)) walk(v)
    }
    walk(plan)
    if (worst.n >= 100_000) return `plan: ${worst.type === 'ALL' ? 'full scan' : 'full index scan'} of ~${worst.n.toLocaleString()} rows on ${worst.table}; filter on an indexed column (stage_describe shows them)`
  } catch {
    // EXPLAIN can fail where the statement would not; never block on it.
  }
  return undefined
}

function checkParams(params) {
  if (params === undefined) return undefined
  if (!Array.isArray(params) || params.length > 1000) throw new ToolError('"params" must be an array of up to 1000 values for the ? placeholders')
  for (const p of params) {
    if (p !== null && !['string', 'number', 'boolean'].includes(typeof p) && !(Array.isArray(p) && p.every((x) => ['string', 'number'].includes(typeof x)))) {
      throw new ToolError('"params" values must be strings, numbers, booleans, null, or arrays of strings/numbers (for IN (?))')
    }
  }
  return params
}

// Where a file may be written: absolute, a known format, not over an
// existing file unless asked, and never somewhere git would pick it up.
function checkOutput(path, overwrite) {
  if (typeof path !== 'string' || !path.trim()) throw new ToolError('"output_path" must be a file path')
  let p = path.trim()
  if (p.startsWith('~/')) p = join(process.env.HOME || '', p.slice(2))
  if (!isAbsolute(p)) throw new ToolError('"output_path" must be absolute (or start with ~/)')
  p = resolve(p)
  const fmt = fileFormat(p)
  if (!fmt) throw new ToolError('"output_path" must end in .csv, .tsv or .jsonl')
  if (existsSync(p)) {
    if (statSync(p).isDirectory()) throw new ToolError(`${p} is a directory`)
    if (!overwrite) throw new ToolError(`${p} exists; pass overwrite: true to replace it, or choose another name`)
  }
  let dir = dirname(p)
  while (!existsSync(dir) && dir !== dirname(dir)) dir = dirname(dir)
  try { dir = realpathSync(dir) } catch {} // a symlinked folder is judged where it really lives
  let top = ''
  try {
    top = execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).toString().trim()
  } catch {}
  if (top) {
    let ignored = false
    try {
      execFileSync('git', ['-C', top, 'check-ignore', '-q', '--no-index', p], { stdio: 'ignore', timeout: 5000 })
      ignored = true
    } catch {}
    if (!ignored) {
      throw new ToolError(
        `${p} is inside the git work tree ${top} and not git-ignored, so staging rows could be committed. ` +
          'Write to a git-ignored folder (in kickoff: .scratch/) or outside the repo (a scratchpad or ~/Downloads).'
      )
    }
  }
  return { path: p, fmt }
}

async function query({ sql, params, limit, timeout_seconds, max_cell_chars, output_path, overwrite } = {}) {
  const statement = checkSql(sql)
  const values = checkParams(params)
  const holes = (scan(statement).masked.match(/\?/g) || []).length
  if (holes !== (values?.length ?? 0)) {
    throw new ToolError(`sql has ${holes} ? placeholder${holes === 1 ? '' : 's'} but params has ${values?.length ?? 0} value${values?.length === 1 ? '' : 's'}`)
  }
  if (output_path !== undefined) return exportRows(statement, values, { output_path, overwrite, timeout_seconds })
  const rowLimit = checkInt(limit, 'limit', 1, MAX_ROWS, DEFAULT_ROWS)
  const timeoutS = checkInt(timeout_seconds, 'timeout_seconds', 1, MAX_TIMEOUT_S, DEFAULT_TIMEOUT_S)
  const maxCell = checkInt(max_cell_chars, 'max_cell_chars', 20, MAX_CELL, DEFAULT_CELL)
  const fp = { hash: sha12(statement), shape: shape(statement) }
  const started = Date.now()
  let fields = []
  const rows = []
  let more = false
  try {
    await withConnection(timeoutS, (c) => {
      fields = []
      rows.length = 0
      more = false
      return stream(c, statement, values, {
        stallMs: (timeoutS + 15) * 1000,
        onFields: (f) => { fields = f },
        onRow: (row) => {
          if (rows.length >= rowLimit) { more = true; return false }
          rows.push(row)
        },
      }).then((r) => (r.stopped ? { destroyed: true } : r))
    })
  } catch (err) {
    throw await queryError(err, statement, values, fp, timeoutS, started)
  }
  const ms = Date.now() - started
  log(`query ${fp.hash} ${ms}ms rows=${rows.length}${more ? '+' : ''}: ${fp.shape}`)
  if (!fields.length && !rows.length) return `OK, no result set (${ms} ms)`
  const names = fields.length ? fields.map((f) => f.name) : rows[0].map((_, i) => `col${i + 1}`)
  const r = renderRows(names, rows, { maxCell, maxChars: MAX_CHARS })
  const notes = []
  if (more) notes.push(`stopped at ${rowLimit} rows; there are more. Aggregate in SQL, add LIMIT, or use output_path for all of them`)
  if (r.shown < rows.length) notes.push(`showing ${r.shown} of ${rows.length} rows (answer capped at ${MAX_CHARS / 1000} KB): select fewer columns or use output_path`)
  if (r.cutCells) notes.push(`${r.cutCells} cell(s) cut at ${maxCell} chars (max_cell_chars raises it)`)
  if (ms > SLOW_MS) {
    const plan = await planNote(statement, values)
    if (plan) notes.push(plan)
  }
  const summary = `${r.shown} row${r.shown === 1 ? '' : 's'}${more ? '+' : ''} · ${ms} ms`
  return `${r.text}\n(${summary})${notes.length ? `\nnote: ${notes.join('; ')}` : ''}`
}

async function queryError(err, statement, values, fp, timeoutS, started, { exporting = false } = {}) {
  if (err instanceof ToolError) return err
  const ms = Date.now() - started
  log(`query ${fp.hash} failed ${err.code || ''} after ${ms}ms: ${fp.shape}`)
  if (err.code === 'ER_QUERY_TIMEOUT' || err.errno === 3024) {
    if (exporting) {
      return new ToolError(
        `The export stopped at the ${timeoutS} s limit and no file was kept. Exports are bound by volume: select only the columns you need ` +
          `(never SELECT * on a wide table), split by id range into several files${timeoutS < MAX_EXPORT_TIMEOUT_S ? `, or raise timeout_seconds (up to ${MAX_EXPORT_TIMEOUT_S})` : ''}.`
      )
    }
    const plan = await planNote(statement, values)
    return new ToolError(
      `Stopped at the ${timeoutS} s limit.${plan ? ` ${plan}.` : ''} Narrow the range, aggregate, or raise timeout_seconds (up to ${MAX_TIMEOUT_S}).`
    )
  }
  if (err.code === 'ER_QUERY_INTERRUPTED') return new ToolError('Stopped: the call was cancelled, and the statement was stopped on the server.')
  if (/DENIED/.test(err.code || '')) return new ToolError(`${err.code}: ${err.sqlMessage}. kickoff_stage_ro can only read kudos_staging (no writes, no system tables).`)
  if (err.code === 'ER_CANT_EXECUTE_IN_READ_ONLY_TRANSACTION') return new ToolError('Refused: this is a read-only staging connection.')
  if (err.sqlMessage) return new ToolError(`${err.code}: ${err.sqlMessage}`)
  if (/Bind parameters|placeholder/i.test(err.message || '')) return new ToolError(`params do not match the ? placeholders: ${err.message}`)
  return explainConnect(err)
}

async function exportRows(statement, values, { output_path, overwrite, timeout_seconds }) {
  const { path, fmt } = checkOutput(output_path, overwrite === true)
  const timeoutS = checkInt(timeout_seconds, 'timeout_seconds', 1, MAX_EXPORT_TIMEOUT_S, MAX_EXPORT_TIMEOUT_S)
  const fp = { hash: sha12(statement), shape: shape(statement) }
  try {
    mkdirSync(dirname(path), { recursive: true })
  } catch (e) {
    throw new ToolError(`Cannot create ${dirname(path)}: ${e.code || e.message}`)
  }
  const tmp = `${path}.part-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  const started = Date.now()
  let fd = null
  let names = []
  let rows = 0
  let bytes = 0
  let capped = ''
  const sample = []
  const write = (s) => {
    const b = Buffer.from(s)
    writeSync(fd, b)
    bytes += b.length
  }
  try {
    await withConnection(timeoutS, async (c) => {
      // A retry after a dropped connection starts the file again.
      if (fd !== null) closeSync(fd)
      try {
        fd = openSync(tmp, 'w', 0o600)
      } catch (e) {
        throw new ToolError(`Cannot write ${path}: ${e.code || e.message}`)
      }
      rows = 0
      bytes = 0
      sample.length = 0
      const r = await stream(c, statement, values, {
        stallMs: (timeoutS + 15) * 1000,
        onFields: (f) => {
          names = uniqueNames(f)
          write(fmt.header(names))
        },
        onRow: (row) => {
          if (rows >= MAX_EXPORT_ROWS) { capped = `stopped at ${MAX_EXPORT_ROWS.toLocaleString()} rows`; return false }
          if (bytes >= MAX_EXPORT_BYTES) { capped = `stopped at ${MAX_EXPORT_BYTES / 1e9} GB`; return false }
          write(fmt.row(names, row))
          if (sample.length < 3) sample.push(row)
          rows++
        },
      })
      return r.stopped ? { destroyed: true } : r
    })
    fsyncSync(fd)
    closeSync(fd)
    fd = null
    renameSync(tmp, path)
  } catch (err) {
    if (fd !== null) try { closeSync(fd) } catch {}
    try { unlinkSync(tmp) } catch {}
    if (['ENOSPC', 'EDQUOT', 'EIO', 'EACCES', 'EPERM', 'EROFS'].includes(err?.code)) throw new ToolError(`Writing ${path} failed (${err.code}); nothing was kept`)
    throw await queryError(err, statement, values, fp, timeoutS, started, { exporting: true })
  }
  const ms = Date.now() - started
  log(`export ${fp.hash} ${ms}ms rows=${rows} bytes=${bytes}: ${fp.shape}`)
  const lines = [
    `Wrote ${rows.toLocaleString()} row${rows === 1 ? '' : 's'} (${(bytes / 1e6).toFixed(bytes < 1e5 ? 3 : 1)} MB, ${fmt.name}) to ${path} in ${(ms / 1000).toFixed(1)} s${capped ? ` — ${capped}; narrow the query for the rest` : ''}.`,
    `columns: ${JSON.stringify(names)}`,
  ]
  if (sample.length) {
    lines.push('first rows (cells cut at 120 chars):')
    for (const s of renderRows(names, sample, { maxCell: 120, maxChars: 4000 }).text.split('\n').slice(1)) lines.push(s)
  }
  lines.push('The file holds staging rows (prod-copied people before 2025-02-26): keep it out of commits and shared docs, delete it when done.')
  return lines.join('\n')
}

async function status() {
  const lines = [`kickoff-stage-db ${VERSION}: STAGING (kudos_staging), not production`]
  let t
  try {
    t = parseUrl()
  } catch (e) {
    return `${lines[0]}\nconfig: ${e.message}`
  }
  const vpn = await vpnState(VPN)
  lines.push(`vpn: "${VPN}" ${vpn.state}${vpn.detail ? ` (${vpn.detail})` : ''}${VPN_AUTOCONNECT ? ', auto-connect on' : ', auto-connect OFF'}`)
  if (lastRecovery) lines.push(`last recovery: ${lastRecovery.at} ${lastRecovery.ok ? lastRecovery.action : lastRecovery.message}`)
  const t0 = Date.now()
  try {
    const rows = await simpleQuery(
      "SELECT CURRENT_USER() AS u, VERSION() AS v, UTC_TIMESTAMP() AS now, @@transaction_read_only AS ro, (SELECT name FROM knex_migrations ORDER BY id DESC LIMIT 1) AS mig"
    )
    const ms = Date.now() - t0
    const t1 = Date.now()
    await simpleQuery('SELECT 1')
    const r = rows[0]
    lines.push(`db: ${r.u} on MySQL ${r.v}, session read only=${r.ro ? 'yes' : 'NO'}, server time ${r.now} UTC`)
    lines.push(`latency: first call ${ms} ms, round trip ${Date.now() - t1} ms`)
    lines.push(`newest migration: ${r.mig}`)
    lines.push('data: production copy of about 2025-02-26 plus staging activity since')
  } catch (e) {
    lines.push(`db: ${e.message}`)
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Tool list

const STAGING = '[STAGING kudos_staging, not production]'
const TOOLS = [
  {
    name: 'stage_guide',
    title: 'Staging database guide',
    description: `${STAGING} What the staging database holds, when to use it instead of the production routes (Kickoff Sanitized DB, zdr_ask), core tables, definitions and limits. Read once before an unfamiliar question.`,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'stage_tables',
    title: 'List staging tables',
    description: `${STAGING} List tables with approximate row counts. like: a LIKE pattern on the table name ("%call%"; a bare word matches anywhere). column_like: only tables having a column like it, listing those columns ("coach_id").`,
    inputSchema: {
      type: 'object',
      properties: { like: { type: 'string' }, column_like: { type: 'string' }, limit: { type: 'number', description: 'default 200, max 500' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'stage_describe',
    title: 'Describe staging tables',
    description: `${STAGING} Columns, types, indexes and foreign keys for one table or up to 10 in one call (tables: [...]). Wide tables (clients has ~150 columns): pass column_like to see only the columns you need.`,
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string' },
        tables: { type: 'array', items: { type: 'string' }, maxItems: 10 },
        column_like: { type: 'string', description: 'only columns (and their indexes and keys) like this, e.g. %coach% or insurance' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'stage_query',
    title: 'Query the staging database (read only)',
    description:
      `${STAGING} Run one read statement (SELECT, WITH, SHOW, EXPLAIN, DESCRIBE). Prefer aggregates. Use ? placeholders with params for values. ` +
      `Shows ${DEFAULT_ROWS} rows by default (limit up to ${MAX_ROWS}) as a column list plus one JSON array per row. ` +
      `For more rows than you need to read, pass output_path (.csv/.tsv/.jsonl, absolute, git-ignored if inside a repo; name only the columns you need) to stream up to ${MAX_EXPORT_ROWS.toLocaleString()} rows to a file; the answer is counts and a sample.`,
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string' },
        params: { type: 'array', description: 'values for ? placeholders, in order' },
        limit: { type: 'number', description: `rows to show, default ${DEFAULT_ROWS}, max ${MAX_ROWS}` },
        timeout_seconds: { type: 'number', description: `default ${DEFAULT_TIMEOUT_S}, max ${MAX_TIMEOUT_S} (exports ${MAX_EXPORT_TIMEOUT_S})` },
        max_cell_chars: { type: 'number', description: `default ${DEFAULT_CELL}, max ${MAX_CELL}` },
        output_path: { type: 'string', description: 'write every row to this file instead of showing them' },
        overwrite: { type: 'boolean', description: 'replace output_path if it exists' },
      },
      required: ['sql'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'stage_status',
    title: 'Staging connection status',
    description: `${STAGING} VPN state, database user, read-only check, latency, newest migration. Use when a call fails or before a long session.`,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
]

const HANDLERS = { stage_guide: guide, stage_tables: tables, stage_describe: describe, stage_query: query, stage_status: status }

// Unknown arguments are refused by name instead of ignored, so a typo
// (`limt`) does not silently fall back to a default.
function checkArgs(name, args) {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) throw new ToolError('arguments must be an object')
  const allowed = Object.keys(TOOLS.find((t) => t.name === name).inputSchema.properties)
  const extra = Object.keys(args).filter((k) => !allowed.includes(k))
  if (extra.length) throw new ToolError(`Unknown argument${extra.length > 1 ? 's' : ''} ${extra.join(', ')}; ${name} takes ${allowed.join(', ') || 'none'}`)
}

async function callTool(name, args = {}) {
  const handler = HANDLERS[name]
  if (!handler) throw new ToolError(`Unknown tool: ${name}`)
  checkArgs(name, args)
  return handler(args)
}

function shutdown(code = 0) {
  const p = pool
  pool = null
  if (p) p.end(() => process.exit(code))
  setTimeout(() => process.exit(code), 500).unref()
}

// ---------------------------------------------------------------------------
// CLI

const USAGE = `usage: kickoff-stage-db <command>   (STAGING kudos_staging, read only)

  query "SQL" [--param v ...] [--limit n] [--timeout s] [--max-cell n] [--out FILE.csv|.tsv|.jsonl] [--overwrite]
  tables [--like p] [--column-like p] [--limit n]
  describe TABLE [TABLE ...] [--column-like p]
  status
  guide

Without a command it runs as an MCP stdio server.`

async function cli(argv) {
  const [cmd, ...rest] = argv
  const pos = []
  const o = { param: [] }
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (!a.startsWith('--')) { pos.push(a); continue }
    const k = a.slice(2)
    if (k === 'overwrite') { o.overwrite = true; continue }
    const v = rest[++i]
    if (v === undefined) throw new ToolError(`--${k} needs a value`)
    if (k === 'param') o.param.push(v)
    else o[k] = v
  }
  switch (cmd) {
    case 'query':
      return callTool('stage_query', {
        sql: pos.join(' ') || (process.stdin.isTTY ? '' : readFileSync(0, 'utf8')),
        ...(o.param.length ? { params: o.param } : {}),
        ...(o.limit ? { limit: Number(o.limit) } : {}),
        ...(o.timeout ? { timeout_seconds: Number(o.timeout) } : {}),
        ...(o['max-cell'] ? { max_cell_chars: Number(o['max-cell']) } : {}),
        ...(o.out ? { output_path: o.out } : {}),
        ...(o.overwrite ? { overwrite: true } : {}),
      })
    case 'tables':
      return callTool('stage_tables', { ...(o.like ? { like: o.like } : {}), ...(o['column-like'] ? { column_like: o['column-like'] } : {}), ...(o.limit ? { limit: Number(o.limit) } : {}) })
    case 'describe':
      return callTool('stage_describe', { tables: pos, ...(o['column-like'] ? { column_like: o['column-like'] } : {}) })
    case 'status':
      return callTool('stage_status')
    case 'guide':
      return callTool('stage_guide')
    default:
      return USAGE
  }
}

// ---------------------------------------------------------------------------
// MCP stdio loop

function server() {
  const send = (m) => process.stdout.write(`${JSON.stringify(m)}\n`)
  const reply = (id, result) => send({ jsonrpc: '2.0', id, result })
  const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } })
  let inflight = 0
  let closing = false
  const maybeExit = () => { if (closing && inflight === 0) shutdown(0) }
  const rl = createInterface({ input: process.stdin })
  rl.on('close', () => { closing = true; maybeExit() })
  rl.on('line', async (line) => {
    if (!line.trim()) return
    let req
    try {
      req = JSON.parse(line)
    } catch {
      return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    }
    const { id, method, params } = req
    if (method === 'initialize') {
      const v = params?.protocolVersion
      reply(id, {
        protocolVersion: SUPPORTED_PROTOCOLS.includes(v) ? v : SUPPORTED_PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'kickoff-stage-db', version: VERSION },
        instructions:
          "Kickoff's STAGING database (kudos_staging), read only. Not production: for production data use Kickoff Sanitized DB " +
          '(production-shaped counts) or zdr_ask (live rows, free text, transcripts). Read stage_guide once before an unfamiliar question. ' +
          'Aggregate in SQL; for many rows write a file with output_path instead of reading them into the conversation.',
      })
    } else if (method === 'tools/list') {
      reply(id, { tools: TOOLS })
    } else if (method === 'tools/call') {
      inflight++
      try {
        const text = await requestCtx.run(id, () => callTool(params?.name, params?.arguments ?? {}))
        reply(id, { content: [{ type: 'text', text }], isError: false })
      } catch (err) {
        if (!(err instanceof ToolError)) log(err?.stack || err)
        const message = err instanceof ToolError ? err.message : `kickoff-stage-db internal error (${err?.code || err?.name || 'unknown'}); details are in the MCP log`
        reply(id, { content: [{ type: 'text', text: message }], isError: true })
      } finally {
        inflight--
        running.delete(id)
        maybeExit()
      }
    } else if (method === 'notifications/cancelled') {
      const threads = running.get(params?.requestId)
      if (threads?.size) {
        log(`request ${params.requestId} cancelled by the client; stopping ${threads.size} statement(s)`)
        for (const t of threads) killQuery(t)
      }
    } else if (method === 'ping') {
      reply(id, {})
    } else if (id !== undefined && id !== null) {
      fail(id, -32601, `Unsupported method: ${method}`)
    }
  })
  process.on('SIGTERM', () => shutdown(0))
  process.on('SIGINT', () => shutdown(0))
}

process.on('unhandledRejection', (e) => log('unhandled rejection:', e?.stack || e))

if (process.argv.length > 2) {
  cli(process.argv.slice(2)).then(
    (out) => { process.stdout.write(`${out}\n`); shutdown(0) },
    (err) => {
      process.stderr.write(`${err instanceof ToolError ? err.message : `internal error: ${err?.stack || err}`}\n`)
      shutdown(1)
    }
  )
} else {
  server()
}
