// Paid-credit watch on the subscription route (offline: fake app-server,
// fake notifier).
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const scratch = mkdtempSync(join(tmpdir(), 'classifier-credits-'))
process.env.CLASSIFIER_JOBS_DIR = join(scratch, 'jobs')
const { parseLimits, spendingCredits, checkCredits, readLimits, notify } = await import('../src/lib/credits.mjs')

const snap = (o = {}) => ({ usedPercent: 40, reached: false, hasCredits: true, unlimited: false, balance: 100, ...o })

test('parse the official rateLimits answer', () => {
  const r = parseLimits({ ordinaryUsageAllowed: true, rateLimits: { primary: { usedPercent: 32 }, credits: { hasCredits: true, unlimited: false, balance: '50266.48' }, rateLimitReachedType: null } })
  assert.deepEqual(r, { usedPercent: 32, reached: false, hasCredits: true, unlimited: false, balance: 50266.48 })
  assert.equal(parseLimits({ rateLimits: { rateLimitReachedType: 'rate_limit_reached', credits: {} } }).reached, true)
})

test('credits are in use: limit reached with credits, or the balance fell', () => {
  assert.equal(spendingCredits(null, snap()), false)
  assert.equal(spendingCredits(null, snap({ reached: true })), true)
  assert.equal(spendingCredits(null, snap({ usedPercent: 100 })), true)
  assert.equal(spendingCredits(null, snap({ reached: true, hasCredits: false })), false, 'no credits: Codex fails instead (handled as rate_limited)')
  assert.equal(spendingCredits(snap({ balance: 100 }), snap({ balance: 99.5 })), true)
  assert.equal(spendingCredits(snap({ balance: 100 }), snap({ balance: 100 })), false)
  assert.equal(spendingCredits(null, snap({ reached: true, unlimited: true })), false)
})

