// Pilot runner: each task as a fresh headless session in the pilot project.
//   node harness/pilot/run.mjs <claude|codex> <anchor|direct> [--tasks t01,t02] [--jobs 4] [--out name]
// Sessions get MCP tools only: Claude with --tools "" and an allow list of
// pilot servers, Codex with a read-only sandbox and no user config. Each task
// has its own anchor state folder, and its daemon is stopped afterwards.
// Writes runs/<out>/<harness>-<mode>/<task>/{transcript.jsonl, result.json}.
import '../env.mjs'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { PILOT, ZDR_SAFE } from './setup.mjs'
import { paths } from '../../src/paths.mjs'

const [harness, mode] = process.argv.slice(2)
const opt = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
if (!['claude', 'codex'].includes(harness) || !['anchor', 'direct'].includes(mode)) { console.error('usage: run.mjs <claude|codex> <anchor|direct> [--tasks ids] [--jobs n] [--out name]'); process.exit(64) }
const P = paths()
const NODE = '/opt/homebrew/bin/node'
const SHIM = join(P.lab, 'src/shim.mjs')
const DIRECT = join(P.lab, 'test/pilot/direct-server.mjs')
const RUN = join(P.lab, '../_shared/bin/run')
const TIMEOUT_MS = Number(opt('timeout', 300_000))
const only = opt('tasks', '')?.split(',').filter(Boolean)
const tasks = JSON.parse(readFileSync(process.env.PILOT_TASKS || join(P.lab, 'test/pilot/tasks.json'), 'utf8')).filter((t) => !only?.length || only.includes(t.id))
const outDir = join(PILOT, 'runs', opt('out', new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')), `${harness}-${mode}`)

function servers(stateDir) {
  if (mode === 'anchor') return { anchor: { command: NODE, args: [SHIM], env: { ANCHOR_STATE_DIR: stateDir, ANCHOR_SERVICES_DIR: join(PILOT, 'services'), ANCHOR_ALERT_BACKEND: 'log' } } }
  const lab = (id) => ({ command: NODE, args: [DIRECT, join(PILOT, 'services', id)] })
  return {
    echo: lab('echo'), slow: lab('slow'), ledger: lab('ledger'),
    'db-kickoff-stage': { command: RUN, args: ['db-kickoff-stage'] },
    'zdr-agent': { command: NODE, args: [DIRECT, '--fleet', 'zdr-agent', '--only', ZDR_SAFE.join(',')] },
  }
}

function command(task, dir, stateDir) {
  const srv = servers(stateDir)
  const prompt = `${task.prompt}\n\nUse only the MCP tools you have. Answer in a few sentences.`
  if (harness === 'claude') {
    const cfg = join(dir, 'mcp.json')
    writeFileSync(cfg, JSON.stringify({ mcpServers: srv }, null, 1))
    mkdirSync(join(dir, '.claude-config'), { recursive: true })
    return {
      bin: join(homedir(), 'dotfiles/bin/claude-headless'),
      args: ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--model', 'claude-opus-5-5', '--permission-mode', 'dontAsk',
        '--setting-sources', 'user', '--settings', '{"disableAllHooks":true}', '--strict-mcp-config', '--mcp-config', cfg,
        '--tools', '', '--allowedTools', Object.keys(srv).map((k) => `mcp__${k}`).join(',')],
      env: { CLAUDE_CONFIG_DIR: join(dir, '.claude-config') },
    }
  }
  const c = []
  for (const [k, v] of Object.entries(srv)) {
    c.push('-c', `mcp_servers.${k}.command=${JSON.stringify(v.command)}`, '-c', `mcp_servers.${k}.args=${JSON.stringify(v.args)}`)
    for (const [ek, ev] of Object.entries(v.env || {})) c.push('-c', `mcp_servers.${k}.env.${ek}=${JSON.stringify(ev)}`)
    // Read-only sandbox: MCP calls would wait for approval that exec cannot give.
    c.push('-c', `mcp_servers.${k}.default_tools_approval_mode="approve"`)
    c.push('-c', `mcp_servers.${k}.startup_timeout_sec=60`, '-c', `mcp_servers.${k}.tool_timeout_sec=120`)
  }
  return {
    bin: 'codex',
    args: ['exec', '--json', '--ephemeral', '--ignore-user-config', '--skip-git-repo-check', '-s', 'read-only', '-c', 'approval_policy="never"', '-m', 'gpt-6-sol', '-c', 'model_reasoning_effort="high"', '-C', dir, ...c, prompt],
    env: {},
  }
}

async function runTask(task) {
  const dir = join(outDir, task.id)
  const stateDir = join(dir, 'state')
  mkdirSync(stateDir, { recursive: true })
  const { bin, args, env } = command(task, dir, stateDir)
  const t0 = Date.now()
  const r = await new Promise((done) => {
    const child = spawn(bin, args, { cwd: dir, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''; let err = ''
    child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', (d) => (err += d))
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS)
    child.on('exit', (code, signal) => { clearTimeout(timer); done({ code, signal, out, err }) })
  })
  writeFileSync(join(dir, 'transcript.jsonl'), r.out)
  if (r.err) writeFileSync(join(dir, 'stderr.txt'), r.err.slice(-20000))
  // Stop this task's daemon only (its pid file is in the task's state folder).
  const pidFile = join(stateDir, 'anchord.pid')
  if (existsSync(pidFile)) try { process.kill(Number(readFileSync(pidFile, 'utf8').trim()), 'SIGTERM') } catch {}
  const result = { task: task.id, harness, mode, ms: Date.now() - t0, exit: r.code, signal: r.signal }
  writeFileSync(join(dir, 'result.json'), JSON.stringify(result, null, 1))
  console.log(`${task.id} ${harness}-${mode} ${Math.round(result.ms / 1000)} s exit ${r.code}${r.signal ? ' ' + r.signal : ''}`)
}

const jobs = Number(opt('jobs', 4))
const queue = [...tasks]
await Promise.all(Array.from({ length: jobs }, async () => { while (queue.length) await runTask(queue.shift()) }))
console.log(`done: ${outDir}`)
