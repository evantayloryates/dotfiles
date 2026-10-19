// Shared incident quarantine, read at every UI entry so existing workers
// cannot cache a formerly enabled policy. Native broker controls are separate.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { DriverError } from './paths.mjs'
import { STATE_DIR, readJson } from './state.mjs'
export const UI_QUARANTINE = join(STATE_DIR, 'ui-quarantine.json')
export function uiPolicy() {
  if (!existsSync(UI_QUARANTINE)) return { blocked: false }
  const row = readJson(UI_QUARANTINE, null)
  if (!row || typeof row !== 'object' || Array.isArray(row) || row.blocked !== false)
    return { blocked: true, reason: typeof row?.reason === 'string' ? row.reason : 'UI quarantine requires explicit release' }
  return { blocked: false }
}
export function assertUiAvailable() {
  const policy = uiPolicy()
  if (policy.blocked) throw new DriverError(`UI automation is quarantined: ${policy.reason}`, { category: 'ui_quarantined' })
}
