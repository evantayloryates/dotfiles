// Service-level technical memory shared by all harnesses. Automatic rows keep
// only control-plane metadata, never prompts, raw results or transcript text.
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { STATE_DIR, appendJsonl, readJsonl } from './state.mjs'
import { versions } from './paths.mjs'
export const MEMORY_FILE = join(STATE_DIR, 'memory.jsonl')
export function recordMemory({ kind = 'lesson', topic, lesson, evidence, jobId, operation, outcome, category, ms, source = 'harness', status = 'candidate' }) {
  const row = { id: randomUUID(), at: new Date().toISOString(), versions: versions(), kind, topic, source, status,
    ...(lesson !== undefined ? { lesson } : {}), ...(evidence !== undefined ? { evidence } : {}),
    ...(jobId ? { jobId } : {}), ...(operation ? { operation } : {}), ...(outcome ? { outcome } : {}), ...(category ? { category } : {}), ...(ms !== undefined ? { ms } : {}) }
  appendJsonl(MEMORY_FILE, row)
  return row
}
export function queryMemory({ topic, kind, limit = 20 } = {}) {
  const rows = readJsonl(MEMORY_FILE)
  return rows.filter(r => (!topic || r.topic === topic) && (!kind || r.kind === kind)).slice(-limit).reverse()
}
export function operationMemory(row) {
  return recordMemory({ kind: 'observation', topic: row.errorCategory || row.op, operation: row.op, outcome: row.outcome,
    category: row.errorCategory, ms: row.ms, source: 'service', status: 'observed' })
}
