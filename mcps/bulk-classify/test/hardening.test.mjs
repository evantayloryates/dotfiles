// Adversarial routing tests (offline: no API calls, no real Codex). They run
// the real launcher (src/launch, under /bin/bash like the harness) against a
// fake home that has its own .zdr-harness, a dummy key file and a fake codex
// that records every run. The rule under test: any tie to the ZDR harness
// routes to the API key, the subscription is never even probed for it, and
// nothing a caller passes can turn that off.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const LAUNCH = join(HERE, '..', 'src', 'launch')
const RUN = join(HERE, '..', '..', '_shared', 'bin', 'run')
const REPO = realpathSync(join(HERE, '..', '..', '..'))
const HARNESS_SCRIPT = join(REPO, 'apps', 'zdr-agent', 'bin', 'zdr-harness')
const OPENCODE_JSON = join(REPO, 'apps', 'zdr-agent', 'opencode', 'opencode.json')

const root = realpathSync(mkdtempSync(join(tmpdir(), 'classifier-harden-')))
const ZH = join(root, '.zdr-harness')
for (const d of ['home', 'work', 'tmp', 'exports', 'xdg/config', 'xdg/data', 'xdg/cache', 'xdg/state', 'opt/node_modules/.bin']) mkdirSync(join(ZH, d), { recursive: true })
writeFileSync(join(ZH, '.env'), 'KICKOFF_OPENAI_ZDR_API_KEY=test-key-not-real\n', { mode: 0o600 })
const marker = join(root, 'codex-ran.log')
mkdirSync(join(root, '.local', 'bin'), { recursive: true })
writeFileSync(
  join(root, '.local', 'bin', 'codex'),
  `#!/bin/sh
echo "$*" >> "${marker}"
case "$1" in login) echo "Logged in using ChatGPT"; exit 0;; esac
cat > /dev/null
exit 3
`
)
chmodSync(join(root, '.local', 'bin', 'codex'), 0o755)
mkdirSync(join(root, 'data'), { recursive: true })
const codexRuns = () => (existsSync(marker) ? readFileSync(marker, 'utf8').split('\n').filter(Boolean).length : 0)

const base = { HOME: root, PATH: '/usr/bin:/bin', TMPDIR: join(root, 'data'), LANG: 'en_US.UTF-8' }
// The worktree may carry a symlinked secrets file; the launcher prefers it.
// Routing never needs the key, so either works.
function route(env, { cwd = join(root, 'data'), args = [], via = 'launch' } = {}) {
  const cmd = via === 'run' ? [RUN, 'bulk-classify', 'default', 'cli', 'route', '--json', ...args] : [LAUNCH, 'cli', 'route', '--json', ...args]
  const r = spawnSync('/bin/bash', cmd, { env, cwd, encoding: 'utf8', timeout: 30_000 })
  assert.equal(r.status, 0, `launcher failed: ${(r.stderr || '').slice(0, 300)}`)
  return JSON.parse(r.stdout)
}
function assertPhi(env, opts, code) {
  const before = codexRuns()
  const r = route(env, opts)
  assert.equal(r.route, 'api', JSON.stringify(r.codes))
  assert.equal(r.phi, true, JSON.stringify(r.codes))
  if (code) assert.ok(r.codes.includes(code), `expected ${code} in ${JSON.stringify(r.codes)}`)
  assert.equal(codexRuns(), before, 'codex must not even be probed for PHI work')
  return r
}

test('launcher baseline: a clean caller routes to the subscription', () => {
  const r = route(base)
  assert.equal(r.scope, 'local')
  assert.equal(r.route, 'subscription', JSON.stringify(r.reasons))
  assert.deepEqual(r.codes, ['clear'])
})

test('launcher: HOME tricks still mean the harness (exact, trailing slash, .., symlink)', () => {
  const link = join(root, 'innocent-home')
  symlinkSync(join(ZH, 'home'), link)
  for (const home of [join(ZH, 'home'), `${join(ZH, 'home')}/`, join(ZH, 'home', '..', 'home'), link]) {
    const r = assertPhi({ ...base, HOME: home })
    assert.equal(r.scope, 'zdr', `HOME variant ${home.replace(root, '<root>')} must be the zdr scope`)
  }
})

