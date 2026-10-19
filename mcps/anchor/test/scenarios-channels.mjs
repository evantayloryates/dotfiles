// Iteration 4: release channels. A "calc" service is rewritten between
// releases to walk through promotion, nightly fallback, changed actions, the
// release-check gate, maximum nightly age and the hotfix path.
import './env.mjs'
import { execSync, execFileSync } from 'node:child_process'
import { rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { startHarness } from './client.mjs'
import { paths } from '../src/paths.mjs'

const P = paths()
const ENV = { ANCHOR_PROMOTE_MIN_CALLS: '3', ANCHOR_MAX_NIGHTLY_AGE_MS: '4000' }
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: ok ? '' : String(detail) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const killDaemon = () => { try { execSync(`pkill -9 -f "${P.daemon} --state ${P.stateDir}"`) } catch {} }
const tool = (...args) => {
  try { return JSON.parse(execFileSync(process.execPath, ['src/release.mjs', ...args], { env: { ...process.env, ...ENV } }).toString()) }
  catch (e) { return JSON.parse(e.stdout.toString()) }
}
const channels = () => JSON.parse(readFileSync(join(P.stateDir, 'channels', 'calc.json'), 'utf8'))

function writeCalc({ v, crashOn = [], setVariant = 'a', extra = false, drift = false }) {
  const ops = {
    get: { description: 'Read a value.', class: 'read', inputSchema: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] } },
    set: { description: 'Store a value.', class: 'write', idempotency: 'none', inputSchema: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] } },
  }
  if (extra) ops.extra = { description: 'A new feature.', class: 'read' }
  if (drift) ops.ghost = { description: 'Declared, never built.', class: 'read' }
  mkdirSync('test/services/calc', { recursive: true })
  writeFileSync('test/services/calc/service.json', JSON.stringify({ description: 'Release-channel test service.', version: '2026-10-19.001', operations: ops }, null, 2))
  writeFileSync('test/services/calc/GUIDE.md', '# calc\n')
  writeFileSync('test/services/calc/index.mjs', `
const CRASH = ${JSON.stringify(crashOn)}
export const ops = {
  get: { handler: ({ x }) => { if (CRASH.includes(x)) setImmediate(() => { throw new Error('calc: cannot read ' + x) }); else return { v: ${v}, x }; return new Promise(() => {}) } },
  set: { handler: ({ x }) => ({ stored: x, variant: '${setVariant}' }) },
  ${extra ? "extra: { handler: () => 'new feature' }," : ''}
}
`)
}

killDaemon()
rmSync(P.stateDir, { recursive: true, force: true }); mkdirSync(P.stateDir, { recursive: true })
rmSync('test/services/calc', { recursive: true, force: true })
writeCalc({ v: 1, crashOn: ['deep'] })
const h = await startHarness({ name: 'chat-channels', env: ENV })
const call = async (target, args, extra = {}) => (await h.call('anchor_run', { calls: [{ target, args, ...extra }] }))
const get = async (x) => (await call('calc:get', { x })).data[0]
// This suite tests the channels themselves: its chat follows them instead of
// being pinned to the releases it first used (pins have their own suite).
await call('anchor:pin', { action: 'release', service: 'calc' })

// 1. dev mode, then first release goes to nightly
let it = await get('a')
check('unreleased service runs from its working folder', it.ok && it.value.v === 1 && !it.served, JSON.stringify(it))
let t = tool('release', 'calc')
check('first release becomes nightly', t.ok && t.channel === 'nightly' && channels().nightly === t.slug && !channels().stable, JSON.stringify(t))
const r1 = t.slug
it = await get('a')
check('with no stable, nightly serves', it.served?.channel === 'nightly' && it.served.version === r1, JSON.stringify(it))

// 2. promotion gates
t = tool('promote', 'calc', '--auto')
check('auto-promotion refused below the call minimum', !t.ok && t.refused === 'gates', JSON.stringify(t))
await get('b'); await get('c')
t = tool('promote', 'calc', '--auto')
check('auto-promotion passes the gates', t.ok && channels().stable === r1 && !channels().nightly, JSON.stringify(t))

// 3. a nightly with a read bug falls back to stable; unchanged actions run on nightly
writeCalc({ v: 2, crashOn: ['boom', 'deep'] })
t = tool('release', 'calc')
const r2 = t.slug
it = await get('a')
check('reads go to nightly', it.ok && it.value.v === 2 && it.served.channel === 'nightly', JSON.stringify(it))
it = await get('boom')
check('nightly crash on a read falls back to stable transparently', it.ok && it.value.v === 1 && it.served.channel === 'stable' && /nightly .*crashed/.test(it.fellBack?.join()), JSON.stringify(it))
it = (await call('calc:set', { x: 'q' })).data[0]
check('an action unchanged in nightly runs on nightly', it.ok && it.served.channel === 'nightly', JSON.stringify(it))

