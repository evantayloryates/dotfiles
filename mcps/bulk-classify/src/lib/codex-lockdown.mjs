// Keeps Taylor's Codex MCP servers (gmail, robinhood, zdr-agent, this
// classifier itself, ...) out of every Codex process this service starts.
// `-c mcp_servers={}` does NOT remove them (measured 2026-11-23 on the
// app-server: 16 started on the first turn). So:
//   1. the primary control: `codex exec` runs with `--ignore-user-config`,
//      which keeps config.toml (and its servers) out, and with the shell
//      snapshot off; the app-server (the credit reader) cannot ignore
//      config, so every server named in config.toml is disabled by name
//      (`-c mcp_servers.<name>.enabled=false`) and `config/read` must
//      confirm it before anything else is asked;
//   2. the backstop: each Codex child runs in its own process group and is
//      watched for its whole life (a ps sample every 250 ms, shared by all
//      running children) and once more when it exits. Any process in its
//      tree or its process group (an orphan keeps the group) that is not on
//      the exact-path allow list ends subscription use for the run (kind
//      `unsafe`, fatal), and the items go to the API key. `codex exec` has an
//      empty allow list (nothing may run under it); the credit reader may
//      run git, by its full Command Line Tools or Xcode path only. A nested
//      `codex` is never allowed.
// A process whose ps name is not an allowed full path (git runs its helpers
// under bare names) is judged by the executable the kernel reports (lsof).
// A process that starts and exits between two samples is not seen; an MCP
// server lives for the whole turn, so it is. Kernel-level fork tracing
// (dtrace) needs root on macOS and is not used.
// Only table names are read from config.toml, never values (it can hold
// tokens in env blocks).

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const NAME = /^[A-Za-z0-9_-]+$/
const realHome = () => process.env.CLASSIFIER_REAL_HOME || homedir()

// Server names from [mcp_servers.<name>] tables (top level only). A name
// that cannot be written as a bare TOML key, or an inline table, is
// reported as odd so the caller can refuse.
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

// git at its real system locations, by full path (and resolved path).
const GIT_DIRS = ['/usr/bin', '/Library/Developer/CommandLineTools/usr/bin', '/Library/Developer/CommandLineTools/usr/libexec/git-core', '/Applications/Xcode.app/Contents/Developer/usr/bin', '/Applications/Xcode.app/Contents/Developer/usr/libexec/git-core']
export const GIT_PATHS = (() => {
  const s = new Set()
  for (const d of GIT_DIRS)
    for (const n of ['git', 'git-remote-http', 'git-remote-https']) {
      const p = join(d, n)
      if (!existsSync(p)) continue
      s.add(p)
      try {
        s.add(realpathSync.native(p))
      } catch {}
    }
  return s
})()

export function parsePs(listing) {
  const rows = []
  for (const line of listing.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)
    if (m) rows.push({ pid: Number(m[1]), ppid: Number(m[2]), pgid: Number(m[3]), comm: m[4].trim() })
  }
  return rows
}

// Processes under pid (by parent, or by process group = pid: an orphan keeps
// its group) whose full path is not in allow. ps failing = cannot tell = one
// unexpected entry.
// The executable a process is running, from the kernel (lsof's txt entry),
// for a process whose ps name is not a full allowed path (git runs its
// helpers under bare names). Cached per pid and name; unreadable = null.
const exeCache = new Map()
export function executablePath(pid, comm, { run = defaultExe } = {}) {
  const key = `${pid}\0${comm}`
  if (exeCache.has(key)) return exeCache.get(key)
  let path = null
  try {
    const m = run(pid).match(/^n(\/.*)$/m)
    path = m ? m[1] : null
  } catch {}
  if (exeCache.size > 2000) exeCache.clear()
  exeCache.set(key, path)
  return path
}
function defaultExe(pid) {
  return execFileSync('/usr/sbin/lsof', ['-a', '-p', String(pid), '-d', 'txt', '-Fn'], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] })
}

export function unexpectedDescendants(pid, { ps = defaultPs, allow = new Set(), exe } = {}) {
  let rows
  try {
    rows = parsePs(ps())
  } catch {
    return ['(process list unreadable)']
  }
  const tree = new Set([pid])
  for (let grew = true; grew; ) {
    grew = false
    for (const r of rows)
      if (!tree.has(r.pid) && (tree.has(r.ppid) || r.pgid === pid)) {
        tree.add(r.pid)
        grew = true
      }
  }
  const bad = []
  for (const r of rows) {
    if (r.pid === pid || !tree.has(r.pid)) continue
    if (r.comm === '<defunct>') continue // exited, not yet reaped
    const path = r.comm.replace(/^\((.*)\)$/, '$1').replace(/^-/, '')
    if (allow.has(path)) continue
    // Not a full allowed path by name: ask the kernel what it runs (only
    // when something is allowed at all; under `codex exec` nothing is).
    const real = allow.size ? executablePath(r.pid, r.comm, exe ? { run: exe } : {}) : null
    if (real && allow.has(real)) continue
    bad.push(real || path)
  }
  return bad
}
function defaultPs() {
  return execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,comm='], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] })
}

// One ps listing shared by every watcher in a 200 ms window, so twelve
// parallel Codex calls cost one ps per tick.
const psCache = new WeakMap()
function shared(ps, windowMs) {
  return () => {
    const hit = psCache.get(ps)
    const now = performance.now()
    if (hit && now - hit.at < windowMs) {
      if (hit.err) throw hit.err
      return hit.out
    }
    try {
      const out = ps()
      psCache.set(ps, { at: now, out })
      return out
    } catch (err) {
      psCache.set(ps, { at: now, err })
      throw err
    }
  }
}

// Watches pid until stop(); calls onBad(list) once, at the first unexpected
// process. check(fresh) takes one more look (fresh: a new listing, for the
// moment before resolving).
export function watchTree(pid, { allow = new Set(), ps = defaultPs, intervalMs = 250, onBad, exe } = {}) {
  const read = shared(ps, Math.min(200, intervalMs / 2))
  let fired = false
  const check = (fresh = false) => {
    const bad = unexpectedDescendants(pid, { ps: fresh ? ps : read, allow, exe })
    if (bad.length && !fired) {
      fired = true
      onBad?.(bad)
    }
    return bad
  }
  const timer = setInterval(() => check(), intervalMs)
  timer.unref?.()
  return {
    check,
    stop: () => clearInterval(timer),
    get fired() {
      return fired
    },
  }
}

// Codex children run detached (their own process group), so they would
// outlive this process. Every live group is sent SIGTERM when this process
// exits (normally, by process.exit, or after the worker's SIGTERM handler).
const liveGroups = new Set()
let exitHook = false
export function trackGroup(pid) {
  if (!pid) return () => {}
  liveGroups.add(pid)
  if (!exitHook) {
    exitHook = true
    process.on('exit', () => {
      for (const g of liveGroups) {
        try {
          process.kill(-g, 'SIGTERM')
        } catch {}
      }
    })
  }
  return () => liveGroups.delete(pid)
}
export const liveGroupCount = () => liveGroups.size