test('launcher: harness environment names, any case, and values that resolve into the harness', () => {
  const linkDir = join(root, 'xdg-link')
  symlinkSync(join(ZH, 'xdg', 'data'), linkDir)
  const cases = [
    [{ ZDR_HARNESS_CLASSIFIER_MCP: LAUNCH }, 'env_caller'],
    [{ KICKOFF_ZDR_DB_URL: '' }, 'env_caller'],
    [{ zdr_memory_dir: '/x' }, 'env_caller'],
    [{ OPENCODE_CONFIG: '/x/opencode.json' }, 'env_caller'],
    [{ Opencode_Server_Username: 'opencode' }, 'env_caller'],
    [{ XDG_DATA_HOME: join(ZH, 'xdg', 'data') }, 'env_caller'],
    [{ SOME_DIR: '~/.zdr-harness/work' }, 'env_caller'],
    [{ XDG_DATA_HOME: linkDir }, 'env_caller'],
    [{ PWD_HINT: `${linkDir}/../cache` }, 'env_caller'],
  ]
  for (const [extra, code] of cases) assertPhi({ ...base, ...extra }, {}, code)
})

test('launcher: a caller cannot switch PHI off (scope, phi, route, env-check overrides)', () => {
  const overrides = { CLASSIFIER_SCOPE: 'local', CLASSIFIER_PHI: '0', CLASSIFIER_ROUTE: 'subscription', CLASSIFIER_ENV_CHECKED: '1', CLASSIFIER_ENV_SIGNALS: '', CLASSIFIER_REAL_HOME: join(root, 'data') }
  const r = assertPhi({ ...base, ...overrides, HOME: join(ZH, 'home') }, {}, 'scope_zdr')
  assert.equal(r.scope, 'zdr')
  // and from an env-signalled (not HOME) caller
  assertPhi({ ...base, ...overrides, OPENCODE_CONFIG: '/x' }, {}, 'env_caller')
})

test('launcher: a working directory inside the harness, directly or through a symlink', () => {
  const link = join(root, 'work-link')
  symlinkSync(join(ZH, 'work'), link)
  assertPhi(base, { cwd: join(ZH, 'work') }, 'path_harness')
  assertPhi({ ...base, PWD: link }, { cwd: link }, 'path_harness')
})

test('launcher: TMPDIR or a jobs/profiles store inside the harness', () => {
  assertPhi({ ...base, TMPDIR: join(ZH, 'tmp') }, {}, 'env_caller')
  assertPhi({ ...base, CLASSIFIER_JOBS_DIR: join(ZH, 'classifier', 'jobs') }, {}, 'path_harness')
  assertPhi({ ...base, CLASSIFIER_PROFILES_DIR: join(ZH, 'profiles') }, {}, 'path_harness')
})

test('launcher: input and output files inside the harness (direct, symlinked, relative with ..)', () => {
  writeFileSync(join(ZH, 'exports', 'qx_1.jsonl'), '{"text":"synthetic"}\n')
  symlinkSync(join(ZH, 'exports', 'qx_1.jsonl'), join(root, 'data', 'innocent.jsonl'))
  assertPhi(base, { args: ['--input', join(ZH, 'exports', 'qx_1.jsonl')] }, 'path_harness')
  assertPhi(base, { args: ['--input', join(root, 'data', 'innocent.jsonl')] }, 'path_harness')
  assertPhi(base, { args: ['--input', '../.zdr-harness/exports/qx_1.jsonl'] }, 'path_harness')
  assertPhi(base, { args: ['--output', join(ZH, 'exports', 'new-out.jsonl')] }, 'path_harness')
})

test('in-process paths: symlink then .. resolves like the kernel, dangling links are followed', async () => {
  const { physicalPath, pathSignal } = await import('../src/lib/route.mjs')
  const lk = join(root, 'data', 'to-exports')
  symlinkSync(join(ZH, 'exports'), lk)
  const tricky = `${lk}/../exports/qx_1.jsonl` // kernel: ZH/exports/qx_1.jsonl; lexical: root/data/exports/qx_1.jsonl
  assert.equal(physicalPath(tricky), join(ZH, 'exports', 'qx_1.jsonl'))
  assert.equal(pathSignal([['input file', tricky]])[0]?.code, 'path_harness')
  const dangling = join(root, 'data', 'dangling.jsonl')
  symlinkSync(join(ZH, 'work', 'not-yet.jsonl'), dangling)
  assert.equal(pathSignal([['output file', dangling]])[0]?.code, 'path_harness')
  const relLink = join(root, 'data', 'rel-dangling.jsonl')
  symlinkSync('../.zdr-harness/work/also-not-yet.jsonl', relLink)
  assert.equal(pathSignal([['output file', relLink]])[0]?.code, 'path_harness')
})

