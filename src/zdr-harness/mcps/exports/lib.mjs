// Export management for the ZDR harness: list, archive, unarchive, delete.
//
// Exports are persistent. Only an archived export ages out: `prune` deletes
// it ARCHIVE_DAYS after it was archived. Archiving is a marker in
// .state/archive.json, never a move, so every path a tool or package refers
// to stays valid. Every operation is bulk (ids or a selector), idempotent,
// and limited to whitelisted export kinds inside the exports root. Nothing
// here reads an export's contents.

import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

export const ARCHIVE_DAYS = 7
const DAY = 86_400_000
const MAX_IDS = 5000

export class ExportsError extends Error {}

// The only things these tools can touch. Anything else under the root is
// listed as unmanaged and left alone (fixture-approvals above all).
export const KINDS = [
  { kind: 'transcripts', prefix: 'tx_', id: /^tx_[a-f0-9]{8}$/, dir: '', file: (id) => `${id}.jsonl`, fromName: (n) => (/^tx_[a-f0-9]{8}\.jsonl$/.test(n) ? n.slice(0, -6) : null), isDir: false },
  { kind: 'fixture-package', prefix: 'fp_', id: /^fp_[a-f0-9]{24}$/, dir: 'fixture-packages', file: (id) => id, fromName: (n) => (/^fp_[a-f0-9]{24}$/.test(n) ? n : null), isDir: true },
  { kind: 'source-page', prefix: 'sp_', id: /^sp_[a-f0-9]{24}$/, dir: 'fixture-source-pages', file: (id) => `${id}.json`, fromName: (n) => (/^sp_[a-f0-9]{24}\.json$/.test(n) ? n.slice(0, -5) : null), isDir: false },
  { kind: 'review', prefix: 'rv_', id: /^rv_[a-z0-9][a-z0-9-]{0,63}$/, dir: 'operational-review', file: (id) => `${id.slice(3)}.json`, fromName: (n) => (/^[a-z0-9][a-z0-9-]{0,63}\.json$/.test(n) ? `rv_${n.slice(0, -5)}` : null), isDir: false },
]
const KNOWN_TOP = new Set(['.state', 'fixture-approvals', ...KINDS.map((k) => k.dir).filter(Boolean)])

const kindOf = (id) => (typeof id === 'string' ? KINDS.find((k) => k.id.test(id)) : undefined)

export function rootOf(root) {
  if (!root) throw new ExportsError('exports root is not set')
  mkdirSync(root, { recursive: true, mode: 0o700 })
  const real = realpathSync(root)
  if (lstatSync(root).isSymbolicLink()) throw new ExportsError('exports root must not be a symlink')
  return real
}

// Absolute path of an export, refusing anything that resolves outside the
// root or through a symlink.
function unitPath(root, id) {
  const k = kindOf(id)
  if (!k) return null
  const p = join(root, k.dir, k.file(id))
  if (relative(root, p).startsWith('..')) return null
  return { k, p }
}

function measure(p, isDir) {
  const st = lstatSync(p)
  if (st.isSymbolicLink()) return null
  if (!isDir) return st.isFile() ? { bytes: st.size, files: 1, modified: st.mtimeMs, created: st.birthtimeMs } : null
  if (!st.isDirectory()) return null
  let bytes = 0
  let files = 0
  let modified = st.mtimeMs
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const q = join(d, e.name)
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) walk(q)
      else if (e.isFile()) {
        const s = statSync(q)
        bytes += s.size
        files++
        if (s.mtimeMs > modified) modified = s.mtimeMs
      }
    }
  }
  walk(p)
  return { bytes, files, modified, created: st.birthtimeMs }
}

// ---- archive state: one small JSON file, written atomically under a lock

const statePath = (root) => join(root, '.state', 'archive.json')

function readState(root) {
  try {
    const s = JSON.parse(readFileSync(statePath(root), 'utf8'))
    return s && typeof s.archived === 'object' ? s : { version: 1, archived: {} }
  } catch {
    return { version: 1, archived: {} }
  }
}

function writeState(root, state) {
  mkdirSync(join(root, '.state'), { recursive: true, mode: 0o700 })
  const tmp = `${statePath(root)}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify(state, null, 1)}\n`, { mode: 0o600 })
  renameSync(tmp, statePath(root))
}

function withLock(root, fn) {
  mkdirSync(join(root, '.state'), { recursive: true, mode: 0o700 })
  const lock = join(root, '.state', 'lock')
  const deadline = Date.now() + 5000
  for (;;) {
    try {
      closeSync(openSync(lock, 'wx', 0o600))
      break
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      // A lock older than 30 s belongs to a process that died mid-operation.
      try { if (Date.now() - statSync(lock).mtimeMs > 30_000) unlinkSync(lock) } catch {}
      if (Date.now() > deadline) throw new ExportsError('another export operation is running; retry in a moment')
      const until = Date.now() + 50
      while (Date.now() < until) {}
    }
  }
  try {
    return fn()
  } finally {
    try { unlinkSync(lock) } catch {}
  }
}

// ---- list

