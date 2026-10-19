// Phase 5: need-based discovery, plus the pilot's interface fixes.
import './env.mjs'
import { execSync, execFileSync } from 'node:child_process'
import { rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { startHarness } from './client.mjs'
import { paths } from '../src/paths.mjs'

const P = paths()
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: ok ? '' : String(detail) })
const killDaemon = () => { try { execSync(`pkill -9 -f "${P.daemon} --state ${P.stateDir}"`) } catch {} }
killDaemon()
rmSync(P.stateDir, { recursive: true, force: true }); mkdirSync(P.stateDir, { recursive: true })

// 1. The evaluation set over the pilot services.
const ev = execFileSync(process.execPath, ['test/discovery/eval.mjs'], { timeout: 60000 }).toString()
const recall = Number(ev.match(/^recall ([\d.]+)%/m)?.[1])
const median = Number(ev.match(/median ([\d.]+) ms/)?.[1])
check('recall on the evaluation set is at least 95%', recall >= 95, ev.split('\n')[0])
check('precision is tracked and reported', /precision [\d.]+%/.test(ev), ev.split('\n')[0])
check('first-pass median latency under 300 ms', median < 300, ev.split('\n')[0])
check('no plaintext request in any log', /plaintext requests in logs: 0/.test(ev), ev.match(/plaintext.*/)?.[0])

// 2. Relevance hooks: one refines its answer, one hangs and is ignored.
for (const [id, rel] of [['relev', `export async function relevance(ctx, need) { return /forecast/.test(need) ? { ops: ['b'], note: 'b gives the forecast' } : { relevant: false } }`], ['hangrel', `export async function relevance() { await new Promise(() => {}) }`]]) {
  rmSync(join(P.servicesDir, id), { recursive: true, force: true }); mkdirSync(join(P.servicesDir, id))
  writeFileSync(join(P.servicesDir, id, 'service.json'), JSON.stringify({ description: `${id}: weather forecast numbers for tests.`, version: '2026-10-19.001', keywords: ['weather', 'forecast'], operations: { a: { description: 'Weather today.' }, b: { description: 'Weather later.' } } }))
  writeFileSync(join(P.servicesDir, id, 'index.mjs'), `export const ops = { a: { handler: () => 'a' }, b: { handler: () => 'b' } }\n`)
  writeFileSync(join(P.servicesDir, id, 'context.mjs'), rel + '\n')
}
const h = await startHarness({ name: 'claude-code', env: { ANCHOR_ALERT_BACKEND: 'log' } })
const disc = async (need) => { const t = Date.now(); const r = await h.call('anchor_discover', { need }); return { ...r.data, ms: Date.now() - t } }
let d = await disc('What is the weather forecast for tomorrow?')
const relev = d.matches?.find((m) => m.id === 'relev')
check("a service's relevance narrows its operations and adds a hint", relev?.ops?.join() === 'b' && /forecast/.test(relev.hint || ''), JSON.stringify(d).slice(0, 400))
check('a relevance hook that hangs is ignored within the deadline', d.matches?.some((m) => m.id === 'hangrel') && d.ms < 2000, `${d.ms} ms ${JSON.stringify(d.matches?.map((m) => m.id))}`)
d = await disc('What was the weather today?')
check('a relevance hook can drop its service', !d.matches?.some((m) => m.id === 'relev') && d.alsoAvailable?.includes('relev'), JSON.stringify(d).slice(0, 300))
check('the answer always lists the rest by name', Array.isArray(d.alsoAvailable) && d.alsoAvailable.includes('echo'), JSON.stringify(d.alsoAvailable))

// 3. Misses: using a service discovery did not suggest is logged, by hash only.
await h.call('anchor_run', { calls: [{ target: 'echo:echo', args: { text: 'x' } }] })
const misses = existsSync(join(P.stateDir, 'discovery-misses.jsonl')) ? readFileSync(join(P.stateDir, 'discovery-misses.jsonl'), 'utf8') : ''
check('a call to a service discovery did not suggest is logged as a miss', /"service":"echo"/.test(misses), misses)
const ledgerText = readFileSync(join(P.stateDir, 'ledger.jsonl'), 'utf8')
check('discover events carry a hash, never the request', /"needHash":"[0-9a-f]{16}"/.test(ledgerText) && !/weather forecast for tomorrow/.test(ledgerText + misses))

// 4. Interface fixes from the pilot. Claude Code keeps only 2048 characters
// of a server's instructions: the composed prompt stays under that.
const init = h.init?.instructions
check('the session prompt fits in 2048 characters', typeof init === 'string' && init.length <= 2048 && /Services:/.test(init), `${init?.length}`)
const wide = await startHarness({ name: 'codex-mcp-client', env: { ANCHOR_ALERT_BACKEND: 'log' } })
const wi = wide.init?.instructions || ''
check('a client without the cap gets one line per operation, with its description', wi.length > init.length && /^    add\(a:number, b:number\): Add two numbers\./m.test(wi), wi.slice(0, 300))
await wide.close()

let r = await h.call('anchor_run', { calls: [{ target: 'slow:work', args: { ms: 600 } }], deadline_ms: 50 })
const handle = r.data[0].handle
check('a job handle comes with the exact call to wait on it', handle && r.data[0].hint.includes(`"handles":["${handle}"]`), JSON.stringify(r.data[0]))
r = await h.call('anchor_run', { calls: [{ target: 'anchor:job.wait', args: { handle, timeout_ms: 5000 } }] })
check('job.wait accepts a single "handle"', r.data[0].ok && r.data[0].value[0]?.state === 'done', JSON.stringify(r.data[0]))
r = await h.call('anchor_run', { calls: [{ target: 'anchor:job.wait', args: { timeout_ms: 10 } }] })
check('job.wait without handles is refused, not silently empty', r.data[0].code === 'bad_args', JSON.stringify(r.data[0]))
r = await h.call('anchor_run', { calls: [{ target: 'slow:work', args: { ms: 300 } }], deadline_ms: 5000 })
check('a larger deadline_ms waits inline', r.data[0].ok, JSON.stringify(r.data[0]))
await h.close()
for (const id of ['relev', 'hangrel']) rmSync(join(P.servicesDir, id), { recursive: true, force: true })
killDaemon()
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.detail ? `\n      ${x.detail.slice(0, 600)}` : ''}`)
console.log(`\n${results.filter((x) => x.ok).length}/${results.length} passed`)
process.exit(results.every((x) => x.ok) ? 0 : 1)
