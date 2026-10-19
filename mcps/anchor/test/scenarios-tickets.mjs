// Iteration 5: tickets from failure signals, clustering, agent reports, the
// hotfix lane end to end, regression reopen, failed and hung fixers,
// escalation, per-service dispatch serialization, persistence.
import './env.mjs'
import { execSync, execFileSync } from 'node:child_process'
import { rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { startHarness } from './client.mjs'
import { paths } from '../src/paths.mjs'

const P = paths()
const ENV = {
  ANCHOR_DISPATCH_CMD: JSON.stringify([process.execPath, 'test/fake-fixer.mjs']),
  ANCHOR_DISPATCH_TIMEOUT_MS: '1500',
  ANCHOR_DISPATCH_BACKOFF_MS: '0,200,200',
  ANCHOR_PROMOTE_MIN_CALLS: '1',
}
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: ok ? '' : String(detail) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const killDaemon = () => { try { execSync(`pkill -9 -f "${P.daemon} --state ${P.stateDir}"`) } catch {} }
const tool = (...args) => JSON.parse(execFileSync(process.execPath, ['src/release.mjs', ...args], { env: { ...process.env, ...ENV } }).toString())
function writeSvc(id, crashOn) {
  mkdirSync(`test/services/${id}`, { recursive: true })
  writeFileSync(`test/services/${id}/service.json`, JSON.stringify({ description: `${id} test service`, version: '2026-10-19.001', operations: { get: { description: 'Read.', class: 'read', inputSchema: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] } } } }, null, 2))
  writeFileSync(`test/services/${id}/GUIDE.md`, `# ${id}\n`)
  writeFileSync(`test/services/${id}/index.mjs`, `const CRASH = ${JSON.stringify(crashOn)}\nexport const ops = { get: { handler: ({ x }) => { if (CRASH.includes(x)) { setImmediate(() => { throw new Error('${id}: cannot read ' + x) }); return new Promise(() => {}) } return { x } } } }\n`)
}
function released(id, crashOn) {
  writeSvc(id, crashOn)
  tool('release', id)
  tool('promote', id)
}

killDaemon()
rmSync(P.stateDir, { recursive: true, force: true }); mkdirSync(P.stateDir, { recursive: true })
rmSync('test/services/flaky/CRASH_ON_START', { force: true })
for (const id of ['mend', 'stuck', 'sleepy']) rmSync(`test/services/${id}`, { recursive: true, force: true })
released('mend', ['deep', 'deeper'])
released('stuck', ['x'])
released('sleepy', ['x'])

const A = await startHarness({ name: 'chat-A', env: ENV })
const B = await startHarness({ name: 'chat-B', env: ENV })
const runA = async (calls) => A.call('anchor_run', { calls })
const runB = async (calls) => B.call('anchor_run', { calls })
const tickets = async (h, args = {}) => (await h.call('anchor_run', { calls: [{ target: 'anchor:ticket.list', args }] })).data[0].value
let seenNotes = ''
const ticket = async (id) => { const r = await A.call('anchor_run', { calls: [{ target: 'anchor:ticket.get', args: { ids: [id] } }] }); seenNotes += r.notes || ''; return r.data[0].value[0] }
const waitFor = async (id, states, ms = 15000) => {
  const until = Date.now() + ms
  let t
  while (Date.now() < until) { t = await ticket(id); if (states.includes(t.state)) return t; await sleep(200) }
  return t
}

// 1. crash signals cluster
await runA([{ target: 'flaky:vary' }])
await runA([{ target: 'flaky:vary' }])
await runB([{ target: 'flaky:vary' }])
let mine = await tickets(A)
const flakyT = mine.find((t) => t.service === 'flaky' && t.kind === 'crash')
check('crashes with varying messages cluster into one ticket', flakyT && flakyT.count >= 3 && (await tickets(A, { mine: false })).filter((t) => t.service === 'flaky' && t.kind === 'crash').length === 1, JSON.stringify(mine))
check('the ticket counts both chats that hit it', flakyT?.sessions === 2, JSON.stringify(flakyT))
for (let i = 0; i < 6; i++) { await runB([{ target: 'chaos:ping' }]); await sleep(250) }
const all = await tickets(A, { mine: false })
check('a different failure gets its own ticket', all.some((t) => t.service === 'chaos') && all.some((t) => t.service === 'flaky'), JSON.stringify(all.map((t) => [t.id, t.service, t.kind])))

// 2. agent reports cluster by similar title
let r = await runA([{ target: 'anchor:ticket.report', args: { service: 'echo', title: 'echo add returns a stale value', detail: 'saw 3 for 1+1' } }])
const rep = r.data[0].value.ticket
r = await runB([{ target: 'anchor:ticket.report', args: { service: 'echo', title: 'echo add returns stale value' } }])
check('similar reports from two chats join one ticket', r.data[0].value.ticket === rep && r.data[0].value.occurrences === 2, JSON.stringify(r.data))
r = await runB([{ target: 'anchor:ticket.report', args: { service: 'echo', title: 'echo pixel image is the wrong size' } }])
check('a different report opens a new ticket', r.data[0].value.ticket !== rep, JSON.stringify(r.data))

