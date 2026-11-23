// Marks a file the harness writes for classification (exports) with the
// extended attribute com.kickoff.zdr. macOS cp, mv and Finder keep extended
// attributes, so a copy taken out of ~/.zdr-harness still carries it, and the
// classifier (mcps/bulk-classify, route.mjs) routes any input file carrying it
// to the ZDR API key, never the ChatGPT subscription. A file that cannot be
// tagged is not published: the caller throws.
import { spawnSync } from 'node:child_process'

export const ZDR_XATTR = 'com.kickoff.zdr'

export function tagZdrFile(path, { run = spawnSync } = {}) {
  const r = run('/usr/bin/xattr', ['-w', ZDR_XATTR, '1', path], { stdio: 'ignore', timeout: 10_000 })
  if (r.status !== 0) throw Object.assign(new Error('could not mark the export as harness data'), { code: 'zdr_tag' })
}
