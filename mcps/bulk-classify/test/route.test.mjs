// Routing between the API key and the ChatGPT subscription (offline; no API
// calls, no real Codex). Every PHI signal must force the API key, and the
// subscription engine must refuse PHI work even when called directly.
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const home = realpathSync(mkdtempSync(join(tmpdir(), 'classifier-route-')))
process.env.CLASSIFIER_REAL_HOME = home
process.env.CLASSIFIER_JOBS_DIR = join(home, 'state', 'jobs')
process.env.CLASSIFIER_PROFILES_DIR = join(home, 'state', 'profiles')
const harness = join(home, '.zdr-harness')
mkdirSync(join(harness, 'exports'), { recursive: true })
mkdirSync(join(harness, 'home'), { recursive: true })
writeFileSync(join(harness, 'exports', 'qx_00000001.jsonl'), '{"text":"x"}\n')

const { decideRoute, phiReasons, assertNoPhi, PhiRefusal, describeRoute } = await import('../src/lib/route.mjs')
const { codexCall, CodexBatcher, parseLoginStatus, subscriptionStatus, resetSubscriptionStatus, SubscriptionError } = await import('../src/lib/codex.mjs')

// A clean environment, process list and subscription for the baseline.
const cleanEnv = { HOME: home, PATH: '/usr/bin:/bin', TMPDIR: tmpdir(), LANG: 'en_US.UTF-8' }
const cleanPs = () => `${process.pid} 1 /usr/local/bin/node server.mjs\n`
const available = () => ({ available: true, why: 'Codex is logged in with ChatGPT' })
const route = (ctx = {}, status = available) => {
  let asked = 0
  const r = decideRoute({ env: cleanEnv, ps: cleanPs, ...ctx }, { subscriptionStatus: () => (asked++, status()) })
  return { ...r, asked }
}

test('baseline: no signal routes to the subscription', () => {
  const r = route()
  assert.equal(r.route, 'subscription')
  assert.equal(r.engine, 'codex')
  assert.equal(r.phi, false)
  assert.match(describeRoute(r), /ChatGPT subscription/)
})

// Every PHI signal, one at a time. Each must route `api`, mark PHI, and never
// even ask whether the subscription is available.
const outside = join(home, 'data', 'in.jsonl')
mkdirSync(join(home, 'data'), { recursive: true })
writeFileSync(outside, '{"text":"x"}\n')
const link = join(home, 'data', 'innocent.jsonl')
symlinkSync(join(harness, 'exports', 'qx_00000001.jsonl'), link)
const linkedDir = join(home, 'linked-harness')
symlinkSync(harness, linkedDir)

