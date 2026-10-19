// Reads the parts of ~/.codex/config.toml the bridge needs to trim a
// thread's MCP roster: every `[mcp_servers.<name>]` table and every enabled
// `[plugins."<id>"]` table. A line-oriented scan is enough; the file is
// Codex's own and these headers are one per line. Table keys are parsed as
// TOML keys (bare, "basic" with escapes, 'literal'), so a quoted server name
// comes back unquoted, which is how Codex keys the server.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CODEX_HOME } from './codex-paths.mjs'

const CONFIG = join(CODEX_HOME, 'config.toml')

// Plugins the bridge's threads need: Computer Use itself.
export const KEEP_PLUGINS = ['unified-computer-use@openai-bundled', 'computer-use@openai-bundled']
// MCP servers from config.toml to keep on a trimmed thread (cua_repl comes
// from the plugin, not config.toml, so it is never disabled here).
export const KEEP_MCP_SERVERS = []

const ESCAPES = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', '\\': '\\' }

// `[a."b.c".'d']` -> ['a', 'b.c', 'd']; null for anything that is not a
// well-formed standard table header (array tables `[[...]]` included).
export function parseTableHeader(line) {
  if (!line.startsWith('[') || line.startsWith('[[')) return null
  const keys = []
  let i = 1
  const ws = () => { while (line[i] === ' ' || line[i] === '\t') i++ }
  for (;;) {
    ws()
    let key = ''
    if (line[i] === '"') {
      for (i++; ; i++) {
        const c = line[i]
        if (c === undefined) return null
        if (c === '"') break
        if (c !== '\\') { key += c; continue }
        const e = line[++i]
        if (e in ESCAPES) key += ESCAPES[e]
        else if (e === 'u' || e === 'U') {
          const len = e === 'u' ? 4 : 8
          const hex = line.slice(i + 1, i + 1 + len)
          if (!new RegExp(`^[0-9A-Fa-f]{${len}}$`).test(hex)) return null
          key += String.fromCodePoint(parseInt(hex, 16))
          i += len
        } else return null
      }
      i++
    } else if (line[i] === "'") {
      const end = line.indexOf("'", i + 1)
      if (end < 0) return null
      key = line.slice(i + 1, end)
      i = end + 1
    } else {
      const m = /^[A-Za-z0-9_-]+/.exec(line.slice(i))
      if (!m) return null
      key = m[0]
      i += key.length
    }
    keys.push(key)
    ws()
    if (line[i] === '.') { i++; continue }
    if (line[i] !== ']') return null
    i++
    ws()
    return i === line.length || line[i] === '#' ? keys : null
  }
}

export function readCodexConfig({ path = CONFIG, text, log = (m) => console.error(m) } = {}) {
  if (text === undefined) {
    if (!existsSync(path)) return { mcpServers: [], plugins: [] }
    text = readFileSync(path, 'utf8')
  }
  const mcpServers = []
  const plugins = []
  let current = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('[')) {
      current = null
      const keys = parseTableHeader(line)
      if (!keys) {
        // A wrong key becomes a bogus override ("invalid transport"), so an
        // unreadable header is skipped, never guessed at.
        if (/^\[\s*(mcp_servers|plugins)\b/.test(line)) log(`codex-config: skipping unreadable table header ${line}`)
        continue
      }
      if (keys.length !== 2) continue // root tables and sub-tables such as `.env`
      if (keys[0] === 'mcp_servers') {
        current = { name: keys[1], enabled: true }
        mcpServers.push(current)
      } else if (keys[0] === 'plugins') {
        current = { id: keys[1], enabled: true }
        plugins.push(current)
      }
      continue
    }
    if (current && /^enabled\s*=\s*false/.test(line)) current.enabled = false
  }
  return { mcpServers, plugins }
}

// The thread/start `config` override and turn/start `disabledPluginIds`
// that leave only Computer Use on the thread.
export function trimmedRoster({ keepMcp = KEEP_MCP_SERVERS, keepPlugins = KEEP_PLUGINS, ...source } = {}) {
  const { mcpServers, plugins } = readCodexConfig(source)
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
