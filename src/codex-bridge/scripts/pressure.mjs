#!/usr/bin/env node
// Pressure-test runner (Track M of docs/pressure-testing.md).
//
// Drives bin/codex-bridge-mcp exactly as Claude Code does (stdio JSON-RPC,
// tools/call with a progress token), one scenario at a time under a lock,
// and appends a ledger row per run. Scenarios are JSON files under
// scenarios/<tier>/<name>.json; see scenarios/README.md for the format.
//
//   node scripts/pressure.mjs --list
//   node scripts/pressure.mjs scenarios/t0/finder-read.json
//   node scripts/pressure.mjs --tier t0 [--attended] [--repeat 3] [--effort low] [--model gpt-6-sol]
//   node scripts/pressure.mjs --all --dry-run
//
// Output: ~/.local/state/codex-bridge/pressure/<date>/ledger.jsonl plus a
// directory per run with result.txt, summary.json, progress.log, timeline
// files and any screenshots.

import { execFile, spawn } from 'node:child_process'
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const LAUNCHER = join(ROOT, 'bin', 'codex-bridge-mcp')
const SCENARIOS = join(ROOT, 'scenarios')
const STATE_DIR = process.env.CODEX_BRIDGE_STATE_DIR || join(homedir(), '.local', 'state', 'codex-bridge')
const PRESSURE_DIR = join(STATE_DIR, 'pressure')
const SCRATCH_DIR = join(PRESSURE_DIR, 'scratch')
const LOCK = join(PRESSURE_DIR, 'pressure.lock')
const OWNER_MARKER = join(PRESSURE_DIR, 'desktop-owner')
const RATE_LIMIT_STOP = Number(process.env.CODEX_BRIDGE_PRESSURE_RATE_STOP || 90)
const APP_DIRS = ['/Applications', '/System/Applications', '/System/Applications/Utilities', '/System/Library/CoreServices', join(homedir(), 'Applications')]

// ---------------------------------------------------------------------------
// CLI

function parseArgs(argv) {
  const flags = {}
  const pos = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const k = a.slice(2)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        flags[k] = next
        i++
      } else flags[k] = true
    } else pos.push(a)
  }
  return { flags, pos }
}

const { flags, pos } = parseArgs(process.argv.slice(2))
const log = (...a) => console.error('[pressure]', ...a)

function listScenarios() {
  const out = []
  if (!existsSync(SCENARIOS)) return out
  for (const tier of readdirSync(SCENARIOS).sort()) {
    const dir = join(SCENARIOS, tier)
    if (!statSync(dir).isDirectory()) continue
    for (const f of readdirSync(dir).sort()) if (f.endsWith('.json')) out.push(join(dir, f))
  }
  return out
}

function loadScenario(path) {
  const sc = JSON.parse(readFileSync(path, 'utf8'))
  sc.path = path
  sc.id ||= `${basename(dirname(path))}/${basename(path, '.json')}`
  sc.tier ||= basename(dirname(path))
  sc.track ||= 'M'
  sc.risk ||= 'read'
  sc.args ||= {}
  sc.expect ||= {}
  sc.preconditions ||= {}
  sc.ground_truth ||= []
  sc.cleanup ||= []
  return sc
}

function selectScenarios() {
  if (pos.length) return pos.map((p) => loadScenario(resolve(p)))
  let all = listScenarios().map(loadScenario)
  if (flags.tier) all = all.filter((s) => String(s.tier) === String(flags.tier) || s.id.startsWith(`${flags.tier}/`))
  if (flags.id) all = all.filter((s) => s.id === flags.id)
  if (!flags.tier && !flags.all && !flags.list && !flags.id) {
    log('nothing selected: pass a scenario path, --tier tN, --id, or --all')
    process.exit(2)
  }
  return all
}

// ---------------------------------------------------------------------------
// Preconditions, lock, markers

function appInstalled(name) {
  const candidates = [`${name}.app`]
  return APP_DIRS.some((d) => candidates.some((c) => existsSync(join(d, c))))
}

async function sh(command, { cwd = SCRATCH_DIR, timeoutMs = 60_000 } = {}) {
  try {
    const { stdout, stderr } = await execFileP('/bin/zsh', ['-lc', command], { cwd, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, SCRATCH: SCRATCH_DIR } })
    return { ok: true, code: 0, stdout: stdout.trim(), stderr: stderr.trim() }
  } catch (err) {
    return { ok: false, code: err.code ?? 1, stdout: (err.stdout || '').trim(), stderr: (err.stderr || err.message || '').trim() }
  }
}

