// Routing between the two ways stage two can run:
//   api           the Kickoff ZDR OpenAI key (Decisions API, or chat for rollback)
//   subscription  Taylor's ChatGPT subscription, through the official Codex CLI
//
// Taylor's rule: anything from the ZDR harness, or associated with it (it is
// cleared for PHI), must never go through the personal subscription; only the
// API key. Everything else uses the subscription to save cost.
//
// So every PHI signal below forces `api`, and nothing can override it. A signal
// that cannot be evaluated counts as present (fail closed). There is no path
// from `api` to `subscription`: a job routed `api` stays `api`, and fallbacks
// only ever go subscription -> api.
//
// Nothing here returns or logs paths, env values or process command lines:
// reasons name the kind of signal and, for env vars, the variable name only.

import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

export const HARNESS_DIR_NAME = '.zdr-harness'
const HARNESS_HOME_SUFFIX = `/${HARNESS_DIR_NAME}/home`
const HARNESS_IN_PATH = /\/\.zdr-harness(\/|$)/
// Environment the ZDR harness sets (apps/zdr-agent/bin/zdr-harness
// isolated_env): ZDR_HARNESS_*, ZDR_MEMORY_DIR, KICKOFF_ZDR_*,
// KICKOFF_SLACK_ZDR_BOT_TOKEN, OPENCODE_*; plus HOME, TMPDIR and XDG_* under
// ~/.zdr-harness (caught by the value test).
const HARNESS_ENV_NAME = /(^|_)ZDR(_|$)|^OPENCODE_/
// The service's own key name is injected by the fleet runner in every scope;
// it is not a harness signal. CLASSIFIER_* are this service's own settings.
const NOT_SIGNALS = /^(KICKOFF_OPENAI_ZDR_API_KEY|CLASSIFIER_.*)$/
// Ancestor processes: anything run from ~/.zdr-harness (the harness's
// OpenCode and its node_modules), the zdr-harness script, the zdr-agent app
// directory, or the ZDR Harness app.
const HARNESS_PROCESS = /\/\.zdr-harness\/|(^|[/\s])zdr-harness(\s|$)|\/apps\/zdr-agent\/|ZDR Harness\.app/
const TRUE = /^(1|true|yes|on)$/i

const realHome = () => process.env.CLASSIFIER_REAL_HOME || homedir()

// ---------------------------------------------------------------------------
// Individual signals. Each returns { present: bool, reasons: [] } or throws
// when it cannot be evaluated.

export function scopeSignal(env = process.env) {
  const reasons = []
  if (env.CLASSIFIER_SCOPE === 'zdr') reasons.push('scope: zdr (started by the ZDR harness)')
  if ((env.HOME || '').endsWith(HARNESS_HOME_SUFFIX)) reasons.push('scope: HOME is the ZDR harness home')
  if (env.CLASSIFIER_SCOPE !== undefined && env.CLASSIFIER_SCOPE !== 'zdr' && env.CLASSIFIER_SCOPE !== 'local') reasons.push('scope: unrecognised scope value')
  return reasons
}

// Env names and values. Under the launcher, node runs with an emptied
// environment, so the launcher evaluates the caller's environment first and
// passes the signalling names in CLASSIFIER_ENV_SIGNALS, with
// CLASSIFIER_ENV_CHECKED=1 to prove it ran. Launched (CLASSIFIER_SCOPE set)
// without that proof = not evaluated = PHI.
export function envSignal(env = process.env) {
  const reasons = []
  if (env.CLASSIFIER_SCOPE !== undefined && env.CLASSIFIER_ENV_CHECKED !== '1') reasons.push('env: the launcher did not report the caller environment (cannot evaluate)')
  for (const name of (env.CLASSIFIER_ENV_SIGNALS || '').split(',').filter(Boolean)) reasons.push(`env: caller had ${name.replace(/[^A-Za-z0-9_]/g, '')}`)
  for (const [name, value] of Object.entries(env)) {
    if (NOT_SIGNALS.test(name)) continue
    if (HARNESS_ENV_NAME.test(name)) reasons.push(`env: ${name} is set`)
    else if (typeof value === 'string' && value.includes(`/${HARNESS_DIR_NAME}`)) reasons.push(`env: ${name} points into the ZDR harness`)
  }
  return reasons
}

