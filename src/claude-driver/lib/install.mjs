// `claude-driver install`: register the MCP server in every harness Taylor
// uses. Idempotent; backs up each file it changes (<file>.bak-claude-driver).

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { HOME, runCli } from './paths.mjs'

const LAUNCHER = join(HOME, 'dotfiles', 'src', 'claude-driver', 'bin', 'claude-driver-mcp')
const NAME = 'claude-driver'

function backup(file) {
  if (existsSync(file)) copyFileSync(file, `${file}.bak-claude-driver`)
}

async function claudeCode(dry) {
  const got = await runCli(['mcp', 'get', NAME], { cwd: HOME, timeoutMs: 30_000 })
  if (got.code === 0 && got.stdout.includes(LAUNCHER)) return 'already registered'
  if (dry) return 'would run: claude mcp add claude-driver -s user -- ' + LAUNCHER
  if (got.code === 0) await runCli(['mcp', 'remove', NAME, '-s', 'user'], { cwd: HOME, timeoutMs: 30_000 })
  const r = await runCli(['mcp', 'add', NAME, '-s', 'user', '--', LAUNCHER], { cwd: HOME, timeoutMs: 30_000 })
  if (r.code !== 0) throw new Error(`claude mcp add failed: ${r.stderr || r.stdout}`)
  return 'registered (user scope)'
}

function codex(dry) {
  const file = join(HOME, '.codex', 'config.toml')
  const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
  if (text.includes(`[mcp_servers.${NAME}]`)) return text.includes(LAUNCHER) ? 'already registered' : 'present with a different command; left alone'
  const block = `\n[mcp_servers.${NAME}]\ncommand = "${LAUNCHER}"\ntool_timeout_sec = 300.0\n`
  if (dry) return `would append to ${file}:${block}`
  backup(file)
  // Insert before the first non-mcp top-level table after the mcp_servers block, else append.
  const idx = text.search(/\n\[(?!mcp_servers)[^\]]+\]\n/g)
  const lastMcp = text.lastIndexOf('[mcp_servers.')
  let out
  if (lastMcp >= 0) {
    const after = text.slice(lastMcp).search(/\n\[(?!mcp_servers)[^\]]+\]/)
    out = after >= 0 ? text.slice(0, lastMcp + after) + block + text.slice(lastMcp + after) : text + block
  } else out = idx >= 0 ? text + block : text + block
  writeFileSync(file, out)
  return `registered in ${file}`
}

function jsonFile(file, mutate, dry) {
  const data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  const before = JSON.stringify(data)
  mutate(data)
  if (JSON.stringify(data) === before) return 'already registered'
  if (dry) return `would write ${file}`
  backup(file)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
  return `registered in ${file}`
}

function cursor(dry) {
  return jsonFile(join(HOME, '.cursor', 'mcp.json'), (d) => {
    d.mcpServers = d.mcpServers || {}
    if (d.mcpServers[NAME]?.command !== LAUNCHER) d.mcpServers[NAME] = { command: LAUNCHER, args: [] }
  }, dry)
}

function opencode(dry) {
  return jsonFile(join(HOME, '.config', 'opencode', 'opencode.json'), (d) => {
    if (!d.$schema) d.$schema = 'https://opencode.ai/config.json'
    d.mcp = d.mcp || {}
    if (d.mcp[NAME]?.command?.[0] !== LAUNCHER) d.mcp[NAME] = { type: 'local', command: [LAUNCHER], enabled: true, timeout: 300000 }
  }, dry)
}

export async function install(flags = {}) {
  const dry = !!flags['dry-run']
  if (!existsSync(LAUNCHER)) throw new Error(`launcher missing: ${LAUNCHER}`)
  const out = {}
  for (const [name, fn] of [['claude-code', claudeCode], ['codex', codex], ['cursor', cursor], ['opencode', opencode]]) {
    try {
      out[name] = await fn(dry)
    } catch (err) {
      out[name] = `FAILED: ${err.message}`
    }
  }
  console.log(JSON.stringify(out, null, 2))
  return Object.values(out).some((v) => v.startsWith('FAILED')) ? 1 : 0
}
