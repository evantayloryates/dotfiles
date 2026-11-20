// The bypass pool: finished desktop sessions that Taylor already put in
// bypassPermissions, cleared and parked (archived) so a later create can hand
// one out instead of importing. An import can never be bypass and a raise
// always needs Taylor's card (docs/findings.md 2026-09-30); a pooled session
// keeps the mode he gave it, so claiming one raises nothing.
//
// Registry shape (registry.json → pools[accountId]), one pool per Claude
// account (account.mjs). A member is filed under the account whose store holds
// its record; reads, reconciles and claims see only the resolved account's
// pool, so a claim never hands out a session the signed-in app cannot see.
// The legacy unkeyed registry.pool (pre-2026-11-20, or written by a stale
// server process) is folded into pools[] by record location on every write.
//   { [local id]: { state: 'recycling' | 'parking' | 'parked' | 'claimed', folder,
//                   priorTitle, cliAtRequest, requestedAt, parkedAt,
//                   claimedAt, claimedTitle, claimUnresolved, claimJobId } }
// "Clean" is read from disk, never from the registry: the app drops a
// record's cliSessionId on /clear and writes a new one on the next turn.

import { existsSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'

import { getRecord, openPrs, readPins } from './sessions.mjs'
import { loadRegistry, readJson, updateRegistry, withLock } from './state.mjs'
import { ensureAccountMigration, ownerOfSession, resolveAccount, storeKey, storeOfSession } from './account.mjs'

import {readSessionManagementEnrollment} from './session-management-controller.mjs'
import {readStandbyEnrollment} from './standby-enrollment.mjs'

// Retained roles protect actors even while absent, expired or archived. Invalid
// enrollment fails closed; pool inspection must never repair service metadata.
export function poolServiceActors(){
 const controller=readSessionManagementEnrollment();if(!controller)return []
 const binding=readStandbyEnrollment(controller.controllerSession)
 return [controller.controllerSession,binding?.primary?.sessionId,binding?.standby?.sessionId].filter(Boolean)
}

export const BYPASS = 'bypassPermissions'
export const RECYCLE_WAIT_MS = 180_000
// A claim whose handed-back calls were never made: the session is still clean after this long.
const CLAIM_STALE_MS = 10 * 60_000

export const poolTitle = (folder) => `pool · ${basename(folder)} · idle`

export const recycleMessage = () =>
  [
    'Pool recycle v1 — this session\'s work is finished and it is being returned to Taylor\'s session pool (claude-driver pool_release). This is Taylor\'s standing rule, in your own instructions: ~/.claude/CLAUDE.md, "Sessions you create for me", the pool paragraph.',
    'Nothing is deleted: the conversation stays on disk and under "Resume previous session"; only this session\'s live context starts over.',
    'If you are holding anything unresolved for Taylor (an open question, unpushed work, a PR that is not merged or closed), do none of the steps and reply with exactly one line: "recycle declined: <why>".',
    'Otherwise do exactly these steps, nothing else:',
    '1. ToolSearch query "select:mcp__ccd_pr__get_status,mcp__ccd_pr__unbind_pr,mcp__ccd_session_mgmt__get_session,mcp__ccd_session_mgmt__detach_session,mcp__ccd_session_mgmt__clear_session".',
    '2. Call mcp__ccd_pr__get_status (session_id "self"). If it reports a bound PR url, call mcp__ccd_pr__unbind_pr with that url. If none is bound, skip.',
    '3. Call mcp__ccd_session_mgmt__get_session with session_id "self". If it reports parentSessionId and detached is not true, call mcp__ccd_session_mgmt__detach_session with session_id "self"; a refusal is fine, so carry on. The next owner of this session must not stay nested under the session that started you.',
    '4. Reply with exactly one line: "recycled: unbind=<done|none|error: ...> detach=<done|none|refused>".',
    '5. As your LAST tool call, call mcp__ccd_session_mgmt__clear_session with session_id "self".',
    'Do not run any other tool, and do not touch git, files or any worktree.',
  ].join('\n')

// The mode a new session in this folder is meant to start in: project
// settings, then Taylor's user settings. Putting a session in that mode is
// his standing choice, not a raise.
export function defaultPermissionMode(folder) {
  const files = [
    ...(folder ? [join(folder, '.claude', 'settings.local.json'), join(folder, '.claude', 'settings.json')] : []),
    join(homedir(), '.claude', 'settings.json'),
  ]
  for (const f of files) {
    if (!existsSync(f)) continue
    const mode = readJson(f, {})?.permissions?.defaultMode
    if (typeof mode === 'string' && mode) return mode
  }
  return 'acceptEdits'
}

// The account a pool entry belongs to: where its record lives, else the
// migration's legacy owner, else the account acting now.
export const entryAccount = (id, fallback = resolveAccount()?.accountId) =>
  storeOfSession(id)?.acct || ownerOfSession(id)?.accountId || fallback || 'unattributed'

function foldLegacy(r, fallback) {
  const legacy = r.pool || {}
  if (!Object.keys(legacy).length) return
  r.pools = { ...(r.pools || {}) }
  // A stale server wrote legacy entries after the keyed ones: they are newer.
  for (const [id, e] of Object.entries(legacy)) {
    const a = entryAccount(id, fallback)
    r.pools[a] = { ...(r.pools[a] || {}), [id]: { ...(r.pools[a]?.[id] || {}), ...e } }
  }
  r.pool = {}
}

// The resolved account's pool (every account's when there are no stores).
export const poolOf = (reg = loadRegistry(), account = resolveAccount()) => {
  ensureAccountMigration()
  const key = account?.accountId
  const keyed = key ? reg.pools?.[key] || {} : Object.assign({}, ...Object.values(reg.pools || {}))
  const legacy = Object.fromEntries(Object.entries(reg.pool || {}).filter(([id]) => !key || entryAccount(id, key) === key))
  return { ...keyed, ...legacy }
}

// Members and ready counts per account, for status only.
export function poolsByAccount(reg = loadRegistry()) {
  const out = {}
  const add = (a, id, e) => { (out[a] ||= { members: 0, byState: {} }).members++; out[a].byState[e.state] = (out[a].byState[e.state] || 0) + 1 }
  for (const [a, p] of Object.entries(reg.pools || {})) for (const [id, e] of Object.entries(p || {})) add(a, id, e)
  for (const [id, e] of Object.entries(reg.pool || {})) add(entryAccount(id), id, e)
  return out
}

export function setEntry(id, patch) {
  ensureAccountMigration()
  const fallback = resolveAccount()?.accountId
  return updateRegistry((r) => {
    foldLegacy(r, fallback)
    const a = entryAccount(id, fallback)
    r.pools = { ...(r.pools || {}) }
    const p = { ...(r.pools[a] || {}) }
    if (patch === null) delete p[id]
    else p[id] = { ...(p[id] || {}), ...patch }
    r.pools[a] = p
  })
}

// Why a session cannot be pooled, or [] when it can.
export function poolGate(rec, { self, brokerId, live, override = false, protectedIds=poolServiceActors() } = {}) {
  const why = []
  if (rec.sessionId === self) why.push('is you')
  if (rec.sessionId === brokerId) why.push('is the broker')
  if (protectedIds.includes(rec.sessionId)) why.push('is a retained independent service actor')
  if (rec.scheduledTaskId) why.push('is an unattended scheduled-task run')
  if (rec.permissionMode !== BYPASS) why.push(`is in ${rec.permissionMode}, not bypassPermissions (the pool only holds sessions Taylor already put in bypass; it never raises one)`)
  if (rec.worktreePath) why.push('owns an app-managed worktree')
  if (readPins().has(rec.sessionId)) why.push('pinned')
  if (['busy', 'working'].includes(live?.get(rec.sessionId)?.status)) why.push('still working')
  if (!override && openPrs(rec).length) why.push(`open PR ${openPrs(rec).join(', ')}`)
  return why
}

// Disk health of one entry.
export function health(id, entry) {
  const rec = getRecord(id)
  if(poolServiceActors().includes(id))return {status:'service_protected',rec}
  if (!rec) return { status: 'gone' }
  if (rec.permissionMode !== BYPASS) return { status: 'not_bypass', rec }
  if (entry.state === 'parked') return { status: rec.cliSessionId || !rec.isArchived ? 'dirty' : 'ready', rec }
  if (entry.state === 'claimed' && entry.claimUnresolved === true) return { status: 'claim_unresolved', rec }
  if (entry.state === 'claimed') {
    if (rec.cliSessionId) return { status: 'in_use', rec }
    return { status: rec.isArchived && Date.now() - (entry.claimedAt || 0) > CLAIM_STALE_MS ? 'claim_stale' : 'claimed', rec }
  }
  return { status: rec.cliSessionId ? 'recycling' : 'cleared', rec }
}

// Drop entries that left the pool by themselves; return stale claims to it.
async function reconcileUnlocked() {
  // Migrate in place: legacy unkeyed members move under their own account.
  ensureAccountMigration()
  if (Object.keys(loadRegistry().pool || {}).length) {
    const fallback = resolveAccount()?.accountId
    await updateRegistry((r) => foldLegacy(r, fallback))
  }
  const rows = []
  for (const [id, entry] of Object.entries(poolOf())) {
    const h = health(id, entry)
    if (['gone', 'not_bypass', 'in_use', 'dirty'].includes(h.status)) {
      await setEntry(id, null)
      rows.push({ sessionId: id, status: h.status, dropped: true, title: h.rec?.title })
      continue
    }
    if(h.status==='service_protected'){rows.push({sessionId:id,status:h.status,folder:h.rec?.cwd??entry.folder,title:h.rec?.title,archived:h.rec?.isArchived===true});continue}
    if (h.status === 'claim_stale') {
      await setEntry(id, { state: 'parked', claimedAt: undefined, claimedTitle: undefined })
      h.status = 'ready'
    }
    rows.push({ sessionId: id, status: h.status, folder: h.rec.cwd, title: h.rec.title, archived: !!h.rec.isArchived, priorTitle: entry.priorTitle })
  }
  return rows
}

export function reconcile() {
  return withLock('pool', reconcileUnlocked)
}

// Atomically pick a ready member parked in this folder (oldest first) and
// mark it claimed. null when the pool has none there. The pool is per
// folder on purpose: moving a session (change_directory) applies only after
// its turn ends, a queued brief runs before it, and an untrusted folder
// raises a workspace-trust prompt for Taylor (findings 2026-10-02).
export async function claim(folder, { title } = {}) {
  const canonical=p=>existsSync(p)?realpathSync(p):resolve(p)
  const want = canonical(folder)
  const account = resolveAccount()
  // Defense in depth: the member's record must be in the resolved store now.
  const sameAccount = (id) => !account || storeKey(storeOfSession(id)) === account.store
  return withLock('pool', async () => {
    const ready = (await reconcileUnlocked())
      .filter((m) => m.status === 'ready')
      .map((m) => ({ ...m, entry: poolOf()[m.sessionId] }))
      .sort((a, b) => (a.entry.parkedAt || 0) - (b.entry.parkedAt || 0))
    const protectedIds=poolServiceActors()
    const pick = ready.find((m) => !protectedIds.includes(m.sessionId)&&sameAccount(m.sessionId)&&canonical(m.folder) === want)
    if (!pick) return null
    await setEntry(pick.sessionId, { state: 'claimed', claimedAt: Date.now(), claimedTitle: title })
    return { sessionId: pick.sessionId, folder: pick.folder, archived: pick.archived, priorTitle: pick.priorTitle }
  })
}
