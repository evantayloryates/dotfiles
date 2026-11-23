// Codex MCP lockdown: Taylor's MCP servers are disabled by name in every
// Codex process, and a Codex call that starts any other process (an MCP
// server) ends subscription use for the run.
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'

const { configuredMcpServers, disableArgs, unexpectedDescendants } = await import('../src/lib/codex-lockdown.mjs')
const { codexCall, CodexBatcher, SubscriptionError, FATAL_KINDS } = await import('../src/lib/codex.mjs')

const CONFIG = `model = "x"
[mcp_servers.gmail_personal_primary]
command = "/x/run"
[mcp_servers.computer-use]
args = ["a"]
[mcp_servers.node_repl]
command = "node"
[mcp_servers.node_repl.env]
TOKEN = "secret-value-never-read"
[mcp_servers."quoted-name"]
url = "https://x"
[profiles.fast]
model = "y"
`

test('server names come from config tables only (never values), subtables skipped', () => {
  const r = configuredMcpServers(CONFIG)
  assert.deepEqual(r.names.sort(), ['computer-use', 'gmail_personal_primary', 'node_repl', 'quoted-name'])
  assert.equal(r.odd, false)
  assert.ok(!JSON.stringify(r).includes('secret'))
  assert.deepEqual(disableArgs(['a', 'b-c']), ['-c', 'mcp_servers.a.enabled=false', '-c', 'mcp_servers.b-c.enabled=false'])
  assert.equal(configuredMcpServers('[mcp_servers."has.dot"]\n').odd, true, 'a name that cannot be a bare key is odd')
  assert.equal(configuredMcpServers('mcp_servers = { a = {} }\n').odd, true, 'inline table is odd')
  assert.deepEqual(configuredMcpServers('').names, [])
})

test('process watch: exact full paths only; nested codex, renamed binaries, shells, node are unexpected; ps failing is unsafe', async () => {
  const { GIT_PATHS } = await import('../src/lib/codex-lockdown.mjs')
  const git = [...GIT_PATHS].find((p) => p.endsWith('/git')) || '/usr/bin/git'
  const ps = () => ['100 1 100 /x/codex', `101 100 100 ${git}`, '102 100 100 /tmp/evil/git', '103 100 100 /Users/x/.local/bin/codex', '104 103 100 node', '105 1 100 /opt/mcp/server', '106 999 999 python3', '107 100 100 <defunct>', '108 100 100 /bin/zsh'].join('\n')
  const bad = unexpectedDescendants(100, { ps, allow: GIT_PATHS }).sort()
  assert.deepEqual(bad, ['/Users/x/.local/bin/codex', '/bin/zsh', '/opt/mcp/server', '/tmp/evil/git', 'node'].sort(), 'only the real git by full path passes; the orphan (same process group) is seen')
  assert.deepEqual(unexpectedDescendants(100, { ps: () => `100 1 100 /x/codex\n101 100 100 ${git}\n` }), [git], 'codex exec allows nothing, not even git')
  assert.deepEqual(unexpectedDescendants(100, { ps: () => { throw new Error('no ps') } }), ['(process list unreadable)'])
  // bare names (git runs helpers that way) are judged by the kernel's executable path
  const bareGit = () => `100 1 100 /x/codex\n201 100 100 git\n202 100 100 git-remote-http\n203 100 100 git\n`
  const exe = (p) => (p === 201 ? `p201\nftxt\nn${git}\n` : p === 202 ? `p202\nftxt\nn/tmp/evil/git-remote-http\n` : '')
  assert.deepEqual(unexpectedDescendants(100, { ps: bareGit, allow: GIT_PATHS, exe }).sort(), ['/tmp/evil/git-remote-http', 'git'].sort(), 'real git passes; a fake one and an unreadable one do not')
})

test('the watch runs for the whole life of the child, not at fixed moments', async () => {
  const { watchTree } = await import('../src/lib/codex-lockdown.mjs')
  let n = 0
  const ps = () => (++n < 8 ? '500 1 500 /x/codex\n' : '500 1 500 /x/codex\n501 500 500 /opt/late/mcp\n') // appears late
  let hit = null
  const w = watchTree(500, { ps, intervalMs: 5, onBad: (b) => (hit = b) })
  await new Promise((r) => setTimeout(r, 200))
  w.stop()
  assert.deepEqual(hit, ['/opt/late/mcp'])
  // and the final fresh check sees what is left at exit
  let m = 0
  const w2 = watchTree(600, { ps: () => '600 1 600 /x/codex\n601 1 600 /opt/orphan\n', intervalMs: 10_000 })
  assert.deepEqual(w2.check(true), ['/opt/orphan'])
  w2.stop()
})

function fakeSpawn(record) {
  return (bin, args, opts) => {
    record.args = args
    record.opts = opts
    const c = new EventEmitter()
    c.pid = 999999 // above macOS's pid range: process.kill(-pid) can never reach a real group
    c.stdout = new EventEmitter()
    c.stderr = new EventEmitter()
    c.stdin = Object.assign(new EventEmitter(), { end: () => {} })
    c.kill = () => setImmediate(() => c.emit('close', null, 'SIGTERM'))
    return c
  }
}
const base = { system: 's', reminder: 'r', labelNames: ['a'], multi: false, entries: [{ key: 'i1', message: 'x' }], phiContext: { env: { HOME: '/tmp', PATH: '/usr/bin:/bin' }, ps: () => `${process.pid} 1 node\n` } }

