// Iteration 2: static operations (no cold start for discovery), drift, and
// persistence of sessions, notes, idempotency records and job results.
import './env.mjs'
import { execSync } from 'node:child_process'
import { rmSync, mkdirSync, readFileSync, appendFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { startHarness } from './client.mjs'
import { paths } from '../src/paths.mjs'

const P = paths()
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: ok ? '' : String(detail) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const killDaemon = () => { try { execSync(`pkill -9 -f "${P.daemon} --state ${P.stateDir}"`) } catch {} }
const hosts = () => { try { return execSync('pgrep -f mcps/anchor/src/service-host.mjs').toString().trim().split('\n').filter(Boolean).length } catch { return 0 } }
const counters = () => { try { return JSON.parse(readFileSync(join(P.stateDir, 'echo-counters.json'), 'utf8')) } catch { return {} } }
killDaemon()
for (let i = 0; i < 50 && hosts() > 0; i++) await sleep(100) // previous suites' services exit on disconnect
rmSync(P.stateDir, { recursive: true, force: true }); mkdirSync(P.stateDir, { recursive: true })
rmSync('test/services/flaky/CRASH_ON_START', { force: true })

const A = await startHarness({ name: 'chat-A' })
const B = await startHarness({ name: 'chat-B' })
const runA = (calls, extra = {}) => A.call('anchor_run', { calls, ...extra })
const runB = (calls, extra = {}) => B.call('anchor_run', { calls, ...extra })

// 1. discovery and description never start a service
let r = await A.call('anchor_discover', { list: true })
check('discover lists operations on a fresh state', r.data.services.find((s) => s.id === 'slow')?.ops?.includes('work'), JSON.stringify(r.data.services))
r = await A.call('anchor_describe', { targets: ['echo', 'flaky', 'slow', 'chaos', 'slow:work'].map((target) => ({ target })) })
check('describe returns schemas from the manifest', r.data[4]?.inputSchema?.required?.includes('ms'), JSON.stringify(r.data[4]))
r = await runA([{ target: 'slow:work', args: { ms: 'soon' } }, { target: 'echo:nope' }])
check('bad args and unknown ops are rejected from the manifest', r.data[0].code === 'bad_args' && r.data[1].code === 'unknown_op', JSON.stringify(r.data))
const startedSoFar = (readFileSync(join(P.stateDir, 'ledger.jsonl'), 'utf8').match(/"type":"started"/g) || []).length
check('none of that started a service process', startedSoFar === 0, `${startedSoFar} service starts in the ledger`)

// 2. drift between manifest and handlers
r = await runA([{ target: 'drifty:declared_and_built' }, { target: 'drifty:declared_only' }, { target: 'drifty:built_only' }])
check('declared and implemented op works', r.data[0].ok && r.data[0].value === 'built', JSON.stringify(r.data[0]))
check('declared but missing handler -> not_implemented', r.data[1].code === 'not_implemented', JSON.stringify(r.data[1]))
check('undeclared handler is not callable', r.data[2].code === 'unknown_op', JSON.stringify(r.data[2]))
check('drift announced to the calling chat', /declares operations it does not implement: declared_only/.test(r.notes), r.notes)
r = await runA([{ target: 'anchor:status' }])
check('status reports drift both ways', JSON.stringify(r.data[0].value.services.drifty?.drift) === JSON.stringify({ missing: ['declared_only'], extra: ['built_only'] }), JSON.stringify(r.data[0].value.services.drifty))

// 3. a note pending for chat A survives a daemon restart
await runA([{ target: 'flaky:ok' }])
await runB([{ target: 'flaky:crash' }]); await runB([{ target: 'flaky:crash' }])
killDaemon()
r = await runA([{ target: 'echo:echo', args: { text: 'after restart' } }])
check('call after daemon death succeeds', r.data[0].ok, JSON.stringify(r.data))
check('chat A still receives its pending note after the restart', /flaky:crash is disabled/.test(r.notes), r.notes)
r = await runA([{ target: 'anchor:status' }])
check('sessions persisted across the restart', r.data[0].value.sessions >= 2, JSON.stringify(r.data[0].value))

// 4. idempotency across restarts
r = await runA([{ target: 'echo:count', args: { name: 'x' }, idempotency_key: 'k1' }])
check('first keyed call runs and the service sees the key', r.data[0].value?.count === 1 && r.data[0].value?.key === 'k1', JSON.stringify(r.data))
killDaemon()
r = await runA([{ target: 'echo:count', args: { name: 'x' }, idempotency_key: 'k1' }])
check('same key after a daemon restart replays, does not rerun', r.data[0].replayed && r.data[0].value.count === 1 && counters().x === 1, JSON.stringify(r.data) + JSON.stringify(counters()))
r = await runB([{ target: 'echo:count', args: { name: 'other' }, idempotency_key: 'k1' }])
check('same key with different args is a conflict', r.data[0].code === 'idempotency_conflict', JSON.stringify(r.data))
const [c1, c2] = await Promise.all([
  runA([{ target: 'echo:count', args: { name: 'slow-z' }, idempotency_key: 'k3' }]),
  runB([{ target: 'echo:count', args: { name: 'slow-z' }, idempotency_key: 'k3' }]),
])
check('concurrent duplicates attach to one run', counters()['slow-z'] === 1 && [c1, c2].some((c) => c.data[0].attached), JSON.stringify([c1.data, c2.data]) + JSON.stringify(counters()))
const inflight = runA([{ target: 'echo:count', args: { name: 'slow-y' }, idempotency_key: 'k2' }])
await sleep(400)
killDaemon()
r = await inflight
check('keyed call interrupted by daemon death is rerun and flagged', r.data[0].ok && r.data[0].rerunAfterRestart, JSON.stringify(r.data))
check('keyed rerun is deduped by the service: applied once, not twice', counters()['slow-y'] === 1 && r.data[0].value.deduped === true && r.data[0].value.key === 'k2', JSON.stringify(counters()) + JSON.stringify(r.data))

// 5. finished job results survive a restart
r = await runA([{ target: 'slow:work', args: { ms: 500 } }], { deadline_ms: 100 })
const handle = r.data[0].handle
await runA([{ target: 'anchor:job.wait', args: { handles: [handle], timeout_ms: 3000 } }])
killDaemon()
r = await runA([{ target: 'anchor:job.result', args: { handles: [handle] } }])
check('finished job result readable after restart', r.data[0].value?.[0]?.state === 'done' && r.data[0].value[0].result?.value?.worked === 500, JSON.stringify(r.data))

// 6. torn journal lines and compaction
appendFileSync(join(P.stateDir, 'sessions.jsonl'), '{"t":"s","h":"as_torn","clientI')
appendFileSync(join(P.stateDir, 'jobs.jsonl'), 'garbage\n')
killDaemon()
r = await runA([{ target: 'echo:echo', args: { text: 'still here' } }])
check('daemon starts despite torn journal lines', r.data[0].ok, JSON.stringify(r.data))
const ledger = readFileSync(join(P.stateDir, 'ledger.jsonl'), 'utf8')
check('skipped lines are recorded, not silent', /journal_skipped_lines/.test(ledger))
check('compaction on start dropped delivered-note records', !/"t":"note-"/.test(readFileSync(join(P.stateDir, 'sessions.jsonl'), 'utf8')))

// 7. a sensitive service never has its results written to disk
mkdirSync('test/services/secretive', { recursive: true })
writeFileSync('test/services/secretive/service.json', JSON.stringify({ description: 'secretive', version: '2026-10-19.001', sensitive: true, operations: { tell: { description: 'Returns a secret-looking value.', class: 'write', idempotency: 'keyed', inputSchema: { type: 'object', properties: { ms: { type: 'number' } } } } } }))
writeFileSync('test/services/secretive/index.mjs', "export const ops = { tell: { handler: async ({ ms = 0 }, ctx) => { await new Promise((r) => setTimeout(r, ms)); return 'SECRET-VALUE-' + (ctx.idempotencyKey || 'x') } } }\n")
r = await runA([{ target: 'secretive:tell', args: {}, idempotency_key: 's1' }])
check('a sensitive service still answers normally', r.data[0].ok && r.data[0].value === 'SECRET-VALUE-s1', JSON.stringify(r.data))
r = await runA([{ target: 'secretive:tell', args: { ms: 800 } }], { deadline_ms: 100 })
await runA([{ target: 'anchor:job.wait', args: { handles: [r.data[0].handle], timeout_ms: 3000 } }])
const onDisk = ['idempotency.jsonl', 'jobs.jsonl', 'ledger.jsonl', 'sessions.jsonl'].map((f) => { try { return readFileSync(join(P.stateDir, f), 'utf8') } catch { return '' } }).join('')
check('its results appear in no journal or log', !onDisk.includes('SECRET-VALUE'), 'found SECRET-VALUE on disk')
killDaemon()
r = await runA([{ target: 'secretive:tell', args: {}, idempotency_key: 's1' }])
check('after a restart a replay says the result was not retained', r.data[0].replayed && r.data[0].resultNotRetained === true && !JSON.stringify(r.data).includes('SECRET-VALUE'), JSON.stringify(r.data))
rmSync('test/services/secretive', { recursive: true, force: true })

await A.close(); await B.close()
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.detail ? `\n      ${x.detail.slice(0, 500)}` : ''}`)
console.log(`\n${results.filter((x) => x.ok).length}/${results.length} passed`)
killDaemon()
process.exit(results.every((x) => x.ok) ? 0 : 1)