export function explicitSignal({ args = {}, env = process.env, job = null } = {}) {
  const reasons = []
  if (args.phi === true || args.zdr === true || TRUE.test(String(args.phi ?? '')) || TRUE.test(String(args.zdr ?? ''))) reasons.push('explicit: phi/zdr flag on the call')
  if (TRUE.test(env.CLASSIFIER_PHI || '')) reasons.push('explicit: CLASSIFIER_PHI is set')
  if (job?.spec?.phi) reasons.push('explicit: the job was started with the phi flag')
  return reasons
}

// Resolves a path through symlinks even when its tail does not exist yet.
function realish(p) {
  let cur = resolve(p)
  const tail = []
  for (let i = 0; i < 256; i++) {
    if (existsSync(cur)) return join(realpathSync(cur), ...tail.reverse())
    const parent = dirname(cur)
    if (parent === cur) return resolve(p)
    tail.push(basename(cur))
    cur = parent
  }
  throw new Error('path too deep')
}

let harnessReal
function harnessRoots() {
  const roots = [join(realHome(), HARNESS_DIR_NAME)]
  if (harnessReal === undefined) {
    try {
      harnessReal = existsSync(roots[0]) ? realpathSync(roots[0]) : null
    } catch {
      harnessReal = null
    }
  }
  if (harnessReal) roots.push(harnessReal)
  return roots
}

export function pathSignal(paths = []) {
  const reasons = []
  const roots = harnessRoots()
  for (const [kind, p] of paths) {
    if (p == null || p === '') continue
    if (typeof p !== 'string' || !isAbsolute(p)) {
      reasons.push(`path: the ${kind} path could not be resolved (cannot evaluate)`)
      continue
    }
    let real
    try {
      real = realish(p)
    } catch {
      reasons.push(`path: the ${kind} path could not be resolved (cannot evaluate)`)
      continue
    }
    const under = [p, real].some((x) => HARNESS_IN_PATH.test(x) || roots.some((r) => x === r || x.startsWith(`${r}/`)))
    if (under) reasons.push(`path: the ${kind} is inside ~/.zdr-harness`)
  }
  return reasons
}

