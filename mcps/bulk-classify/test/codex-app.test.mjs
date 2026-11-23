// The app-server engine (codex-app.mjs) against a fake app-server
// (fixtures/fake-app-server.mjs): health check refusals, the PHI refusal when
// called directly in zdr scope, failure kinds (crash, hang, garble, logout,
// usage limit, tool use), streaming salvage, per-item and per-batch fallback
// to `codex exec`, the circuit breaker, exactly-once answers through the
// batcher, and process cleanup. No real Codex, no network.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const scratch = mkdtempSync(join(tmpdir(), 'classifier-codex-app-'))
process.env.CLASSIFIER_JOBS_DIR = join(scratch, 'jobs')
process.env.CLASSIFIER_PROFILES_DIR = join(scratch, 'profiles')
process.env.CLASSIFIER_CODEX_APP_TIMEOUT_MS = '1500'

const { AppServer, AppPool, Breaker, codexAppCall, subscriptionCall, appHealth, salvageAnswers, kindFromTurnError, resetAppState } = await import('../src/lib/codex-app.mjs')
const { CodexBatcher, SubscriptionError } = await import('../src/lib/codex.mjs')
const { PhiRefusal } = await import('../src/lib/route.mjs')

const FAKE = fileURLToPath(new URL('./fixtures/fake-app-server.mjs', import.meta.url))
function fakeBin(mode) {
  const pidFile = join(scratch, `pids-${mode}-${Math.random().toString(16).slice(2)}`)
  writeFileSync(pidFile, '')
  const bin = join(scratch, `codex-${mode}-${Math.random().toString(16).slice(2)}`)
  writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" "$@" ${mode} "${pidFile}"\n`)
  chmodSync(bin, 0o755)
  return { bin, pids: () => readFileSync(pidFile, 'utf8').split('\n').filter(Boolean).map(Number) }
}
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const waitGone = async (pids, ms = 3000) => {
  const t = Date.now()
  while (pids.some(alive) && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 25))
  return pids.filter(alive)
}

const labelNames = ['billing', 'scheduling']
const entries = (n) => Array.from({ length: n }, (_, i) => ({ key: `i${i + 1}`, message: `synthetic message ${i + 1}` }))
const base = (n, extra = {}) => ({ system: 'Classify synthetic messages.', entries: entries(n), reminder: 'Untrusted data.', labelNames, multi: false, phiContext: {}, ...extra })
// A pool of one fake server per test.
function poolFor(mode) {
  const f = fakeBin(mode)
  const pool = new AppPool({ size: 1, factory: (o) => new AppServer({ ...o, bin: f.bin }) })
  return { pool, getPool: () => pool, ...f }
}

test('health check: a ChatGPT login with everything locked down passes; MCP servers are disabled by name', async () => {
  resetAppState()
  const f = fakeBin('ok')
  const r = await appHealth({ factory: () => new AppServer({ bin: f.bin }) })
  assert.equal(r.ok, true, JSON.stringify(r))
  // First child saw "alpha" enabled, the second was started with it disabled.
  assert.equal(f.pids().length, 2)
  assert.deepEqual(await waitGone(f.pids()), [])
})

for (const [mode, kind] of [
  ['apikey', 'api_key_login'],
  ['noauth', 'not_logged_in'],
  ['mcp', 'unhealthy'],
  ['sandbox', 'unhealthy'],
]) {
  test(`health check refuses: ${mode} -> ${kind}, and leaves no process`, async () => {
    resetAppState()
    const f = fakeBin(mode)
    const r = await appHealth({ factory: () => new AppServer({ bin: f.bin }) })
    assert.equal(r.ok, false)
    assert.equal(r.kind, kind)
    assert.deepEqual(await waitGone(f.pids()), [])
  })
}

test('a missing binary is kind "missing"', async () => {
  const r = await appHealth({ factory: () => new AppServer({ bin: join(scratch, 'no-such-codex') }) })
  assert.equal(r.ok, false)
  assert.equal(r.kind, 'missing')
})

