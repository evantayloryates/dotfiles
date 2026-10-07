// Service-level technical memory shared by all harnesses. Automatic rows keep
// only control-plane metadata, never prompts, raw results or transcript text.
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { STATE_DIR, appendJsonl, reverseJsonl } from './state.mjs'
import { versions } from './paths.mjs'
import { RUNTIME_BUILD } from './build.mjs'
export const MEMORY_FILE = join(STATE_DIR, 'memory.jsonl')
export function recordMemory({ kind = 'lesson', topic, lesson, evidence, jobId, operation, outcome, category, ms, brokerBuild, bootstrapHash, source = 'harness', status = 'candidate' }) {
  const row = { id: randomUUID(), at: new Date().toISOString(), versions: versions(), runtimeBuild: RUNTIME_BUILD, kind, topic, source, status,
    ...(lesson !== undefined ? { lesson } : {}), ...(evidence !== undefined ? { evidence } : {}),
    ...(brokerBuild !== undefined ? {brokerBuild} : {}), ...(bootstrapHash !== undefined ? {bootstrapHash} : {}),
    ...(jobId ? { jobId } : {}), ...(operation ? { operation } : {}), ...(outcome ? { outcome } : {}), ...(category ? { category } : {}), ...(ms !== undefined ? { ms } : {}) }
  appendJsonl(MEMORY_FILE, row)
  return row
}
export function queryMemory({ topic, kind, limit = 20 } = {}) {
  const rows = []
  for (const r of reverseJsonl(MEMORY_FILE)) {
    if ((!topic || r.topic === topic) && (!kind || r.kind === kind)) rows.push(r)
    if (rows.length >= limit) break
  }
  return rows
}
export function operationMemory(row) {
  return recordMemory({ kind: 'observation', topic: row.errorCategory || row.op, operation: row.op, outcome: row.outcome,
    category: row.errorCategory, ms: row.ms, source: 'service', status: 'observed' })
}
