// Per-item results as JSONL at a path the caller chose: written when a job
// finishes, or later through classify_results.
import { readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

export function writeOutput(output, spec, items, results) {
  const path = output.abs
  // Hidden temp file beside the target; leftovers from a killed writer (which
  // may hold item text) are removed first.
  const prefix = `.${basename(path)}.classifier-`
  try {
    for (const f of readdirSync(dirname(path))) if (f.startsWith(prefix)) rmSync(join(dirname(path), f), { force: true })
  } catch {}
  const tmp = join(dirname(path), `${prefix}${process.pid}.tmp`)
  try {
    const lines = items.map((it) => {
      const r = results.get(it.n) || { status: 'error', reason: 'model_error' }
      const o = { id: it.id, label: r.status === 'ok' ? r.label : null }
      if (spec.max_labels === 2) o.secondary = r.secondary ?? null
      o.confidence = r.confidence ?? null
      o.status = r.status
      if (r.reason) o.reason = r.reason
      if (output.include_text && it.text) o.text = it.text
      return JSON.stringify(o)
    })
    writeFileSync(tmp, `${lines.join('\n')}\n`)
    renameSync(tmp, path)
    return undefined
  } catch (e) {
    try {
      rmSync(tmp, { force: true })
    } catch {}
    return `could not write ${output.given}: ${e.code || 'error'}`
  }
}
