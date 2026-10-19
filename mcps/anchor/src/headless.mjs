// One headless Claude Code session, the way anchor runs every agent it
// starts (fixers, reviewers): in its own workspace, under the Seatbelt
// sandbox, on Taylor's subscription only, with a fixed tool list, no MCP
// servers and no user hooks.
//   const r = await runHeadless({ ws, brief, tools: 'Read,Grep,Glob' })
//   r.stoppedForAuth / r.authSource / r.run / r.session / r.sid / r.where
// custom: a test double's command ([bin, ...args]) instead of the real CLI.

import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { prepare as prepareSandbox } from './sandbox.mjs'

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = resolve(PKG, '../..')
const CLAUDE_CLI = join(homedir(), '.local/bin/claude')

export async function runHeadless({ ws, brief, tools, custom = null, sandbox = true, timeoutMs = 25 * 60_000, label = 'session', model = 'claude-opus-5-5' }) {
  let bin
  let pre
  let sandboxEnv = {}
  if (custom) {
    ;[bin, ...pre] = custom
    // The command's script (node <script>) must be readable inside the sandbox too.
    if (sandbox) { const sb = prepareSandbox(ws, bin, { extraReads: pre.filter((a) => a.startsWith('/') && existsSync(a)).map((a) => dirname(a)) }); sandboxEnv = sb.env; bin = sb.wrapper }
  } else {
    // claude-headless reads the subscription token outside the sandbox, then
    // execs the sandboxed CLI with it.
    bin = join(REPO, 'bin/claude-headless')
    pre = []
    if (sandbox) { const sb = prepareSandbox(ws, CLAUDE_CLI); sandboxEnv = { ...sb.env, CLAUDE_HEADLESS_CLI: sb.wrapper } }
  }
  const args = [...pre, '-p', brief, '--model', model, '--permission-mode', 'bypassPermissions', '--setting-sources', 'user', '--settings', JSON.stringify({ disableAllHooks: true }), '--strict-mcp-config', '--tools', tools, '--output-format', 'stream-json', '--verbose']
  // Never an API key: only HOME, PATH and the sandbox's own variables pass.
  const env = { HOME: process.env.HOME, PATH: `/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:${join(homedir(), '.local/bin')}`, ...sandboxEnv }
  // Subscription guard (Taylor, 2026-10-19): the start-up event says how the
  // session authenticated; anything but the subscription token ("none")
  // stops it before it does any work.
  let authSource = null
  let stoppedForAuth = false
  const run = await new Promise((done) => {
    const child = spawn(bin, args, { cwd: ws, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    let buf = ''
    child.stdout.on('data', (d) => {
      out += d
      buf += d
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i)
        buf = buf.slice(i + 1)
        let m
        try { m = JSON.parse(line) } catch { continue }
        if (m.type === 'system' && m.subtype === 'init' && authSource === null) {
          authSource = m.apiKeySource ?? 'unknown'
          if (authSource !== 'none') { stoppedForAuth = true; child.kill('SIGKILL') }
        }
      }
    })
    child.stderr.on('data', (d) => (err += d))
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.on('exit', (code, signal) => { clearTimeout(timer); done({ code, signal, out, err }) })
  })
  writeFileSync(join(ws, `${label}.stdout.json`), run.out)
  let session = null
  for (const line of run.out.trim().split('\n').reverse()) { try { const j = JSON.parse(line); if (j.type === 'result') { session = j; break } } catch {} }
  const sid = session?.session_id || 'unknown'
  const where = `headless ${label} ${sid}, workspace ${ws}${sandbox ? ', sandboxed' : ', NOT sandboxed'}`
  return { run, session, sid, where, authSource, stoppedForAuth }
}
