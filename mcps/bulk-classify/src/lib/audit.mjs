// One routing audit line per classify_texts call and per finished job, so
// the API-key / subscription split is observable after the fact:
//
//   <scope state>/audit.jsonl   (beside the scope's jobs, mode 600)
//
// A line holds the engine, the route, PHI yes/no, the reason codes, the
// fallback (kind and item count) and counts. Never text, labels, paths,
// env values or command lines. Writing it never fails the call.

import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { JOBS_DIR, SCOPE } from './paths.mjs'

const MAX_BYTES = 5 * 1024 * 1024
export const auditPath = () => join(dirname(JOBS_DIR), 'audit.jsonl')

export function auditLine({ kind, job = null, route, usage = {}, items = 0, status = 'done' }) {
  const fb = route?.fallback
  return {
    at: new Date().toISOString(),
    kind,
    ...(job && { job }),
    status,
    scope: SCOPE,
    route: route?.route || 'unknown',
    engine: route?.engine || 'unknown',
    stage1: route?.stage1 || 'unknown',
    phi: route ? route.phi === true : true,
    codes: Array.isArray(route?.codes) ? route.codes : ['unknown'],
    fallback: fb ? { kind: fb.kind || 'error', items: fb.items || 0, fatal: !!fb.fatal } : null,
    items,
    codex_calls: usage.codex_calls || 0,
    decision_calls: usage.decision_calls || 0,
    chat_calls: usage.chat_calls || 0,
    embed_calls: usage.embed_calls || 0,
  }
}

export function writeAudit(entry) {
  try {
    const path = auditPath()
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    try {
      if (statSync(path).size > MAX_BYTES) renameSync(path, `${path}.1`)
    } catch {}
    appendFileSync(path, `${JSON.stringify(auditLine(entry))}\n`, { mode: 0o600 })
  } catch {}
}