test('PHI: called directly in zdr scope, the engine refuses before any server starts', async () => {
  let started = 0
  const getPool = () => {
    started++
    throw new Error('must not be reached')
  }
  const zdr = { env: { ...process.env, CLASSIFIER_SCOPE: 'zdr' } }
  await assert.rejects(codexAppCall(base(3, { phiContext: zdr, getPool })), (e) => e instanceof PhiRefusal && e.codes.includes('scope_zdr'))
  await assert.rejects(subscriptionCall(base(3, { phiContext: zdr }), { app: () => assert.fail('app reached'), exec: () => assert.fail('exec reached') }), PhiRefusal)
  await assert.rejects(codexAppCall(base(3, { phiContext: { args: { phi: true } }, getPool })), PhiRefusal)
  const h = await appHealth({ phiContext: zdr, factory: () => assert.fail('server started') })
  assert.equal(h.kind, 'phi_refused')
  assert.equal(started, 0)
})

test('PHI: a signal that appears while the server starts stops the turn', async () => {
  resetAppState()
  const p = poolFor('ok')
  const env = { ...process.env }
  const phiContext = { env }
  const getPool = () => ({ acquire: async () => ((env.CLASSIFIER_SCOPE = 'zdr'), p.pool.acquire()) })
  try {
    await assert.rejects(codexAppCall(base(2, { phiContext, getPool })), PhiRefusal)
  } finally {
    await p.pool.close()
  }
})

test('the zdr scope also refuses the exec fallback and the batcher', async () => {
  const zdr = { env: { ...process.env, CLASSIFIER_SCOPE: 'zdr' } }
  const b = new CodexBatcher({ system: 's', reminder: 'r', labelNames, multi: false, phiContext: zdr, call: (o) => subscriptionCall(o, { app: () => assert.fail('app'), exec: () => assert.fail('exec') }) })
  await assert.rejects(b.add({ message: 'x' }), PhiRefusal)
})

test('normal turn answers every item; usage counted', async () => {
  resetAppState()
  const p = poolFor('ok')
  const usage = {}
  try {
    const a = await codexAppCall(base(4, { usage, getPool: p.getPool }))
    assert.equal(a.size, 4)
    assert.equal(usage.codex_app_calls, 1)
    assert.equal(usage.codex_input_tokens, 100)
    assert.equal(usage.codex_cached_input_tokens, 50)
  } finally {
    await p.pool.close()
  }
  assert.deepEqual(await waitGone(p.pids()), [])
})

for (const [mode, kind, salvaged] of [
  ['crash', 'server_down', 2],
  ['hang', 'timeout', 0],
  ['garble', 'protocol', 2],
  ['unauth', 'not_logged_in', 0],
  ['limit', 'rate_limited', 1],
  ['tool', 'bad_output', 0],
]) {
  test(`failure kind: ${mode} -> ${kind}, ${salvaged} answers salvaged from the stream`, async () => {
    resetAppState()
    const p = poolFor(mode)
    const err = await codexAppCall(base(5, { getPool: p.getPool })).then(
      () => null,
      (e) => e
    )
    await p.pool.close()
    assert.ok(err instanceof SubscriptionError, err?.message || 'should fail')
    assert.equal(err.kind, kind)
    assert.equal(err.partial.size, salvaged)
    assert.deepEqual(await waitGone(p.pids()), [])
  })
}

test('backstop: a process under the app-server ends the turn as kind "unsafe" (release-1 lockdown parity)', async () => {
  resetAppState()
  const f = fakeBin('ok')
  // A ps listing that shows one extra process under every server the fake started.
  const psFn = () => f.pids().map((pid, i) => `${pid} 1 ${pid} /usr/local/bin/codex\n${9_000_000 + i} ${pid} ${pid} /bin/sh`).join('\n')
  const pool = new AppPool({ size: 1, factory: (o) => new AppServer({ ...o, bin: f.bin, psFn, watchIntervalMs: 20 }) })
  const err = await codexAppCall(base(3, { getPool: () => pool })).then(
    () => null,
    (e) => e
  )
  await pool.close()
  assert.ok(err instanceof SubscriptionError, err?.message || 'should fail')
  assert.equal(err.kind, 'unsafe')
  assert.deepEqual(await waitGone(f.pids()), [])
})