test('a Codex call that starts an MCP server is killed and ends subscription use (unsafe, fatal)', async () => {
  const rec = {}
  const ps = () => `999999 ${process.pid} 999999 /x/codex\n4243 999999 999999 /opt/homebrew/bin/node\n`
  await assert.rejects(codexCall({ ...base, spawnFn: fakeSpawn(rec), psFn: ps, watchIntervalMs: 5 }), (e) => e instanceof SubscriptionError && e.kind === 'unsafe')
  assert.ok(FATAL_KINDS.has('unsafe'))
  assert.equal(rec.opts.detached, true, 'own process group')
  assert.ok(rec.args.includes('--ignore-user-config'), 'config.toml (and its MCP servers) kept out of codex exec')
  assert.ok(!rec.args.some((a) => /^mcp_servers\./.test(a)), 'no per-name overrides on exec: with the config ignored they break the CLI')
  assert.ok(rec.args.join(' ').includes('--disable shell_snapshot'), 'no login shell (and its rc files) under Codex')
  let calls = 0
  const b = new CodexBatcher({ ...base, call: async () => (calls++, Promise.reject(new SubscriptionError('mcp', 'unsafe'))) })
  await assert.rejects(b.add({ message: 'a' }))
  await assert.rejects(b.add({ message: 'b' }))
  assert.equal(calls, 1, 'no retry, no second call')
})

test('a process left behind when Codex exits voids the answer (final check)', async () => {
  const rec = {}
  let exited = false
  const spawnFn = (bin, args, opts) => {
    const c = fakeSpawn(rec)(bin, args, opts)
    c.stdin.end = () => setTimeout(() => ((exited = true), c.emit('close', 0, null)), 20)
    return c
  }
  const ps = () => (exited ? `4300 1 999999 /opt/orphan-mcp\n` : `999999 ${process.pid} 999999 /x/codex\n`)
  await assert.rejects(codexCall({ ...base, spawnFn, psFn: ps, watchIntervalMs: 10_000 }), (e) => e.kind === 'unsafe')
})

test('live Codex process groups are tracked and released, so they are signalled if this process exits', async () => {
  const { liveGroupCount } = await import('../src/lib/codex-lockdown.mjs')
  const before = liveGroupCount()
  const rec = {}
  let seen = null
  const spawnFn = (bin, args, opts) => {
    const c = fakeSpawn(rec)(bin, args, opts)
    c.stdin.end = () => setTimeout(() => ((seen = liveGroupCount()), c.emit('close', 0, null)), 10)
    return c
  }
  await assert.rejects(codexCall({ ...base, spawnFn, psFn: () => `999999 ${process.pid} 999999 /x/codex\n`, watchIntervalMs: 10_000 }))
  assert.equal(seen, before + 1, 'tracked while running')
  assert.equal(liveGroupCount(), before, 'released at close')
  // and a real child left running is killed with its group when the process exits
  const out = (await import('node:child_process')).spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { spawn } from 'node:child_process'
    import { trackGroup } from ${JSON.stringify(new URL('../src/lib/codex-lockdown.mjs', import.meta.url).pathname)}
    const c = spawn('/bin/sleep', ['30'], { detached: true, stdio: 'ignore' })
    trackGroup(c.pid)
    console.log(c.pid)
    process.exit(0)`], { encoding: 'utf8' })
  const pid = Number(out.stdout.trim())
  await new Promise((r) => setTimeout(r, 200))
  let alive = true
  try {
    process.kill(pid, 0)
  } catch {
    alive = false
  }
  assert.equal(alive, false, 'the detached group was signalled on exit')
})

test('the MCP server exits through its exit hook on SIGTERM, SIGHUP and SIGINT', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../src/server.mjs', import.meta.url), 'utf8')
  assert.match(src, /for \(const sig of \['SIGTERM', 'SIGHUP', 'SIGINT'\]\) process\.on\(sig, \(\) => process\.exit\(0\)\)/)
  // and process.exit from a signal handler does run the group-kill hook
  const out = (await import('node:child_process')).spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { spawn } from 'node:child_process'
    import { trackGroup } from ${JSON.stringify(new URL('../src/lib/codex-lockdown.mjs', import.meta.url).pathname)}
    const c = spawn('/bin/sleep', ['30'], { detached: true, stdio: 'ignore' })
    trackGroup(c.pid)
    process.on('SIGTERM', () => process.exit(0))
    console.log(c.pid)
    setTimeout(() => process.kill(process.pid, 'SIGTERM'), 50)
    setTimeout(() => {}, 5000)`], { encoding: 'utf8', timeout: 10_000 })
  const pid = Number(out.stdout.trim())
  await new Promise((r) => setTimeout(r, 200))
  let alive = true
  try {
    process.kill(pid, 0)
  } catch {
    alive = false
  }
  assert.equal(alive, false)
})
