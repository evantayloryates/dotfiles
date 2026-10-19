// Result cache: the same text under the same label set gets the same label
// across jobs (the model alone changed 0.7-2% of labels between identical
// runs, many of them "high"), and repeat runs skip the API. Keys are text
// hashes, never text. One file per label-set fingerprint, in the scope's own
// store, dropped on the job retention window.

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { JOBS_DIR, RETENTION_DAYS } from './paths.mjs'
import { dedupeKey, sha } from './text.mjs'

const DIR = join(dirname(JOBS_DIR), 'cache')
const cutoff = () => Date.now() - RETENTION_DAYS * 86_400_000

export const textKey = (text) => sha(dedupeKey(text)).slice(0, 32)

export function openCache(fingerprint) {
  if (process.env.CLASSIFIER_NO_CACHE) return { get: () => undefined, put() {}, flush() {} }
  mkdirSync(DIR, { recursive: true, mode: 0o700 })
  const path = join(DIR, `${fingerprint}.jsonl`)
  const map = new Map()
  let pending = []
  if (existsSync(path)) {
    const min = cutoff()
    let dropped = 0
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (!line) continue
      try {
        const e = JSON.parse(line)
        if (e.at >= min) map.set(e.h, e.r)
        else dropped++
      } catch {}
    }
    if (dropped) writeFileSync(path, [...map].map(([h, r]) => JSON.stringify({ h, r, at: Date.now() })).join('\n') + (map.size ? '\n' : ''), { mode: 0o600 })
  }
  return {
    get: (h) => map.get(h),
    put(h, r) {
      if (map.has(h)) return
      map.set(h, r)
      pending.push(JSON.stringify({ h, r, at: Date.now() }))
      if (pending.length >= 500) this.flush()
    },
    flush() {
      if (!pending.length) return
      appendFileSync(path, `${pending.join('\n')}\n`, { mode: 0o600 })
      pending = []
    },
  }
}

export function pruneCache(days = RETENTION_DAYS) {
  if (!existsSync(DIR)) return 0
  const min = Date.now() - days * 86_400_000
  let removed = 0
  for (const f of readdirSync(DIR)) {
    const p = join(DIR, f)
    try {
      if (statSync(p).mtimeMs < min) {
        rmSync(p, { force: true })
        removed++
      }
    } catch {}
  }
  return removed
}
