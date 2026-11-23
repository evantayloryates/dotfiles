// Which scopes have used a profile, for routing (route.mjs). Kept apart from
// the profile JSON in an append-only marker file per profile, because the
// JSON is rewritten (read, modify, write) by every run and save: two runs in
// different scopes finishing together could otherwise lose the `zdr` stamp.
// Lines are only ever appended, so a stamp, once written, stays.
//
//   <profiles dir>/.scopes/<name>   one scope per line: local | zdr
//
// Routing reads this file fresh on every decision (and before every Codex
// call), so a profile first used in the zdr scope while a local job runs
// moves that job's later calls to the API key.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/
const dirFor = () => join(process.env.CLASSIFIER_PROFILES_DIR || join(process.env.CLASSIFIER_REAL_HOME || process.env.HOME || '', '.local', 'share', 'classifier', 'profiles'), '.scopes')

// Appends a stamp. Throws when it cannot be written: a zdr use that leaves
// no stamp must not go ahead (the caller turns that into a refusal).
export function stampScope(name, scope) {
  if (!NAME.test(String(name || ''))) throw Object.assign(new Error('bad profile name'), { code: 'scope_stamp' })
  const dir = dirFor()
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  appendFileSync(join(dir, name), `${scope}\n`, { mode: 0o600 })
}

// The scopes stamped for a profile. A name that cannot be checked, or a file
// that cannot be read, reports `unknown` (routing treats it as PHI).
export function stampedScopes(name) {
  if (!NAME.test(String(name || ''))) return ['unknown']
  const file = join(dirFor(), name)
  try {
    if (!existsSync(file)) return []
    return [...new Set(readFileSync(file, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean).map((s) => (s === 'local' || s === 'zdr' ? s : 'unknown')))]
  } catch {
    return ['unknown']
  }
}
