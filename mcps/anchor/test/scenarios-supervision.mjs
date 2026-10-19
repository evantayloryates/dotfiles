// Round 2: crashes, restarts, backoff, quarantine, timeouts, hot reload.
import './env.mjs'
import { execSync } from 'node:child_process'
import { rmSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startHarness } from './client.mjs'
import { paths } from '../src/paths.mjs'

const P = paths()
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: ok ? '' : String(detail) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
try { execSync(`pkill -f "${P.daemon} --state ${P.stateDir}"`) } catch {}
rmSync(P.stateDir, { recursive: true, force: true }); mkdirSync(P.stateDir, { recursive: true })
rmSync('test/services/flaky/CRASH_ON_START', { force: true })
const h = await startHarness({ name: 'claude-code-sim' })
const run = async (calls, extra = {}) => (await h.call('anchor_run', { calls, ...extra }))
const one = async (target, args, extra) => { const r = await run([{ target, args, ...extra }]); return { item: r.data[0], notes: r.notes } }

// 1. one crash -> outcome unknown, immediate restart on next call
let r = await one('flaky:crash')
check('crash reported as outcome unknown with fingerprint', r.item.code === 'crashed' && r.item.fingerprint, JSON.stringify(r.item))
r = await one('flaky:ok')
check('next call restarts the service immediately', r.item.ok && r.item.value === 'fine', JSON.stringify(r.item))

// 2. same op crashes again -> op quarantined, service keeps serving others
const second = await one('flaky:crash')
check('quarantine announced in the notes channel of the calling chat', /flaky:crash is disabled/.test(second.notes), second.notes)
r = await one('flaky:crash')
check('op quarantined after crashing twice', r.item.code === 'op_quarantined', JSON.stringify(r.item))
const bystander = await startHarness({ name: 'bystander' })
const b = await bystander.call('anchor_run', { calls: [{ target: 'echo:echo', args: { text: 'x' } }] })
check('chats that never used flaky get no flaky notes', !/flaky/.test(b.notes), b.notes)
await bystander.close()
r = await one('flaky:ok')
check('other ops of that service still work (no backoff)', r.item.ok, JSON.stringify(r.item))

// 2b. a crash shared by two operations blames neither: each reruns alone
// (both are reads), the crasher earns its strikes on its own, the read works.
r = await run([{ target: 'pair:boom' }, { target: 'pair:wait' }])
check('a read that shared a crash is rerun alone and answers', r.data[1].ok && r.data[1].value === 'waited' && r.data[1].rerunAfterSharedCrash, JSON.stringify(r.data))
check("an operation's notice reaches the chat once, as a note", /pair:wait: renamed soon/.test(r.notes), r.notes)
check("the notice also rides on the call's own result", /renamed soon/.test(r.data[1].notice || ''), JSON.stringify(r.data[1]))
check('the crashing read is rerun alone and still crashes', r.data[0].code === 'crashed' && !r.data[0].shared, JSON.stringify(r.data[0]))
r = await run([{ target: 'pair:boom' }, { target: 'pair:wait' }])
check('the crasher is quarantined from its solo crashes; the read keeps working', /pair:boom is disabled/.test(r.notes) && r.data[1].ok && !/pair:wait is disabled/.test(r.notes), JSON.stringify(r.data) + r.notes)
r = await run([{ target: 'pair:boom' }, { target: 'pair:wait' }])
check('a notice is not repeated to the same chat', !/renamed soon/.test(r.notes || ''), r.notes)
check('afterwards only the crasher is refused', r.data[0].code === 'op_quarantined' && r.data[1].ok, JSON.stringify(r.data))

// 3. spontaneous crashes with changing errors -> flapping -> service quarantine
for (let i = 0; i < 7; i++) { await one('chaos:ping'); await sleep(250) }
r = await one('chaos:ping')
check('flapping service is quarantined and fails fast', r.item.code === 'quarantined' && r.item.error?.includes('quarantined'), JSON.stringify(r.item))
const st = (await one('anchor:status')).item.value.services.chaos
check('status shows quarantine', st.state === 'quarantined', JSON.stringify(st))