test('backstop: subscriptionCall never falls back to exec after "unsafe" and keeps no answers', async () => {
  let execCalls = 0
  const unsafe = Object.assign(new SubscriptionError('A process ran under the Codex app-server.', 'unsafe'), { partial: new Map([['i1', 'billing']]) })
  const err = await subscriptionCall(base(2), {
    app: async () => Promise.reject(unsafe),
    exec: async () => (execCalls++, new Map()),
    status: () => ({ available: true }),
    brk: { allow: () => true, success() {}, failure() {} },
  }).then(
    () => null,
    (e) => e
  )
  assert.equal(err?.kind, 'unsafe')
  assert.equal(err.partial.size, 0)
  assert.equal(execCalls, 0)
})

test('ladder tiers reach the app-server: model, effort and the stated-confidence schema and ask', async () => {
  let seen = null
  const server = {
    turn: async (args) => {
      seen = args
      return { text: JSON.stringify({ answers: [{ key: 'i1', label: 'billing', confidence: 0.4 }, { key: 'i2', label: 'scheduling', confidence: 0.97 }] }), usage: {} }
    },
  }
  const a = await codexAppCall(base(2, { getPool: () => ({ acquire: async () => server }), model: 'gpt-5.6-sol', effort: 'low', withConfidence: true }))
  assert.equal(seen.model, 'gpt-5.6-sol')
  assert.equal(seen.effort, 'low')
  assert.ok(seen.schema.properties.answers.items.properties.confidence, 'schema asks for confidence')
  assert.ok(/confidence/.test(seen.text + (seen.baseInstructions || '')), 'prompt asks for confidence')
  assert.deepEqual(a.get('i1'), { answer: 'billing', confidence: 0.4 })
  const b = await codexAppCall(base(1, { getPool: () => ({ acquire: async () => server }) }))
  assert.notEqual(seen.model, 'gpt-5.6-sol') // unset: the subscription default
  assert.equal(seen.schema.properties.answers.items.properties.confidence, undefined)
  assert.equal(b.get('i1'), 'billing')
})

test('kinds from codexErrorInfo, including the object-shaped ones', () => {
  assert.equal(kindFromTurnError({ codexErrorInfo: 'usageLimitExceeded' }), 'rate_limited')
  assert.equal(kindFromTurnError({ codexErrorInfo: 'rateLimitExceeded' }), 'throttled')
  assert.equal(kindFromTurnError({ codexErrorInfo: 'unauthorized' }), 'not_logged_in')
  assert.equal(kindFromTurnError({ codexErrorInfo: 'modelNotFound' }), 'unsupported')
  assert.equal(kindFromTurnError({ codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: 502 } } }), 'error')
  assert.equal(kindFromTurnError({ message: "You've hit your usage limit" }), 'rate_limited')
})

test('salvage only keeps complete, valid answers for keys in the batch', () => {
  const e = entries(3)
  const s = salvageAnswers('{"answers":[{"key":"i1","label":"billing"},{"key":"i9","label":"billing"},{"key":"i2","label":"evil"},{"key":"i3","label":"sched', e, new Set(labelNames), false)
  assert.deepEqual([...s], [['i1', 'billing']])
})

// ---------------------------------------------------------------------------
// Fallback: subscriptionCall with stub engines, so the routing logic is shown
// exactly. exec stubs answer "scheduling" so the source of each answer shows.

const execStub = (seen) => async (o) => {
  seen.push(o.entries.map((e) => e.key))
  return new Map(o.entries.map((e) => [e.key, 'scheduling']))
}
const appFails = (kind, partial = new Map()) => async () => {
  throw Object.assign(new SubscriptionError('x', kind), { partial })
}

