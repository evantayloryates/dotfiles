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

test('process watch: only git is Codex own; shells, node, python are unexpected; ps failing is unsafe', () => {
  const ps = () => ['100 1 /x/codex', '101 100 /bin/zsh', '102 100 (git)', '103 101 node', '104 999 python3', '105 103 uvx'].join('\n')
  assert.deepEqual(unexpectedDescendants(100, { ps }).sort(), ['node', 'uvx', 'zsh'])
  assert.deepEqual(unexpectedDescendants(100, { ps: () => '100 1 codex\n102 100 <defunct>\n103 100 /usr/libexec/git-core/git-remote-https\n104 100 (git)\n' }), [])
  assert.deepEqual(unexpectedDescendants(100, { ps: () => '100 1 codex\n101 100 /bin/bash\n' }), ['bash'], 'an MCP server behind a shell script')
  assert.deepEqual(unexpectedDescendants(100, { ps: () => { throw new Error('no ps') } }), ['(process list unreadable)'])
})

function fakeSpawn(record) {
  return (bin, args) => {
    record.args = args
    const c = new EventEmitter()
    c.pid = 4242
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
  const ps = () => `4242 ${process.pid} codex\n4243 4242 node\n`
  await assert.rejects(codexCall({ ...base, spawnFn: fakeSpawn(rec), psFn: ps, watchMs: [5] }), (e) => e instanceof SubscriptionError && e.kind === 'unsafe')
  assert.ok(FATAL_KINDS.has('unsafe'))
  assert.ok(rec.args.includes('--ignore-user-config'), 'config.toml (and its MCP servers) kept out of codex exec')
  assert.ok(!rec.args.some((a) => /^mcp_servers\./.test(a)), 'no per-name overrides on exec: with the config ignored they break the CLI')
  assert.ok(rec.args.join(' ').includes('--disable shell_snapshot'), 'no login shell (and its rc files) under Codex')
  let calls = 0
  const b = new CodexBatcher({ ...base, call: async () => (calls++, Promise.reject(new SubscriptionError('mcp', 'unsafe'))) })
  await assert.rejects(b.add({ message: 'a' }))
  await assert.rejects(b.add({ message: 'b' }))
  assert.equal(calls, 1, 'no retry, no second call')
})

