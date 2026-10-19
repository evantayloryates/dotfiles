// 6.1: alert episodes: one alert per episode, repeats until acknowledged,
// one resolve; degraded mode across chats; escalation; hotfix with no fixer.
import './env.mjs'
import { execSync, execFileSync } from 'node:child_process'
import { rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { startHarness } from './client.mjs'
import { paths } from '../src/paths.mjs'

process.env.ANCHOR_ALERT_BACKEND = 'log'
const P = paths()
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: ok ? '' : String(detail) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const killDaemon = () => { try { execSync(`pkill -9 -f "${P.daemon} --state ${P.stateDir}"`) } catch {} }
const lines = (re) => (existsSync(join(P.stateDir, 'notifications.log')) ? readFileSync(join(P.stateDir, 'notifications.log'), 'utf8').split('\n').filter((l) => re.test(l)) : [])
const cli = (...a) => JSON.parse(execFileSync(process.execPath, ['src/alerts.mjs', ...a], { env: { ...process.env, ANCHOR_ALERT_BACKEND: 'log', ANCHOR_ALERT_REPEAT_MS: '1200' } }).toString())
killDaemon()
rmSync(P.stateDir, { recursive: true, force: true }); mkdirSync(P.stateDir, { recursive: true })

// 1. episode mechanics through the library
const { Alerts } = await import('../src/alerts.mjs')
const a = new Alerts(P.stateDir, { backend: 'log', repeatMs: 1200 })
const e1 = a.raise('grind-blocked', 'Grind blocked', 'phase 3 needs Taylor')
a.raise('grind-blocked', 'Grind blocked', 'phase 3 needs Taylor again')
check('one alert per episode', lines(/ ALERT grind-blocked /).length === 1, lines(/grind-blocked/).join('\n'))
await sleep(1300); a.tick(); await sleep(1300); a.tick()
check('an unacknowledged alert repeats', lines(/ REPEAT grind-blocked /).length === 2, lines(/grind-blocked/).join('\n'))
cli('ack', e1.id)
await sleep(1300); a.tick()
check('a click (ack) stops the repeats', lines(/ REPEAT grind-blocked /).length === 2, lines(/grind-blocked/).join('\n'))
a.resolve('grind-blocked', 'unblocked'); a.resolve('grind-blocked', 'unblocked again')
check('one resolve alert per episode', lines(/ RESOLVED grind-blocked /).length === 1)
const e2 = a.raise('grind-blocked', 'Grind blocked', 'blocked again')
check('a new episode after a resolve alerts again', e2.id !== e1.id && lines(/ ALERT grind-blocked /).length === 2)
a.resolve('grind-blocked', 'done')

// 2. degraded mode: two chats, one episode, one resolve
const env = { ANCHOR_DAEMON_BROKEN: '1', ANCHOR_DAEMON_START_MS: '500', ANCHOR_HELLO_BUDGET_MS: '200', ANCHOR_ALERT_BACKEND: 'log', ANCHOR_ALERT_REPEAT_MS: '1200' }
const d1 = await startHarness({ name: 'deg-1', env })
const d2 = await startHarness({ name: 'deg-2', env })
await d1.call('anchor_run', { calls: [{ target: 'echo:add', args: { a: 1, b: 1 } }] })
await d2.call('anchor_run', { calls: [{ target: 'echo:add', args: { a: 1, b: 1 } }] })
check('two degraded chats share one alert', lines(/ ALERT degraded /).length === 1, lines(/degraded/).join('\n'))
await sleep(2600)
check('the degraded alert repeats while it lasts', lines(/ REPEAT degraded /).length >= 1, lines(/degraded/).join('\n'))
execSync(`ANCHOR_ALERT_BACKEND=log nohup ${process.execPath} ${P.daemon} --state ${P.stateDir} >/dev/null 2>&1 &`)
await sleep(6500)
check('recovery resolves it exactly once', lines(/ RESOLVED degraded /).length === 1, lines(/degraded/).join('\n'))
await d1.close(); await d2.close()
killDaemon()

// 3. hotfix with no fixer configured alerts; a manual fix resolves it
mkdirSync('test/services/lonely', { recursive: true })
writeFileSync('test/services/lonely/service.json', JSON.stringify({ description: 'lonely', version: '2026-10-19.001', operations: { get: { description: 'Read.', class: 'read', inputSchema: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] } } } }))
writeFileSync('test/services/lonely/GUIDE.md', '# lonely\n')
writeFileSync('test/services/lonely/index.mjs', "const CRASH = ['bad']\nexport const ops = { get: { handler: ({ x }) => { if (CRASH.includes(x)) { setImmediate(() => { throw new Error('lonely: cannot read ' + x) }); return new Promise(() => {}) } return { x } } } }\n")
const rel = (...x) => JSON.parse(execFileSync(process.execPath, ['src/release.mjs', ...x]).toString())
rel('release', 'lonely'); rel('promote', 'lonely')
const h = await startHarness({ name: 'no-fixer', env: { ANCHOR_ALERT_BACKEND: 'log', ANCHOR_PROMOTE_MIN_CALLS: '1' } })
await h.call('anchor_run', { calls: [{ target: 'lonely:get', args: { x: 'bad' } }] })
await sleep(300)
check('a hotfix ticket with no fixer configured alerts Taylor', lines(/ ALERT hotfix:T-/).length === 1, lines(/hotfix/).join('\n'))
const tid = lines(/ ALERT hotfix:/)[0]?.match(/hotfix:(T-\d+)/)?.[1]
writeFileSync('test/services/lonely/index.mjs', readFileSync('test/services/lonely/index.mjs', 'utf8').replace("const CRASH = ['bad']", 'const CRASH = []'))
const fix = rel('release', 'lonely', '--hotfix')
const r = await h.call('anchor_run', { calls: [{ target: 'anchor:ticket.resolve', args: { id: tid, release: fix.slug, note: 'fixed by hand' } }] })
await sleep(300)
check('marking it fixed by hand resolves the alert', r.data[0].ok && lines(new RegExp(` RESOLVED hotfix:${tid} `)).length === 1, JSON.stringify(r.data) + lines(/hotfix/).join('\n'))
await h.close()
killDaemon()
rmSync('test/services/lonely', { recursive: true, force: true })

for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.detail ? `\n      ${x.detail.slice(0, 600)}` : ''}`)
console.log(`\n${results.filter((x) => x.ok).length}/${results.length} passed`)
process.exit(results.every((x) => x.ok) ? 0 : 1)
