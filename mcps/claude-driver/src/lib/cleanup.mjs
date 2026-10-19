// After the app deletes an imported session (or a bootstrap turn fails), the
// CLI's own files for that uuid stay behind and can resurface through the
// app's "Found N Claude Code sessions … not in your session list" prompt.
// Remove only files named by the uuid, and a project dir only when nothing
// but an empty memory/ is left. Never reconstruct mangled project-dir names:
// search by uuid.

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { HOME } from './paths.mjs'
import { findRecordFile } from './sessions.mjs'

const CLAUDE_DIR = join(HOME, '.claude')

export function cliLeftovers(uuid) {
  const hits = []
  const projects = join(CLAUDE_DIR, 'projects')
  if (existsSync(projects)) {
    for (const d of readdirSync(projects)) {
      const dir = join(projects, d)
      for (const name of [`${uuid}.jsonl`, uuid]) if (existsSync(join(dir, name))) hits.push({ path: join(dir, name), projectDir: dir })
    }
  }
  const env = join(CLAUDE_DIR, 'session-env', uuid)
  if (existsSync(env)) hits.push({ path: env })
  for (const ext of ['json', 'lock']) {
    const f = join(CLAUDE_DIR, 'security', `security_warnings_state_${uuid}.${ext}`)
    if (existsSync(f)) hits.push({ path: f })
  }
  return hits
}

function onlyEmptyMemory(dir) {
  const entries = readdirSync(dir)
  if (entries.length === 0) return true
  if (entries.length !== 1 || entries[0] !== 'memory') return false
  const mem = join(dir, 'memory')
  return statSync(mem).isDirectory() && readdirSync(mem).length === 0
}

// Refuses while the app still has a record for the session.
export function cleanupCliLeftovers(uuid, { dryRun = false, force = false } = {}) {
  if (!/^[0-9a-f-]{36}$/.test(uuid)) throw new Error(`not a uuid: ${uuid}`)
  if (!force && findRecordFile(`local_${uuid}`)) return { skipped: 'app record still exists', removed: [] }
  const hits = cliLeftovers(uuid)
  const removed = []
  const projectDirs = new Set()
  for (const h of hits) {
    if (!dryRun) rmSync(h.path, { recursive: true, force: true })
    removed.push(h.path)
    if (h.projectDir) projectDirs.add(h.projectDir)
  }
  for (const dir of projectDirs) {
    if (!dryRun && existsSync(dir) && onlyEmptyMemory(dir)) {
      rmSync(dir, { recursive: true, force: true })
      removed.push(dir)
    }
  }
  return { removed, dryRun }
}
