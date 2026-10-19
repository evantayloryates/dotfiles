// 6.3: build real lab state, export the dashboard aggregates, and check the
// export against anchor:status and anchor:ticket.list read separately.
import './env.mjs'
import { execSync, execFileSync } from 'node:child_process'
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { startHarness } from './client.mjs'
import { paths } from '../src/paths.mjs'

const P = paths()
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: ok ? '' : String(detail) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const killDaemon = () => { try { execSync(`pkill -9 -f "${P.daemon} --state ${P.stateDir}"`) } catch {} }
const tool = (...a) => JSON.parse(execFileSync(process.execPath, ['src/release.mjs', ...a]).toString())
const ENV = {
  ANCHOR_DISPATCH_CMD: JSON.stringify([process.execPath, 'src/fixer-headless.mjs']),
  ANCHOR_HEADLESS_CMD: JSON.stringify([process.execPath, join(P.lab, 'test/fake-headless.mjs')]),
  ANCHOR_REVIEW_CMD: JSON.stringify([process.execPath, join(P.lab, 'test/fake-reviewer.mjs')]),
  ANCHOR_FIXER_TIMEOUT_MS: '3000', ANCHOR_DISPATCH_MAX_ATTEMPTS: '1', ANCHOR_ALERT_BACKEND: 'log',
  FAKE_HEADLESS_LOG: join(homedir(), '.cache/anchor-lab/fixers/fake-headless.log'),
}
const SVCS = ['fixit', 'nochange', 'dash']
killDaemon()
rmSync(P.stateDir, { recursive: true, force: true }); mkdirSync(P.stateDir, { recursive: true })
for (const id of SVCS) {
  rmSync(`test/services/${id}`, { recursive: true, force: true }); mkdirSync(`test/services/${id}`, { recursive: true })
  writeFileSync(`test/services/${id}/service.json`, JSON.stringify({ description: `${id} dashboard test service`, version: '2026-10-19.001', operations: { get: { description: 'Read.', class: 'read', inputSchema: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] } } } }, null, 2))
  writeFileSync(`test/services/${id}/GUIDE.md`, `# ${id}\n`)
  writeFileSync(`test/services/${id}/index.mjs`, `const CRASH = ['bad']\nexport const ops = { get: { handler: ({ x }) => { if (CRASH.includes(x)) { setImmediate(() => { throw new Error('${id}: cannot read ' + x) }); return new Promise(() => {}) } return { x } } } }\n`)
  tool('release', id); tool('promote', id)
}
// dash gets a nightly whose reads crash, so they fall back to stable.
writeFileSync('test/services/dash/index.mjs', `export const ops = { get: { handler: () => new Promise(() => setTimeout(() => { throw new Error('dash nightly broke') }, 5)) } }\n`)
tool('release', 'dash')

const h = await startHarness({ name: 'chat-dashboard', env: ENV })
const run = (calls) => h.call('anchor_run', { calls })
for (let i = 0; i < 12; i++) await run([{ target: 'echo:add', args: { a: i, b: 1 } }, { target: 'echo:echo', args: { text: `t${i}` } }])
await run([{ target: 'echo:add', args: { a: 'x', b: 1 } }])
for (let i = 0; i < 4; i++) await run([{ target: 'dash:get', args: { x: 'y' } }])
await run([{ target: 'anchor:ticket.report', args: { service: 'echo', title: 'echo drops trailing spaces', op: 'echo' } }])
for (const id of ['fixit', 'nochange']) await run([{ target: `${id}:get`, args: { x: 'bad' } }])
const until = Date.now() + 40000
while (Date.now() < until) {
  const t = (await run([{ target: 'anchor:ticket.list', args: { mine: false } }])).data[0].value.filter((x) => x.kind === 'hotfix')
  if (t.length === 2 && t.every((x) => !['open', 'dispatched'].includes(x.state))) break
  await sleep(500)
}

const exp = execFileSync(process.execPath, ['src/export-dashboard.mjs'], { timeout: 60000 }).toString()
const d = JSON.parse(readFileSync(join(P.stateDir, 'dashboard.json'), 'utf8'))
const [st, tl] = (await run([{ target: 'anchor:status' }, { target: 'anchor:ticket.list', args: { mine: false, limit: 500 } }])).data.map((x) => x.value)
check('the export ran over real state', d.calls.length >= 4 && d.tickets.length >= 4, exp)
const sameTickets = JSON.stringify(d.tickets.map((t) => [t.id, t.kind, t.lane, t.state, t.priority]).sort()) === JSON.stringify(tl.map((t) => [t.id, t.kind, t.lane, t.state, t.priority]).sort())
check('tickets match anchor:ticket.list (id, kind, lane, state, priority)', sameTickets, JSON.stringify({ exp: d.tickets.map((t) => [t.id, t.state, t.priority]), live: tl.map((t) => [t.id, t.state, t.priority]) }))
const svcKeys = (o) => Object.keys(o || {}).sort().join()
check('services match anchor:status', svcKeys(d.status.services) === svcKeys(st.services) && Object.entries(st.services).every(([k, v]) => d.status.services[k]?.coldStartMs === v.coldStartMs), `${svcKeys(d.status.services)} vs ${svcKeys(st.services)}`)
check('falling-back nightlies match anchor:status', JSON.stringify(d.status.fallingBack.map((f) => [f.service, f.op, f.ticket])) === JSON.stringify(st.fallingBack.map((f) => [f.service, f.op, f.ticket])) && d.status.fallingBack.length === 1, JSON.stringify(st.fallingBack))
const add = d.calls.find((c) => c.target === 'echo:add')
check('call counts and error codes come from the call log', add?.calls === 13 && add.codes.bad_args === 1, JSON.stringify(add))
check('fixer outcomes and cost are exported', d.fixer.some((f) => f.state === 'fixed' && f.costUsd > 0 && f.sandboxed) && d.fixer.some((f) => f.state === 'escalated'), JSON.stringify(d.fixer))
check('releases per channel with nightly age', d.releases.find((r) => r.service === 'dash')?.nightly && d.releases.find((r) => r.service === 'dash').nightlyAgeHours !== null, JSON.stringify(d.releases))
const raw = readFileSync(join(P.stateDir, 'dashboard.json'), 'utf8')
check('no call arguments or results in the export', !/"t11"|"args"|"value"|"result"/.test(raw), raw.match(/"t11"|"args"|"value"|"result"/)?.[0])
await h.close()
killDaemon()
for (const id of SVCS) rmSync(`test/services/${id}`, { recursive: true, force: true })
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.detail ? `\n      ${x.detail.slice(0, 600)}` : ''}`)
console.log(`\n${results.filter((x) => x.ok).length}/${results.length} passed`)
process.exit(results.every((x) => x.ok) ? 0 : 1)