// 4. a changed action stays on stable
writeCalc({ v: 3, crashOn: ['boom', 'deep'], setVariant: 'b' })
t = tool('release', 'calc')
const r3 = t.slug
it = (await call('calc:set', { x: 'q' })).data[0]
check('an action nightly changed runs on stable', it.ok && it.served.channel === 'stable' && it.value.variant === 'a', JSON.stringify(it))
await get('boom')
t = tool('promote', 'calc', '--auto')
check('auto-promotion refused when nightly keeps failing', !t.ok && /failure rate/.test(t.error), JSON.stringify(t))

// 5. the release check gates every release
writeCalc({ v: 3, crashOn: ['boom', 'deep'], setVariant: 'b', drift: true })
t = tool('release', 'calc')
check('a drifted working copy cannot be released', !t.ok && t.refused === 'release_check' && channels().nightly === r3, JSON.stringify(t))

// 6. maximum nightly age freezes features
await sleep(4200)
let r = await call('calc:get', { x: 'a' })
check('an overdue nightly is announced', /past its maximum age/.test(r.notes), r.notes)
writeCalc({ v: 4, crashOn: ['deep'], setVariant: 'b', extra: true })
t = tool('release', 'calc')
check('feature release refused while nightly is overdue', !t.ok && t.refused === 'nightly_overdue', JSON.stringify(t))
writeCalc({ v: 4, crashOn: ['deep'], setVariant: 'b' })
t = tool('release', 'calc', '--fix')
const r4 = t.slug
check('a fix release is allowed while overdue', t.ok && channels().nightly === r4, JSON.stringify(t))
for (const x of ['a', 'b', 'c']) await get(x)
t = tool('promote', 'calc', '--auto')
check('the fixed nightly promotes on its own record', t.ok && channels().stable === r4, JSON.stringify(t))

// 7. stable broken, nothing to fall back to: hotfix path
writeCalc({ v: 5, crashOn: ['deep'], setVariant: 'b', extra: true })
t = tool('release', 'calc')
const r5 = t.slug
r = await call('calc:get', { x: 'deep' })
check('stable failing with no fallback requests a hotfix', !r.data[0].ok && /hotfix was requested/.test(r.notes), JSON.stringify(r.data) + r.notes)
writeCalc({ v: 6, crashOn: [], setVariant: 'b' })
t = tool('release', 'calc', '--hotfix')
const r6 = t.slug
const ch = channels()
check('hotfix becomes stable at once', t.ok && ch.stable === r6, JSON.stringify(t))
check('the older nightly is cleared, to be rebuilt on the hotfix', ch.nightly === null && ch.history.some((e) => e.action === 'nightly_cleared' && e.slug === r5), JSON.stringify(ch))
await call('anchor:release', { service: `calc@${r4}` })
it = await get('deep')
check('the hotfixed stable serves the failing call', it.ok && it.value.v === 6 && it.served.version === r6, JSON.stringify(it))

// 8. stable only ever moved forward
const stables = ch.history.filter((e) => ['promote', 'hotfix'].includes(e.action)).map((e) => e.slug)
check('stable history is strictly increasing', stables.every((s, i) => i === 0 || s > stables[i - 1]) && stables.join() === [r1, r4, r6].join(), stables.join())
t = tool('promote', 'calc')
check('promote with no nightly is refused', !t.ok && t.refused === 'no_nightly', JSON.stringify(t))

// 9. simultaneous releases of one service get distinct versions
const { execFile } = await import('node:child_process')
const relAsync = () => new Promise((res) => execFile(process.execPath, ['src/release.mjs', 'release', 'calc', '--fix'], { env: { ...process.env, ...ENV } }, (e, out) => res(JSON.parse(out))))
const outs = await Promise.all([relAsync(), relAsync(), relAsync()])
const slugs = outs.map((o) => o.slug)
const { readdirSync } = await import('node:fs')
check('three simultaneous releases get three distinct versions', outs.every((o) => o.ok) && new Set(slugs).size === 3, JSON.stringify(outs))
check('no half-copied release is left behind', !readdirSync('test/services/calc/dist').some((d) => d.startsWith('.staging')))

await h.close()
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.detail ? `\n      ${x.detail.slice(0, 600)}` : ''}`)
console.log(`\n${results.filter((x) => x.ok).length}/${results.length} passed`)
killDaemon()
process.exit(results.every((x) => x.ok) ? 0 : 1)