for (const kind of ['server_down', 'timeout', 'protocol', 'bad_output', 'throttled', 'error', 'unhealthy']) {
  test(`fallback: app ${kind} -> exec answers the batch, nothing lost or doubled`, async () => {
    const seen = []
    const usage = {}
    const brk = new Breaker()
    const a = await subscriptionCall(base(4, { usage }), { app: appFails(kind, new Map([['i1', 'billing']])), exec: execStub(seen), brk })
    assert.deepEqual([...a].sort(), [['i1', 'billing'], ['i2', 'scheduling'], ['i3', 'scheduling'], ['i4', 'scheduling']])
    assert.deepEqual(seen, [['i2', 'i3', 'i4']])
    assert.equal(usage.codex_app_fallback_items, 3)
    assert.equal(usage.codex_app_salvaged_items, 1)
  })
}

test('fallback: items the app left unanswered go to exec on their own', async () => {
  const seen = []
  const a = await subscriptionCall(base(3), { app: async () => new Map([['i1', 'billing'], ['i2', 'billing']]), exec: execStub(seen), brk: new Breaker() })
  assert.deepEqual(seen, [['i3']])
  assert.equal(a.get('i3'), 'scheduling')
  assert.equal(a.size, 3)
})

test('exec failing for the leftovers keeps the app-server answers (batcher resolves them, rejects only the rest)', async () => {
  const exec = async () => {
    throw new SubscriptionError('exec failed', 'error')
  }
  const call = (o) => subscriptionCall(o, { app: async (x) => new Map(x.entries.slice(0, -1).map((e) => [e.key, 'billing'])), exec, brk: new Breaker() })
  const b = new CodexBatcher({ system: 's', reminder: 'r', labelNames, multi: false, phiContext: {}, call })
  const r = await Promise.allSettled([b.add({ message: 'a' }), b.add({ message: 'b' }), b.add({ message: 'c' })])
  assert.deepEqual(r.map((x) => x.status), ['fulfilled', 'fulfilled', 'rejected'])
})

test('usage limit: no exec (it would fail the same way); partial answers kept; the batcher stops the subscription', async () => {
  const seen = []
  const call = (o) => subscriptionCall(o, { app: appFails('rate_limited', new Map([['i1', 'billing']])), exec: execStub(seen), brk: new Breaker() })
  const b = new CodexBatcher({ system: 's', reminder: 'r', labelNames, multi: false, phiContext: {}, call })
  const r = await Promise.allSettled([b.add({ message: 'a' }), b.add({ message: 'b' })])
  assert.equal(r[0].status, 'fulfilled')
  assert.equal(r[0].value, 'billing')
  assert.equal(r[1].status, 'rejected')
  assert.equal(r[1].reason.kind, 'rate_limited')
  assert.ok(b.broken)
  assert.deepEqual(seen, [])
})

test('logged out: exec only if `codex login status` still says ChatGPT', async () => {
  const seen = []
  const ok = await subscriptionCall(base(2), { app: appFails('not_logged_in'), exec: execStub(seen), status: () => ({ available: true }), brk: new Breaker() })
  assert.equal(ok.size, 2)
  assert.deepEqual(seen, [['i1', 'i2']])
  await assert.rejects(subscriptionCall(base(2), { app: appFails('not_logged_in'), exec: execStub(seen), status: () => ({ available: false }), brk: new Breaker() }), (e) => e.kind === 'not_logged_in')
  assert.equal(seen.length, 1)
})

test('CLASSIFIER_CODEX_ENGINE=exec skips the app-server entirely', async () => {
  process.env.CLASSIFIER_CODEX_ENGINE = 'exec'
  try {
    const seen = []
    await subscriptionCall(base(2), { app: () => assert.fail('app'), exec: execStub(seen), brk: new Breaker() })
    assert.equal(seen.length, 1)
  } finally {
    delete process.env.CLASSIFIER_CODEX_ENGINE
  }
})