async function checkPreconditions(sc) {
  const problems = []
  for (const app of sc.preconditions.apps_installed || []) if (!appInstalled(app)) problems.push(`app not installed: ${app}`)
  for (const f of sc.preconditions.files_exist || []) if (!existsSync(expand(f))) problems.push(`file missing: ${f}`)
  for (const c of sc.preconditions.commands || []) {
    const r = await sh(c)
    if (!r.ok) problems.push(`precondition command failed (${r.code}): ${c} :: ${r.stderr.slice(0, 200)}`)
  }
  return problems
}

const expand = (p) => p.replace(/^~(?=$|\/)/, homedir()).replace(/\$SCRATCH/g, SCRATCH_DIR)

function acquireLock() {
  mkdirSync(PRESSURE_DIR, { recursive: true })
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(LOCK, 'wx')
      writeFileSync(fd, String(process.pid))
      closeSync(fd)
      return () => {
        try {
          unlinkSync(LOCK)
        } catch {}
      }
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
      const pid = Number(readFileSync(LOCK, 'utf8').trim())
      let alive = false
      try {
        process.kill(pid, 0)
        alive = true
      } catch {}
      if (alive) throw new Error(`another pressure run holds ${LOCK} (pid ${pid})`)
      log(`stale lock from pid ${pid}; removing`)
      unlinkSync(LOCK)
    }
  }
  throw new Error('could not acquire lock')
}

function desktopOwner() {
  if (!existsSync(OWNER_MARKER)) return null
  return readFileSync(OWNER_MARKER, 'utf8').trim() || 'unknown'
}

// ---------------------------------------------------------------------------
// MCP client (one server process for the whole batch, as Claude Code keeps one)

class McpClient {
  #child
  #pending = new Map()
  #nextId = 1
  progress = [] // {t, message}
  t0 = Date.now()

  constructor(stderrPath) {
    mkdirSync(dirname(stderrPath), { recursive: true })
    this.#child = spawn(LAUNCHER, [], { stdio: ['pipe', 'pipe', openSync(stderrPath, 'a')] })
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
        this.progress.push({ t: Date.now() - this.t0, message: msg.params?.message })
        return
      }
      const p = this.#pending.get(msg.id)
      if (!p) return
      this.#pending.delete(msg.id)
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result)
    })
    this.#child.on('exit', (code) => {
      for (const p of this.#pending.values()) p.reject(new Error(`MCP server exited (${code})`))
      this.#pending.clear()
    })
  }

  request(method, params) {
    return new Promise((resolve, reject) => {
      const id = this.#nextId++
      this.#pending.set(id, { resolve, reject })
      this.#child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    })
  }

  notify(method, params) {
    this.#child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
  }

  async init() {
    const r = await this.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'codex-bridge-pressure', version: '0.1' } })
    this.notify('notifications/initialized')
    return r
  }

  callTool(name, args) {
    this.progress = []
    this.t0 = Date.now()
    return this.request('tools/call', { name, arguments: args, _meta: { progressToken: `p${this.#nextId}` } })
  }

  close() {
    this.#child.stdin.end()
    return new Promise((r) => this.#child.on('exit', r))
  }
}

// ---------------------------------------------------------------------------
// Expectations and ground truth

function checkExpect(sc, summary, text) {
  const e = sc.expect
  const fails = []
  const want = e.status || 'completed'
  if (summary.status !== want) fails.push(`status ${summary.status} != ${want}`)
  for (const s of e.contains || []) if (!new RegExp(s, 'i').test(text)) fails.push(`missing /${s}/`)
  for (const s of e.not_contains || []) if (new RegExp(s, 'i').test(text)) fails.push(`unexpected /${s}/`)
  if (Array.isArray(e.steps)) {
    const n = summary.steps.length
    if (n < e.steps[0] || n > e.steps[1]) fails.push(`steps ${n} outside [${e.steps[0]}, ${e.steps[1]}]`)
  }
  if (e.no_denials && summary.denied.length) fails.push(`denials: ${summary.denied.map((d) => d.app || d.command || 'other').join(', ')}`)
  for (const app of e.denied || []) if (!summary.denied.some((d) => (d.app || '').toLowerCase() === app.toLowerCase())) fails.push(`expected denial of ${app}`)
  if (e.screenshots_min != null && summary.screenshots.length < e.screenshots_min) fails.push(`screenshots ${summary.screenshots.length} < ${e.screenshots_min}`)
  if (e.failed_steps_max != null) {
    const f = summary.steps.filter((s) => s.error).length
    if (f > e.failed_steps_max) fails.push(`failed steps ${f} > ${e.failed_steps_max}`)
  }
  for (const f of e.files_exist || []) if (!existsSync(expand(f))) fails.push(`file should exist: ${f}`)
  for (const f of e.files_absent || []) if (existsSync(expand(f))) fails.push(`file should not exist: ${f}`)
  return fails
}

