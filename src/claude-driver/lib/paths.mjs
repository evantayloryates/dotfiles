// Where the Claude desktop app keeps things, which bundled CLI to run, and
// how to run it. Everything here is read-only discovery; see README.md
// "Verified mechanisms" for why each choice is what it is.

import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { promisify } from 'node:util'

const run = promisify(execFile)

export const HOME = homedir()
export const APP_SUPPORT = process.env.CLAUDE_DRIVER_APP_SUPPORT || join(HOME, 'Library', 'Application Support', 'Claude')
export const SESSIONS_ROOT = join(APP_SUPPORT, 'claude-code-sessions')
export const DESKTOP_CONFIG = join(APP_SUPPORT, 'claude_desktop_config.json')
export const MAIN_LOG = join(HOME, 'Library', 'Logs', 'Claude', 'main.log')
export const APP_BUNDLE = '/Applications/Claude.app'
export const PEER_SESSIONS_DIR = join(HOME, '.claude', 'sessions')
export const CLAUDE_BUNDLE_ID = 'com.anthropic.claudefordesktop'

export class DriverError extends Error {
  constructor(message, { category = 'error', detail } = {}) {
    super(message)
    this.expected = true
    this.category = category
    this.detail = detail
  }
}

const semverKey = (v) => v.split('.').map((n) => String(Number(n) || 0).padStart(6, '0')).join('.')

// The app ships its own CLI under claude-code/<version>/. Homebrew's claude
// lags the app and rejects current model ids, so never use PATH.
export function resolveClaudeBinary() {
  if (process.env.CLAUDE_DRIVER_CLI) return process.env.CLAUDE_DRIVER_CLI
  const root = join(APP_SUPPORT, 'claude-code')
  const versions = existsSync(root) ? readdirSync(root).filter((v) => /^\d+(\.\d+)*$/.test(v)) : []
  versions.sort((a, b) => (semverKey(a) < semverKey(b) ? 1 : -1))
  for (const v of versions) {
    const bin = join(root, v, 'claude.app', 'Contents', 'MacOS', 'claude')
    if (existsSync(bin)) return bin
    // App 2.19675.0 nests the bundle one level deeper: <version>/<build hash>/claude.app
    for (const build of readdirSync(join(root, v))) {
      const nested = join(root, v, build, 'claude.app', 'Contents', 'MacOS', 'claude')
      if (existsSync(nested)) return nested
    }
  }
  throw new DriverError(`no bundled Claude Code CLI under ${root}; open the Claude app once so it installs one`, { category: 'no_cli' })
}

export function cliVersionFromPath(bin) {
  return bin.match(/claude-code\/([\d.]+)\//)?.[1] || null
}

export function appVersion() {
  if (process.env.CLAUDE_DRIVER_APP_VERSION) return process.env.CLAUDE_DRIVER_APP_VERSION
  try {
    const plist = readFileSync(join(APP_BUNDLE, 'Contents', 'Info.plist'), 'utf8')
    return plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/)?.[1] || null
  } catch {
    return null
  }
}

export function versions() {
  let cli = null
  try {
    cli = cliVersionFromPath(resolveClaudeBinary())
  } catch {}
  return { app: appVersion(), cli }
}

// Every account/org store. The active one is whichever holds the newest
// local_*.json; verification must still look in all of them.
export function sessionStores() {
  if (!existsSync(SESSIONS_ROOT)) return []
  const out = []
  for (const acct of readdirSync(SESSIONS_ROOT)) {
    const acctDir = join(SESSIONS_ROOT, acct)
    if (!safeIsDir(acctDir)) continue
    for (const org of readdirSync(acctDir)) {
      const dir = join(acctDir, org)
      if (safeIsDir(dir)) out.push({ acct, org, dir })
    }
  }
  return out
}

export function activeStore() {
  let best = null
  for (const store of sessionStores()) {
    for (const f of readdirSync(store.dir)) {
      if (!/^local_.*\.json$/.test(f)) continue
      const m = statSync(join(store.dir, f)).mtimeMs
      if (!best || m > best.mtime) best = { ...store, mtime: m }
    }
  }
  if (!best) throw new DriverError('no Claude Code session records found; is the Claude app set up?', { category: 'no_store' })
  return best
}

function safeIsDir(p) {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

// "No folder" in the app = a cwd matching the app's own scratch regex:
// scratch-workspaces/<acct>/<org>/scratch-YYYY-MM-DD-<6 hex>.
export const SCRATCH_RE = /\/scratch-workspaces\/[^/]+\/[^/]+\/scratch-\d{4}-\d{2}-\d{2}-[0-9a-f]{6}$/

export function makeScratchFolder() {
  const { acct, org } = activeStore()
  const d = new Date()
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const dir = join(APP_SUPPORT, 'scratch-workspaces', acct, org, `scratch-${day}-${randomBytes(3).toString('hex')}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

// A desktop-spawned process inherits a CLAUDE_CODE_OAUTH_TOKEN the app
// refreshes out of band; the CLI then 401s. A clean env makes it use its own
// keychain credentials.
export function cleanEnv(extra = {}) {
  return { HOME, USER: process.env.USER || 'taylor', PATH: '/usr/bin:/bin', TERM: 'dumb', ...extra }
}

export function runCli(args, { cwd, timeoutMs = 180_000, signal } = {}) {
  const bin = resolveClaudeBinary()
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'], signal })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code, sig) => {
      clearTimeout(timer)
      resolve({ code, signal: sig, stdout, stderr })
    })
  })
}

export async function openUrl(url, { background = false } = {}) {
  await run('/usr/bin/open', background ? ['-g', url] : [url])
}

export async function sh(cmd, args, opts = {}) {
  const { stdout } = await run(cmd, args, { maxBuffer: 16 * 1024 * 1024, ...opts })
  return stdout
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
