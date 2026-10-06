#!/usr/bin/env node
// Repeat boundary/race tests in fresh processes and persist service-level
// evidence. No Claude turns or UI operations in this deterministic tier.
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { RUNTIME_BUILD, runtimeFingerprint } from '../lib/build.mjs'
import { recordMemory } from '../lib/memory.mjs'
import { STATE_DIR, writeJsonAtomic } from '../lib/state.mjs'
const i = process.argv.indexOf('--repeat')
const repeat = i >= 0 ? Number(process.argv[i + 1]) : 5
if (!Number.isInteger(repeat) || repeat < 1 || repeat > 100) throw new Error('--repeat must be 1–100')
const root = fileURLToPath(new URL('../../..', import.meta.url))
const results = []
const suites = readdirSync(join(root, 'src/claude-driver/test')).filter(f=>f.endsWith('.test.mjs')).sort().map(f=>`src/claude-driver/test/${f}`)
const suiteHashes = () => Object.fromEntries(suites.map(file=>[file,createHash('sha256').update(readFileSync(join(root,file))).digest('hex')]))
const initialSuiteHashes = suiteHashes()
for (let run = 0; run < repeat; run++) {
  const started = Date.now()
  const child = spawn(process.execPath, ['--test', ...suites], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', x=>output+=x); child.stderr.on('data', x=>output+=x)
  const code = await new Promise(resolve=>child.on('exit',resolve))
  const row = { run: run + 1, ok: code === 0, ms: Date.now() - started, ...(code ? { output } : {}) }
  results.push(row); console.log(JSON.stringify(row))
  if (code) break
}
const report = join(STATE_DIR, 'pressure', `v2-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
const sourceChanged = runtimeFingerprint() !== RUNTIME_BUILD || JSON.stringify(suiteHashes()) !== JSON.stringify(initialSuiteHashes)
const ok = results.length === repeat && results.every(r=>r.ok) && !sourceChanged
writeJsonAtomic(report, { suite: 'v2 isolated lifecycle and MCP contract suites', suites, suiteHashes: initialSuiteHashes, runtimeBuild: RUNTIME_BUILD, sourceChanged, results, ok })
recordMemory({kind:'test_result',topic:'v2-pressure',source:'pressure-v2',status:ok?'passed':'failed',evidence:report,lesson:`${results.filter(r=>r.ok).length}/${repeat} isolated pressure rounds passed; sourceChanged=${sourceChanged}`})
console.log(JSON.stringify({report,passed:results.filter(r=>r.ok).length,total:repeat,sourceChanged,ok}))
process.exitCode = ok ? 0 : 1
