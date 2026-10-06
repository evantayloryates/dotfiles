#!/usr/bin/env node
// Repeat boundary/race tests in fresh processes and persist service-level
// evidence. No Claude turns or UI operations in this deterministic tier.
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { recordMemory } from '../lib/memory.mjs'
import { STATE_DIR, writeJsonAtomic } from '../lib/state.mjs'
const i = process.argv.indexOf('--repeat')
const repeat = i >= 0 ? Number(process.argv[i + 1]) : 5
if (!Number.isInteger(repeat) || repeat < 1 || repeat > 100) throw new Error('--repeat must be 1–100')
const root = fileURLToPath(new URL('../../..', import.meta.url))
const results = []
for (let run = 0; run < repeat; run++) {
  const started = Date.now()
  const child = spawn(process.execPath, ['--test', 'src/claude-driver/test/v2.test.mjs'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', x=>output+=x); child.stderr.on('data', x=>output+=x)
  const code = await new Promise(resolve=>child.on('exit',resolve))
  const row = { run: run + 1, ok: code === 0, ms: Date.now() - started, ...(code ? { output } : {}) }
  results.push(row); console.log(JSON.stringify(row))
  if (code) break
}
const report = join(STATE_DIR, 'pressure', `v2-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
writeJsonAtomic(report, { suite: 'v2 deterministic race/failure suite', results })
recordMemory({kind:'test_result',topic:'v2-pressure',source:'pressure-v2',status:results.every(r=>r.ok)?'passed':'failed',evidence:report,lesson:`${results.filter(r=>r.ok).length}/${repeat} isolated pressure rounds passed`})
console.log(JSON.stringify({report,passed:results.filter(r=>r.ok).length,total:repeat}))
process.exitCode = results.length === repeat && results.every(r=>r.ok) ? 0 : 1