test('launcher: --phi forces the API key without probing Codex', () => {
  assertPhi(base, { args: ['--phi'] }, 'explicit_flag')
})

// The ZDR harness starts the classifier with OpenCode's environment, which is
// built by isolated_env in apps/zdr-agent/bin/zdr-harness. Run that function
// itself (secrets replaced by dummies, ZH pointed at the fake root) and launch
// the classifier the way opencode.json does: the command is
// {env:ZDR_HARNESS_CLASSIFIER_MCP}, with no extra environment.
function harnessReplica(command, { parentArgv0 } = {}) {
  const fn = readFileSync(HARNESS_SCRIPT, 'utf8').match(/^isolated_env\(\) \{[\s\S]*?^\}/m)[0]
  const script = `set -euo pipefail
ZH="${ZH}"
PROJECT_DIR="${REPO}/apps/zdr-agent"
CONFIG_FILE="${OPENCODE_JSON}"
KICKOFF_OPENAI_ZDR_API_KEY=dummy ZDR_HARNESS_PASSWORD=dummy KICKOFF_BUGSNAG_TOKEN=dummy KICKOFF_POSTHOG_TOKEN=dummy
${fn}
cd "$ZH/work"
${parentArgv0 ? `isolated_env /bin/bash -c 'exec -a "$0" /bin/bash -c "\\"\\$ZDR_HARNESS_CLASSIFIER_MCP\\" ${command}; true"' "${parentArgv0}"` : `isolated_env /bin/bash -c '"$ZDR_HARNESS_CLASSIFIER_MCP" ${command}'`}
`
  return spawnSync('/bin/bash', ['-c', script], { encoding: 'utf8', timeout: 30_000, env: { PATH: '/usr/bin:/bin', HOME: root } })
}

test('ZDR harness replica: isolated_env + the opencode.json command routes to the API key', () => {
  const before = codexRuns()
  const r = harnessReplica('cli route --json')
  assert.equal(r.status, 0, (r.stderr || '').slice(0, 300))
  const out = JSON.parse(r.stdout)
  assert.equal(out.scope, 'zdr')
  assert.equal(out.route, 'api')
  assert.equal(out.phi, true)
  for (const code of ['scope_zdr', 'scope_home', 'env_caller', 'path_harness']) assert.ok(out.codes.includes(code), `${code} in ${JSON.stringify(out.codes)}`)
  assert.equal(codexRuns(), before)
})

test('ZDR harness replica under a harness-looking parent process: the process chain is seen too', () => {
  const r = harnessReplica('cli route --json', { parentArgv0: `${ZH}/opt/node_modules/opencode-ai/bin/opencode.exe` })
  assert.equal(r.status, 0, (r.stderr || '').slice(0, 300))
  const out = JSON.parse(r.stdout)
  assert.ok(out.codes.includes('process_harness'), JSON.stringify(out.codes))
})

test('ZDR harness registration: the classifier is launched directly, never through a shared host', () => {
  const cfg = JSON.parse(readFileSync(OPENCODE_JSON, 'utf8'))
  assert.deepEqual(cfg.mcp.classifier.command, ['{env:ZDR_HARNESS_CLASSIFIER_MCP}'])
  assert.equal(cfg.mcp.classifier.environment, undefined)
  for (const [name, m] of Object.entries(cfg.mcp)) {
    const cmd = JSON.stringify(m.command || m.url || '')
    assert.ok(!/anchor|_shared\/bin\/run|bulk-classify/.test(cmd), `harness MCP ${name} must not reach the classifier through a shared host`)
  }
  assert.match(readFileSync(HARNESS_SCRIPT, 'utf8'), /ZDR_HARNESS_CLASSIFIER_MCP="\$\{PROJECT_DIR\}\/\.\.\/\.\.\/mcps\/bulk-classify\/src\/launch"/)
})

test('Claude Code / Codex registration (mcps/_shared/bin/run): clean routes to the subscription, harness env does not', () => {
  assert.equal(route(base, { via: 'run' }).route, 'subscription')
  assertPhi({ ...base, HOME: join(ZH, 'home') }, { via: 'run' }, 'scope_zdr')
  assertPhi({ ...base, OPENCODE_CONFIG: '/x' }, { via: 'run' }, 'env_caller')
})

