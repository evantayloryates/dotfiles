// Job and call summaries.
import { NONE } from './taxonomy.mjs'

export function summarize(items, results, taxonomy, usage, ms) {
  const counts = Object.fromEntries([...taxonomy.labels.map((l) => [l.name, 0]), [NONE, 0]])
  const byPath = {}
  const byStatus = {}
  const reasons = {}
  let low = 0
  let secondary = 0
  for (const r of results.values()) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1
    if (r.status === 'ok') {
      counts[r.label] = (counts[r.label] || 0) + 1
      byPath[r.path] = (byPath[r.path] || 0) + 1
      if (r.confidence === 'low') low++
      if (r.secondary) secondary++
    } else reasons[r.reason] = (reasons[r.reason] || 0) + 1
  }
  return { items: items.length, counts, by_path: byPath, by_status: byStatus, reasons, low_confidence: low, with_secondary: secondary, usd: +usage.usd.toFixed(4), seconds: +(ms / 1000).toFixed(1) }
}