const signals = {
  'launcher scope zdr': { env: { ...cleanEnv, CLASSIFIER_SCOPE: 'zdr', CLASSIFIER_ENV_CHECKED: '1' } },
  'HOME is the harness home': { env: { ...cleanEnv, HOME: join(harness, 'home') } },
  'harness env name (ZDR_HARNESS_DB_MCP)': { env: { ...cleanEnv, ZDR_HARNESS_DB_MCP: '/x' } },
  'harness env name (KICKOFF_ZDR_DB_URL)': { env: { ...cleanEnv, KICKOFF_ZDR_DB_URL: '' } },
  'harness env name (OPENCODE_CONFIG)': { env: { ...cleanEnv, OPENCODE_CONFIG: '/x/opencode.json' } },
  'env value pointing into the harness (XDG_DATA_HOME)': { env: { ...cleanEnv, XDG_DATA_HOME: join(harness, 'xdg', 'data') } },
  'launcher-reported env signal': { env: { ...cleanEnv, CLASSIFIER_SCOPE: 'local', CLASSIFIER_ENV_CHECKED: '1', CLASSIFIER_ENV_SIGNALS: 'ZDR_HARNESS_CLASSIFIER_MCP' } },
  'launched without the env check (fail closed)': { env: { ...cleanEnv, CLASSIFIER_SCOPE: 'local' } },
  'unknown scope value (fail closed)': { env: { ...cleanEnv, CLASSIFIER_SCOPE: 'weird', CLASSIFIER_ENV_CHECKED: '1' } },
  'explicit CLASSIFIER_PHI': { env: { ...cleanEnv, CLASSIFIER_PHI: '1' } },
  'explicit phi flag on the call': { args: { phi: true } },
  'explicit zdr flag on the call': { args: { zdr: true } },
  'input file in harness exports': { paths: [['input file', join(harness, 'exports', 'qx_00000001.jsonl')]] },
  'input file symlinked into the harness': { paths: [['input file', link]] },
  'input via a symlinked harness directory': { paths: [['input file', join(linkedDir, 'exports', 'qx_00000001.jsonl')]] },
  'output file in the harness (not yet existing)': { paths: [['output file', join(harness, 'out', 'new.jsonl')]] },
  'job directory in the harness': { paths: [['job directory', join(harness, 'classifier', 'jobs', 'cls_00000001')]] },
  'relative path (cannot evaluate)': { paths: [['input file', 'relative/in.jsonl']] },
  'ancestor process from the harness': { ps: () => `${process.pid} 500 node server.mjs\n500 400 /bin/bash launch\n400 1 ${harness}/opt/node_modules/opencode-ai/bin/opencode.exe serve\n` },
  'ancestor zdr-harness script': { ps: () => `${process.pid} 500 node server.mjs\n500 1 /bin/bash /x/apps/zdr-agent/bin/zdr-harness serve\n` },
  'ps fails (fail closed)': { ps: () => { throw new Error('no ps') } },
  'this process missing from ps (fail closed)': { ps: () => '1 0 launchd\n' },
  'job created in zdr scope': { job: { scope: 'zdr', route: { route: 'subscription', phi: false }, spec: {} } },
  'job routed as PHI': { job: { scope: 'local', route: { route: 'api', phi: true }, spec: {} } },
  'job started with phi flag': { job: { scope: 'local', route: { route: 'subscription', phi: false }, spec: { phi: true } } },
  'job with no routing record (fail closed)': { job: { scope: 'local', spec: {} } },
  'profile used in zdr scope': { profile: { name: 'p', scopes: ['local', 'zdr'] } },
  'profile saved before routing (fail closed)': { profile: { name: 'p' } },
  'profile with unknown history marker': { profile: { name: 'p', scopes: ['unknown', 'local'] } },
}
for (const [name, ctx] of Object.entries(signals)) {
  test(`PHI signal forces the API key: ${name}`, () => {
    const r = route(ctx)
    assert.equal(r.route, 'api', JSON.stringify(r.reasons))
    assert.equal(r.phi, true)
    assert.ok(r.reasons.length)
    assert.equal(r.asked, 0, 'the subscription must not even be probed for PHI work')
    // Nothing overrides it: not an explicit request, not CLASSIFIER_ROUTE.
    const forced = route({ ...ctx, args: { ...(ctx.args || {}), engine: 'subscription' }, env: { ...(ctx.env || cleanEnv), CLASSIFIER_ROUTE: 'subscription' } })
    assert.equal(forced.route, 'api')
  })
}

test('a clean input outside the harness does not count as a signal', () => {
  assert.equal(route({ paths: [['input file', outside], ['output file', join(home, 'data', 'new-out.jsonl')]] }).route, 'subscription')
  assert.deepEqual(phiReasons({ env: cleanEnv, ps: cleanPs, paths: [['input file', outside]] }), [])
})

test('the service key name and CLASSIFIER_* settings are not signals', () => {
  assert.equal(route({ env: { ...cleanEnv, KICKOFF_OPENAI_ZDR_API_KEY: 'x', CLASSIFIER_OPENAI_KEY: 'x', CLASSIFIER_SCOPE: 'local', CLASSIFIER_ENV_CHECKED: '1' } }).route, 'subscription')
})

test('non-PHI work falls back to the API key when the subscription is unavailable', () => {
  const r = route({}, () => ({ available: false, why: 'Codex is not logged in' }))
  assert.equal(r.route, 'api')
  assert.equal(r.phi, false)
  assert.match(r.reasons[0], /not logged in/)
  assert.equal(route({ env: { ...cleanEnv, CLASSIFIER_ROUTE: 'api' } }).route, 'api')
  assert.equal(route({}, () => { throw new Error('boom') }).route, 'api')
})

