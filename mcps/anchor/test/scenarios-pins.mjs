// Phase 4: per-chat release pins and nightly fallback reporting.
import './env.mjs'
import { execSync, execFileSync } from 'node:child_process'
import { rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startHarness } from './client.mjs'
import { paths } from '../src/paths.mjs'

const P = paths()
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: ok ? '' : String(detail) })
const killDaemon = () => { try { execSync(`pkill -9 -f "${P.daemon} --state ${P.stateDir}"`) } catch {} }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ENV = { ANCHOR_ALERT_BACKEND: 'log' }
killDaemon()
rmSync(P.stateDir, { recursive: true, force: true }); mkdirSync(P.stateDir, { recursive: true })
const SVC = join(P.servicesDir, 'pinny')
rmSync(SVC, { recursive: true, force: true }); mkdirSync(SVC, { recursive: true })
const version = (v, { crash = [] } = {}) => {
  writeFileSync(join(SVC, 'service.json'), JSON.stringify({ description: 'Says which build answered; a lab service for pin tests.', version: '2026-10-19.001', operations: { get: { description: 'Which build is this?', class: 'read' }, other: { description: 'Another read.', class: 'read' } } }, null, 1))
  const body = (op) => crash.includes(op) ? `() => new Promise(() => setTimeout(() => { throw new Error('pinny ${v}: ${op} broke') }, 5))` : `() => '${v}:${op}'`
  writeFileSync(join(SVC, 'index.mjs'), `export const ops = { get: { handler: ${body('get')} }, other: { handler: ${body('other')} } }\n`)
}
const rel = (...a) => JSON.parse(execFileSync(process.execPath, ['src/release.mjs', ...a]).toString())
const get = async (h, extra = {}) => (await h.call('anchor_run', { calls: [{ target: 'pinny:get', ...extra }] }))
const val = (r) => r.data[0].value

// v1 is stable. Chat X pins it.
version('v1'); rel('release', 'pinny'); rel('promote', 'pinny')
const X = await startHarness({ name: 'chat-x', env: ENV })
check('a chat pins the stable it first uses', val(await get(X)) === 'v1:get')
// v2 becomes nightly, then stable. X stays on v1; a new chat Y gets v2.
version('v2'); rel('release', 'pinny')
check('a nightly does not move a chat pinned before it', val(await get(X)) === 'v1:get')
rel('promote', 'pinny')
let r = await get(X)
check('a chat started on stable N keeps N after N+1 is promoted', val(r) === 'v1:get' && !/pin moved/.test(r.notes || ''), JSON.stringify(r))
const Y = await startHarness({ name: 'chat-y', env: ENV })
check('a new chat gets the current stable', val(await get(Y)) === 'v2:get')
check('version "stable" overrides the pin', val(await get(X, { version: 'stable' })) === 'v2:get')
const v1slug = rel('status', 'pinny').history?.find?.((h) => h.action === 'promote')?.slug
r = await X.call('anchor_run', { calls: [{ target: 'anchor:pin', args: { action: 'show' } }] })
check('anchor:pin show lists the pin', r.data[0].value.pinny?.stable && !r.data[0].value.pinny.nightly, JSON.stringify(r.data[0]))
// Pins survive a daemon restart (same front end, same handle).
killDaemon(); await sleep(300)
check('the pin survives a daemon restart', val(await get(X)) === 'v1:get')
await X.call('anchor_run', { calls: [{ target: 'anchor:pin', args: { action: 'refresh', service: 'pinny' } }] })
check('anchor:pin refresh moves the chat to the current releases', val(await get(X)) === 'v2:get')

