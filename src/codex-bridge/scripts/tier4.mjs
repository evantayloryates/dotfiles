#!/usr/bin/env node
// Tier 4: bridge and protocol edge cases (docs/pressure-testing.md §3).
// These need concurrent tool calls, a second bridge process, or a shell
// action mid-turn, so they live here rather than in scenario files. Each
// check appends a ledger row (tier t4) like scripts/pressure.mjs does.
//
//   node scripts/tier4.mjs --list
//   node scripts/tier4.mjs --only timeout,interrupt,steer
//   node scripts/tier4.mjs --all
//
// Long tasks use `sleep` through Codex's shell (allowed in the read-only
// sandbox) so nothing on the desktop moves while the bridge is exercised.

import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync, truncateSync, copyFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const LAUNCHER = join(ROOT, 'bin', 'codex-bridge-mcp')
const CODEX = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex'
const STATE_DIR = process.env.CODEX_BRIDGE_STATE_DIR || join(homedir(), '.local', 'state', 'codex-bridge')
const PRESSURE_DIR = join(STATE_DIR, 'pressure')
const SCRATCH = join(PRESSURE_DIR, 'scratch')
const DAY = new Date().toISOString().slice(0, 10)
const DAY_DIR = join(PRESSURE_DIR, DAY)
const LEDGER = join(DAY_DIR, 'ledger.jsonl')
mkdirSync(SCRATCH, { recursive: true })
mkdirSync(DAY_DIR, { recursive: true })