// 3. drift becomes a ticket
await runA([{ target: 'drifty:declared_and_built' }])
check('drift opens a ticket', (await tickets(A, { mine: false })).some((t) => t.kind === 'drift' && t.service === 'drifty'))

// 4. hotfix lane end to end
r = await runA([{ target: 'mend:get', args: { x: 'deep' } }])
check('stable failing with no fallback fails the call', !r.data[0].ok && r.data[0].served?.channel === 'stable', JSON.stringify(r.data))
const mendTickets = (await tickets(A, { mine: false, service: 'mend' }))
const hot = mendTickets.find((t) => t.kind === 'hotfix')
check('one hotfix ticket, and the crash joined it rather than opening another', hot && mendTickets.length === 1, JSON.stringify(mendTickets.map((t) => [t.id, t.kind, t.count])))
const fixed = await waitFor(hot.id, ['fixed', 'verified'])
const chMend = JSON.parse(readFileSync(join(P.stateDir, 'channels', 'mend.json'), 'utf8'))
check('the hotfix lane dispatched a fixer that released a hotfix', fixed.state === 'fixed' && fixed.fixedIn === chMend.stable, JSON.stringify(fixed) + JSON.stringify(chMend))
check('a root-cause ticket was opened in the standard lane', (await tickets(A, { mine: false, service: 'mend' })).some((t) => t.kind === 'root_cause' && t.lane === 'standard' && t.links?.includes(hot.id)))
r = await runA([{ target: 'mend:get', args: { x: 'deep' } }])
check('the chat that hit it is told it is fixed', r.data[0].ok && new RegExp(`${hot.id}.*fixed in mend`).test(seenNotes + r.notes), seenNotes + r.notes)
check('a successful call on the fix verifies the ticket', (await ticket(hot.id)).state === 'verified')

// 5. the same failure after the fix reopens it
writeFileSync('test/services/mend/index.mjs', readFileSync('test/services/mend/index.mjs', 'utf8').replace('const CRASH = []', "const CRASH = ['deep']"))
tool('release', 'mend', '--hotfix')
await runA([{ target: 'mend:get', args: { x: 'deep' } }])
const re = await ticket(hot.id)
check('a regression reopens the fixed ticket', re.history.some((h) => h.state === 'reopened'), JSON.stringify(re.history))
const refixed = await waitFor(hot.id, ['fixed'])
check('...and the hotfix lane takes it again', refixed.state === 'fixed', JSON.stringify(refixed))

// 6. per-service serialization: two hotfix tickets for mend never run at once
writeFileSync('test/services/mend/index.mjs', readFileSync('test/services/mend/index.mjs', 'utf8').replace('const CRASH = []', "const CRASH = ['deep', 'deeper']"))
tool('release', 'mend', '--hotfix')
await Promise.all([runA([{ target: 'mend:get', args: { x: 'deeper' } }]), runB([{ target: 'mend:get', args: { x: 'deep' } }])])
await sleep(6000)
const log = readFileSync(join(P.stateDir, 'fixer.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.service === 'mend')
let open = 0
let maxOpen = 0
for (const e of log) { open += e.what === 'start' ? 1 : -1; maxOpen = Math.max(maxOpen, open) }
check('fixers for one service never overlap', maxOpen === 1 && log.length >= 4, JSON.stringify(log))

// 7. failing and hanging fixers retry, then escalate
await runA([{ target: 'stuck:get', args: { x: 'x' } }])
await runA([{ target: 'sleepy:get', args: { x: 'x' } }])
const st = (await tickets(A, { mine: false, service: 'stuck' })).find((t) => t.kind === 'hotfix')
const sl = (await tickets(A, { mine: false, service: 'sleepy' })).find((t) => t.kind === 'hotfix')
const stE = await waitFor(st.id, ['escalated'], 20000)
const slE = await waitFor(sl.id, ['escalated'], 20000)
check('a fixer that keeps failing is retried 3 times, then escalated', stE.state === 'escalated' && stE.attempts === 3, JSON.stringify(stE))
check('a hung fixer is killed at its timeout and counts as a failure', slE.state === 'escalated' && slE.history.some((h) => /killed/.test(h.note || '')), JSON.stringify(slE.history))
const notes = readFileSync(join(P.stateDir, 'notifications.log'), 'utf8')
check('escalations notify Taylor', /ALERT ticket:T-[0-9]+ .*stuck/.test(notes) && /ALERT ticket:T-[0-9]+ .*sleepy/.test(notes), notes)
r = await runA([{ target: 'echo:echo', args: { text: 'x' } }])
check('the chats that hit it are told it was escalated', /escalated to Taylor/.test(seenNotes + r.notes), seenNotes + r.notes)

// 8. tickets survive a daemon restart; abandoned dispatches reopen
const before = (await tickets(A, { mine: false })).length
killDaemon()
const after = await tickets(A, { mine: false })
check('tickets survive a daemon restart', after.length === before, `${before} -> ${after.length}`)

await A.close(); await B.close()
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.detail ? `\n      ${x.detail.slice(0, 600)}` : ''}`)
console.log(`\n${results.filter((x) => x.ok).length}/${results.length} passed`)
killDaemon()
for (const id of ['mend', 'stuck', 'sleepy']) rmSync(`test/services/${id}`, { recursive: true, force: true })
process.exit(results.every((x) => x.ok) ? 0 : 1)
