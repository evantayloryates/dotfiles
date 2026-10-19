import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseTableHeader, readCodexConfig, trimmedRoster } from '../src/lib/codex-config.mjs'

const CONFIG = `
model = "gpt-5"

[plugins."github@openai-curated"]
enabled = true

[plugins."computer-use@openai-bundled"]
enabled = true

[plugins."figma@openai-curated"]
enabled = false

[mcp_servers.bare-name]
command = "node"

[mcp_servers.bare-name.env]
enabled = false

[mcp_servers."double_quoted"]
command = "node"

[mcp_servers."double_quoted".env]
TOKEN = "x"

[mcp_servers.'single_quoted']
url = "http://localhost"

[mcp_servers."dotted.name"]
command = "node"

[ mcp_servers . "spaced" ] # trailing comment
command = "node"

[mcp_servers."escaped\\u0041\\"q"]
command = "node"

[mcp_servers.off]
command = "node"
enabled = false

[mcp_servers."off_quoted"]
enabled = false

[[mcp_servers.array]]
command = "node"
`

const read = (text, log = () => {}) => readCodexConfig({ text, log })

test('table headers parse as TOML keys', () => {
  assert.deepEqual(parseTableHeader('[mcp_servers.a]'), ['mcp_servers', 'a'])
  assert.deepEqual(parseTableHeader('[mcp_servers."a.b".env]'), ['mcp_servers', 'a.b', 'env'])
  assert.deepEqual(parseTableHeader("[mcp_servers.'c:\\x']"), ['mcp_servers', 'c:\\x'])
  assert.deepEqual(parseTableHeader('[plugins."p@q"] # note'), ['plugins', 'p@q'])
  for (const bad of ['[mcp_servers."open]', '[mcp_servers.]', '[mcp_servers.a b]', '[mcp_servers.a] x', '[[mcp_servers.a]]', '[mcp_servers."\\q"]']) {
    assert.equal(parseTableHeader(bad), null, bad)
  }
})

test('server names come back unquoted; sub-tables are not servers', () => {
  const { mcpServers } = read(CONFIG)
  assert.deepEqual(mcpServers, [
    { name: 'bare-name', enabled: true },
    { name: 'double_quoted', enabled: true },
    { name: 'single_quoted', enabled: true },
    { name: 'dotted.name', enabled: true },
    { name: 'spaced', enabled: true },
    { name: 'escapedA"q', enabled: true },
    { name: 'off', enabled: false },
    { name: 'off_quoted', enabled: false },
  ])
})

test('trimmed roster disables enabled servers by their real key and leaves plugins as before', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-config-'))
  try {
    const path = join(dir, 'config.toml')
    writeFileSync(path, CONFIG)
    const t = trimmedRoster({ path, log: () => {} })
    assert.deepEqual(Object.keys(t.config.mcp_servers), ['bare-name', 'double_quoted', 'single_quoted', 'dotted.name', 'spaced', 'escapedA"q'])
    for (const key of Object.keys(t.config.mcp_servers)) assert.ok(!/^["']/.test(key), `quoted key ${key}`)
    assert.deepEqual(t.disabledPluginIds, ['github@openai-curated'])
    assert.deepEqual(t.config.plugins, { 'github@openai-curated': { enabled: false } })
    assert.deepEqual(trimmedRoster({ path, keepMcp: ['double_quoted'], log: () => {} }).disabledServers.includes('double_quoted'), false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('an unreadable server header is skipped and logged, never turned into an override', () => {
  const logs = []
  const { mcpServers } = read('[mcp_servers."unterminated]\ncommand = "x"\n[mcp_servers.ok]\n', (m) => logs.push(m))
  assert.deepEqual(mcpServers, [{ name: 'ok', enabled: true }])
  assert.equal(logs.length, 1)
  assert.match(logs[0], /unterminated/)
})

test('a missing config file yields an empty roster', () => {
  assert.deepEqual(readCodexConfig({ path: join(tmpdir(), 'no-such-codex-config.toml') }), { mcpServers: [], plugins: [] })
})
