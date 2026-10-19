// Round 3: daemon death mid-call, idempotent retry, lost jobs, degraded mode.
import './env.mjs'
import { execSync, spawn } from 'node:child_process'
import { rmSync, mkdirSync, readFileSync, existsSync, openSync } from 'node:fs'
import { join } from 'node:path'
import { startHarness } from './client.mjs'
import { paths } from '../src/paths.mjs'

const P = paths()
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: ok ? '' : String(detail) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const killDaemon = () => { try { execSync(`pkill -9 -f "${P.daemon} --state ${P.stateDir}"`) } catch {} }
const daemonPid = () => { try { return execSync(`pgrep -f "${P.daemon} --state ${P.stateDir}"`).toString().trim().split('\n')[0] } catch { return null } }
killDaemon()
rmSync(P.stateDir, { recursive: true, force: true }); mkdirSync(P.stateDir, { recursive: true })

const h = await startHarness({ name: 'claude-code-sim' })
const run = (calls, extra = {}) => h.call('anchor_run', { calls, ...extra })
const pid1 = daemonPid()

// a. daemon dies during a non-idempotent call
const pending = run([{ target: 'slow:work', args: { ms: 2000 } }])
await sleep(300)
killDaemon()
let r = await pending
check('call in flight during daemon death -> outcome_unknown', r.data[0].code === 'outcome_unknown', JSON.stringify(r.data))
check('caller is told in the notes channel', /daemon restarted/.test(r.notes), r.notes)
r = await run([{ target: 'echo:echo', args: { text: 'back' } }])
const pid2 = daemonPid()
check('next call restarts the daemon transparently', r.data[0].ok && pid2 && pid2 !== pid1, `${pid1} -> ${pid2} ${JSON.stringify(r.data)}`)

// b. idempotent call survives a daemon death
const p2 = run([{ target: 'slow:work', args: { ms: 1500 }, idempotency_key: 'job-A' }], { deadline_ms: 5000 })
await sleep(300)
killDaemon()
r = await p2
check('keyed call to a "none" write op is not blindly rerun after daemon death', r.data[0].code === 'outcome_unknown', JSON.stringify(r.data))

// c. a job handle from before a restart reports lost, not unknown
r = await run([{ target: 'slow:work', args: { ms: 3000 } }], { deadline_ms: 200 })
const handle = r.data[0].handle
killDaemon()
await sleep(200)
r = await run([{ target: 'anchor:job.status', args: { handles: [handle] } }])
check('job running at daemon death reports lost with an explanation', r.data[0].value?.[0]?.state === 'lost' && /restarted/.test(JSON.stringify(r.data[0].value[0].result)), JSON.stringify(r.data))

// d. two chats hammering in parallel
const h2 = await startHarness({ name: 'codex-sim' })
const many = (n) => Array.from({ length: n }, (_, i) => ({ target: 'echo:add', args: { a: i, b: 0 } }))
const [x, y] = await Promise.all([run(many(150)), h2.call('anchor_run', { calls: many(150) })])
check('two chats x 150 calls in parallel all succeed', [...x.data, ...y.data].every((it) => it.ok), 'some failed')
check('parallel batches finish under 1.5 s', Math.max(x.ms, y.ms) < 1500, `${x.ms}/${y.ms} ms`)
await h2.close()
await h.close()

// e. degraded mode: daemon cannot start -> embedded core, loud notifications, recovery
killDaemon()
const hd = await startHarness({ name: 'claude-code-sim', env: { ANCHOR_DAEMON_BROKEN: '1', ANCHOR_DAEMON_START_MS: '800', ANCHOR_HELLO_BUDGET_MS: '400' } })
check('chat still starts when the daemon cannot (static instructions)', hd.init.instructions.includes('anchor_discover'), hd.init.instructions.slice(0, 120))
r = await hd.call('anchor_run', { calls: [{ target: 'echo:add', args: { a: 2, b: 2 } }] })
check('degraded mode still serves operations', r.data[0].ok && r.data[0].value === 4, JSON.stringify(r.data))
check('degraded mode is announced to the agent', /DEGRADED/.test(r.notes), r.notes)
const nlog = () => (existsSync(join(P.stateDir, 'notifications.log')) ? readFileSync(join(P.stateDir, 'notifications.log'), 'utf8') : '')
check('degraded entry notification fired', /ALERT degraded /.test(nlog()), nlog())
const out = openSync(join(P.stateDir, 'anchord.log'), 'a')
spawn(process.execPath, [P.daemon, '--state', P.stateDir], { detached: true, stdio: ['ignore', out, out] }).unref()
await sleep(6500)
check('recovery notification fired when the daemon came back', /RESOLVED degraded /.test(nlog()), nlog())
r = await hd.call('anchor_run', { calls: [{ target: 'anchor:status' }] })
check('after recovery calls go to the shared daemon', r.data[0].value?.mode === 'daemon', JSON.stringify(r.data[0]))
await hd.close()

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.detail ? `\n      ${x.detail.slice(0, 400)}` : ''}`)
console.log(`\n${results.filter((x) => x.ok).length}/${results.length} passed`)
killDaemon()
process.exit(results.every((x) => x.ok) ? 0 : 1)
