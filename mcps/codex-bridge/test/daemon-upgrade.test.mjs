// The shared daemon follows the bundled CLI's build, at most once per
// version, and never under someone's running turn.
//
// The AppServer cases drive the real connect path against a fake `codex`
// that models the CLI: `restart` relaunches the pinned package, `update
// --from-cli` pins this CLI's version. There is no control socket, so connect
// always ends in an error after the version step; the cases assert on what
// the fake was asked to do.

import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, beforeEach, test } from 'node:test'

const root = mkdtempSync(join(tmpdir(), 'codex-bridge-upgrade-'))
process.env.CODEX_HOME = join(root, 'codex-home')
process.env.CODEX_BRIDGE_STATE_DIR = join(root, 'state')
after(() => rmSync(root, { recursive: true, force: true }))

// Namespace import: run against an older appserver.mjs, the pure helpers are
// undefined and only those cases fail; the AppServer cases still run.
const appserver = await import('../src/lib/appserver.mjs')
const { AppServer } = appserver

const BUNDLED = '0.162.0-alpha.17.2'
const OLD = '0.158.0-alpha.2.1'

const FAKE = `#!/usr/bin/env node
const fs = require('node:fs')
const file = process.env.FAKE_CODEX_STATE
const s = JSON.parse(fs.readFileSync(file, 'utf8'))
const args = process.argv.slice(2)
const save = () => fs.writeFileSync(file, JSON.stringify(s))
const report = () => console.log(JSON.stringify({ status: s.status, managedCodexVersion: s.pinned, cliVersion: s.cli, appServerVersion: s.status === 'running' ? s.running : undefined }))
if (args[0] === '--version') { console.log('codex-cli ' + s.cli); process.exit(0) }
const sub = args[2]
s.calls.push(sub)
if (sub === 'restart' || sub === 'start') { s.status = 'running'; s.running = s.pinned }
if (sub === 'update') {
  if (!args.includes('--from-cli') || !args.includes('--yes')) { save(); console.error('update needs --from-cli --yes here'); process.exit(2) }
  if (s.updateWorks) s.pinned = s.cli
  s.running = s.pinned
}
save()
report()
`

function fakeCodex({ bundled = true } = {}) {
  const dir = bundled ? join(root, 'Fake.app', 'Contents', 'MacOS') : join(root, 'bin')
  mkdirSync(dir, { recursive: true })
  const bin = join(dir, 'codex')
  writeFileSync(bin, FAKE)
  chmodSync(bin, 0o755)
  return bin
}

let stateFile
let markersDir
function daemon(fields) {
  writeFileSync(stateFile, JSON.stringify({ cli: BUNDLED, pinned: OLD, running: OLD, status: 'running', updateWorks: true, calls: [], ...fields }))
}
const fake = () => JSON.parse(readFileSync(stateFile, 'utf8'))
const upgrades = () => fake().calls.filter((c) => c === 'update' || c === 'restart').length

let n = 0
beforeEach(() => {
  n++
  stateFile = join(root, `fake-${n}.json`)
  markersDir = join(root, `markers-${n}`)
  process.env.FAKE_CODEX_STATE = stateFile
})

async function connectOnce({ bin, busy = 0 }) {
  process.env.CODEX_BRIDGE_CODEX_PATH = bin
  const logs = []
  const app = new AppServer({
    mode: 'daemon',
    log: (line) => logs.push(line),
    daemonBusy: async () => busy,
    markers: appserver.upgradeMarkers?.(markersDir),
  })
  await assert.rejects(app.connect())
  return logs
}

test('older daemon: updated to the bundled build and verified, then left alone', async () => {
  daemon()
  const bin = fakeCodex()
  const first = await connectOnce({ bin })
  assert.equal(fake().running, BUNDLED, 'daemon must end up on the bundled build')
  assert.equal(fake().calls.at(-1), 'version', 'the version must be re-checked after the upgrade')
  assert.ok(first.some((l) => l.includes(`daemon upgraded to ${BUNDLED}`)), first.join('\n'))
  const second = await connectOnce({ bin })
  assert.equal(upgrades(), 1, `calls: ${fake().calls}`)
  assert.ok(!second.some((l) => /restart|updat/i.test(l)), second.join('\n'))
})