test('CLASSIFIER_STAGE2=chat rolls the API engine back to chat completions', () => {
  const r = route({ args: { phi: true }, env: { ...cleanEnv, CLASSIFIER_STAGE2: 'chat' } })
  assert.equal(r.engine, 'chat')
  assert.equal(route({ args: { phi: true } }).engine, 'decisions')
})

test('codex login status: only a ChatGPT login is the subscription', () => {
  assert.equal(parseLoginStatus('Logged in using ChatGPT').available, true)
  assert.equal(parseLoginStatus('Logged in using an API key - sk-...').available, false)
  assert.equal(parseLoginStatus('Not logged in').available, false)
  assert.equal(parseLoginStatus('').available, false)
  resetSubscriptionStatus()
  assert.equal(subscriptionStatus({ run: () => { throw new Error('no codex') } }).available, false)
  resetSubscriptionStatus()
})

// A fake codex binary that records being run; it must never run for PHI work.
const bin = join(home, 'fake-codex')
const marker = join(home, 'codex-ran')
writeFileSync(
  bin,
  `#!/bin/sh
touch "${marker}"
env | cut -d= -f1 > "${marker}.env"
out=""
prev=""
for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done
cat > /dev/null
printf '%s' '{"answers":[{"key":"i1","label":"billing"}]}' > "$out"
echo '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":2}}'
`
)
chmodSync(bin, 0o755)
process.env.CLASSIFIER_CODEX_BIN = bin

const callArgs = { system: 'sys', reminder: 'r', labelNames: ['billing', 'scheduling'], multi: false, entries: [{ key: 'i1', message: 'charged twice' }] }

test('the subscription engine refuses in zdr scope even when called directly', async () => {
  const saved = { ...process.env }
  try {
    process.env.CLASSIFIER_SCOPE = 'zdr'
    process.env.CLASSIFIER_ENV_CHECKED = '1'
    await assert.rejects(codexCall({ ...callArgs, phiContext: { ps: cleanPs } }), (e) => e instanceof PhiRefusal && /scope: zdr/.test(e.message))
    assert.equal(existsSync(marker), false, 'codex must not have been spawned')
    process.env.CLASSIFIER_SCOPE = 'local'
    process.env.HOME = join(harness, 'home')
    await assert.rejects(codexCall({ ...callArgs, phiContext: { ps: cleanPs } }), PhiRefusal)
    assert.equal(existsSync(marker), false)
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]
    Object.assign(process.env, saved)
  }
})

test('the subscription engine refuses for a PHI path or job passed by its caller', async () => {
  await assert.rejects(codexCall({ ...callArgs, phiContext: { ps: cleanPs, paths: [['input file', link]] } }), PhiRefusal)
  await assert.rejects(codexCall({ ...callArgs, phiContext: { ps: cleanPs, job: { scope: 'zdr', route: { route: 'subscription' }, spec: {} } } }), PhiRefusal)
  assert.throws(() => assertNoPhi({ ps: cleanPs, args: { phi: true } }), PhiRefusal)
  assert.equal(existsSync(marker), false)
})

test('the subscription engine runs Codex for clean work, with a minimal environment', async () => {
  const usage = {}
  const answers = await codexCall({ ...callArgs, phiContext: { ps: cleanPs }, usage })
  assert.equal(answers.get('i1'), 'billing')
  assert.equal(existsSync(marker), true)
  assert.equal(usage.codex_calls, 1)
  assert.equal(usage.codex_input_tokens, 10)
  const names = (await import('node:fs')).readFileSync(`${marker}.env`, 'utf8').split('\n').filter(Boolean).sort()
  assert.deepEqual(names.filter((n) => !['PWD', 'SHLVL', '_', 'OLDPWD'].includes(n)), ['HOME', 'LANG', 'PATH', 'TMPDIR'])
})

test('a broken subscription rejects later entries at once (for the API fallback)', async () => {
  let calls = 0
  const b = new CodexBatcher({ ...callArgs, call: async () => (calls++, Promise.reject(new SubscriptionError('limit', 'rate_limited'))) })
  await assert.rejects(b.add({ message: 'a' }), (e) => e.kind === 'rate_limited')
  await assert.rejects(b.add({ message: 'b' }), (e) => e.kind === 'rate_limited')
  assert.equal(calls, 1)
})