// Chat Z starts while v3 is nightly: it pins both and is served the nightly.
version('v3'); rel('release', 'pinny')
const Z = await startHarness({ name: 'chat-z', env: ENV })
check('a chat pins the nightly it starts with', val(await get(Z)) === 'v3:get')
version('v4'); rel('release', 'pinny')
check('a newer nightly does not move it', val(await get(Z)) === 'v3:get')
// Hotfix: v5 straight to stable. Every pin moves forward, with a note.
version('v5'); rel('release', 'pinny', '--hotfix')
r = await get(Y)
check('a hotfix moves a stable pin forward, with a note', val(r) === 'v5:get' && /pin moved forward.*hotfix/.test(r.notes || ''), JSON.stringify(r))
r = await get(Z)
check("a hotfix moves a nightly pin forward too", val(r) === 'v5:get' && /pin moved forward/.test(r.notes || ''), JSON.stringify(r))
// A pinned nightly that is promoted moves the chat to the current stable.
version('v6'); rel('release', 'pinny')
const W = await startHarness({ name: 'chat-w', env: ENV })
check('chat W is on nightly v6', val(await get(W)) === 'v6:get')
rel('promote', 'pinny')
r = await get(W)
check('a promoted nightly pin moves to the current stable, with a note', val(r) === 'v6:get' && /promoted/.test(r.notes || ''), JSON.stringify(r))
check('pins only move forward: W stable pin is the promoted release', (await W.call('anchor_run', { calls: [{ target: 'anchor:pin', args: {} }] })).data[0].value.pinny.stable === rel('status', 'pinny').stable)
// release: the chat follows the channels on every call.
await Y.call('anchor_run', { calls: [{ target: 'anchor:pin', args: { action: 'release', service: 'pinny' } }] })
check('a released pin follows the channels', val(await get(Y)) === 'v6:get')
// Session identity: every call of one chat carries one handle, across a
// daemon restart; different chats never share one.
const byClient = {}
for (const l of readFileSync(join(P.stateDir, 'ledger.jsonl'), 'utf8').trim().split('\n').map((x) => JSON.parse(x))) if (l.event?.type === 'hello') (byClient[l.event.client] ||= new Set()).add(l.event.session)
const handles = Object.values(byClient).map((x) => [...x])
check('one chat keeps one handle (across a daemon restart); two chats get two', handles.length === 4 && handles.every((h) => h.length === 1) && new Set(handles.flat()).size === 4, JSON.stringify(Object.fromEntries(Object.entries(byClient).map(([k, v]) => [k, [...v]]))))

// Fallback reporting: nightly v7 breaks both operations; reads fall back.
version('v7', { crash: ['get', 'other'] }); rel('release', 'pinny')
const F = await startHarness({ name: 'chat-f', env: ENV })
for (let i = 0; i < 4; i++) {
  r = await F.call('anchor_run', { calls: [{ target: 'pinny:get' }, { target: 'pinny:other' }] })
  if (i === 0) check('a failing nightly read falls back to stable', r.data.every((d) => d.ok && d.fellBack), JSON.stringify(r.data))
}
const tl = (await F.call('anchor_run', { calls: [{ target: 'anchor:ticket.list', args: { mine: false } }] })).data[0].value
const fb = tl.filter((t) => t.kind === 'fallback')
check('repeated fallbacks open exactly one ticket per nightly and operation', fb.length === 2 && new Set(fb.map((t) => t.op)).size === 2 && fb.every((t) => t.lane === 'standard'), JSON.stringify(tl.map((t) => [t.id, t.kind, t.op, t.title])))
const st = (await F.call('anchor_run', { calls: [{ target: 'anchor:status' }] })).data[0].value
check('anchor:status shows the nightlies that keep falling back', st.fallingBack?.length === 2 && st.fallingBack.every((e) => e.ticket && e.fallbacks >= 3), JSON.stringify(st.fallingBack))

for (const h of [X, Y, Z, W, F]) await h.close()
killDaemon()
rmSync(SVC, { recursive: true, force: true })
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.detail ? `\n      ${x.detail.slice(0, 600)}` : ''}`)
console.log(`\n${results.filter((x) => x.ok).length}/${results.length} passed`)
process.exit(results.every((x) => x.ok) ? 0 : 1)