const log = (...a) => console.error('[tier4]', ...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const flags = Object.fromEntries(process.argv.slice(2).map((a) => (a.startsWith('--') ? a.slice(2).split('=') : [a, true])).map(([k, v]) => [k, v ?? true]))

const READ_ONLY = 'Read-only on the desktop: never click, type, scroll or change anything. Apps: Finder only; never focus Google Chrome. '
const LONG = (secs) => `${READ_ONLY}Goal: a timing probe. Run the shell command \`sleep ${secs}\` once (it is allowed in the read-only sandbox), then report the single word DONE. Do not use Computer Use for this task.`

// ---------------------------------------------------------------------------
// Minimal MCP client with concurrent calls, same as pressure.mjs but with
// kill() and env support.

class Client {
  #child
  #pending = new Map()
  #next = 1
  progress = []
  constructor(label, env = {}) {
    this.label = label
    this.#child = spawn(LAUNCHER, [], { stdio: ['pipe', 'pipe', openSync(join(DAY_DIR, `tier4-${label}.stderr.log`), 'a')], env: { ...process.env, ...env } })
    this.pid = this.#child.pid
    const rl = createInterface({ input: this.#child.stdout })
    rl.on('line', (line) => {
      if (!line.trim()) return
      let msg
      try {
        msg = JSON.parse(line)
      } catch {
        return
      }
      if (msg.method === 'notifications/progress') {
        this.progress.push({ t: Date.now(), message: msg.params?.message })
        return
      }
      const p = this.#pending.get(msg.id)
      if (!p) return
      this.#pending.delete(msg.id)
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result)
    })
    this.#child.on('exit', (code, sig) => {
      for (const p of this.#pending.values()) p.reject(new Error(`MCP server ${label} exited (${code ?? sig})`))
      this.#pending.clear()
    })
  }
  request(method, params) {
    return new Promise((resolve, reject) => {
      const id = this.#next++
      this.#pending.set(id, { resolve, reject })
      this.#child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    })
  }
  async init() {
    await this.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: `tier4-${this.label}`, version: '0' } })
    this.#child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
    return this
  }
  call(name, args) {
    return this.request('tools/call', { name, arguments: args, _meta: { progressToken: `t${this.#next}` } })
  }
  text(res) {
    return (res?.content || []).find((c) => c.type === 'text')?.text || ''
  }
  kill() {
    this.#child.kill('SIGKILL')
  }
  async close() {
    this.#child.stdin.end()
    await Promise.race([new Promise((r) => this.#child.on('exit', r)), sleep(3000)])
  }
}

const newClient = async (label, env) => new Client(label, env).init()
const summaryOf = (res) => res?.structuredContent || {}

async function sh(cmd) {
  try {
    const { stdout } = await execFileP('/bin/zsh', ['-lc', cmd], { timeout: 60_000 })
    return stdout.trim()
  } catch (err) {
    return (err.stdout || '').trim()
  }
}
const stdioChildren = async () => Number((await sh("pgrep -f 'app-server --listen stdio' | wc -l")) || 0)

// ---------------------------------------------------------------------------
// Checks. Each returns { verdict, finding, ...fields }.

const checks = {
  async timeout() {
    const c = await newClient('timeout')
    try {
      const t0 = Date.now()
      const res = await c.call('codex_computer_use', { task: LONG(60), session: 't4-timeout', new_thread: true, timeout_sec: 30, screenshots: 'none' })
      const s = summaryOf(res)
      const wall = Date.now() - t0
      const follow = await c.call('codex_computer_use', { task: 'No tools. Reply with exactly: still here.', session: 't4-timeout', screenshots: 'none', timeout_sec: 60 })
      const fs = summaryOf(follow)
      await c.call('codex_close_session', { session: 't4-timeout' })
      const ok = s.status === 'timeout' && wall < 45_000 && fs.status === 'completed' && /still here/i.test(fs.finalText || '')
      return { verdict: ok ? 'pass' : 'fail', finding: ok ? null : `status=${s.status} wall=${wall} follow=${fs.status}`, status: s.status, wall_ms: wall }
    } finally {
      await c.close()
    }
  },

  async interrupt() {
    const c = await newClient('interrupt')
    try {
      const t0 = Date.now()
      const running = c.call('codex_computer_use', { task: LONG(60), session: 't4-interrupt', new_thread: true, timeout_sec: 120, screenshots: 'none' })
      await sleep(8000)
      const ir = await c.call('codex_interrupt', { session: 't4-interrupt' })
      const res = await running
      const s = summaryOf(res)
      const wall = Date.now() - t0
      const follow = await c.call('codex_computer_use', { task: 'No tools. Reply with exactly: resumed fine.', session: 't4-interrupt', screenshots: 'none', timeout_sec: 60 })
      const fs = summaryOf(follow)
      await c.call('codex_close_session', { session: 't4-interrupt' })
      const ok = s.status === 'interrupted' && wall < 25_000 && fs.status === 'completed'
      return { verdict: ok ? 'pass' : 'fail', finding: ok ? null : `status=${s.status} wall=${wall} follow=${fs.status} interrupt=${c.text(ir).slice(0, 80)}`, status: s.status, wall_ms: wall }
    } finally {
      await c.close()
    }
  },

  async steer() {
    const c = await newClient('steer')
    try {
      const t0 = Date.now()
      const task = `${READ_ONLY}Goal: a steering probe. Run the shell command \`sleep 8\` five times in a row as five separate commands (allowed in the read-only sandbox), then report DONE. Do not use Computer Use.`
      const running = c.call('codex_computer_use', { task, session: 't4-steer', new_thread: true, timeout_sec: 120, screenshots: 'none' })
      await sleep(9000)
      const sr = await c.call('codex_steer', { session: 't4-steer', message: 'STEER: stop the sleeps now. Reply with exactly the word STEERED and nothing else.' })
      const res = await running
      const s = summaryOf(res)
      const wall = Date.now() - t0
      await c.call('codex_close_session', { session: 't4-steer' })
      const ok = s.status === 'completed' && /STEERED/.test(s.finalText || '') && wall < 40_000
      return { verdict: ok ? 'pass' : 'fail', finding: ok ? null : `status=${s.status} wall=${wall} final=${(s.finalText || '').slice(0, 60)} steer=${c.text(sr).slice(0, 80)}`, status: s.status, wall_ms: wall, steps: s.steps?.length }
    } finally {
      await c.close()
    }
  },

  async concurrent_sessions() {
    const [a, b] = await Promise.all([newClient('conc-a'), newClient('conc-b')])
    try {
      const task = `${READ_ONLY}Goal: report the title of Finder's key window in one line. No screenshot.`
      const t0 = Date.now()
      const [ra, rb] = await Promise.all([
        a.call('codex_computer_use', { task, session: 't4-conc-a', new_thread: true, apps: ['Finder'], screenshots: 'none', timeout_sec: 90 }),
        b.call('codex_computer_use', { task, session: 't4-conc-b', new_thread: true, apps: ['Finder'], screenshots: 'none', timeout_sec: 90 }),
      ])
      const wall = Date.now() - t0
      const sa = summaryOf(ra)
      const sb = summaryOf(rb)
      await Promise.all([a.call('codex_close_session', { session: 't4-conc-a' }), b.call('codex_close_session', { session: 't4-conc-b' })])
      const ok = sa.status === 'completed' && sb.status === 'completed'
      return { verdict: ok ? 'pass' : 'fail', finding: `a=${sa.status} ${sa.durationMs}ms, b=${sb.status} ${sb.durationMs}ms, both within ${wall}ms`, wall_ms: wall }
    } finally {
      await Promise.all([a.close(), b.close()])
    }
  },

  async same_session_two_processes() {
    const [a, b] = await Promise.all([newClient('same-a'), newClient('same-b')])
    try {
      const running = a.call('codex_computer_use', { task: LONG(40), session: 't4-shared', new_thread: true, timeout_sec: 120, screenshots: 'none' })
      await sleep(6000)
      let second
      try {
        const rb = await b.call('codex_computer_use', { task: 'No tools. Reply with exactly: second.', session: 't4-shared', screenshots: 'none', timeout_sec: 60 })
        second = `${rb.isError ? 'error' : 'ok'}: ${b.text(rb).split('\n')[0].slice(0, 120)}`
      } catch (err) {
        second = `threw: ${err.message.slice(0, 120)}`
      }
      const ra = await running
      const sa = summaryOf(ra)
      await a.call('codex_close_session', { session: 't4-shared' }).catch(() => {})
      // Any outcome where the first turn completes and the second is a clear error or a clean queue is acceptable; a hang or a crash is not.
      const ok = sa.status === 'completed'
      return { verdict: ok ? 'pass' : 'fail', finding: `first=${sa.status}; second process got ${second}`, status: sa.status }
    } finally {
      await Promise.all([a.close(), b.close()])
    }
  },

  async mcp_server_killed_mid_turn() {
    const a = await newClient('kill-a')
    const before = await stdioChildren()
    a.call('codex_computer_use', { task: LONG(45), session: 't4-kill', new_thread: true, timeout_sec: 120, screenshots: 'none' }).catch(() => {})
    await sleep(7000)
    a.kill()
    await sleep(2000)
    const after = await stdioChildren()
    const b = await newClient('kill-b')
    try {
      const st = b.text(await b.call('codex_status', { session: 't4-kill' }))
      const ir = b.text(await b.call('codex_interrupt', { session: 't4-kill' }))
      await sleep(2000)
      const follow = await b.call('codex_computer_use', { task: 'No tools. Reply with exactly: recovered.', session: 't4-kill', screenshots: 'none', timeout_sec: 60 })
      const fs = summaryOf(follow)
      await b.call('codex_close_session', { session: 't4-kill' })
      const orphans = after - before
      const ok = orphans <= 0 && fs.status === 'completed'
      return { verdict: ok ? 'pass' : 'fail', finding: `stdio children before=${before} after=${after}; status saw session=${/t4-kill/.test(st)}; interrupt: ${ir.slice(0, 90)}; follow-up=${fs.status}`, status: fs.status }
    } finally {
      await b.close()
    }
  },

  async daemon_stopped_before_call() {
    await sh(`"${CODEX}" app-server daemon stop`)
    await sleep(1500)
    const c = await newClient('daemon-stop')
    try {
      const t0 = Date.now()
      const st = c.text(await c.call('codex_status', {}))
      const ok = /connected via daemon/.test(st)
      return { verdict: ok ? 'pass' : 'fail', finding: ok ? `auto-started daemon in ${Date.now() - t0}ms` : st.split('\n')[0], wall_ms: Date.now() - t0 }
    } finally {
      await c.close()
    }
  },

  async daemon_restart_mid_turn() {
    const c = await newClient('daemon-restart')
    try {
      const t0 = Date.now()
      const pidBefore = await sh(`pgrep -f 'app-server-daemon/releases' | head -1`)
      const running = c.call('codex_computer_use', { task: LONG(40), session: 't4-restart', new_thread: true, timeout_sec: 120, screenshots: 'none' })
      await sleep(6000)
      const restartOut = await sh(`"${CODEX}" app-server daemon restart`)
      const pidAfter = await sh(`pgrep -f 'app-server-daemon/releases' | head -1`)
      const res = await running
      const s = summaryOf(res)
      const wall = Date.now() - t0
      const follow = await c.call('codex_computer_use', { task: 'No tools. Reply with exactly: after restart.', session: 't4-restart', screenshots: 'none', timeout_sec: 60 })
      const fs = summaryOf(follow)
      await c.call('codex_close_session', { session: 't4-restart' }).catch(() => {})
      // Either outcome is acceptable: the turn survives the restart, or it is
      // reported disconnected quickly and the next call reconnects.
      const ok = fs.status === 'completed' && ['completed', 'disconnected'].includes(s.status)
      return { verdict: ok ? 'pass' : 'fail', finding: `daemon pid ${pidBefore} -> ${pidAfter} (restart said: ${restartOut.slice(0, 60)}); mid-turn status=${s.status} after ${wall}ms; follow-up=${fs.status}`, status: s.status, wall_ms: wall }
    } finally {
      await c.close()
    }
  },

  async version_mismatch() {
    const standalone = join(homedir(), '.local', 'bin', 'codex')
    if (!existsSync(standalone)) return { verdict: 'blocked', finding: 'no standalone codex at ~/.local/bin/codex' }
    const c = await newClient('mismatch', { CODEX_BRIDGE_CODEX_PATH: standalone, CODEX_BRIDGE_TRANSPORT: 'daemon' })
    try {
      const st = c.text(await c.call('codex_status', {}))
      const daemon = await sh(`"${CODEX}" app-server daemon version`)
      const stillBundled = /0\.158/.test(daemon)
      const ok = /NOT connected/.test(st) && /not touching the shared daemon/.test(st) && stillBundled
      return { verdict: ok ? 'pass' : 'fail', finding: `${st.split('\n')[0].slice(0, 160)} | daemon still bundled build: ${stillBundled}` }
    } finally {
      await c.close()
    }
  },

  async screenshots_all() {
    const c = await newClient('shots')
    try {
      const task = `${READ_ONLY}Goal: a payload probe. Get the Finder app once, then call getScreenshot({ emit: true }) on it six times in six separate cua_repl calls. Report DONE.`
      const res = await c.call('codex_computer_use', { task, session: 't4-shots', new_thread: true, apps: ['Finder'], screenshots: 'all', timeout_sec: 120 })
      const s = summaryOf(res)
      const images = (res.content || []).filter((x) => x.type === 'image').length
      const bytes = JSON.stringify(res).length
      await c.call('codex_close_session', { session: 't4-shots' })
      const ok = s.status === 'completed' && images >= 4
      return { verdict: ok ? 'pass' : 'fail', finding: `status=${s.status} screenshots=${s.screenshots?.length} images_returned=${images} result_json_bytes=${bytes} (text ${c.text(res).length} chars)`, status: s.status }
    } finally {
      await c.close()
    }
  },

  async output_schema() {
    const c = await newClient('schema')
    try {
      const schema = { type: 'object', properties: { outcome: { type: 'string', enum: ['ok', 'blocked'] }, facts: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, value: { type: 'string' } }, required: ['name', 'value'], additionalProperties: false } }, blocked: { type: 'array', items: { type: 'string' } } }, required: ['outcome', 'facts', 'blocked'], additionalProperties: false }
      const res = await c.call('codex_computer_use', { task: `${READ_ONLY}Goal: report two facts, the title of Finder's key window and the count of running apps from cua.getState(). No screenshot.`, session: 't4-schema', new_thread: true, apps: ['Finder'], screenshots: 'none', output_schema: schema, timeout_sec: 90 })
      const s = summaryOf(res)
      let parsed = null
      try {
        parsed = JSON.parse(s.finalText)
      } catch {}
      await c.call('codex_close_session', { session: 't4-schema' })
      const ok = s.status === 'completed' && parsed && Array.isArray(parsed.facts) && parsed.facts.length >= 2
      return { verdict: ok ? 'pass' : 'fail', finding: ok ? JSON.stringify(parsed).slice(0, 160) : `status=${s.status} final=${(s.finalText || '').slice(0, 120)}`, status: s.status }
    } finally {
      await c.close()
    }
  },

  async images_input() {
    const shots = (await sh(`ls -t ${STATE_DIR}/screenshots/*.jpg 2>/dev/null | head -1`)).trim()
    if (!shots) return { verdict: 'blocked', finding: 'no screenshot on disk to attach' }
    const c = await newClient('images')
    try {
      const res = await c.call('codex_computer_use', { task: 'No Computer Use, no shell. Look at the attached image and reply with one line: what kind of screen it shows and roughly how many file or folder icons are visible.', session: 't4-images', new_thread: true, images: [shots], screenshots: 'none', timeout_sec: 90 })
      const s = summaryOf(res)
      await c.call('codex_close_session', { session: 't4-images' })
      const ok = s.status === 'completed' && /desktop|finder|icon|folder/i.test(s.finalText || '')
      return { verdict: ok ? 'pass' : 'fail', finding: (s.finalText || '').slice(0, 160), status: s.status }
    } finally {
      await c.close()
    }
  },

  async allow_commands() {
    const c = await newClient('cmds')
    const file = join(SCRATCH, 't4-allow.txt')
    try {
      await sh(`rm -f "${file}"`)
      const task = `No Computer Use. Goal: using your shell, write the single word hello into the file ${file} (create it), then report DONE. If the sandbox blocks the write, request approval to escalate rather than giving up; if approval is denied, report DENIED.`
      const denied = await c.call('codex_computer_use', { task, session: 't4-cmds', new_thread: true, cwd: SCRATCH, screenshots: 'none', timeout_sec: 90 })
      const sd = summaryOf(denied)
      const deniedOk = !existsSync(file) && (sd.denied || []).some((d) => d.command)
      await sh(`rm -f "${file}"`)
      const allowed = await c.call('codex_computer_use', { task, session: 't4-cmds', screenshots: 'none', timeout_sec: 90, allow_commands: true, sandbox: 'workspace-write' })
      const sa = summaryOf(allowed)
      const allowedOk = existsSync(file) && readFileSync(file, 'utf8').includes('hello')
      await sh(`rm -f "${file}"`)
      await c.call('codex_close_session', { session: 't4-cmds' })
      const ok = deniedOk && allowedOk
      return { verdict: ok ? 'pass' : 'fail', finding: `denied run: file absent=${deniedOk || !existsSync(file)} denials=${(sd.denied || []).length} status=${sd.status} final=${(sd.finalText || '').slice(0, 80)}; allowed run: file written=${allowedOk} approvals=${(sa.approvals || []).length} status=${sa.status} final=${(sa.finalText || '').slice(0, 80)}` }
    } finally {
      await c.close()
    }
  },

  async request_user_input() {
    const c = await newClient('question')
    try {
      const res = await c.call('codex_computer_use', { task: 'No Computer Use, no shell. Before answering, you must ask the user one clarifying question through your request_user_input tool (which app to read: Finder or Calculator). Then reply with whatever answer you received, verbatim, in one line.', session: 't4-question', new_thread: true, screenshots: 'none', timeout_sec: 90 })
      const s = summaryOf(res)
      let followText = ''
      if (s.status === 'needs_input') {
        const follow = await c.call('codex_computer_use', { task: 'Finder. (That is the answer to your question. Now reply with the one line as instructed.)', session: 't4-question', screenshots: 'none', timeout_sec: 60 })
        followText = ` | follow-up=${summaryOf(follow).status}: ${(summaryOf(follow).finalText || '').slice(0, 60)} in ${summaryOf(follow).durationMs}ms`
      }
      await c.call('codex_close_session', { session: 't4-question' })
      const asked = (s.questions || []).length
      // Pass when the question reached the bridge as a server request, or when
      // Codex asked in its final message (no question tool in this context).
      const askedInProse = /which app|finder or calculator/i.test(s.finalText || '')
      const ok = (s.status === 'needs_input' && asked > 0) || (s.status === 'completed' && askedInProse)
      return { verdict: ok ? 'pass' : 'fail', finding: `status=${s.status} questions captured as server requests=${asked}; asked in prose=${askedInProse}; steps=${s.steps?.length}; final=${(s.finalText || '').replace(/\n/g, ' ').slice(0, 120)}${followText}`, status: s.status }
    } finally {
      await c.close()
    }
  },

  async state_corruption() {
    const file = join(STATE_DIR, 'state.json')
    const backup = `${file}.tier4.bak`
    copyFileSync(file, backup)
    try {
      truncateSync(file, 20)
      const c = await newClient('state')
      try {
        const st = c.text(await c.call('codex_status', {}))
        const ok = /connected via/.test(st)
        return { verdict: ok ? 'pass' : 'fail', finding: ok ? 'status served with a truncated state file' : st.split('\n')[0] }
      } finally {
        await c.close()
      }
    } finally {
      copyFileSync(backup, file)
    }
  },
}

