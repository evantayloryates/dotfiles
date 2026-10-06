// The bypass pool: finished desktop sessions that Taylor already put in
// bypassPermissions, cleared and parked (archived) so a later create can hand
// one out instead of importing. An import can never be bypass and a raise
// always needs Taylor's card (docs/findings.md 2026-09-30); a pooled session
// keeps the mode he gave it, so claiming one raises nothing.
//
// Registry shape (registry.json → pool):
//   { [local id]: { state: 'recycling' | 'parking' | 'parked' | 'claimed', folder,
//                   priorTitle, cliAtRequest, requestedAt, parkedAt,
//                   claimedAt, claimedTitle } }
// "Clean" is read from disk, never from the registry: the app drops a
// record's cliSessionId on /clear and writes a new one on the next turn.

import { existsSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'

import { getRecord, openPrs, readPins } from './sessions.mjs'
import { loadRegistry, readJson, updateRegistry, withLock } from './state.mjs'

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
    '1. ToolSearch query "select:mcp__ccd_pr__get_status,mcp__ccd_pr__unbind_pr,mcp__ccd_session_mgmt__clear_session".',
    '2. Call mcp__ccd_pr__get_status (session_id "self"). If it reports a bound PR url, call mcp__ccd_pr__unbind_pr with that url. If none is bound, skip.',
    '3. Reply with exactly one line: "recycled: unbind=<done|none|error: ...>".',
    '4. As your LAST tool call, call mcp__ccd_session_mgmt__clear_session with session_id "self".',
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

export const poolOf = (reg = loadRegistry()) => reg.pool || {}

export function setEntry(id, patch) {
  return updateRegistry((r) => {
    r.pool = { ...(r.pool || {}) }
    if (patch === null) delete r.pool[id]
    else r.pool[id] = { ...(r.pool[id] || {}), ...patch }
  })
}

// Why a session cannot be pooled, or [] when it can.
export function poolGate(rec, { self, brokerId, live, override = false } = {}) {
  const why = []
  if (rec.sessionId === self) why.push('is you')
  if (rec.sessionId === brokerId) why.push('is the broker')
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
  if (!rec) return { status: 'gone' }
  if (rec.permissionMode !== BYPASS) return { status: 'not_bypass', rec }
  if (entry.state === 'parked') return { status: rec.cliSessionId || !rec.isArchived ? 'dirty' : 'ready', rec }
  if (entry.state === 'claimed') {
    if (rec.cliSessionId) return { status: 'in_use', rec }
    return { status: rec.isArchived && Date.now() - (entry.claimedAt || 0) > CLAIM_STALE_MS ? 'claim_stale' : 'claimed', rec }
  }
  return { status: rec.cliSessionId ? 'recycling' : 'cleared', rec }
}

// Drop entries that left the pool by themselves; return stale claims to it.
async function reconcileUnlocked() {
  const rows = []
  for (const [id, entry] of Object.entries(poolOf())) {
    const h = health(id, entry)
    if (['gone', 'not_bypass', 'in_use', 'dirty'].includes(h.status)) {
      await setEntry(id, null)
      rows.push({ sessionId: id, status: h.status, dropped: true, title: h.rec?.title })
      continue
    }
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
  return withLock('pool', async () => {
    const ready = (await reconcileUnlocked())
      .filter((m) => m.status === 'ready')
      .map((m) => ({ ...m, entry: poolOf()[m.sessionId] }))
      .sort((a, b) => (a.entry.parkedAt || 0) - (b.entry.parkedAt || 0))
    const pick = ready.find((m) => canonical(m.folder) === want)
    if (!pick) return null
    await setEntry(pick.sessionId, { state: 'claimed', claimedAt: Date.now(), claimedTitle: title })
    return { sessionId: pick.sessionId, folder: pick.folder, archived: pick.archived, priorTitle: pick.priorTitle }
  })
}
