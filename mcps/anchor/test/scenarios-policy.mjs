// Iteration 3: per-operation idempotency policy and the release-time check.
import './env.mjs'
import { execSync, execFileSync } from 'node:child_process'
import { rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { startHarness } from './client.mjs'
import { paths } from '../src/paths.mjs'

const P = paths()
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: ok ? '' : String(detail) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const killDaemon = () => { try { execSync(`pkill -9 -f "${P.daemon} --state ${P.stateDir}"`) } catch {} }
const counters = () => { try { return JSON.parse(readFileSync(join(P.stateDir, 'echo-counters.json'), 'utf8')) } catch { return {} } }
const releaseCheck = (...ids) => {
  try { return { code: 0, out: JSON.parse(execFileSync(process.execPath, ['src/release-check.mjs', ...ids, '--json']).toString()) } }
  catch (e) { return { code: e.status, out: JSON.parse(e.stdout.toString()) } }
}
killDaemon()
rmSync(P.stateDir, { recursive: true, force: true }); mkdirSync(P.stateDir, { recursive: true })
rmSync('test/services/flaky/CRASH_ON_START', { force: true })
const h = await startHarness({ name: 'chat-policy' })
const run = (calls, extra = {}) => h.call('anchor_run', { calls, ...extra })
const interrupt = async (call) => {
  const p = run([call], { deadline_ms: 10000 })
  await sleep(400)
  killDaemon()
  return (await p).data[0]
}

// 1. "none": never rerun blindly, with or without a key
let it = await interrupt({ target: 'echo:bump', args: { name: 'slow-n' }, idempotency_key: 'n1' })
check('"none" op interrupted by daemon death -> outcome_unknown', it.code === 'outcome_unknown', JSON.stringify(it))
check('...and it was not resent (applied once)', counters()['slow-n'] === 1, JSON.stringify(counters()))
let r = await run([{ target: 'echo:bump', args: { name: 'slow-n' }, idempotency_key: 'n1' }])
check('retrying the same key does not rerun a "none" op', r.data[0].code === 'outcome_unknown' && r.data[0].policy === 'none' && counters()['slow-n'] === 1, JSON.stringify(r.data) + JSON.stringify(counters()))
r = await run([{ target: 'echo:bump', args: { name: 'slow-n' }, idempotency_key: 'n2' }])
check('a new key runs it again on purpose', r.data[0].ok && counters()['slow-n'] === 2, JSON.stringify(r.data))

// 2. "none" interrupted by a service crash (not the daemon), keyed
r = await run([{ target: 'flaky:crash', idempotency_key: 'c1' }])
check('service crash with a key reports crashed', r.data[0].code === 'crashed', JSON.stringify(r.data))
r = await run([{ target: 'flaky:crash', idempotency_key: 'c1' }])
check('same key after a crash is not rerun for a "none" op', r.data[0].code === 'outcome_unknown', JSON.stringify(r.data))

// 3. "natural": resent automatically, no key needed
it = await interrupt({ target: 'echo:slow_echo', args: { text: 'safe', ms: 1200 } })
check('"natural" op interrupted by daemon death is resent and succeeds', it.ok && it.value === 'safe', JSON.stringify(it))

// 4. "keyed": resent only with a key; the service dedupes
it = await interrupt({ target: 'echo:count', args: { name: 'slow-k' } })
check('"keyed" op without a key is not resent', it.code === 'outcome_unknown' && counters()['slow-k'] === 1, JSON.stringify(it) + JSON.stringify(counters()))
it = await interrupt({ target: 'echo:count', args: { name: 'slow-k2' }, idempotency_key: 'kk' })
check('"keyed" op with a key is resent and deduped by the service', it.ok && it.value?.deduped && counters()['slow-k2'] === 1, JSON.stringify(it) + JSON.stringify(counters()))

// 5. manifest validation at runtime
mkdirSync('test/services/badmeta', { recursive: true })
writeFileSync('test/services/badmeta/service.json', JSON.stringify({ description: 'bad', version: '2026-10-19.001', operations: { wipe: { description: 'w', class: 'destructive', idempotency: 'natural' }, odd: { description: 'o', idempotency: 'maybe' } } }))
writeFileSync('test/services/badmeta/index.mjs', "export const ops = { wipe: { handler: () => 1 }, odd: { handler: () => 2 } }\n")
r = await h.call('anchor_discover', { list: true })
const bad = r.data.services.find((s) => s.id === 'badmeta')
check('invalid idempotency declarations make the service unavailable', /cannot be "natural"/.test(bad?.description) && /must be one of natural, keyed, none/.test(bad?.description), JSON.stringify(bad))

// 6. release check
let rc = releaseCheck('echo')
check('release check passes a clean service', rc.code === 0 && rc.out[0].errors.length === 0, JSON.stringify(rc.out))
rc = releaseCheck('drifty')
check('release check fails drift', rc.code === 1 && rc.out[0].errors.some((e) => /declared but not implemented: declared_only/.test(e)) && rc.out[0].errors.some((e) => /implemented but not declared: built_only/.test(e)), JSON.stringify(rc.out))
rc = releaseCheck('badmeta')
check('release check fails a malformed manifest', rc.code === 1 && rc.out[0].errors.length >= 2, JSON.stringify(rc.out))
writeFileSync('test/services/flaky/CRASH_ON_START', '')
rc = releaseCheck('flaky')
rmSync('test/services/flaky/CRASH_ON_START', { force: true })
check('release check fails a module that cannot load', rc.code === 1 && rc.out[0].errors.some((e) => /fails to load: Error: flaky: refusing to start/.test(e)), JSON.stringify(rc.out))
mkdirSync('test/services/keyless', { recursive: true })
writeFileSync('test/services/keyless/service.json', JSON.stringify({ description: 'k', version: '2026-10-19.001', operations: { charge: { description: 'c', class: 'write', idempotency: 'keyed' } } }))
writeFileSync('test/services/keyless/index.mjs', "export const ops = { charge: { handler: () => 'charged' } }\n")
writeFileSync('test/services/keyless/context.mjs', "export async function sessionContext() { await new Promise((r) => setTimeout(r, 400)); return 'x'.repeat(900) }\n")
rc = releaseCheck('keyless')
const w = rc.out[0].warnings.join(' | ')
check('keyed op that ignores the key is warned about', /declared "keyed" but its handler never reads/.test(w), w)
check('slow, oversized context generator is warned about', /took \d+ ms/.test(w) && /900 chars/.test(w), w)
check('warnings alone do not fail the release', rc.code === 0, JSON.stringify(rc.out))
rmSync('test/services/badmeta', { recursive: true }); rmSync('test/services/keyless', { recursive: true })

await h.close()

// 7. records are honored across the daemon and degraded mode, both ways
const a = await startHarness({ name: 'pre-outage' })
const pa = a.call('anchor_run', { calls: [{ target: 'echo:bump', args: { name: 'slow-d' }, idempotency_key: 'd1' }], deadline_ms: 10000 })
await sleep(400); killDaemon(); await pa; await a.close()
const deg = await startHarness({ name: 'degraded', env: { ANCHOR_DAEMON_BROKEN: '1', ANCHOR_DAEMON_START_MS: '600', ANCHOR_HELLO_BUDGET_MS: '300' } })
r = await deg.call('anchor_run', { calls: [{ target: 'echo:bump', args: { name: 'slow-d' }, idempotency_key: 'd1' }] })
check('degraded mode honors a "none" key the daemon had started', /DEGRADED/.test(r.notes) && r.data[0].code === 'outcome_unknown' && counters()['slow-d'] === 1, JSON.stringify(r.data) + JSON.stringify(counters()))
r = await deg.call('anchor_run', { calls: [{ target: 'echo:bump', args: { name: 'during-outage' }, idempotency_key: 'e1' }] })
check('degraded mode runs new work', r.data[0].ok && counters()['during-outage'] === 1, JSON.stringify(r.data))
await deg.close()
const back = await startHarness({ name: 'post-outage' })
r = await back.call('anchor_run', { calls: [{ target: 'echo:bump', args: { name: 'during-outage' }, idempotency_key: 'e1' }] })
check('the recovered daemon replays a key first used in degraded mode', r.data[0].replayed && counters()['during-outage'] === 1, JSON.stringify(r.data) + JSON.stringify(counters()))
await back.close()

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.detail ? `\n      ${x.detail.slice(0, 500)}` : ''}`)
console.log(`\n${results.filter((x) => x.ok).length}/${results.length} passed`)
killDaemon()
process.exit(results.every((x) => x.ok) ? 0 : 1)
