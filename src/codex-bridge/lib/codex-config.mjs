// Reads the parts of ~/.codex/config.toml the bridge needs to trim a
// thread's MCP roster: every `[mcp_servers.<name>]` table and every enabled
// `[plugins."<id>"]` table. A line-oriented scan is enough; the file is
// Codex's own and these headers are one per line.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CODEX_HOME } from './codex-paths.mjs'

const CONFIG = join(CODEX_HOME, 'config.toml')

// Plugins the bridge's threads need: Computer Use itself.
export const KEEP_PLUGINS = ['unified-computer-use@openai-bundled', 'computer-use@openai-bundled']
// MCP servers from config.toml to keep on a trimmed thread (cua_repl comes
// from the plugin, not config.toml, so it is never disabled here).
export const KEEP_MCP_SERVERS = []

export function readCodexConfig() {
  if (!existsSync(CONFIG)) return { mcpServers: [], plugins: [] }
  const lines = readFileSync(CONFIG, 'utf8').split('\n')
  const mcpServers = []
  const plugins = []
  let current = null
  for (const raw of lines) {
    const line = raw.trim()
    let m = /^\[mcp_servers\.([^\].]+)\]$/.exec(line)
    if (m) {
      mcpServers.push({ name: m[1], enabled: true })
      current = mcpServers[mcpServers.length - 1]
      continue
    }
    m = /^\[plugins\."([^"]+)"\]$/.exec(line)
    if (m) {
      plugins.push({ id: m[1], enabled: true })
      current = plugins[plugins.length - 1]
      continue
    }
    if (line.startsWith('[')) {
      current = null
      continue
    }
    if (current && /^enabled\s*=\s*false/.test(line)) current.enabled = false
  }
  return { mcpServers, plugins }
}

// The thread/start `config` override and turn/start `disabledPluginIds`
// that leave only Computer Use on the thread.
export function trimmedRoster({ keepMcp = KEEP_MCP_SERVERS, keepPlugins = KEEP_PLUGINS } = {}) {
  const { mcpServers, plugins } = readCodexConfig()
  const mcp_servers = {}
  const disabledServers = []
  for (const s of mcpServers) {
    if (!s.enabled || keepMcp.includes(s.name)) continue
    mcp_servers[s.name] = { enabled: false }
    disabledServers.push(s.name)
  }
  const disabledPluginIds = plugins.filter((p) => p.enabled && !keepPlugins.includes(p.id)).map((p) => p.id)
  // turn/start's disabledPluginIds is recorded but "does not yet filter
  // plugin capabilities" (probe 2026-09-29: playwright stayed connected).
  // A `plugins` config override does remove the plugin's MCP servers.
  const pluginsConfig = Object.fromEntries(disabledPluginIds.map((id) => [id, { enabled: false }]))
  return { config: { mcp_servers, plugins: pluginsConfig }, disabledPluginIds, disabledServers }
}