test('concurrent launches in both scopes never cross', async () => {
  const one = (env) =>
    new Promise((res) => {
      const c = spawn('/bin/bash', [LAUNCH, 'cli', 'route', '--json'], { env, cwd: join(root, 'data') })
      let out = ''
      c.stdout.on('data', (d) => (out += d))
      c.on('close', () => res(JSON.parse(out)))
    })
  const before = codexRuns()
  const runs = await Promise.all(Array.from({ length: 16 }, (_, i) => one(i % 2 ? { ...base, HOME: join(ZH, 'home') } : base)))
  runs.forEach((r, i) => assert.equal(r.route, i % 2 ? 'api' : 'subscription'))
  // only the clean launches may have probed codex (status is cached per process)
  assert.ok(codexRuns() - before <= 8)
})

// ---------------------------------------------------------------------------
// In-process: records, stamps, the Codex engine.

process.env.CLASSIFIER_REAL_HOME = root
process.env.CLASSIFIER_PROFILES_DIR = join(root, 'profiles')
process.env.CLASSIFIER_JOBS_DIR = join(root, 'jobs')
const { decideRoute, phiSignals, PhiRefusal, recordSignal } = await import('../src/lib/route.mjs')
const { stampScope, stampedScopes } = await import('../src/lib/scopes.mjs')
const { codexCall, CodexBatcher, classifyFailure, subscriptionStatus, resetSubscriptionStatus, SubscriptionError } = await import('../src/lib/codex.mjs')
const cleanEnv = { HOME: root, PATH: '/usr/bin:/bin', TMPDIR: join(root, 'data'), LANG: 'en_US.UTF-8' }
const cleanPs = () => `${process.pid} 1 node server.mjs\n`
const ok = () => ({ available: true, why: 'Codex is logged in with ChatGPT' })

test('phi:false (or "false", 0) on the call never overrides another signal', () => {
  for (const phi of [false, 'false', 0, 'no']) {
    const r = decideRoute({ env: { ...cleanEnv, CLASSIFIER_SCOPE: 'zdr', CLASSIFIER_ENV_CHECKED: '1' }, ps: cleanPs, args: { phi, zdr: false, engine: 'subscription' } }, { subscriptionStatus: ok })
    assert.equal(r.route, 'api')
  }
  assert.equal(decideRoute({ env: cleanEnv, ps: cleanPs, args: { phi: false } }, { subscriptionStatus: ok }).route, 'subscription')
})

test('profile stamps: zdr is one-way and survives a lost JSON update', () => {
  const profile = { name: 'race-test', scopes: ['local'] }
  assert.equal(decideRoute({ env: cleanEnv, ps: cleanPs, profile }, { subscriptionStatus: ok }).route, 'subscription')
  stampScope('race-test', 'zdr')
  // A local run that read the JSON before the zdr use writes back scopes
  // ['local'] (the lost update); the stamp file still says zdr.
  const r = decideRoute({ env: cleanEnv, ps: cleanPs, profile: { ...profile, scopes: ['local'] } }, { subscriptionStatus: ok })
  assert.equal(r.route, 'api')
  assert.ok(r.codes.includes('record_profile_zdr'))
  stampScope('race-test', 'local')
  assert.deepEqual(stampedScopes('race-test').sort(), ['local', 'zdr'])
  assert.equal(decideRoute({ env: cleanEnv, ps: cleanPs, profile }, { subscriptionStatus: ok }).route, 'api', 'never downgrades')
  // unreadable stamps fail closed
  assert.ok(recordSignal({ profile, stamps: () => ['unknown'] }).some((s) => s.code === 'record_profile_unknown'))
  assert.ok(recordSignal({ profile: { name: 'old' } }).some((s) => s.code === 'record_profile_unknown'))
})

