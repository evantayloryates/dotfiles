// Which Claude account a call acts for, and where that account's driver
// state lives. The app keeps one session store per account and org,
// claude-code-sessions/<accountId>/<orgId>/local_*.json, and shows only the
// signed-in account's sessions. Every account-bound read and write (session
// listing and lookup, the pool, the broker and controller configuration,
// sidebar groups) is scoped to the account this module resolves.
//
// Resolution, first match wins:
//   1. argument   the op's `account` argument (accountId, accountId/orgId or a
//                 unique prefix of at least 8 characters)
//   2. env        CLAUDE_DRIVER_ACCOUNT, same forms
//   3. desktop-caller  the store that holds the calling desktop session's own
//                 record (exactly one store does)
//   4. most-recent-activity  the store whose newest local_*.json was modified
//                 last; ties go to the lexically smaller acct/org key
// null only when there are no stores at all, which disables scoping.
//
// Legacy state (one broker.json, one session-management-controller.json, one
// registry pool, written before accounts were tracked) belongs to the account
// whose store holds those sessions' records. accounts/migration.json records
// that owner once; nothing legacy is moved or deleted.

import { AsyncLocalStorage } from 'node:async_hooks'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { DriverError, sessionStores } from './paths.mjs'
import { BROKER_DIR, STATE_DIR, ensureDir, loadRegistry, readJson, writeJsonAtomic } from './state.mjs'
// Cyclic on purpose (sessions.mjs scopes by account); only functions cross it.
import { callerHostSession } from './sessions.mjs'

export const ACCOUNT_ENV = 'CLAUDE_DRIVER_ACCOUNT'
export const ACCOUNTS_DIR = join(STATE_DIR, 'accounts')
export const MIGRATION_FILE = join(ACCOUNTS_DIR, 'migration.json')
// The legacy, unkeyed files. They stay where they are and keep belonging to
// the account that owns their sessions; other accounts get keyed files.
export const LEGACY_BROKER_FILE = join(BROKER_DIR, 'broker.json')
export const LEGACY_CONTROLLER_FILE = join(STATE_DIR, 'session-management-controller.json')
const context = new AsyncLocalStorage()

// Run fn with a per-call account override (the op's `account` argument).
export function withAccount(spec, fn) {
  if (spec === undefined || spec === null || spec === '') return fn()
  matchAccount(spec) // fail before running anything
  return context.run({ spec }, fn)
}

export const storeKey = (s) => (s ? `${s.acct}/${s.org}` : null)

function newestMtime(dir) {
  let best = 0
  let names = []
  try { names = readdirSync(dir) } catch { return 0 }
  for (const f of names) {
    if (!/^local_.*\.json$/.test(f)) continue
    try { const m = statSync(join(dir, f)).mtimeMs; if (m > best) best = m } catch {}
  }
  return best
}

// The store that holds this session's record, or null.
export function storeOfSession(localId) {
  if (typeof localId !== 'string' || !localId.startsWith('local_')) return null
  for (const s of sessionStores()) if (existsSync(join(s.dir, `${localId}.json`))) return s
  return null
}

function describe(store, source, extra = {}) {
  return { accountId: store.acct, orgId: store.org, store: storeKey(store), dir: store.dir, source, ...extra }
}

// accountId | accountId/orgId | unique prefix (>= 8 chars) of either.
export function matchAccount(spec) {
  if (typeof spec !== 'string' || !spec.trim()) throw new DriverError('account must be an account id, accountId/orgId, or a unique prefix', { category: 'bad_args' })
  const [a, o] = spec.trim().split('/')
  const stores = sessionStores()
  const short = (x) => typeof x === 'string' && x.length < 8
  let hits = stores.filter((s) => s.acct === a && (o === undefined || s.org === o))
  if (!hits.length) {
    if (short(a) || (o !== undefined && short(o))) throw new DriverError('account prefix must be at least 8 characters', { category: 'bad_args' })
    hits = stores.filter((s) => s.acct.startsWith(a) && (o === undefined || s.org.startsWith(o)))
  }
  const accounts = new Set(hits.map((s) => s.acct))
  if (!hits.length) throw new DriverError(`no session store for account ${spec}; known: ${[...new Set(stores.map((s) => s.acct))].join(', ') || 'none'}`, { category: 'bad_args' })
  if (accounts.size > 1) throw new DriverError(`account ${spec} is ambiguous: ${[...accounts].join(', ')}`, { category: 'bad_args' })
  // One account, several orgs and no org named: the org with the newest record.
  if (hits.length > 1) hits = [...hits].sort((x, y) => newestMtime(y.dir) - newestMtime(x.dir) || storeKey(x).localeCompare(storeKey(y)))
  return hits[0]
}

export function mostRecentStore() {
  let best = null
  for (const s of sessionStores()) {
    const m = newestMtime(s.dir)
    if (!m) continue
    if (!best || m > best.mtime || (m === best.mtime && storeKey(s) < storeKey(best))) best = { ...s, mtime: m }
  }
  return best
}

