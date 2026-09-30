// Ground truth from disk: session records, pins, live processes, and what
// the main window last focused. The app owns every file read here; the
// driver never writes them (the app keeps state in memory and rewrites).

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { DESKTOP_CONFIG, DriverError, PEER_SESSIONS_DIR, sessionStores } from './paths.mjs'

const FIELDS = ['sessionId', 'cliSessionId', 'title', 'titleSource', 'cwd', 'originCwd', 'isArchived', 'model', 'effort', 'permissionMode', 'worktreePath', 'createdAt', 'lastActivityAt', 'lastFocusedAt', 'prs', 'prUrl', 'prState', 'prNumber', 'completedTurns']

export function readRecord(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

// All session records across every account/org store.
export function allRecords({ includeArchived = true } = {}) {
  const out = []
  for (const store of sessionStores()) {
    for (const f of readdirSync(store.dir)) {
      if (!/^local_.*\.json$/.test(f)) continue
      const file = join(store.dir, f)
      const rec = readRecord(file)
      if (!rec?.sessionId) continue
      if (!includeArchived && rec.isArchived) continue
      out.push({ ...rec, _file: file, _store: `${store.acct}/${store.org}` })
    }
  }
  return out
}

export function findRecordFile(localId) {
  for (const store of sessionStores()) {
    const file = join(store.dir, `${localId}.json`)
    if (existsSync(file)) return file
  }
  return null
}

export function getRecord(localId) {
  const file = findRecordFile(localId)
  if (!file) return null
  const rec = readRecord(file)
  return rec ? { ...rec, _file: file } : null
}

export function summarize(rec, { pins = readPins(), live = null } = {}) {
  if (!rec) return null
  const s = {}
  for (const k of FIELDS) if (rec[k] !== undefined && rec[k] !== null) s[k] = rec[k]
  s.pinned = pins.has(rec.sessionId)
  if (live) {
    const l = live.get(rec.sessionId)
    s.live = l ? { pid: l.pid, status: l.status } : null
  }
  s.openPrs = openPrs(rec)
  return s
}

export function openPrs(rec) {
  const prs = Array.isArray(rec.prs) ? rec.prs : rec.prUrl ? [{ url: rec.prUrl, state: rec.prState }] : []
  return prs.filter((p) => p.state && !['MERGED', 'CLOSED'].includes(String(p.state).toUpperCase())).map((p) => p.url)
}

// Accepts local_<id>, a bare uuid (local id or cliSessionId), "self" (the
// desktop session hosting the calling harness), or an exact title.
export function resolveSession(ref, { allowArchived = true } = {}) {
  if (!ref || typeof ref !== 'string') throw new DriverError('session is required', { category: 'bad_args' })
  if (ref === 'self') {
    const self = callerHostSession()
    if (!self) throw new DriverError('"self" only works when the calling harness runs inside a Claude desktop session', { category: 'bad_args' })
    ref = self
  }
  if (ref.startsWith('local_')) {
    const rec = getRecord(ref)
    if (!rec) throw new DriverError(`no session record for ${ref}`, { category: 'not_found' })
    return rec
  }
  const recs = allRecords()
  if (/^[0-9a-f-]{36}$/i.test(ref)) {
    const hit = recs.find((r) => r.sessionId === `local_${ref}`) || recs.find((r) => r.cliSessionId === ref)
    if (!hit) throw new DriverError(`no session with id ${ref}`, { category: 'not_found' })
    return hit
  }
  let hits = recs.filter((r) => r.title === ref)
  if (!allowArchived || hits.length > 1) {
    const active = hits.filter((r) => !r.isArchived)
    if (active.length) hits = active
  }
  if (hits.length === 1) return hits[0]
  if (!hits.length) throw new DriverError(`no session titled "${ref}"`, { category: 'not_found' })
  throw new DriverError(`${hits.length} sessions are titled "${ref}"; pass a session id: ${hits.map((h) => h.sessionId).join(', ')}`, { category: 'ambiguous' })
}

function readDesktopConfig() {
  try {
    return JSON.parse(readFileSync(DESKTOP_CONFIG, 'utf8'))
  } catch {
    return {}
  }
}

export function readPins() {
  const prefs = readDesktopConfig().preferences?.epitaxyPrefs || {}
  return new Set(prefs['starred-local-code-sessions'] || [])
}

// What the main window last showed, from disk alone: the pane store's
// primary code session, cross-checked with the newest lastFocusedAt.
// Verified equal to get_window_layout's focused pane (see findings.md).
export function diskFocus() {
  const prefs = readDesktopConfig().preferences?.epitaxyPrefs || {}
  const primary = prefs['desktop-frame.paneStore.v1']?.state?.lastPrimaryCodeSession?.id || null
  let newest = null
  for (const r of allRecords({ includeArchived: false })) {
    if (r.lastFocusedAt && (!newest || r.lastFocusedAt > newest.lastFocusedAt)) newest = r
  }
  return { primarySession: primary, lastFocused: newest ? { sessionId: newest.sessionId, at: newest.lastFocusedAt } : null }
}

// Live Claude Code processes, from ~/.claude/sessions/<pid>.json (the same
// data `claude agents --json` prints), with dead pids dropped.
export function liveProcesses() {
  const out = []
  if (!existsSync(PEER_SESSIONS_DIR)) return out
  for (const f of readdirSync(PEER_SESSIONS_DIR)) {
    if (!/^\d+\.json$/.test(f)) continue
    let j
    try {
      j = JSON.parse(readFileSync(join(PEER_SESSIONS_DIR, f), 'utf8'))
    } catch {
      continue
    }
    if (!j.pid || !pidAlive(j.pid)) continue
    out.push(j)
  }
  return out
}

export function liveByHost() {
  const m = new Map()
  for (const p of liveProcesses()) if (p.hostSessionId) m.set(p.hostSessionId, p)
  return m
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

// The desktop session hosting this process tree, if any: an MCP server's
// parent is the Claude Code process, whose sessions/<pid>.json names it.
export function callerHostSession() {
  if (process.env.CLAUDE_DRIVER_CALLER_SESSION) return process.env.CLAUDE_DRIVER_CALLER_SESSION
  if (process.env.CLAUDE_CODE_ENTRYPOINT !== 'claude-desktop') return null
  let pid = process.ppid
  for (let i = 0; i < 4 && pid > 1; i++) {
    const f = join(PEER_SESSIONS_DIR, `${pid}.json`)
    if (existsSync(f)) {
      try {
        return JSON.parse(readFileSync(f, 'utf8')).hostSessionId || null
      } catch {
        return null
      }
    }
    pid = parentPid(pid)
  }
  return null
}

function parentPid(pid) {
  try {
    return Number(execFileSync('/bin/ps', ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf8' }).trim()) || 0
  } catch {
    return 0
  }
}

// Wait for a record to appear or satisfy a predicate. Bounded.
export async function waitForRecord(localId, predicate = () => true, { timeoutMs = 20_000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    last = getRecord(localId)
    if (last && predicate(last)) return { ok: true, record: last }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return { ok: false, record: last }
}

export async function waitForPins(predicate, { timeoutMs = 10_000 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const pins = readPins()
    if (predicate(pins)) return true
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

export function mtime(file) {
  try {
    return statSync(file).mtimeMs
  } catch {
    return 0
  }
}

// Sidebar groups for the active account/org, from the app's config.
export function readGroups() {
  const scopes = readDesktopConfig().preferences?.epitaxyPrefs?.['dframe-group-scopes'] || {}
  const out = { groups: [], assignments: {} }
  for (const scope of Object.values(scopes)) {
    for (const g of scope.groups || []) out.groups.push(g)
    for (const [k, v] of Object.entries(scope.assignments || {})) out.assignments[k.replace(/^code:/, '')] = v
  }
  return out
}
