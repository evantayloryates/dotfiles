// Per-account resolution and state: the caller's own record picks the account,
// listings and the pool never mix stores, legacy state stays with its owner.
import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'claude-driver-account-'))
const state = join(root, 'state'), app = join(root, 'app'), folder = join(root, 'work')
process.env.CLAUDE_DRIVER_STATE_DIR = state
process.env.CLAUDE_DRIVER_APP_SUPPORT = app
process.env.CLAUDE_DRIVER_PEER_SESSIONS_DIR = join(root, 'peers')
delete process.env.CLAUDE_DRIVER_ACCOUNT
delete process.env.CLAUDE_DRIVER_CALLER_SESSION
mkdirSync(folder, { recursive: true }); mkdirSync(join(root, 'peers')); mkdirSync(join(state, 'broker'), { recursive: true, mode: 0o700 })

const A = { acct: 'aaaaaaaa-1111-4111-8111-111111111111', org: 'aorg0000-0000-4000-8000-000000000000' }
const B = { acct: 'bbbbbbbb-2222-4222-8222-222222222222', org: 'borg0000-0000-4000-8000-000000000000' }
const id = (n) => `local_00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const storeDir = (s) => join(app, 'claude-code-sessions', s.acct, s.org)
function rec(s, n, extra = {}, mtime) {
  mkdirSync(storeDir(s), { recursive: true })
  const file = join(storeDir(s), `${id(n)}.json`)
  writeFileSync(file, JSON.stringify({ sessionId: id(n), cwd: folder, title: `s${n}`, permissionMode: 'bypassPermissions', cliSessionId: null, isArchived: true, ...extra }))
  if (mtime) utimesSync(file, mtime / 1000, mtime / 1000)
}
// A: the old account (broker 1, controller 2, pool members 3 and 4). B: new (5, 6, caller 7).
rec(A, 1, { title: 'claude-driver-broker' }, 1_000_000)
rec(A, 2, {}, 1_000_000); rec(A, 3, {}, 1_000_000); rec(A, 4, {}, 1_000_000)
rec(B, 5, {}, 2_000_000); rec(B, 6, {}, 2_000_000); rec(B, 7, { isArchived: false, title: 'caller in B' }, 2_000_000)
writeFileSync(join(state, 'broker', 'broker.json'), JSON.stringify({ sessionId: id(1), createdAt: 'then' }))
writeFileSync(join(state, 'session-management-controller.json'), JSON.stringify({ schemaVersion: 1, controllerSession: id(2), receiverCwd: folder, enrolledAt: 1 }), { mode: 0o600 })
writeFileSync(join(state, 'registry.json'), JSON.stringify({ sessions: {}, folders: {}, pool: {
  [id(3)]: { state: 'parked', folder, parkedAt: 1 },
  [id(4)]: { state: 'recycling', folder, cliAtRequest: 'x', requestedAt: 1 },
} }))

const account = await import('../src/lib/account.mjs')
const sessions = await import('../src/lib/sessions.mjs')
const pool = await import('../src/lib/pool.mjs')
const broker = await import('../src/lib/broker.mjs')
const controller = await import('../src/lib/session-management-controller.mjs')
const { runOp, accountStatus } = await import('../src/lib/driver.mjs')

after(() => rmSync(root, { recursive: true, force: true }))
beforeEach(() => { delete process.env.CLAUDE_DRIVER_ACCOUNT; delete process.env.CLAUDE_DRIVER_CALLER_SESSION })

test('the desktop caller record picks its account; no caller falls back to the newest store', () => {
  process.env.CLAUDE_DRIVER_CALLER_SESSION = id(7)
  let r = account.resolveAccount()
  assert.equal(r.accountId, B.acct); assert.equal(r.orgId, B.org); assert.equal(r.source, 'desktop-caller'); assert.equal(r.callerSession, id(7))
  process.env.CLAUDE_DRIVER_CALLER_SESSION = id(2)
  r = account.resolveAccount()
  assert.equal(r.accountId, A.acct); assert.equal(r.source, 'desktop-caller')
  delete process.env.CLAUDE_DRIVER_CALLER_SESSION
  r = account.resolveAccount()
  assert.equal(r.accountId, B.acct); assert.equal(r.source, 'most-recent-activity')
  process.env.CLAUDE_DRIVER_CALLER_SESSION = id(999)
  r = account.resolveAccount()
  assert.equal(r.source, 'most-recent-activity'); assert.match(r.note, /not found/)
})

test('an argument beats env, env beats the caller, and bad overrides fail closed', async () => {
  process.env.CLAUDE_DRIVER_CALLER_SESSION = id(7)
  process.env.CLAUDE_DRIVER_ACCOUNT = A.acct
  assert.equal(account.resolveAccount().source, 'env')
  assert.equal(account.resolveAccount().accountId, A.acct)
  await account.withAccount(`${B.acct.slice(0, 8)}`, () => { const r = account.resolveAccount(); assert.equal(r.accountId, B.acct); assert.equal(r.source, 'argument') })
  assert.throws(() => account.matchAccount('bbb'), (e) => e.category === 'bad_args')
  assert.throws(() => account.matchAccount('cccccccc'), (e) => e.category === 'bad_args')
  await assert.rejects(runOp('list_sessions', { account: 'nope-nope-nope' }), (e) => e.category === 'bad_args')
})

test('legacy state is attributed to the account holding its records, without moving it', () => {
  process.env.CLAUDE_DRIVER_CALLER_SESSION = id(7)
  const m = account.ensureAccountMigration()
  assert.deepEqual(m.legacyOwner, { accountId: A.acct, orgId: A.org })
  assert.equal(m.evidence.broker.store, `${A.acct}/${A.org}`)
  assert.equal(m.evidence.pool[id(3)], `${A.acct}/${A.org}`)
  assert.ok(existsSync(join(state, 'broker', 'broker.json')), 'legacy broker.json stays')
  assert.equal(JSON.parse(readFileSync(join(state, 'accounts', A.acct, 'broker.json'), 'utf8')).sessionId, id(1))
  assert.ok(existsSync(join(state, 'session-management-controller.json')), 'legacy controller stays')
})

test('a new account sees no other account\'s broker, controller, pool members or sessions', async () => {
  process.env.CLAUDE_DRIVER_CALLER_SESSION = id(7)
  const b = broker.brokerInfo()
  assert.equal(b.configured, false); assert.equal(b.reason, 'not_configured_for_account')
  assert.equal(b.occupant.accountId, A.acct); assert.equal(b.occupant.sessionId, id(1)); assert.equal(b.account.accountId, B.acct)
  assert.equal(b.sessionId, undefined)
  assert.equal(controller.readSessionManagementEnrollment(), null)
  assert.equal(controller.controllerFileFor(), join(state, 'accounts', B.acct, 'session-management-controller.json'))
  assert.deepEqual(pool.poolOf(), {})
  assert.equal(await pool.claim(folder, { title: 'must not take A' }), null)
  const listed = await runOp('list_sessions', { include_archived: true })
  assert.deepEqual(listed.map((r) => r.sessionId).sort(), [id(5), id(6), id(7)])
  assert.throws(() => sessions.resolveSession(id(3)), (e) => e.category === 'other_account' && e.detail.store === `${A.acct}/${A.org}`)
  assert.throws(() => sessions.resolveSession('s3'), (e) => e.category === 'not_found')
  // The old account keeps its state, visible when it is the resolved account.
  process.env.CLAUDE_DRIVER_CALLER_SESSION = id(2)
  assert.equal(broker.brokerAccountView().mine, true)
  assert.equal(controller.readSessionManagementEnrollment().controllerSession, id(2))
  assert.deepEqual(Object.keys(pool.poolOf()).sort(), [id(3), id(4)])
  assert.equal(sessions.resolveSession(id(3)).sessionId, id(3))
})

test('a claim never takes another account\'s member, even a ready one in the same folder', async () => {
  process.env.CLAUDE_DRIVER_CALLER_SESSION = id(7)
  await pool.setEntry(id(5), { state: 'parked', folder, parkedAt: 5 })
  // Old-account entries were folded under their own key by that write, not dropped.
  const reg = JSON.parse(readFileSync(join(state, 'registry.json'), 'utf8'))
  assert.deepEqual(reg.pool, {})
  assert.deepEqual(Object.keys(reg.pools[A.acct]).sort(), [id(3), id(4)])
  assert.deepEqual(Object.keys(reg.pools[B.acct]), [id(5)])
  // A stale server writes a legacy unkeyed entry for an A session; B still cannot see it.
  reg.pool = { [id(3)]: { state: 'parked', folder, parkedAt: 0 } }
  writeFileSync(join(state, 'registry.json'), JSON.stringify(reg))
  assert.deepEqual(Object.keys(pool.poolOf()), [id(5)])
  const pick = await pool.claim(folder, { title: 'B claim' })
  assert.equal(pick.sessionId, id(5))
  assert.equal(await pool.claim(folder, { title: 'nothing left in B' }), null)
  assert.equal(pool.poolOf(undefined, { accountId: A.acct })[id(3)].state, 'parked', 'A member untouched')
})

test('status names the resolved account and counts other accounts\' pools', async () => {
  process.env.CLAUDE_DRIVER_CALLER_SESSION = id(7)
  const s = accountStatus()
  assert.equal(s.account.accountId, B.acct); assert.equal(s.account.source, 'desktop-caller'); assert.equal(s.account.callerSession, id(7))
  assert.deepEqual(s.legacyStateOwner, { accountId: A.acct, orgId: A.org })
  const a = s.accounts.find((x) => x.accountId === A.acct), b = s.accounts.find((x) => x.accountId === B.acct)
  assert.equal(a.current, false); assert.equal(b.current, true)
  assert.equal(a.brokerOccupant, true); assert.equal(b.brokerOccupant, false)
  assert.equal(a.retainedBroker, id(1)); assert.equal(b.retainedBroker, null)
  assert.ok(a.pool.members >= 2)
  const p = await runOp('pool_status', {})
  assert.equal(p.account.accountId, B.acct)
  assert.ok(p.members.every((m) => m.sessionId !== id(3) && m.sessionId !== id(4)))
  assert.ok(p.otherAccounts[A.acct].members >= 2)
  const pa = await runOp('pool_status', { account: A.acct })
  assert.equal(pa.account.source, 'argument')
  assert.ok(pa.members.some((m) => m.sessionId === id(3)))
})

test('saving a broker for a new account retains the previous occupant under its own key', () => {
  process.env.CLAUDE_DRIVER_CALLER_SESSION = id(7)
  broker.saveBrokerInfo({ sessionId: id(6), createdAt: 'now' })
  const row = JSON.parse(readFileSync(join(state, 'broker', 'broker.json'), 'utf8'))
  assert.equal(row.sessionId, id(6)); assert.equal(row.accountId, B.acct); assert.equal(row.orgId, B.org)
  assert.equal(JSON.parse(readFileSync(join(state, 'accounts', A.acct, 'broker.json'), 'utf8')).sessionId, id(1))
  assert.equal(JSON.parse(readFileSync(join(state, 'accounts', B.acct, 'broker.json'), 'utf8')).sessionId, id(6))
  process.env.CLAUDE_DRIVER_CALLER_SESSION = id(2)
  const b = broker.brokerInfo()
  assert.equal(b.configured, false); assert.equal(b.occupant.accountId, B.acct); assert.equal(b.retainedForAccount.sessionId, id(1))
})
