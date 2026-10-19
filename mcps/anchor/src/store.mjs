// Append-only JSON-lines journal with crash-safe replay and compaction.
// - append: one line per record, written with a single appendFileSync, so a
//   crash loses at most the record being written;
// - replay: skips a torn or malformed line instead of refusing to start;
// - compact: rewrites the live state to a temp file and renames it over the
//   journal, so a crash mid-compaction leaves the old journal intact.

import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

export class Journal {
  constructor(path, { maxLines = 5000 } = {}) {
    this.path = path
    this.maxLines = maxLines
    this.lines = 0
    this.skipped = 0
  }

  replay() {
    if (!existsSync(this.path)) return []
    const out = []
    for (const line of readFileSync(this.path, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try {
        out.push(JSON.parse(line))
      } catch {
        this.skipped++
      }
    }
    this.lines = out.length
    return out
  }

  append(record) {
    appendFileSync(this.path, JSON.stringify(record) + '\n')
    this.lines++
  }

  // Replace the journal with exactly these records.
  compact(records) {
    const tmp = `${this.path}.compact.${process.pid}`
    writeFileSync(tmp, records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : ''))
    renameSync(tmp, this.path)
    this.lines = records.length
  }

  needsCompaction() {
    return this.lines > this.maxLines
  }
}
