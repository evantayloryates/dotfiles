// Evidence identifies the actual runtime source, including uncommitted
// iterations, rather than attributing every experiment to the last commit.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
export function runtimeFingerprint(base = root) {
  const hash = createHash('sha256')
  const files = ['server.mjs', 'cli.mjs', 'broker-template/CLAUDE.md']
  for (const dir of ['lib', 'scripts']) for (const name of readdirSync(join(base, dir))) {
    if (name.endsWith('.mjs') || name.endsWith('.swift') || name.endsWith('.py')) files.push(`${dir}/${name}`)
  }
  // Package generators load these modules as runtime dependencies. Historical
  // snapshots without candidates retain their original fingerprint.
  function candidates(dir,prefix){for(const entry of readdirSync(dir,{withFileTypes:true})){
    if(entry.isDirectory())candidates(join(dir,entry.name),prefix+entry.name+'/')
    else if(entry.name.endsWith('.js'))files.push(prefix+entry.name)
  }}
  if(existsSync(join(base,'candidates')))candidates(join(base,'candidates'),'candidates/')
  for (const file of files.sort()) hash.update(file).update('\0').update(readFileSync(join(base, file))).update('\0')
  return hash.digest('hex')
}
export const RUNTIME_BUILD = runtimeFingerprint()

// Long-lived MCP processes must distinguish loaded code from files on disk.
// Missing/partially updated files also require restart; no path/error escapes.
export function runtimeState() {
 try {const sourceBuild=runtimeFingerprint();return {runtimeBuild:RUNTIME_BUILD,sourceBuild,restartRequired:sourceBuild!==RUNTIME_BUILD}}
 catch {return {runtimeBuild:RUNTIME_BUILD,sourceBuild:null,restartRequired:true}}
}
