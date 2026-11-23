// Keeps Taylor's Codex MCP servers (gmail, robinhood, zdr-agent, this
// classifier itself, ...) out of every Codex process this service starts.
// `-c mcp_servers={}` does NOT remove them (measured 2026-11-23 on the
// app-server: 16 started on the first turn). So:
//   1. `codex exec` runs with `--ignore-user-config`, which keeps config.toml
//      (and its servers) out; the app-server (the credit reader) cannot
//      ignore config, so every server named in config.toml is disabled by
//      name (`-c mcp_servers.<name>.enabled=false`) and `config/read` must
//      confirm it before anything else is asked;
//   2. each Codex call is watched: a process under the Codex child that is
//      not one of the few programs Codex itself runs (git) ends subscription use for the run (kind `unsafe`, fatal), and
//      the items go to the API key.
// Only table names are read from config.toml, never values (it can hold
// tokens in env blocks).

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

const NAME = /^[A-Za-z0-9_-]+$/
const realHome = () => process.env.CLASSIFIER_REAL_HOME || homedir()

// Server names from [mcp_servers.<name>] tables (top level only). An
// unreadable or odd config yields what could be read; a name that cannot be
// written as a bare TOML key is reported so the caller can refuse.
export function configuredMcpServers(text = null) {
  let t = text
  if (t == null) {
    try {
      t = readFileSync(join(realHome(), '.codex', 'config.toml'), 'utf8')
    } catch {
      return { names: [], odd: false }
    }
  }
  const names = new Set()
  let odd = false
  for (const line of t.split('\n')) {
    const m = line.match(/^\s*\[\s*mcp_servers\s*\.\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))\s*\]\s*(#.*)?$/)
    if (!m) {
      if (/^\s*\[\s*mcp_servers\s*\]/.test(line) || /^\s*mcp_servers\s*=/.test(line)) odd = true
      continue
    }
    const n = m[1] ?? m[2] ?? m[3]
    if (NAME.test(n)) names.add(n)
    else odd = true
  }
  return { names: [...names], odd }
}

export function disableArgs(names) {
  const out = []
  for (const n of names) out.push('-c', `mcp_servers.${n}.enabled=false`)
  return out
}

// Programs Codex may run itself (observed 2026-11-23: the app-server's git
// calls). Shells are not on the list: the shell snapshot, which ran Taylor's
// login shell and whatever it starts, is turned off (`--disable
// shell_snapshot`), and an MCP server started through a shell script would
// show up as that shell.
const ALLOWED = new Set(['codex', 'git', 'git-remote-http', 'git-remote-https'])

// Descendants of pid that are not allowed. ps failing = cannot tell = unsafe.
export function unexpectedDescendants(pid, { ps = defaultPs } = {}) {
  let listing
  try {
    listing = ps()
  } catch {
    return ['(process list unreadable)']
  }
  const rows = []
  for (const line of listing.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)
    if (m) rows.push([Number(m[1]), Number(m[2]), m[3].trim()])
  }
  const tree = new Set([pid])
  for (let grew = true; grew; ) {
    grew = false
    for (const [p, pp] of rows) if (tree.has(pp) && !tree.has(p)) tree.add(p), (grew = true)
  }
  const bad = []
  for (const [p, , comm] of rows) {
    if (p === pid || !tree.has(p)) continue
    if (comm === '<defunct>') continue // an exited child not yet reaped
    const name = basename(comm.replace(/^\(|\)$/g, '')).replace(/^-/, '')
    if (!ALLOWED.has(name)) bad.push(name)
  }
  return bad
}
function defaultPs() {
  return execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,comm='], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] })
}
