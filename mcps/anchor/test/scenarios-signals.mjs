// B3: one event stream, a current-state snapshot, and anchor:signals {since}.
import './env.mjs'
import { execSync, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { startHarness } from './client.mjs'
import { paths } from '../src/paths.mjs'

const P = paths()
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: ok ? '' : String(detail) })
const killDaemon = () => { try { execSync(`pkill -9 -f "${P.daemon} --state ${P.stateDir}"`) } catch {} }
const tool = (...a) => JSON.parse(execFileSync(process.execPath, ['src/release.mjs', ...a]).toString())
killDaemon()
rmSync(P.stateDir, { recursive: true, force: true }); mkdirSync(P.stateDir, { recursive: true })
rmSync('test/services/sig', { recursive: true, force: true }); mkdirSync('test/services/sig', { recursive: true })
writeFileSync('test/services/sig/service.json', JSON.stringify({ description: 'sig: signals test service', version: '2026-10-19.001', operations: { get: { description: 'Read.', class: 'read' } } }))
writeFileSync('test/services/sig/index.mjs', "export const ops = { get: { handler: () => 'v1' } }\n")
tool('release', 'sig'); tool('promote', 'sig')

let h = await startHarness({ name: 'chat-signals', env: { ANCHOR_ALERT_BACKEND: 'log' } })
const run = async (calls) => (await h.call('anchor_run', { calls })).data
const sig = async (args = {}) => (await run([{ target: 'anchor:signals', args }]))[0].value
await run([{ target: 'echo:echo', args: { text: 'secret-arg-marker-123' } }, { target: 'echo:add', args: { a: 'x', b: 1 } }, { target: 'sig:get' }])
await run([{ target: 'flaky:crash' }])
await h.call('anchor_discover', { need: 'echo some text back' })
let s = await sig()
const kinds = new Set(s.events.map((e) => e.kind))
check('the stream carries calls, errors, crashes, starts, releases, sessions and discovery', ['daemon_start', 'session_start', 'call', 'error', 'crash', 'start', 'release', 'discover'].every((k) => kinds.has(k)), [...kinds].join(','))
check('events have the v1 shape with a rising sequence', s.schema === 1 && s.events.every((e, i) => e.v === 1 && e.at && (i === 0 || e.seq > s.events[i - 1].seq)), JSON.stringify(s.events.slice(0, 2)))
const echo = s.state.services.find((x) => x.service === 'echo')
check('the snapshot counts calls and errors per service', echo?.calls === 2 && echo.errors === 1 && echo.lastError?.code === 'bad_args', JSON.stringify(echo))
const sigSvc = s.state.services.find((x) => x.service === 'sig')
check('the snapshot shows each service\'s releases', sigSvc?.stable === '2026-10-19.001', JSON.stringify(sigSvc))
const raw = readFileSync(join(P.stateDir, 'events.jsonl'), 'utf8')
check('no argument or result text reaches the stream', !raw.includes('secret-arg-marker-123') && !/"args"|"value"|fingerprint|boom/.test(raw), raw.match(/secret-arg-marker-123|"args"|"value"|fingerprint|boom/)?.[0])
check('sessions are hashed in the stream', !raw.includes('as_') && /"session":"[0-9a-f]{10}"/.test(raw))

// Cursor: only what happened after it.
const cursor = s.cursor
await run([{ target: 'echo:echo', args: { text: 'later' } }])
s = await sig({ since: cursor })
check('since(cursor) returns only newer events', s.events.length >= 1 && s.events.every((e) => e.seq > cursor) && s.events.some((e) => e.kind === 'call' && e.service === 'echo'), JSON.stringify(s.events.map((e) => [e.seq, e.kind])))
check('a kinds filter narrows the events', (await sig({ kinds: ['crash'] })).events.every((e) => e.kind === 'crash'))

// Restart: the snapshot is rebuilt from the stream, releases are not repeated.
const before = (await sig()).state.services.find((x) => x.service === 'echo')
await h.close(); killDaemon()
h = await startHarness({ name: 'chat-signals-2', env: { ANCHOR_ALERT_BACKEND: 'log' } })
await run([{ target: 'sig:get' }])
s = await sig()
const after = s.state.services.find((x) => x.service === 'echo')
check('after a daemon restart the snapshot is the same', after?.calls === before.calls && after.errors === before.errors, JSON.stringify({ before, after }))
check('a restart does not repeat release events', s.events.filter((e) => e.kind === 'release' && e.service === 'sig').length === 1)
await h.close(); killDaemon()

// Rotation: small files, the cursor still reads across them.
h = await startHarness({ name: 'chat-rotate', env: { ANCHOR_ALERT_BACKEND: 'log', ANCHOR_SIGNALS_ROTATE_BYTES: '3000' } })
const c0 = (await sig()).cursor
for (let i = 0; i < 25; i++) await run([{ target: 'echo:echo', args: { text: `r${i}` } }])
s = await sig({ since: c0, limit: 1000 })
const rotated = readdirSync(P.stateDir).filter((f) => /^events-\d+\.jsonl$/.test(f))
check('the stream rotates and keeps three old files', rotated.length >= 1 && rotated.length <= 3, rotated.join(','))
check('a cursor reads across rotated files without gaps', s.events.filter((e) => e.kind === 'call').length >= 20 && s.events.every((e, i) => i === 0 || e.seq === s.events[i - 1].seq + 1), JSON.stringify(s.events.map((e) => e.seq).slice(0, 40)))

// The dashboard export reads the same stream.
const exp = execFileSync(process.execPath, ['src/export-dashboard.mjs'], { timeout: 60000 }).toString()
const d = JSON.parse(readFileSync(join(P.stateDir, 'dashboard.json'), 'utf8'))
check('the dashboard export counts calls from the stream', d.calls.find((c) => c.target === 'echo:echo')?.calls >= 25, exp)
await h.close(); killDaemon()
rmSync('test/services/sig', { recursive: true, force: true })
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.detail ? `\n      ${x.detail.slice(0, 600)}` : ''}`)
console.log(`\n${results.filter((x) => x.ok).length}/${results.length} passed`)
process.exit(results.every((x) => x.ok) ? 0 : 1)
