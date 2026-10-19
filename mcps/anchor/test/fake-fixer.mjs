// Stand-in for a fixer agent. Reads a work order, then by service:
//   stuck  -> reports failure      sleepy -> hangs      anything else -> fixes
// A fix empties the service's CRASH list and releases it (hotfix lane:
// --hotfix; standard lane: a nightly). Logs start/end for concurrency checks.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
const order = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const { ticket, servicesDir, stateDir } = order
const logLine = (what) => appendFileSync(join(stateDir, 'fixer.log'), JSON.stringify({ at: Date.now(), what, ticket: ticket.id, service: ticket.service, attempt: order.attempt }) + '\n')
logLine('start')
await new Promise((r) => setTimeout(r, 300))
if (ticket.service === 'stuck') { logLine('end'); console.log(JSON.stringify({ outcome: 'failed', reason: 'could not reproduce' })); process.exit(0) }
if (ticket.service === 'sleepy') { setInterval(() => {}, 1000); await new Promise(() => {}) }
const src = join(servicesDir, ticket.service, 'index.mjs')
writeFileSync(src, readFileSync(src, 'utf8').replace(/const CRASH = \[[^\]]*\]/, 'const CRASH = []'))
const out = JSON.parse(execFileSync(process.execPath, ['src/release.mjs', 'release', ticket.service, ...(ticket.lane === 'hotfix' ? ['--hotfix'] : [])]).toString())
logLine('end')
console.log(JSON.stringify(out.ok ? { outcome: 'fixed', release: out.slug, note: `removed the crash path (${ticket.fingerprint})` } : { outcome: 'failed', reason: JSON.stringify(out) }))