// 4. crash on start, same error twice -> backoff with a retry time
writeFileSync('test/services/flaky/CRASH_ON_START', '')
await one('anchor:release', { service: 'flaky' })
try { execSync(`pkill -f "service-host.mjs ${join(P.servicesDir, 'flaky')}"`) } catch {}
await sleep(300)
r = await one('flaky:ok')
const firstStart = r.item
r = await one('flaky:ok')
check('start failure surfaces the real error', /refusing to start/.test(firstStart.error || ''), JSON.stringify(firstStart))
r = await one('flaky:ok')
check('repeat start failure moves to backoff', r.item.code === 'backoff' && /retry after/.test(r.item.error), JSON.stringify(r.item))
unlinkSync('test/services/flaky/CRASH_ON_START')
await one('anchor:release', { service: 'flaky' })
r = await one('flaky:ok')
check('release clears backoff once fixed', r.item.ok, JSON.stringify(r.item))

// 5. timeouts and hung handlers -> recycled process
for (let i = 0; i < 3; i++) {
  r = await one('flaky:hang', undefined, { timeout_ms: 200 })
}
check('per-call timeout returns timeout code', r.item.code === 'timeout', JSON.stringify(r.item))
await sleep(600)
const ledger = readFileSync(join(P.stateDir, 'ledger.jsonl'), 'utf8')
check('process recycled after 3 hung handlers', /"type":"recycled"/.test(ledger), 'no recycled event')
r = await one('flaky:ok')
check('service serves again after recycle', r.item.ok, JSON.stringify(r.item))

// 6. hot reload: new service appears, broken manifest is reported
mkdirSync('test/services/late', { recursive: true })
writeFileSync('test/services/late/service.json', '{ "description": "Added while running.", "version": "2026-10-19.001", "operations": { "hi": { "description": "hi" } } }')
writeFileSync('test/services/late/index.mjs', "export const ops = { hi: { description: 'hi', handler: () => 'hello' } }\n")
mkdirSync('test/services/broken', { recursive: true })
writeFileSync('test/services/broken/service.json', '{ not json')
r = await h.call('anchor_discover', { list: true })
check('new service visible without restart', r.data.services.some((s) => s.id === 'late'))
check('broken manifest listed as unavailable', r.data.services.some((s) => s.id === 'broken' && /unavailable/.test(s.description)))
r = await one('late:hi')
check('new service runs immediately', r.item.ok && r.item.value === 'hello', JSON.stringify(r.item))
r = await one('broken:x')
check('broken service gives a clear error', r.item.code === 'broken_manifest', JSON.stringify(r.item))
rmSync('test/services/late', { recursive: true }); rmSync('test/services/broken', { recursive: true })

// 7. idempotency and bulk load
r = await run([{ target: 'echo:add', args: { a: 1, b: 1 }, idempotency_key: 'k1' }])
r = await run([{ target: 'echo:add', args: { a: 1, b: 1 }, idempotency_key: 'k1' }])
check('idempotent replay returns the stored result', r.data[0].replayed === true && r.data[0].value === 2, JSON.stringify(r.data[0]))
const calls = Array.from({ length: 200 }, (_, i) => ({ target: 'echo:add', args: { a: i, b: 1 } }))
r = await run(calls)
check('200-call bulk: all ok', r.data.every((x, i) => x.ok && x.value === i + 1), r.data.filter((x) => !x.ok).slice(0, 2))
check('200-call bulk under 1 s', r.ms < 1000, `${r.ms} ms`)

await h.close()
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.detail ? `\n      ${x.detail.slice(0, 400)}` : ''}`)
console.log(`\n${results.filter((x) => x.ok).length}/${results.length} passed`)
try { execSync(`pkill -f "${P.daemon} --state ${P.stateDir}"`) } catch {}
process.exit(results.every((x) => x.ok) ? 0 : 1)
