// Where the service keeps things. The launcher decides the scope from the
// environment it was started in and passes it down; nothing here is ever
// returned to a caller.
//
//   jobs      per scope, deleted on the chat-retention window
//   profiles  shared by every scope, kept forever (sanitised content only)

import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const realHome = process.env.CLASSIFIER_REAL_HOME || homedir()

// `zdr` when started inside the ZDR harness, `local` everywhere else.
export const SCOPE = process.env.CLASSIFIER_SCOPE === 'zdr' ? 'zdr' : 'local'

export const JOBS_DIR =
  process.env.CLASSIFIER_JOBS_DIR ||
  (SCOPE === 'zdr' ? join(realHome, '.zdr-harness', 'classifier', 'jobs') : join(realHome, '.local', 'state', 'classifier', 'jobs'))

export const PROFILES_DIR = process.env.CLASSIFIER_PROFILES_DIR || join(realHome, '.local', 'share', 'classifier', 'profiles')

// Jobs follow the ZDR chat windows: 7 days inside the harness (the window for
// chats that touched the production database), 14 days elsewhere (the general
// window). `zdr-harness prune` passes its own --db-days / --days through.
export const RETENTION_DAYS = Number(process.env.CLASSIFIER_RETENTION_DAYS) || (SCOPE === 'zdr' ? 7 : 14)

export function ensureDirs() {
  mkdirSync(JOBS_DIR, { recursive: true, mode: 0o700 })
  mkdirSync(PROFILES_DIR, { recursive: true, mode: 0o700 })
}