// Walks this process's ancestors with one ps call. Not found in the listing or
// ps failing = cannot evaluate.
export function processSignal({ pid = process.pid, ps = defaultPs } = {}) {
  let listing
  try {
    listing = ps()
  } catch {
    return ['process: the parent process chain could not be read (cannot evaluate)']
  }
  const table = new Map()
  for (const line of listing.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s(.*)$/)
    if (m) table.set(Number(m[1]), { ppid: Number(m[2]), command: m[3] })
  }
  if (!table.has(pid)) return ['process: this process is missing from the process list (cannot evaluate)']
  const seen = new Set()
  for (let cur = pid; cur > 1 && !seen.has(cur); ) {
    seen.add(cur)
    const row = table.get(cur)
    if (!row) break
    if (HARNESS_PROCESS.test(row.command)) return [`process: an ancestor process belongs to the ZDR harness${cur === pid ? ' (this process)' : ''}`]
    cur = row.ppid
  }
  return []
}
function defaultPs() {
  return execFileSync('/bin/ps', ['-axww', '-o', 'pid=,ppid=,command='], { encoding: 'utf8', timeout: 5000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
}

// Jobs and profiles carry the scopes that created or touched them. A profile
// with no recorded scopes predates this check: its provenance is unknown.
export function recordSignal({ job = null, profile = null } = {}) {
  const reasons = []
  if (job) {
    if (job.scope === 'zdr') reasons.push('record: the job was created in the zdr scope')
    if (job.route?.phi) reasons.push('record: the job was routed as PHI when it was created')
    if (!job.route) reasons.push('record: the job has no routing record (cannot evaluate)')
  }
  if (profile) {
    if (!Array.isArray(profile.scopes) || profile.scopes.includes('unknown')) reasons.push(`record: profile ${profile.name} has no complete scope history (saved before routing; cannot evaluate)`)
    if (Array.isArray(profile.scopes) && profile.scopes.includes('zdr')) reasons.push(`record: profile ${profile.name} was created or used in the zdr scope`)
  }
  return reasons
}

// ---------------------------------------------------------------------------
// All signals together. ctx: { args, paths: [[kind, abs]], job, profile, env,
// ps, pid }. Returns the PHI reasons; an empty list means no signal at all.

export function phiReasons(ctx = {}) {
  const env = ctx.env || process.env
  const reasons = []
  const guard = (name, fn) => {
    try {
      reasons.push(...fn())
    } catch {
      reasons.push(`${name}: could not be evaluated`)
    }
  }
  guard('scope', () => scopeSignal(env))
  guard('env', () => envSignal(env))
  guard('explicit', () => explicitSignal({ args: ctx.args, env, job: ctx.job }))
  guard('path', () => pathSignal([['working directory', safeCwd()], ['jobs store', env.CLASSIFIER_JOBS_DIR || null], ...(ctx.paths || [])]))
  guard('process', () => processSignal({ pid: ctx.pid, ps: ctx.ps }))
  guard('record', () => recordSignal({ job: ctx.job, profile: ctx.profile }))
  return [...new Set(reasons)]
}
const safeCwd = () => {
  try {
    return process.cwd()
  } catch {
    return 'unresolvable'
  }
}

export class PhiRefusal extends Error {
  constructor(reasons) {
    super(`Refused: PHI signals present (${reasons.join('; ')}). This work may only use the API key.`)
    this.code = 'phi_refused'
    this.reasons = reasons
    this.retryable = false
  }
}

// The subscription engine calls this immediately before it spawns Codex.
export function assertNoPhi(ctx = {}) {
  const reasons = phiReasons(ctx)
  if (reasons.length) throw new PhiRefusal(reasons)
}

// ---------------------------------------------------------------------------
// The routing decision. subscriptionStatus: () => { available, why } (only
// called when no PHI signal is present, so Codex is never even probed for PHI
// work). Returns { route, engine, stage1, phi, reasons, at }.

export function stage2ApiEngine(env = process.env) {
  return env.CLASSIFIER_STAGE2 === 'chat' ? 'chat' : 'decisions'
}

export function decideRoute(ctx = {}, { subscriptionStatus } = {}) {
  const env = ctx.env || process.env
  const api = (phi, reasons) => ({ route: 'api', engine: stage2ApiEngine(env), stage1: 'embed', phi, reasons, at: new Date().toISOString() })
  const phi = phiReasons(ctx)
  if (phi.length) return api(true, phi)
  const mode = (env.CLASSIFIER_ROUTE || 'auto').toLowerCase()
  if (mode === 'api') return api(false, ['no PHI signal; CLASSIFIER_ROUTE=api forces the API key'])
  if (ctx.args?.engine === 'api') return api(false, ['no PHI signal; the call asked for engine "api"'])
  if (mode !== 'auto' && mode !== 'subscription') return api(false, [`no PHI signal; unknown CLASSIFIER_ROUTE value, using the API key`])
  let status
  try {
    status = subscriptionStatus ? subscriptionStatus() : { available: false, why: 'no subscription check configured' }
  } catch {
    status = { available: false, why: 'the subscription check failed' }
  }
  if (!status.available) return api(false, [`no PHI signal; subscription unavailable (${status.why}), so the API key is used`])
  const stage1 = env.CLASSIFIER_SUB_STAGE1 === 'skip' ? 'skip' : 'embed'
  return { route: 'subscription', engine: 'codex', stage1, phi: false, reasons: [`no PHI signal (scope, env, paths, process chain, records, flags all clear); ${status.why}`], at: new Date().toISOString() }
}

// One line for results and logs.
export function describeRoute(r) {
  if (!r) return 'Engine: unknown.'
  const engine = r.route === 'subscription' ? 'ChatGPT subscription via Codex CLI' : r.engine === 'chat' ? 'API key, chat completions (rollback)' : 'API key, Decisions API'
  const fb = r.fallback ? ` Fallback: ${r.fallback.items} item${r.fallback.items === 1 ? '' : 's'} went to the API key (${r.fallback.reason}).` : ''
  return `Engine: ${engine}${r.route === 'subscription' && r.stage1 === 'skip' ? ', no embedding stage' : ''}. Route reasons: ${r.reasons.join('; ')}.${fb}`
}