async function runGroundTruth(sc) {
  const out = []
  for (const g of sc.ground_truth) {
    const r = await sh(g.command)
    out.push({ name: g.name || g.command, passed: r.ok, stdout: r.stdout.slice(0, 300), stderr: r.stderr.slice(0, 300) })
  }
  return out
}

async function runCleanup(sc) {
  for (const c of sc.cleanup) {
    const r = await sh(c.command || c)
    if (!r.ok) log(`cleanup failed: ${c.command || c} :: ${r.stderr.slice(0, 200)}`)
  }
}

// ---------------------------------------------------------------------------
// Leftover detection: GUI apps running after the run that were not before.
// Cheap and model-free; dialogs are not visible this way, only processes.

// Only user-facing apps count: bundles under the Applications folders.
// System agents (screencaptureui, ManagedClient, Codex's own
// SkyComputerUseClient notifier) come and go on their own and are noise.
async function guiApps() {
  const r = await sh("ps -axo comm= | grep -E '^(/Applications|/System/Applications|" + homedir() + "/Applications)/[^/]+\\.app/Contents/MacOS/' | sed -E 's#.*/([^/]+)\\.app/Contents/MacOS/.*#\\1#' | sort -u")
  return new Set(r.stdout.split('\n').filter(Boolean))
}

// Launch-services alerts ("X.app is not open anymore") belong to
// CoreServicesUIAgent and survive the turn. A read-only System Events query
// lists its windows; no clicking happens here.
async function staleDialogs() {
  const r = await sh(`osascript -e 'tell application "System Events" to get name of every window of (every process whose name is "CoreServicesUIAgent")' 2>/dev/null`)
  const names = r.stdout.replace(/[{}]/g, '').split(',').map((x) => x.trim()).filter(Boolean)
  return names
}

// ---------------------------------------------------------------------------
// One run

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')
}

