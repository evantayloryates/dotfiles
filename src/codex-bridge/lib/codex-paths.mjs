// Where Codex lives on this machine, and the daemon controls built on it.
//
// Only the CLI bundled inside the desktop app can drive Computer Use: the
// standalone/Homebrew build is not authenticated to the CUA service
// (openai/codex#19544) and lags the app's model list. So the bridge never
// trusts `codex` on PATH; it resolves the app bundle explicitly.

import { execFile } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

export const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), '.codex')
export const DAEMON_SOCK = join(CODEX_HOME, 'app-server-control', 'app-server-control.sock')

const BUNDLED_CANDIDATES = [
  '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
  '/Applications/Codex.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
  '/Applications/Codex.app/Contents/Resources/codex',
]

export class CodexNotFound extends Error {}

export function resolveCodexBinary() {
  const override = process.env.CODEX_BRIDGE_CODEX_PATH
  if (override) {
    if (!existsSync(override)) throw new CodexNotFound(`CODEX_BRIDGE_CODEX_PATH=${override} does not exist`)
    return override
  }
  const found = BUNDLED_CANDIDATES.find((p) => existsSync(p))
  if (!found) {
    throw new CodexNotFound(
      'No app-bundled Codex CLI found. Install the ChatGPT or Codex desktop app; the standalone `codex` cannot drive Computer Use. ' +
        `Looked in: ${BUNDLED_CANDIDATES.join(', ')}`
    )
  }
  return found
}

async function run(bin, args, { timeoutMs = 30_000 } = {}) {
  const { stdout, stderr } = await execFileP(bin, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 })
  return { stdout: stdout.trim(), stderr: stderr.trim() }
}

function lastJsonLine(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith('{')) {
      try {
        return JSON.parse(lines[i])
      } catch {}
    }
  }
  return null
}

export async function cliVersion(bin) {
  const { stdout } = await run(bin, ['--version'])
  return stdout.replace(/^codex-cli\s+/, '')
}

// `daemon version` reports {status: running|stopped, appServerVersion, socketPath, ...}
export async function daemonStatus(bin) {
  try {
    const { stdout } = await run(bin, ['app-server', 'daemon', 'version'])
    return lastJsonLine(stdout) || { status: 'unknown', raw: stdout }
  } catch (err) {
    // `daemon version` exits non-zero when nothing listens on the control socket.
    const text = `${err.stdout || ''}\n${err.stderr || ''}\n${err.message || ''}`
    if (/failed to connect|No such file/i.test(text)) return { status: 'stopped' }
    throw err
  }
}

export async function daemonStart(bin) {
  const { stdout } = await run(bin, ['app-server', 'daemon', 'start'], { timeoutMs: 60_000 })
  return lastJsonLine(stdout) || { status: 'unknown', raw: stdout }
}

export async function daemonStop(bin) {
  const { stdout } = await run(bin, ['app-server', 'daemon', 'stop'])
  return lastJsonLine(stdout) || { status: 'unknown', raw: stdout }
}

export async function daemonRestart(bin) {
  const { stdout } = await run(bin, ['app-server', 'daemon', 'restart'], { timeoutMs: 60_000 })
  return lastJsonLine(stdout) || { status: 'unknown', raw: stdout }
}

// The control socket is a symlink into /private/tmp/codex-daemon-<uid>/<hash>.
// Connect to the target: the symlink path is long, and macOS caps AF_UNIX
// paths at 104 bytes.
export function daemonSocketPath() {
  if (!existsSync(DAEMON_SOCK)) return null
  try {
    return realpathSync(DAEMON_SOCK)
  } catch {
    return null
  }
}