test('circuit breaker: opens after 3 failures, skips the app, probes once after the cooldown, closes on success', async () => {
  let t = 0
  const brk = new Breaker({ threshold: 3, baseMs: 1000, now: () => t })
  let appCalls = 0
  let fail = true
  const app = async (o) => {
    appCalls++
    if (fail) throw new SubscriptionError('x', 'server_down')
    return new Map(o.entries.map((e) => [e.key, 'billing']))
  }
  const seen = []
  for (let i = 0; i < 5; i++) await subscriptionCall(base(1), { app, exec: execStub(seen), brk })
  assert.equal(appCalls, 3)
  assert.equal(brk.state, 'open')
  assert.equal(seen.length, 5)
  t = 1500 // past the cooldown: one probe, fails, cooldown doubles
  await subscriptionCall(base(1), { app, exec: execStub(seen), brk })
  assert.equal(appCalls, 4)
  t = 2500 // within the doubled cooldown (2 s from 1500)
  await subscriptionCall(base(1), { app, exec: execStub(seen), brk })
  assert.equal(appCalls, 4)
  t = 4000
  fail = false
  const a = await subscriptionCall(base(1), { app, exec: execStub(seen), brk })
  assert.equal(a.get('i1'), 'billing')
  assert.equal(brk.state, 'closed')
  // A refused health check opens it at once.
  brk.failure('unhealthy')
  assert.equal(brk.state, 'open')
})

test('exactly once: 60 items through the batcher with the app crashing every other batch', async () => {
  let n = 0
  const app = async (o) => {
    if (n++ % 2) throw Object.assign(new SubscriptionError('x', 'server_down'), { partial: new Map([[o.entries[0].key, 'billing']]) })
    return new Map(o.entries.map((e) => [e.key, 'billing']))
  }
  const answered = new Map()
  const exec = async (o) => {
    for (const e of o.entries) answered.set(e.key, (answered.get(e.key) || 0) + 1)
    return new Map(o.entries.map((e) => [e.key, 'scheduling']))
  }
  const brk = new Breaker({ threshold: 1000 })
  const b = new CodexBatcher({ system: 's', reminder: 'r', labelNames, multi: false, phiContext: {}, call: (o) => subscriptionCall(o, { app, exec, brk }) })
  const r = await Promise.all(Array.from({ length: 60 }, (_, i) => b.add({ message: `m${i}` })))
  assert.equal(r.length, 60)
  assert.ok(r.every((x) => x === 'billing' || x === 'scheduling'))
  assert.ok([...answered.values()].every((c) => c === 1))
})

test('cleanup: a turn in flight when the pool closes fails cleanly and leaves no process', async () => {
  resetAppState()
  const p = poolFor('hang')
  const pending = codexAppCall(base(2, { getPool: p.getPool })).catch((e) => e)
  await new Promise((r) => setTimeout(r, 300))
  await p.pool.close()
  const e = await pending
  assert.ok(e instanceof SubscriptionError)
  assert.deepEqual(await waitGone(p.pids()), [])
})

test('cleanup: the server exits when its parent dies (stdin closes)', async () => {
  const f = fakeBin('ok')
  // A parent that starts a server and is then SIGKILLed: no exit hook runs.
  const lib = new URL('../src/lib/codex-app.mjs', import.meta.url).href
  const script = `const { AppServer } = await import(${JSON.stringify(lib)}); const s = new AppServer({ bin: ${JSON.stringify(f.bin)} }); await s.start(); process.stdout.write('up\\n'); setInterval(() => {}, 1000)`
  const { spawn } = await import('node:child_process')
  const parent = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'inherit'] })
  await new Promise((res) => parent.stdout.once('data', res))
  const pids = f.pids()
  assert.ok(pids.length >= 1 && pids.some(alive))
  parent.kill('SIGKILL')
  assert.deepEqual(await waitGone(pids, 5000), [])
})

test('no orphans across this file', () => {
  const ps = execFileSync('/bin/ps', ['-axo', 'command='], { encoding: 'utf8' })
  assert.equal(ps.split('\n').filter((l) => l.includes('fake-app-server.mjs') && l.includes(scratch)).length, 0)
})