export function list(rootIn, { kind, status = 'all', limit = 500, now = Date.now() } = {}) {
  const root = rootOf(rootIn)
  if (kind !== undefined && !KINDS.some((k) => k.kind === kind)) throw new ExportsError(`kind must be one of ${KINDS.map((k) => k.kind).join(', ')}`)
  if (!['all', 'active', 'archived'].includes(status)) throw new ExportsError('status must be all, active or archived')
  const state = readState(root)
  const items = []
  for (const k of KINDS) {
    if (kind && k.kind !== kind) continue
    const d = join(root, k.dir)
    if (!existsSync(d)) continue
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const id = k.fromName(e.name)
      if (!id || e.isSymbolicLink()) continue
      const m = measure(join(d, e.name), k.isDir)
      if (!m) continue
      const at = state.archived[id]?.at
      const st = at ? 'archived' : 'active'
      if (status !== 'all' && status !== st) continue
      items.push({
        id,
        kind: k.kind,
        status: st,
        path: join(d, e.name),
        bytes: m.bytes,
        files: m.files,
        modified: new Date(m.modified).toISOString(),
        archived_at: at || null,
        deletes_after: at ? new Date(Date.parse(at) + ARCHIVE_DAYS * DAY).toISOString() : null,
      })
    }
  }
  const unmanaged = existsSync(root) ? readdirSync(root).filter((n) => !KNOWN_TOP.has(n) && !KINDS[0].fromName(n)) : []
  items.sort((a, b) => (a.modified < b.modified ? 1 : -1))
  const n = Math.max(1, Math.min(Number(limit) || 500, 5000))
  return { root, total: items.length, shown: Math.min(n, items.length), items: items.slice(0, n), unmanaged }
}

// ---- selection: explicit ids, or a selector (never "everything" by accident)

function select(root, { ids, select: sel }, state, now) {
  if (ids !== undefined && sel !== undefined) throw new ExportsError('pass ids or select, not both')
  if (ids !== undefined) {
    if (!Array.isArray(ids) || ids.length === 0) throw new ExportsError('ids must be a non-empty array')
    if (ids.length > MAX_IDS) throw new ExportsError(`at most ${MAX_IDS} ids per call`)
    return [...new Set(ids)]
  }
  if (!sel || typeof sel !== 'object') throw new ExportsError('pass ids (an array) or select ({kind, status, modified_before})')
  const { kind, status, modified_before } = sel
  if (kind === undefined && status === undefined && modified_before === undefined) throw new ExportsError('select needs at least one of kind, status, modified_before')
  if (modified_before !== undefined && Number.isNaN(Date.parse(modified_before))) throw new ExportsError('modified_before must be an ISO date')
  return list(root, { kind, status: status || 'all', limit: 5000, now })
    .items.filter((i) => modified_before === undefined || i.modified < new Date(modified_before).toISOString())
    .map((i) => i.id)
}

function summarize(results, dryRun) {
  const counts = {}
  for (const r of results) counts[r.result] = (counts[r.result] || 0) + 1
  return { dry_run: !!dryRun, counts, results }
}

export function archive(rootIn, args = {}, now = Date.now()) {
  const root = rootOf(rootIn)
  return withLock(root, () => {
    const state = readState(root)
    const results = select(root, args, state, now).map((id) => {
      const u = unitPath(root, id)
      if (!u) return { id, result: 'invalid_id' }
      if (!existsSync(u.p)) return { id, result: 'absent' }
      if (state.archived[id]) return { id, result: 'already_archived', archived_at: state.archived[id].at }
      if (!args.dry_run) state.archived[id] = { at: new Date(now).toISOString() }
      return { id, result: 'archived', deletes_after: new Date(now + ARCHIVE_DAYS * DAY).toISOString() }
    })
    if (!args.dry_run) writeState(root, state)
    return summarize(results, args.dry_run)
  })
}

export function unarchive(rootIn, args = {}, now = Date.now()) {
  const root = rootOf(rootIn)
  return withLock(root, () => {
    const state = readState(root)
    const results = select(root, args, state, now).map((id) => {
      if (!kindOf(id)) return { id, result: 'invalid_id' }
      if (!state.archived[id]) return { id, result: 'not_archived' }
      if (!args.dry_run) delete state.archived[id]
      return { id, result: 'unarchived' }
    })
    if (!args.dry_run) writeState(root, state)
    return summarize(results, args.dry_run)
  })
}

function removeUnit(u) {
  const st = lstatSync(u.p)
  if (st.isSymbolicLink()) throw new ExportsError('symlink refused')
  if (u.k.isDir ? !st.isDirectory() : !st.isFile()) throw new ExportsError('unexpected file type')
  // rmSync never follows symlinks inside the tree; it removes the links.
  rmSync(u.p, { recursive: u.k.isDir, force: false })
}

export function remove(rootIn, args = {}, now = Date.now()) {
  const root = rootOf(rootIn)
  return withLock(root, () => {
    const state = readState(root)
    const results = select(root, args, state, now).map((id) => {
      const u = unitPath(root, id)
      if (!u) return { id, result: 'invalid_id' }
      if (!existsSync(u.p)) {
        if (!args.dry_run) delete state.archived[id]
        return { id, result: 'absent' }
      }
      if (args.dry_run) return { id, result: 'would_delete' }
      try {
        removeUnit(u)
      } catch (e) {
        return { id, result: 'refused', reason: e.message }
      }
      delete state.archived[id]
      return { id, result: 'deleted' }
    })
    if (!args.dry_run) writeState(root, state)
    return summarize(results, args.dry_run)
  })
}

// Delete archived exports whose archive date is older than `days`, and drop
// state entries for exports that no longer exist. Active exports are never
// touched.
export function prune(rootIn, { days = ARCHIVE_DAYS, dry_run = false } = {}, now = Date.now()) {
  const root = rootOf(rootIn)
  const state = readState(root)
  const due = Object.entries(state.archived)
    .filter(([, v]) => now - Date.parse(v.at) >= days * DAY)
    .map(([id]) => id)
  if (!due.length) return { dry_run, counts: {}, results: [] }
  return remove(root, { ids: due, dry_run }, now)
}
