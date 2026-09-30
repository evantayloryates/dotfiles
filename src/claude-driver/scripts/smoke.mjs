#!/usr/bin/env node
// End-to-end tests through the MCP launcher, as a non-desktop harness would
// see the server (CLAUDE_CODE_ENTRYPOINT stripped, so Tier B goes through the
// broker). Ground truth comes from the driver's disk reads, never the UI.
//
//   node scripts/smoke.mjs                 t0 + t1 (safe, ~15 s)
//   node scripts/smoke.mjs t2 t3 t4        chosen tiers
//   node scripts/smoke.mjs --all           t0–t4 (t5 needs --attended, t6 needs --attended)
//   node scripts/smoke.mjs --attended t5 t6
//
// Scenario format: scenarios/README.md.

import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const argv = process.argv.slice(2)
const attended = argv.includes('--attended')
let tiers = argv.filter((a) => /^t\d$/.test(a))
if (argv.includes('--all')) tiers = ['t0', 't1', 't2', 't3', 't4']
if (!tiers.length) tiers = ['t0', 't1']

const STATE = process.env.CLAUDE_DRIVER_STATE_DIR || join(homedir(), '.local', 'state', 'claude-driver')
const TS = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
const SCRATCH = join(STATE, 'probe', `smoke-${TS}`)
mkdirSync(SCRATCH, { recursive: true })

const env = { ...process.env }
delete env.CLAUDE_CODE_ENTRYPOINT
const child = spawn(join(ROOT, 'bin', 'claude-driver-mcp'), [], { stdio: ['pipe', 'pipe', 'inherit'], env })
const rl = createInterface({ input: child.stdout })
const pending = new Map()
let nextId = 1
rl.on('line', (line) => {
  if (!line.trim()) return
  const msg = JSON.parse(line)
  if (msg.method === 'notifications/progress') return console.log(`      · ${msg.params.message}`)
  const p = pending.get(msg.id)
  if (!p) return
  pending.delete(msg.id)
  msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result)
})
const send = (m) => child.stdin.write(`${JSON.stringify(m)}\n`)
const request = (method, params) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    send({ jsonrpc: '2.0', id, method, params })
  })

async function call(tool, args) {
  const r = await request('tools/call', { name: tool, arguments: args, _meta: { progressToken: `p${nextId}` } })
  const text = r.content?.[0]?.text || ''
  let data = r.structuredContent
  if (data === undefined) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  return { isError: !!r.isError, text, data }
}

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)

function subst(v, vars) {
  if (typeof v === 'string') {
    const whole = v.match(/^\$\{(\w+)\}$/)
    if (whole) return vars[whole[1]]
    return v.replace(/\$\{(\w+)\}/g, (_, k) => String(vars[k]))
  }
  if (Array.isArray(v)) return v.map((x) => subst(x, vars))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, subst(x, vars)]))
  return v
}

function check(step, res, vars) {
  const errs = []
  const e = step.expect || {}
  if ((e.error ?? false) !== res.isError) errs.push(`isError ${res.isError}, expected ${e.error ?? false}: ${res.text.slice(0, 300)}`)
  for (const [p, want] of Object.entries(subst(e.equals || {}, vars))) {
    const got = get(res.data, p)
    if (JSON.stringify(got) !== JSON.stringify(want)) errs.push(`${p} = ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
  }
  for (const [p, re] of Object.entries(e.matches || {})) {
    const got = p === '$text' ? res.text : get(res.data, p)
    if (!new RegExp(re, 'i').test(String(got))) errs.push(`${p} = ${JSON.stringify(got)?.slice(0, 200)} does not match /${re}/`)
  }
  return errs
}

async function runScenario(file) {
  const sc = JSON.parse(readFileSync(file, 'utf8'))
  const id = sc.id || file.split('/scenarios/')[1].replace(/\.json$/, '')
  if (sc.never_run_unattended && !attended) return { id, skipped: 'needs --attended' }
  const vars = { SCRATCH, STATE, TS, HOME: homedir() }
  const failures = []
  const t0 = Date.now()
  console.log(`\n▶ ${id} — ${sc.description || ''}`)
  const steps = [...(sc.steps || [])]
  for (const step of steps) {
    if (step.tool === '_sleep') {
      await new Promise((r) => setTimeout(r, step.args?.ms || 1000))
      continue
    }
    const args = subst(step.args || {}, vars)
    const res = await call(step.tool, args)
    const errs = check(step, res, vars)
    for (const [name, path] of Object.entries(step.save || {})) vars[name] = get(res.data, path)
    console.log(`   ${errs.length ? '✗' : '✓'} ${step.name || step.tool}${errs.length ? `\n      ${errs.join('\n      ')}` : ''}`)
    if (errs.length) {
      failures.push(...errs.map((x) => `${step.name || step.tool}: ${x}`))
      if (!step.continue_on_fail) break
    }
  }
  for (const step of sc.cleanup || []) {
    try {
      const res = await call(step.tool, subst(step.args || {}, vars))
      console.log(`   ⌫ ${step.name || step.tool}${res.isError ? ` (error: ${res.text.slice(0, 120)})` : ''}`)
    } catch (err) {
      console.log(`   ⌫ ${step.tool} threw ${err.message}`)
    }
  }
  return { id, ok: !failures.length, failures, ms: Date.now() - t0 }
}

let results = []
try {
  const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-driver-smoke', version: '1' } })
  send({ jsonrpc: '2.0', method: 'notifications/initialized' })
  console.log(`initialized ${init.serverInfo.name} ${init.serverInfo.version}; scratch ${SCRATCH}`)
  for (const tier of tiers) {
    if (['t5', 't6'].includes(tier) && !attended) {
      results.push({ id: tier, skipped: 'needs --attended' })
      continue
    }
    const dir = join(ROOT, 'scenarios', tier)
    let files = []
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    } catch {}
    for (const f of files) results.push(await runScenario(join(dir, f)))
  }
} catch (err) {
  console.error(`smoke failed: ${err.message}`)
  results.push({ id: 'harness', ok: false, failures: [err.message] })
} finally {
  child.stdin.end()
  await new Promise((r) => child.on('exit', r))
}
console.log('\nSummary')
for (const r of results) console.log(`  ${r.skipped ? '–' : r.ok ? '✓' : '✗'} ${r.id}${r.skipped ? ` (${r.skipped})` : ` ${(r.ms / 1000).toFixed(1)}s`}`)
const failed = results.some((r) => r.ok === false)
console.log(failed ? 'SMOKE FAILED' : 'SMOKE OK')
process.exit(failed ? 1 : 0)