test('notifications: at most once per job and once per hour', async () => {
  const sent = []
  const send = (n) => (sent.push(n), { accepted: true })
  const read = async () => snap({ reached: true })
  const t = 1_800_000_000_000
  assert.equal((await checkCredits({ job: 'cls_00000001', read, send, now: t })).notified, true)
  assert.equal((await checkCredits({ job: 'cls_00000001', read, send, now: t + 2 * 3_600_000 })).notified, false, 'same job: once')
  assert.equal((await checkCredits({ job: 'cls_00000002', read, send, now: t + 10 * 60_000 })).notified, false, 'within the hour')
  assert.equal((await checkCredits({ job: 'cls_00000003', read, send, now: t + 61 * 60_000 })).notified, true)
  assert.equal(sent.length, 2)
  for (const n of sent) assert.ok(!/cls_|\//.test(`${n.title} ${n.message}`), 'no ids or paths in the banner')
  assert.deepEqual(await checkCredits({ read: async () => null, send }), { read: false })
  const state = readFileSync(join(scratch, 'credits.json'), 'utf8')
  assert.ok(!/text|label/.test(state))
})

test('balance drop against a fresh baseline only (two hours)', async () => {
  const sent = []
  const send = (n) => (sent.push(n), { accepted: true })
  const t = 1_900_000_000_000
  await checkCredits({ read: async () => snap({ balance: 500 }), send, now: t })
  await checkCredits({ read: async () => snap({ balance: 499 }), send, now: t + 3 * 3_600_000 })
  assert.equal(sent.length, 0, 'a three-hour-old reading is not a baseline')
  await checkCredits({ read: async () => snap({ balance: 498 }), send, now: t + 3 * 3_600_000 + 60_000 })
  assert.equal(sent.length, 1)
})

test('readLimits speaks the app-server handshake and survives a dead reader', async () => {
  const fakeSpawn = (bin, args) => {
    const c = new EventEmitter()
    c.argsSeen = args || []
    c.stdout = new EventEmitter()
    c.kill = () => {}
    const written = []
    c.stdin = Object.assign(new EventEmitter(), {
      write: (line) => {
        const m = JSON.parse(line)
        written.push(m.method)
        if (m.method === 'initialize') setImmediate(() => c.stdout.emit('data', `${JSON.stringify({ id: 1, result: {} })}\n`))
        if (m.method === 'config/read') setImmediate(() => c.stdout.emit('data', `${JSON.stringify({ id: 3, result: { config: { mcp_servers: c.mcpState } } })}\n`))
        if (m.method === 'account/rateLimits/read') setImmediate(() => c.stdout.emit('data', `${JSON.stringify({ id: 2, result: { rateLimits: { primary: { usedPercent: 101 }, credits: { hasCredits: true, balance: '5' } } } })}\n`))
      },
    })
    c.written = written
    c.mcpState = mcpState
    fakeSpawn.last = c
    return c
  }
  let mcpState = { gmail: { enabled: false }, robinhood: { enabled: false } }
  const two = '[mcp_servers.gmail]\ncommand = "x"\n[mcp_servers.robinhood]\ncommand = "y"\n'
  const r = await readLimits({ spawnFn: fakeSpawn, mcpConfig: two })
  assert.equal(r.usedPercent, 101)
  assert.deepEqual(fakeSpawn.last.written, ['initialize', 'initialized', 'config/read', 'account/rateLimits/read'])
  mcpState = { gmail: { enabled: false }, robinhood: { enabled: true } }
  assert.equal(await readLimits({ spawnFn: fakeSpawn, mcpConfig: two }), null, 'an MCP server still enabled: no reading')
  assert.ok(!fakeSpawn.last.written.includes('account/rateLimits/read'))
  // backstop: anything but the real git under the reader voids the reading
  mcpState = { gmail: { enabled: false } }
  const one = '[mcp_servers.gmail]\ncommand = "x"\n'
  const withPid = (...a) => Object.assign(fakeSpawn(...a), { pid: 999999 })
  assert.equal(await readLimits({ spawnFn: withPid, mcpConfig: one, ps: () => `999999 1 999999 /x/codex\n4300 999999 999999 /tmp/evil/git\n` }), null)
  assert.ok(await readLimits({ spawnFn: withPid, mcpConfig: one, ps: () => `999999 1 999999 /x/codex\n` }), 'a clean tree keeps the reading')
  // the config/read gate is not vacuous: every configured name must be there and off
  const cfg = '[mcp_servers.gmail]\ncommand = "x"\n[mcp_servers.robinhood]\ncommand = "y"\n'
  mcpState = undefined
  assert.equal(await readLimits({ spawnFn: fakeSpawn, mcpConfig: cfg }), null, 'no mcp_servers in the answer while config names servers')
  mcpState = { gmail: { enabled: false } }
  assert.equal(await readLimits({ spawnFn: fakeSpawn, mcpConfig: cfg }), null, 'a configured server missing from the answer')
  mcpState = { gmail: { enabled: false }, robinhood: { enabled: false } }
  assert.ok(await readLimits({ spawnFn: fakeSpawn, mcpConfig: cfg }))
  assert.ok(fakeSpawn.last.argsSeen.join(' ').includes('--disable plugins --disable apps'))
  assert.ok(fakeSpawn.last.argsSeen.includes('mcp_servers.robinhood.enabled=false'))
  assert.equal(await readLimits({ spawnFn: () => { throw new Error('no codex') } }), null)
  const silent = () => Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stdin: Object.assign(new EventEmitter(), { write: () => {} }), kill: () => {} })
  assert.equal(await readLimits({ spawnFn: silent, timeoutMs: 50 }), null)
})

test('notify uses the notify-macos helper with argv only', () => {
  let got
  const r = notify({ title: 'T', message: 'M; $(x)', run: (bin, args) => ((got = { bin, args }), { status: 0 }) })
  if (r.why === 'notify helper missing') return
  assert.equal(got.bin, '/usr/bin/python3')
  assert.deepEqual(got.args.slice(1, 7), ['--title', 'T', '--message', 'M; $(x)', '--group', 'bulk-classify-credits'])
  assert.equal(r.accepted, true)
})

test('the credit watch is gated on the subscription route', () => {
  const worker = readFileSync(new URL('../src/worker.mjs', import.meta.url), 'utf8')
  const service = readFileSync(new URL('../src/lib/service.mjs', import.meta.url), 'utf8')
  assert.match(worker, /if \(route\.route === 'subscription'\) \{\n\s+checkCredits/)
  assert.match(service, /if \(creditCheckDue\(route, usage\)\) checkCreditsSoon\(\)/)
  assert.match(service, /creditCheckDue = \(route, usage\) => route\?\.route === 'subscription' && !!\(usage\?\.codex_calls \|\| usage\?\.codex_app_calls\)/)
  assert.equal((worker.match(/checkCredits\(/g) || []).length, 3)
})