// ---------------------------------------------------------------------------

const names = Object.keys(checks)
if (flags.list) {
  console.log(names.join('\n'))
  process.exit(0)
}
const only = flags.only ? String(flags.only).split(',').map((s) => s.trim()) : flags.all ? names : []
if (!only.length) {
  console.log('usage: tier4.mjs --list | --only a,b | --all')
  process.exit(2)
}
let failed = 0
for (const name of only) {
  if (!checks[name]) {
    log(`unknown check ${name}`)
    continue
  }
  const t0 = Date.now()
  let row
  try {
    row = await checks[name]()
  } catch (err) {
    row = { verdict: 'fail', finding: `threw: ${err.message.slice(0, 200)}` }
  }
  row = { run_id: `${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')}-t4_${name}`, scenario_id: `t4/${name}`, tier: 't4', track: 'M', started_at: new Date(t0).toISOString(), wall_ms: Date.now() - t0, surface: 'bridge', ...row }
  writeFileSync(LEDGER, JSON.stringify(row) + '\n', { flag: 'a' })
  if (row.verdict === 'fail') failed++
  console.log(`${row.verdict.toUpperCase().padEnd(7)} ${name.padEnd(28)} ${((row.wall_ms || 0) / 1000).toFixed(1)}s  ${row.finding || ''}`)
  await sh(`pkill -x Calculator 2>/dev/null; true`)
}
process.exit(failed ? 1 : 0)