export function resolveAccount({ override } = {}) {
  const spec = override ?? context.getStore()?.spec
  if (spec) return describe(matchAccount(spec), 'argument')
  const env = process.env[ACCOUNT_ENV]
  if (env) return describe(matchAccount(env), 'env')
  const caller = callerHostSession() || null
  if (caller) {
    const s = storeOfSession(caller)
    if (s) return describe(s, 'desktop-caller', { callerSession: caller })
  }
  const recent = mostRecentStore()
  if (!recent) return null
  return describe(recent, 'most-recent-activity', caller ? { callerSession: caller, note: 'desktop caller record not found in any store' } : {})
}

// True when a record (from allRecords/getRecord, or a store) is in the account.
export function inAccount(storeOrKey, account = resolveAccount()) {
  if (!account) return true
  const key = typeof storeOrKey === 'string' ? storeOrKey : storeKey(storeOrKey)
  return key === account.store
}

// ---------------------------------------------------------------- state

export const accountDir = (accountId) => {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(accountId || '')) throw new DriverError('invalid account id', { category: 'bad_args' })
  return join(ACCOUNTS_DIR, accountId)
}
export const accountFile = (accountId, name) => join(accountDir(accountId), name)

export function readMigration() {
  return readJson(MIGRATION_FILE, null)
}

// Owner of legacy, unkeyed state: the account whose store holds the session
// record, else the migration's recorded legacy owner, else null (unknown).
export function ownerOfSession(localId) {
  const s = storeOfSession(localId)
  if (s) return { accountId: s.acct, orgId: s.org, via: 'session-record-location' }
  const legacy = readMigration()?.legacyOwner
  if (legacy?.accountId) return { accountId: legacy.accountId, orgId: legacy.orgId, via: 'migration-legacy-owner' }
  return null
}

// One-time, idempotent: name the account that owns today's unkeyed state,
// from where those sessions' records live, and retain a keyed copy of the
// broker configuration. Never moves or deletes the legacy files.
let migrated = false
export function ensureAccountMigration({ brokerFile = LEGACY_BROKER_FILE, controllerFile = LEGACY_CONTROLLER_FILE, registry } = {}) {
  if (migrated || existsSync(MIGRATION_FILE)) { migrated = true; return readMigration() }
  registry ??= loadRegistry()
  const evidence = { broker: null, controller: null, pool: {} }
  const tally = new Map()
  const note = (id) => {
    const s = storeOfSession(id)
    if (s) tally.set(storeKey(s), (tally.get(storeKey(s)) || 0) + 1)
    return s ? storeKey(s) : null
  }
  const broker = brokerFile && readJson(brokerFile, null)
  if (broker?.sessionId) evidence.broker = { sessionId: broker.sessionId, store: note(broker.sessionId) }
  const controller = controllerFile && readJson(controllerFile, null)
  if (controller?.controllerSession) evidence.controller = { sessionId: controller.controllerSession, store: note(controller.controllerSession) }
  for (const id of Object.keys(registry?.pool || {})) evidence.pool[id] = note(id)
  if (!evidence.broker && !evidence.controller && !Object.keys(evidence.pool).length) { migrated = true; return null } // nothing legacy to attribute
  const [winner] = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const [accountId, orgId] = winner ? winner[0].split('/') : [null, null]
  const row = {
    schemaVersion: 1,
    migratedAt: new Date().toISOString(),
    rule: 'legacy unkeyed state belongs to the account store holding most of its session records (broker, controller, pool members)',
    legacyOwner: accountId ? { accountId, orgId } : null,
    evidence,
  }
  ensureDir(ACCOUNTS_DIR)
  if (accountId && broker?.sessionId && evidence.broker.store === `${accountId}/${orgId}`) {
    const retained = accountFile(accountId, 'broker.json')
    if (!existsSync(retained)) { ensureDir(accountDir(accountId)); writeJsonAtomic(retained, broker) }
  }
  writeJsonAtomic(MIGRATION_FILE, row)
  migrated = true
  return row
}

// Every account the app has a store for, with its session counts.
export function accountInventory() {
  const out = {}
  for (const s of sessionStores()) {
    const a = (out[s.acct] ||= { accountId: s.acct, orgs: [], sessions: 0, newestRecordAt: null })
    let n = 0
    try { n = readdirSync(s.dir).filter((f) => /^local_.*\.json$/.test(f)).length } catch {}
    const m = newestMtime(s.dir)
    a.orgs.push({ orgId: s.org, sessions: n, newestRecordAt: m ? new Date(m).toISOString() : null })
    a.sessions += n
    if (m && (!a.newestRecordAt || new Date(m).toISOString() > a.newestRecordAt)) a.newestRecordAt = new Date(m).toISOString()
  }
  return Object.values(out)
}

// Which account owns a broker or controller configuration row. A row this
// driver wrote since 2026-11-20 names its account; an older row belongs to
// the account whose store holds its session's record.
export function ownerOfConfig(row, sessionField) {
  if (!row) return null
  if (row.accountId) return { accountId: row.accountId, orgId: row.orgId ?? null, via: 'recorded' }
  return ownerOfSession(row[sessionField])
}
