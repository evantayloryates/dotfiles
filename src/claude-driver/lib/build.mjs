// Evidence identifies the actual runtime source, including uncommitted
// iterations, rather than attributing every experiment to the last commit.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
export function runtimeFingerprint() {
  const hash = createHash('sha256')
  const files = ['server.mjs', 'cli.mjs', 'broker-template/CLAUDE.md']
  for (const dir of ['lib', 'scripts']) for (const name of readdirSync(join(root, dir))) {
    if (name.endsWith('.mjs')) files.push(`${dir}/${name}`)
  }
  for (const file of files.sort()) hash.update(file).update('\0').update(readFileSync(join(root, file))).update('\0')
  return hash.digest('hex')
}
export const RUNTIME_BUILD = runtimeFingerprint()
