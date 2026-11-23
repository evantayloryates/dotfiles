// Paid Codex credits on the subscription route (Taylor, 2026-11-23: spending
// credits is fine, but tell him when it starts). When the ChatGPT plan's
// usage limit is reached and the account has credits, Codex keeps answering
// and bills credits instead of failing, so nothing in a Codex call shows it.
// This reads the account's limits through the official app-server method
// `account/rateLimits/read` (no model call, no text sent) and posts a macOS
// notification when credits are in use:
//   - the plan limit is reached (or 100% used) and the account has credits, or
//   - the credit balance fell since the last reading (within two hours).
// At most one notification per job and one per hour overall. Only ever run
// on the subscription route (no PHI signal); never for API-key work.
//
// Release-2 note: a persistent app-server engine can feed `check()` from its
// own `account/rateLimits/updated` notifications instead of spawning a reader.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { JOBS_DIR } from './paths.mjs'
import { configuredMcpServers, disableArgs, GIT_PATHS, watchTree } from './codex-lockdown.mjs'

const realHome = () => process.env.CLASSIFIER_REAL_HOME || homedir()
const codexBin = () => process.env.CLASSIFIER_CODEX_BIN || join(realHome(), '.local', 'bin', 'codex')
const stateFile = () => join(dirname(JOBS_DIR), 'credits.json')
export const NOTIFY_HELPER = () => join(realHome(), '.claude', 'skills', 'notify-macos', 'scripts', 'notify.py')
const HOUR = 3_600_000
const BASELINE_MAX_AGE = 2 * HOUR

// One reading: { usedPercent, reached, hasCredits, unlimited, balance } or
// null when it cannot be read (never an error for the caller).
export function readLimits({ spawnFn = spawn, timeoutMs = 20_000, ps } = {}) {
  return new Promise((resolve) => {
    let child
    try {
      // Every configured MCP server off by name (codex-lockdown.mjs), and
      // config/read must confirm it before the limits are read.
      const mcp = configuredMcpServers()
      if (mcp.odd) return resolve(null)
      child = spawnFn(codexBin(), ['app-server', '--stdio', ...disableArgs(mcp.names)], { cwd: tmpdir(), env: { HOME: realHome(), PATH: '/usr/bin:/bin', TMPDIR: process.env.TMPDIR || tmpdir(), LANG: 'en_US.UTF-8' }, stdio: ['pipe', 'pipe', 'ignore'], detached: true })
    } catch {
      return resolve(null)
    }
    // Backstop: nothing but git (by full system path) may run under the
    // reader; anything else, at any time or still there at the end, voids
    // the reading (codex-lockdown.mjs).
    let unsafe = false
    const watch = child.pid ? watchTree(child.pid, { allow: GIT_PATHS, ...(ps && { ps }), onBad: () => { unsafe = true; finish(null) } }) : null
    let buf = ''
    let settled = false
    const finish = (v) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      watch?.stop()
      if (v && watch && watch.check(true).length) unsafe = true
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {
        try {
          child.kill()
        } catch {}
      }
      resolve(unsafe ? null : v)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    child.on('error', () => finish(null))
    child.on('close', () => finish(null))
    child.stdin.on('error', () => {})
    child.stdout.on('data', (d) => {
      buf += d
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i)
        buf = buf.slice(i + 1)
        let m
        try {
          m = JSON.parse(line)
        } catch {
          continue
        }
        if (m.id === 1 && m.result) {
          child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'initialized' })}\n`)
          child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'config/read', params: { cwd: tmpdir() } })}\n`)
        } else if (m.id === 3) {
          const servers = m.result?.config?.mcp_servers
          const all = servers && typeof servers === 'object' ? Object.values(servers) : []
          if (!m.result || all.some((v) => v?.enabled !== false)) return finish(null) // not locked down: no reading
          child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'account/rateLimits/read', params: null })}\n`)
        } else if (m.id === 2) finish(m.result ? parseLimits(m.result) : null)
        else if (m.id === 1 && m.error) finish(null)
      }
    })
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'bulk-classify', version: '1' } } })}\n`)
  })
}

export function parseLimits(r) {
  const rl = r?.rateLimits || {}
  const c = rl.credits || {}
  const balance = Number(c.balance)
  return {
    usedPercent: Number(rl.primary?.usedPercent ?? NaN),
    reached: !!rl.rateLimitReachedType || r?.ordinaryUsageAllowed === false,
    hasCredits: !!c.hasCredits,
    unlimited: !!c.unlimited,
    balance: Number.isFinite(balance) ? balance : null,
  }
}

// Is the subscription drawing paid credits now? prev: the last reading.
export function spendingCredits(prev, cur) {
  if (!cur || cur.unlimited) return false
  if (cur.hasCredits && (cur.reached || cur.usedPercent >= 100)) return true
  return !!(prev && prev.balance != null && cur.balance != null && cur.balance < prev.balance - 1e-6)
}

function loadState() {
  try {
    return JSON.parse(readFileSync(stateFile(), 'utf8'))
  } catch {
    return {}
  }
}
function saveState(s) {
  try {
    mkdirSync(dirname(stateFile()), { recursive: true, mode: 0o700 })
    const tmp = `${stateFile()}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(s), { mode: 0o600 })
    renameSync(tmp, stateFile())
  } catch {}
}

export function notify({ title, message, run = spawnSync } = {}) {
  const helper = NOTIFY_HELPER()
  if (!existsSync(helper)) return { accepted: false, why: 'notify helper missing' }
  const args = [helper, '--title', title, '--message', message, '--group', 'bulk-classify-credits']
  if (process.env.CLASSIFIER_NOTIFY_DRY === '1') args.push('--dry-run')
  try {
    const r = run('/usr/bin/python3', args, { env: { HOME: realHome(), PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8' }, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'] })
    return { accepted: r.status === 0 }
  } catch {
    return { accepted: false }
  }
}

// One check: read, compare with the last reading, remember it, and notify
// when credits are in use (throttled). job: the job id, or null for a
// classify_texts call. Returns what happened, for tests and the worker log.
export async function checkCredits({ job = null, read = readLimits, send = notify, now = Date.now() } = {}) {
  const cur = await read()
  if (!cur) return { read: false }
  const state = loadState()
  const prev = state.last && now - state.last.at < BASELINE_MAX_AGE ? state.last : null
  const spending = spendingCredits(prev, cur)
  state.last = { at: now, balance: cur.balance, usedPercent: cur.usedPercent }
  let notified = false
  if (spending) {
    const jobs = Array.isArray(state.notifiedJobs) ? state.notifiedJobs : []
    const recent = state.notifiedAt && now - state.notifiedAt < HOUR
    const seenJob = job && jobs.includes(job)
    if (!recent && !seenJob) {
      const r = send({ title: 'bulk-classify is using paid Codex credits', message: cur.reached || cur.usedPercent >= 100 ? 'The ChatGPT plan limit is reached, so subscription classification now draws Codex credits. Nothing is blocked.' : 'The Codex credit balance fell while bulk-classify ran on the subscription. Nothing is blocked.' })
      notified = !!r?.accepted
      state.notifiedAt = now
      if (job) state.notifiedJobs = [...jobs, job].slice(-50)
    }
  }
  saveState(state)
  return { read: true, spending, notified }
}

// Per-process throttle for classify_texts calls: at most one reading every
// ten minutes, never awaited by the call.
let lastTextsCheck = -Infinity
export function checkCreditsSoon(opts = {}, { now = performance.now() } = {}) {
  if (now - lastTextsCheck < 600_000) return false
  lastTextsCheck = now
  checkCredits(opts).catch(() => {})
  return true
}