async function runScenario(mcp, sc, { attended, repeatIndex, effort, model, day, versions }) {
  const runId = `${stamp()}-${sc.id.replace(/[\/ ]/g, '_')}${repeatIndex ? `-r${repeatIndex}` : ''}`
  const runDir = join(PRESSURE_DIR, day, runId)
  mkdirSync(runDir, { recursive: true })
  mkdirSync(SCRATCH_DIR, { recursive: true })
  const row = {
    run_id: runId,
    scenario_id: sc.id,
    tier: sc.tier,
    track: sc.track,
    surfaces: sc.surfaces || [],
    risk: sc.risk,
    started_at: new Date().toISOString(),
    codex_version: versions.codex,
    app_version: versions.app,
    model: model || sc.args.model || null,
    effort: effort || sc.args.effort || null,
    roster: flags.roster || sc.args.mcp_roster || 'trim',
    instructions: flags.instructions ? basename(String(flags.instructions), '.md') : 'default',
    session: null,
    thread_id: null,
    turn_id: null,
    status: null,
    wall_ms: null,
    verdict: null,
    expect_failures: [],
    ground_truth: [],
    surface: null,
    finding: null,
    evidence: [runDir],
    follow_up: null,
  }

  const skip = (why) => {
    row.status = 'skipped'
    row.verdict = 'blocked'
    row.finding = why
    log(`SKIP ${sc.id}: ${why}`)
    return row
  }
  if (sc.never_run_unattended && !attended) return skip('never_run_unattended without --attended')
  const owner = desktopOwner()
  if (owner && sc.raises_windows) return skip(`desktop owned by ${owner} and scenario raises windows`)
  const problems = await checkPreconditions(sc)
  if (problems.length) return skip(problems.join('; '))

  // Session policy: fresh (new thread named after the run) or reuse:<name>.
  const policy = sc.session || 'fresh'
  const args = { ...sc.args, task: sc.task }
  if (policy === 'fresh') {
    args.session = `pressure-${sc.id.replace(/[\/ ]/g, '_')}`
    args.new_thread = true
  } else if (policy.startsWith('reuse:')) {
    args.session = policy.slice(6)
  } else args.session = policy
  if (effort) args.effort = effort
  if (model) args.model = model
  if (flags.roster) args.mcp_roster = flags.roster
  if (flags.instructions) args.developer_instructions = readFileSync(resolve(flags.instructions), 'utf8')
  args.cwd ||= SCRATCH_DIR
  row.session = args.session

  log(`RUN ${sc.id} (${row.session})`)
  const appsBefore = await guiApps()
  const t0 = Date.now()
  let res
  try {
    res = await mcp.callTool('codex_computer_use', args)
  } catch (err) {
    row.status = 'error'
    row.verdict = 'fail'
    row.surface = 'bridge'
    row.finding = `tool call failed: ${err.message}`
    row.wall_ms = Date.now() - t0
    writeFileSync(join(runDir, 'progress.log'), mcp.progress.map((p) => `${p.t}\t${p.message}`).join('\n'))
    await runCleanup(sc)
    return row
  }
  row.wall_ms = Date.now() - t0
  const text = (res.content || []).find((c) => c.type === 'text')?.text || ''
  const images = (res.content || []).filter((c) => c.type === 'image')
  const summary = res.structuredContent || { status: 'unknown', steps: [], denied: [], screenshots: [] }
  writeFileSync(join(runDir, 'result.txt'), text)
  writeFileSync(join(runDir, 'summary.json'), JSON.stringify(summary, null, 2))
  writeFileSync(join(runDir, 'progress.log'), mcp.progress.map((p) => `${p.t}\t${p.message}`).join('\n'))
  images.forEach((img, i) => writeFileSync(join(runDir, `returned-${i + 1}.${(img.mimeType || 'image/jpeg').split('/')[1]}`), Buffer.from(img.data, 'base64')))
  for (const s of summary.screenshots || []) if (s.path && existsSync(s.path)) copyFileSync(s.path, join(runDir, basename(s.path)))
  if (summary.timelinePath && existsSync(summary.timelinePath)) {
    copyFileSync(summary.timelinePath, join(runDir, basename(summary.timelinePath)))
    const j = summary.timelinePath.replace(/\.jsonl$/, '.json')
    if (existsSync(j)) copyFileSync(j, join(runDir, basename(j)))
  }

  row.thread_id = summary.threadId || null
  row.turn_id = summary.turnId || null
  row.status = summary.status
  row.steps = summary.steps?.length ?? null
  row.tool_calls = summary.metrics?.cua_calls ?? null
  row.failed_steps = (summary.steps || []).filter((s) => s.error).length
  row.first_step_ms = summary.metrics?.first_action_ms ?? null
  try {
    const tl = readFileSync(summary.timelinePath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    row.model_calls = tl.filter((e) => e.ev === 'item_started' && e.type !== 'userMessage' && e.type !== 'dynamicToolCall').length
    row.preamble_messages = tl.filter((e) => e.ev === 'item_started' && e.type === 'agentMessage').length - 1
  } catch {
    row.model_calls = null
  }
  row.boot_ms = summary.metrics?.boot_ms ?? null
  row.cua_ms = summary.metrics?.cua_ms ?? null
  row.model_ms = summary.metrics?.model_ms ?? null
  row.tokens_in = summary.metrics?.tokens_in ?? null
  row.tokens_cached = summary.metrics?.tokens_cached ?? null
  row.tokens_out = summary.metrics?.tokens_out ?? null
  row.rate_limit_pct = summary.metrics?.rate_limit_pct ?? null
  row.result_bytes = summary.metrics?.result_bytes ?? null
  row.approvals = (summary.approvals || []).map((a) => a.app || a.command || 'file')
  row.denials = (summary.denied || []).map((d) => d.app || d.command || 'other')
  row.questions = (summary.questions || []).length
  row.screenshots = (summary.screenshots || []).length
  row.images_returned = images.length
  row.is_error = !!res.isError

  row.expect_failures = checkExpect(sc, summary, text)
  row.ground_truth = await runGroundTruth(sc)
  const gtFailed = row.ground_truth.filter((g) => !g.passed)
  // Anything Codex launched and did not quit is a cleanup failure, before
  // our own cleanup hides it.
  const appsAfter = await guiApps()
  const ignoreApps = (process.env.CODEX_BRIDGE_PRESSURE_IGNORE_APPS || 'PIA Split Tunnel,Private Internet Access').split(',').map((x) => x.trim())
  row.left_running = [...appsAfter].filter((a) => !appsBefore.has(a) && !(sc.expect.may_leave_running || []).includes(a) && !ignoreApps.includes(a))
  if (row.left_running.length) row.expect_failures.push(`left running: ${row.left_running.join(', ')}`)
  row.left_dialogs = await staleDialogs()
  if (row.left_dialogs.length) row.expect_failures.push(`stale dialog: ${row.left_dialogs.join(' | ')}`)
  await runCleanup(sc)
  // A fresh session was scratch: archive its thread so the daemon frees the
  // MCP servers and Computer Use runtime it keeps alive per loaded thread.
  if (policy === 'fresh' && !flags['keep-sessions']) {
    try {
      await mcp.callTool('codex_close_session', { session: row.session })
    } catch (err) {
      log(`close session ${row.session} failed: ${err.message}`)
    }
  }

  if (!row.expect_failures.length && !gtFailed.length) row.verdict = 'pass'
  else if (summary.status === 'completed' && (row.expect_failures.length || gtFailed.length)) row.verdict = 'partial'
  else row.verdict = 'fail'
  if (row.verdict !== 'pass') row.finding = [...row.expect_failures, ...gtFailed.map((g) => `ground truth failed: ${g.name}`)].join('; ')
  log(`${row.verdict.toUpperCase()} ${sc.id} ${(row.wall_ms / 1000).toFixed(1)}s steps=${row.steps} tokens=${row.tokens_in}${row.finding ? ` :: ${row.finding}` : ''}`)
  return row
}

// ---------------------------------------------------------------------------
// Main

async function versionsOf() {
  const out = { codex: null, app: null }
  try {
    const { stdout } = await execFileP('/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex', ['--version'])
    out.codex = stdout.trim().replace(/^codex-cli\s+/, '')
  } catch {}
  try {
    const { stdout } = await execFileP('/usr/bin/defaults', ['read', '/Applications/ChatGPT.app/Contents/Info.plist', 'CFBundleShortVersionString'])
    out.app = stdout.trim()
  } catch {}
  return out
}

async function main() {
  if (flags.list) {
    for (const p of listScenarios()) {
      const sc = loadScenario(p)
      console.log(`${sc.id.padEnd(36)} tier=${sc.tier} track=${sc.track} risk=${sc.risk}${sc.raises_windows ? ' raises-windows' : ''}${sc.never_run_unattended ? ' attended-only' : ''}`)
    }
    return 0
  }
  const scenarios = selectScenarios()
  if (!scenarios.length) {
    log('no scenarios matched')
    return 2
  }
  const repeat = Number(flags.repeat || 1)
  if (flags['dry-run']) {
    for (const sc of scenarios) console.log(`would run ${sc.id} x${repeat} (${sc.risk}${sc.raises_windows ? ', raises windows' : ''})`)
    return 0
  }
  const day = new Date().toISOString().slice(0, 10)
  const dayDir = join(PRESSURE_DIR, day)
  mkdirSync(dayDir, { recursive: true })
  const release = acquireLock()
  const versions = await versionsOf()
  const mcp = new McpClient(join(dayDir, 'mcp-server.stderr.log'))
  let exit = 0
  try {
    await mcp.init()
    const status = await mcp.callTool('codex_status', {})
    const statusText = status.content?.[0]?.text || ''
    if (!/connected via/.test(statusText)) {
      log(`bridge not connected:\n${statusText}`)
      return 3
    }
    log(`bridge ok: ${statusText.split('\n')[0]}`)
    const ledger = join(dayDir, 'ledger.jsonl')
    for (const sc of scenarios) {
      for (let i = 0; i < repeat; i++) {
        const row = await runScenario(mcp, sc, { attended: !!flags.attended, repeatIndex: repeat > 1 ? i + 1 : 0, effort: flags.effort, model: flags.model, day, versions })
        writeFileSync(ledger, JSON.stringify(row) + '\n', { flag: 'a' })
        if (row.verdict === 'fail') exit = 1
        if (row.rate_limit_pct != null && row.rate_limit_pct >= RATE_LIMIT_STOP) {
          log(`codex weekly limit at ${row.rate_limit_pct}% (stop threshold ${RATE_LIMIT_STOP}%); stopping`)
          return 4
        }
      }
    }
    log(`ledger: ${ledger}`)
    return exit
  } finally {
    await mcp.close()
    release()
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    log(err.stack || err.message)
    process.exit(1)
  })
