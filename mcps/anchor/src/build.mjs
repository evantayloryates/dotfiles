// The build id of anchor's code: a hash of everything in src/. The daemon
// records it at start; a front end compares it with what is on disk now, so a
// daemon left running on old code is drained and restarted (shim.mjs).
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = dirname(fileURLToPath(import.meta.url))

export function buildId() {
  const h = createHash('sha256')
  const walk = (d) => {
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f)
      if (statSync(p).isDirectory()) walk(p)
      else { h.update(p.slice(SRC.length)); h.update(readFileSync(p)) }
    }
  }
  walk(SRC)
  // Tests only: an extra file that stands in for a code change.
  const extra = process.env.ANCHOR_BUILD_EXTRA
  if (extra && existsSync(extra)) h.update(readFileSync(extra))
  return h.digest('hex').slice(0, 12)
}
