// A1: updates without restarts. A front end that finds the daemon on code no
// longer on disk drains it; work in flight finishes; a new daemon starts on
// the current code; state carries over; old front ends keep working.
import './env.mjs'
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { startHarness } from './client.mjs'
import { paths } from '../src/paths.mjs'

const P = paths()
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: ok ? '' : String(detail) })
const killDaemon = () => { try { execSync(`pkill -9 -f "${P.daemon} --state ${P.stateDir}"`) } catch {} }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const pid = () => { try { return Number(readFileSync(P.pidFile, 'utf8')) } catch { return null } }
const SALT = join(homedir(), '.cache/anchor-lab/build-salt')
const ENV = { ANCHOR_ALERT_BACKEND: 'log', ANCHOR_BUILD_EXTRA: SALT, ANCHOR_BUILD_CHECK_MS: '500' }
killDaemon()
rmSync(P.stateDir, { recursive: true, force: true }); mkdirSync(P.stateDir, { recursive: true })
writeFileSync(SALT, 'v1')

const old = await startHarness({ name: 'chat-old', env: ENV })
await old.call('anchor_run', { calls: [{ target: 'anchor:pin', args: { action: 'release', service: 'echo' } }] })
const pid1 = pid()
check('a daemon starts on v1', pid1 > 0, pid1)

// A long call in flight when the code changes.
const inflight = old.call('anchor_run', { calls: [{ target: 'slow:work', args: { ms: 2500 } }], deadline_ms: 20000 })
await sleep(300)
writeFileSync(SALT, 'v2')
const fresh = await startHarness({ name: 'chat-new', env: ENV })
const r = await fresh.call('anchor_run', { calls: [{ target: 'echo:echo', args: { text: 'after upgrade' } }] })
const done = await inflight
const pid2 = pid()
check('the call in flight when the daemon drained finished', done.data[0].ok && done.data[0].value?.worked === 2500, JSON.stringify(done.data[0]))
check('the newer front end gets its answer from a new daemon', r.data[0].ok && pid2 && pid2 !== pid1, JSON.stringify({ r: r.data[0], pid1, pid2 }))
const log = readFileSync(join(P.stateDir, 'anchord.log'), 'utf8')
check('the old daemon drained cleanly', /drained cleanly/.test(log), log.split('\n').filter((l) => /drain/.test(l)).join(' | '))
let alive = true
try { process.kill(pid1, 0) } catch { alive = false }
check('the old daemon is gone', !alive)

// The old front end keeps working against the new daemon, is told once that
// it is stale, and never drains the current daemon.
const a = await old.call('anchor_run', { calls: [{ target: 'echo:echo', args: { text: 'old chat' } }] })
const b = await old.call('anchor_run', { calls: [{ target: 'echo:echo', args: { text: 'old chat again' } }] })
check('an older front end keeps working on the new daemon', a.data[0].ok && b.data[0].ok, JSON.stringify([a.data[0], b.data[0]]))
check('it is told once that a new chat picks up the update', /new chat/.test(a.notes || '') && !/new chat/.test(b.notes || ''), JSON.stringify([a.notes, b.notes]))
check('an older front end never drains the current daemon', pid() === pid2, `${pid()} vs ${pid2}`)
const pins = (await old.call('anchor_run', { calls: [{ target: 'anchor:pin', args: {} }] })).data[0].value
check('state carries over the restart (this chat\'s pin)', pins?.echo?.follow === true, JSON.stringify(pins))

// A job still running in the background when a drain starts: the old daemon
// waits for it, and its result is waiting in the new one.
const job = (await old.call('anchor_run', { calls: [{ target: 'slow:work', args: { ms: 2000 } }], deadline_ms: 100 })).data[0]
writeFileSync(SALT, 'v2b')
const fourth = await startHarness({ name: 'chat-fourth', env: ENV })
await fourth.call('anchor_run', { calls: [{ target: 'echo:echo', args: { text: 'x' } }] })
const w = (await old.call('anchor_run', { calls: [{ target: 'anchor:job.wait', args: { handles: [job.handle], timeout_ms: 5000 } }] })).data[0]
check('a background job finishes across the drain and its result survives', job.handle && w.value?.[0]?.state === 'done' && w.value[0].result?.value?.worked === 2000, JSON.stringify({ job, w }))
await fourth.close()

// A daemon refusing work while it drains: the request is resent, not lost.
writeFileSync(SALT, 'v3')
const third = await startHarness({ name: 'chat-third', env: ENV })
const c = await third.call('anchor_run', { calls: [{ target: 'echo:add', args: { a: 2, b: 3 } }] })
check('a third build replaces the second the same way', c.data[0].ok && c.data[0].value === 5 && pid() !== pid2, JSON.stringify(c.data[0]))

// No new chat at all: the daemon notices the change on disk itself, drains,
// and the next call from an open chat reaches a daemon on the new code.
const pidBefore = pid()
writeFileSync(SALT, 'v4')
await sleep(2500)
const d = await third.call('anchor_run', { calls: [{ target: 'echo:echo', args: { text: 'no new chat' } }] })
check('the daemon notices new code by itself and an open chat moves to it', d.data[0].ok && pid() && pid() !== pidBefore, JSON.stringify({ d: d.data[0], pidBefore, now: pid() }))

const ups = readFileSync(join(P.stateDir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.kind === 'upgrade')
check('each drain is recorded as an upgrade signal with both builds', ups.length >= 3 && ups.every((e) => e.previous && e.build && e.previous !== e.build), JSON.stringify(ups.slice(0, 3)))
for (const h of [old, fresh, third]) await h.close()
killDaemon()
rmSync(SALT, { force: true })
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.detail ? `\n      ${x.detail.slice(0, 600)}` : ''}`)
console.log(`\n${results.filter((x) => x.ok).length}/${results.length} passed`)
process.exit(results.every((x) => x.ok) ? 0 : 1)