test('upgrade that does not take: logged once, never a second restart or update', async () => {
  daemon({ updateWorks: false })
  const bin = fakeCodex()
  const first = await connectOnce({ bin })
  await connectOnce({ bin })
  await connectOnce({ bin })
  assert.equal(upgrades(), 1, `calls: ${fake().calls}`)
  assert.ok(first.some((l) => l.includes('did not take')), first.join('\n'))
})

test('non-bundle binary never touches the shared daemon', async () => {
  daemon()
  const bin = fakeCodex({ bundled: false })
  await connectOnce({ bin })
  assert.equal(upgrades(), 0, `calls: ${fake().calls}`)
  assert.equal(fake().running, OLD)
})

test('busy daemon: upgrade deferred, then done once it is idle', async () => {
  daemon()
  const bin = fakeCodex()
  const logs = await connectOnce({ bin, busy: 2 })
  assert.equal(upgrades(), 0, `calls: ${fake().calls}`)
  assert.ok(logs.some((l) => l.includes('deferring the upgrade (2 turn(s) running on it)')), logs.join('\n'))
  await connectOnce({ bin, busy: 0 })
  assert.equal(fake().running, BUNDLED)
})

test('planDaemonUpgrade decisions', () => {
  const plan = (o) => appserver.planDaemonUpgrade({ cliVersion: BUNDLED, bin: '/A.app/Contents/MacOS/codex', daemonVersion: OLD, ...o }).action
  assert.equal(plan({ daemonVersion: BUNDLED }), 'connect')
  assert.equal(plan({ daemonVersion: undefined }), 'connect')
  assert.equal(plan({ daemonVersion: '0.170.0' }), 'refuse')
  assert.equal(plan({ bin: '/opt/homebrew/bin/codex' }), 'refuse')
  assert.equal(plan({ attempted: true, busy: 0 }), 'skip')
  assert.equal(plan({}), 'check')
  assert.equal(plan({ busy: 1 }), 'defer')
  assert.equal(plan({ busy: null }), 'defer')
  assert.equal(plan({ busy: 0 }), 'upgrade')
})

test('upgradeOutcome reads daemon version output', () => {
  assert.equal(appserver.upgradeOutcome(BUNDLED, { appServerVersion: BUNDLED }), 'upgraded')
  assert.equal(appserver.upgradeOutcome(BUNDLED, { appServerVersion: OLD, managedCodexVersion: BUNDLED }), 'relaunch')
  assert.equal(appserver.upgradeOutcome(BUNDLED, { appServerVersion: OLD, managedCodexVersion: OLD }), 'failed')
})

test('countActiveThreads pages loaded threads and counts active ones', async () => {
  const threads = { a: { type: 'idle' }, b: { type: 'active', activeFlags: [] }, c: { type: 'active', activeFlags: ['waitingOnApproval'] } }
  const request = async (method, params) => {
    if (method === 'thread/loaded/list') return params.cursor ? { data: ['c'], nextCursor: null } : { data: ['a', 'b'], nextCursor: 'p2' }
    return { thread: { id: params.threadId, status: threads[params.threadId] } }
  }
  assert.equal(await appserver.countActiveThreads(request), 2)
  await assert.rejects(appserver.countActiveThreads(async (m) => (m === 'thread/loaded/list' ? { data: ['x'] } : { thread: {} })))
})

test('a second bridge cannot claim the same version', () => {
  const m = appserver.upgradeMarkers(join(root, 'claims'))
  assert.equal(m.claim(BUNDLED), true)
  assert.equal(m.claim(BUNDLED), false)
  m.settle(BUNDLED, 'upgraded', 'ok')
  assert.equal(m.read(BUNDLED).outcome, 'upgraded')
})