test('profile stamping: the zdr scope stamps a profile when it is used, and a failed stamp stops the call', async () => {
  const out = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { stampUse } from ${JSON.stringify(join(HERE, '..', 'src', 'lib', 'profiles.mjs'))}
       stampUse('used-in-zdr')
       process.env.CLASSIFIER_PROFILES_DIR = '/dev/null/nope'
       try { stampUse('used-in-zdr'); console.log('NOT REFUSED') } catch (e) { console.log('refused', e.expected === true) }`,
    ],
    { env: { ...cleanEnv, CLASSIFIER_SCOPE: 'zdr', CLASSIFIER_ENV_CHECKED: '1', CLASSIFIER_REAL_HOME: root, CLASSIFIER_PROFILES_DIR: join(root, 'profiles') }, encoding: 'utf8' }
  )
  assert.match(out.stdout, /refused/, out.stderr)
  assert.deepEqual(stampedScopes('used-in-zdr'), ['zdr'])
})

test('a profile stamped zdr mid-job stops the next Codex call (fresh re-check before every spawn)', async () => {
  stampScope('mid-job', 'local')
  const profile = { name: 'mid-job', scopes: ['local'] }
  let spawned = 0
  const fakeSpawn = () => {
    spawned++
    throw new Error('should not spawn')
  }
  const args = { system: 's', reminder: 'r', labelNames: ['a'], multi: false, entries: [{ key: 'i1', message: 'x' }], phiContext: { env: cleanEnv, ps: cleanPs, profile }, spawnFn: fakeSpawn }
  stampScope('mid-job', 'zdr')
  await assert.rejects(codexCall(args), PhiRefusal)
  assert.equal(spawned, 0)
})

test('jobs resumed or continued in the other scope', () => {
  const zdrJob = { scope: 'zdr', route: { route: 'api', phi: true }, spec: {} }
  const localSubJob = { scope: 'local', route: { route: 'subscription', phi: false }, spec: {} }
  // a zdr job reached from a local process (shared jobs store) stays API
  assert.equal(decideRoute({ env: cleanEnv, ps: cleanPs, job: zdrJob }, { subscriptionStatus: ok }).route, 'api')
  // a local subscription job resumed from the zdr scope moves to the API key
  assert.equal(decideRoute({ env: { ...cleanEnv, CLASSIFIER_SCOPE: 'zdr', CLASSIFIER_ENV_CHECKED: '1' }, ps: cleanPs, job: localSubJob }, { subscriptionStatus: ok }).route, 'api')
  // ... or resumed by a worker whose job directory sits in the harness
  assert.equal(decideRoute({ env: cleanEnv, ps: cleanPs, job: localSubJob, paths: [['job directory', join(ZH, 'classifier', 'jobs', 'cls_00000001')]] }, { subscriptionStatus: ok }).route, 'api')
})

test('child processes: the route of a detached worker comes from its job record, not its parents', () => {
  // ps shows the worker re-parented to launchd: nothing in the chain, the record decides.
  const orphanPs = () => `${process.pid} 1 node worker.mjs cls_00000001\n`
  assert.equal(decideRoute({ env: cleanEnv, ps: orphanPs, job: { scope: 'zdr', route: { route: 'subscription' }, spec: {} } }, { subscriptionStatus: ok }).route, 'api')
  assert.equal(decideRoute({ env: cleanEnv, ps: orphanPs, job: { scope: 'local', spec: {} } }, { subscriptionStatus: ok }).route, 'api', 'no routing record = PHI')
})

test('codex failures are classified from the real CLI wording, including stderr', () => {
  assert.equal(classifyFailure("You've hit your usage limit. Upgrade to Plus to continue using Codex", 1), 'rate_limited')
  assert.equal(classifyFailure('stream error: usage_limit_reached', 1), 'rate_limited')
  assert.equal(classifyFailure('workspace_member_credits_depleted', 1), 'rate_limited')
  assert.equal(classifyFailure('codex: no app-installed Codex found. Install or open the ChatGPT app', 127), 'missing')
  assert.equal(classifyFailure('', 127), 'missing')
  assert.equal(classifyFailure('Your access token could not be refreshed; please log in again', 1), 'not_logged_in')
  assert.equal(classifyFailure("The 'gpt-x' model is not supported when using Codex with a ChatGPT account.", 1), 'unsupported')
  assert.equal(classifyFailure('', null), 'timeout')
  assert.equal(classifyFailure('something odd', 1), 'error')
})

function fakeChild({ code = 0, stderr = '', stdout = '' }) {
  return () => {
    const c = new EventEmitter()
    c.stdout = new EventEmitter()
    c.stderr = new EventEmitter()
    c.stdin = Object.assign(new EventEmitter(), { end: () => setImmediate(() => { if (stdout) c.stdout.emit('data', stdout); if (stderr) c.stderr.emit('data', stderr); c.emit('close', code, null) }) })
    c.kill = () => {}
    return c
  }
}

test('codex logged out or over its limit mid-job: fatal, batcher broken, status cache dropped', async () => {
  const base = { system: 's', reminder: 'r', labelNames: ['a'], multi: false, entries: [{ key: 'i1', message: 'x' }], phiContext: { env: cleanEnv, ps: cleanPs } }
  for (const [stderr, code, kind] of [
    ["ERROR: You've hit your usage limit. Visit https://chatgpt.com/settings/usage to purchase more credits", 1, 'rate_limited'],
    ['Error: not logged in. Run codex login', 1, 'not_logged_in'],
    ['codex: no app-installed Codex found.', 127, 'missing'],
  ]) {
    resetSubscriptionStatus()
    let probes = 0
    assert.equal(subscriptionStatus({ run: () => (probes++, 'Logged in using ChatGPT') }).available, true)
    await assert.rejects(codexCall({ ...base, spawnFn: fakeChild({ code, stderr }) }), (e) => e instanceof SubscriptionError && e.kind === kind)
    subscriptionStatus({ run: () => (probes++, 'Not logged in') })
    assert.equal(probes, 2, 'a fatal failure must drop the cached login status')
  }
  // spawn error (binary removed): missing
  await assert.rejects(
    codexCall({
      ...base,
      spawnFn: () => {
        const c = fakeChild({})()
        c.stdin.end = () => setImmediate(() => c.emit('error', Object.assign(new Error('x'), { code: 'ENOENT' })))
        return c
      },
    }),
    (e) => e.kind === 'missing'
  )
  let calls = 0
  const b = new CodexBatcher({ ...base, call: async () => (calls++, Promise.reject(new SubscriptionError('gone', 'missing'))) })
  await assert.rejects(b.add({ message: 'a' }))
  await assert.rejects(b.add({ message: 'b' }))
  assert.equal(calls, 1)
})

test('login status cache follows the monotonic clock: a wall-clock jump cannot stretch it', () => {
  resetSubscriptionStatus()
  let probes = 0
  const run = () => (probes++, 'Logged in using ChatGPT')
  subscriptionStatus({ run, now: 1_000 })
  subscriptionStatus({ run, now: 1_000 + 299_000 })
  assert.equal(probes, 1)
  subscriptionStatus({ run, now: 1_000 + 301_000 })
  assert.equal(probes, 2)
  subscriptionStatus({ run, now: 10 }) // clock went backwards: re-read, never trust
  assert.equal(probes, 3)
  resetSubscriptionStatus()
})

test('partial batch: unanswered items fail alone (for the API fallback), answered ones keep the Codex answer', async () => {
  const b = new CodexBatcher({ system: 's', reminder: 'r', labelNames: ['a', 'b'], multi: false, call: async ({ entries }) => new Map(entries.slice(0, 1).map((e) => [e.key, 'a'])) })
  const [first, second] = await Promise.allSettled([b.add({ message: 'one' }), b.add({ message: 'two' })])
  assert.equal(first.value, 'a')
  assert.equal(second.status, 'rejected')
  assert.equal(second.reason.kind, 'bad_output')
  assert.equal(b.broken, null, 'one bad answer does not end subscription use')
})

test('audit line: codes and counts only, never text, labels or paths', async () => {
  const { auditLine } = await import('../src/lib/audit.mjs')
  const r = decideRoute({ env: { ...cleanEnv, OPENCODE_CONFIG: '/secret/path/opencode.json' }, ps: cleanPs, paths: [['input file', join(ZH, 'exports', 'qx_1.jsonl')]] }, { subscriptionStatus: ok })
  r.fallback = { kind: 'rate_limited', items: 3, fatal: true, reason: 'subscription rate_limited' }
  const line = JSON.stringify(auditLine({ kind: 'job', job: 'cls_00000001', route: r, usage: { codex_calls: 2 }, items: 10 }))
  assert.match(line, /"phi":true/)
  assert.match(line, /"codes":\["env_name","path_harness"\]/)
  assert.ok(!line.includes('/'), 'no paths in an audit line')
  assert.ok(!/opencode\.json|secret|qx_1|exports/.test(line))
})

test('every PHI signal has a code', () => {
  const s = phiSignals({ env: { ...cleanEnv, CLASSIFIER_SCOPE: 'weird', OPENCODE_X: '1' }, ps: () => { throw new Error('x') }, args: { phi: true }, job: { scope: 'zdr', spec: { phi: true } }, profile: { name: 'p' }, paths: [['input file', 'relative']] })
  for (const x of s) assert.match(x.code, /^[a-z_]+$/, x.text)
})

test.after(() => rmSync(root, { recursive: true, force: true }))
