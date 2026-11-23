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

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync, statSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { stampedScopes } from './scopes.mjs'

export const HARNESS_DIR_NAME = '.zdr-harness'
const HARNESS_HOME_SUFFIX = `/${HARNESS_DIR_NAME}/home`
// Any mention of the harness directory, relative or absolute, counts: a false
// positive only costs money, a false negative breaks Taylor's rule.
const HARNESS_IN_TEXT = /\.zdr-harness(\/|$|[^A-Za-z0-9_-])/
// Environment the ZDR harness sets (apps/zdr-agent/bin/zdr-harness
// isolated_env): ZDR_HARNESS_*, ZDR_MEMORY_DIR, KICKOFF_ZDR_*,
// KICKOFF_SLACK_ZDR_BOT_TOKEN, OPENCODE_*; plus HOME, TMPDIR, PATH and XDG_*
// under ~/.zdr-harness (caught by the value test). Case-insensitive.
const HARNESS_ENV_NAME = /(^|_)ZDR(_|$)|^OPENCODE_/i
// The service's own key name is injected by the fleet runner in every scope;
// it is not a harness signal. CLASSIFIER_* are this service's own settings.
const NOT_SIGNALS = /^(KICKOFF_OPENAI_ZDR_API_KEY|CLASSIFIER_.*)$/
// Ancestor processes: anything run from ~/.zdr-harness (the harness's
// OpenCode and its node_modules), the zdr-harness script, the zdr-agent app
// directory, or the ZDR Harness app.
const HARNESS_PROCESS = /\/\.zdr-harness\/|(^|[/\s])zdr-harness(\s|$)|\/apps\/zdr-agent\/|ZDR Harness\.app/
const TRUE = /^(1|true|yes|on)$/i

// Each signal is { code, text }: the code goes to the audit line and the
// routing record, the text to the caller. Neither ever holds a path, an env
// value or a command line.
const sig = (code, text) => ({ code, text })

// ---------------------------------------------------------------------------
// Individual signals. Each returns a list of signals or throws when it cannot
// be evaluated.

export function scopeSignal(env = process.env) {
  const out = []
  if (env.CLASSIFIER_SCOPE === 'zdr') out.push(sig('scope_zdr', 'scope: zdr (started by the ZDR harness)'))
  const home = env.HOME || ''
  if (home.replace(/\/+$/, '').endsWith(HARNESS_HOME_SUFFIX) || HARNESS_IN_TEXT.test(home)) out.push(sig('scope_home', 'scope: HOME is the ZDR harness home'))
  if (env.CLASSIFIER_SCOPE !== undefined && env.CLASSIFIER_SCOPE !== 'zdr' && env.CLASSIFIER_SCOPE !== 'local') out.push(sig('scope_unknown', 'scope: unrecognised scope value'))
  return out
}

// Env names and values. Under the launcher, node runs with an emptied
// environment, so the launcher evaluates the caller's environment first and
// passes the signalling names in CLASSIFIER_ENV_SIGNALS, with
// CLASSIFIER_ENV_CHECKED=1 to prove it ran. Launched (CLASSIFIER_SCOPE set)
// without that proof = not evaluated = PHI.
export function envSignal(env = process.env) {
  const out = []
  if (env.CLASSIFIER_SCOPE !== undefined && env.CLASSIFIER_ENV_CHECKED !== '1') out.push(sig('env_unchecked', 'env: the launcher did not report the caller environment (cannot evaluate)'))
  for (const name of (env.CLASSIFIER_ENV_SIGNALS || '').split(',').filter(Boolean)) out.push(sig('env_caller', `env: caller had ${name.replace(/[^A-Za-z0-9_]/g, '')}`))
  for (const [name, value] of Object.entries(env)) {
    if (NOT_SIGNALS.test(name)) continue
    if (HARNESS_ENV_NAME.test(name)) out.push(sig('env_name', `env: ${name} is set`))
    else if (typeof value === 'string' && HARNESS_IN_TEXT.test(value)) out.push(sig('env_value', `env: ${name} points into the ZDR harness`))
  }
  return out
}

export function explicitSignal({ args = {}, env = process.env, job = null } = {}) {
  const out = []
  if (args.phi === true || args.zdr === true || TRUE.test(String(args.phi ?? '')) || TRUE.test(String(args.zdr ?? ''))) out.push(sig('explicit_flag', 'explicit: phi/zdr flag on the call'))
  if (TRUE.test(env.CLASSIFIER_PHI || '')) out.push(sig('explicit_env', 'explicit: CLASSIFIER_PHI is set'))
  if (job?.spec?.phi) out.push(sig('explicit_job', 'explicit: the job was started with the phi flag'))
  return out
}

// Resolves a path the way the kernel would: symlinks first, then `..`
// against the real parent (so /x/link/../f is the f beside the link's
// target, not /x/f), even when its tail does not exist yet. Lexical
// normalisation (path.resolve) gets this wrong for a symlink followed by `..`.
// A dangling symlink is followed too (a write through it lands at its target).
export function physicalPath(p, depth = 0) {
  if (depth > 40) throw new Error('too many links')
  if (existsSync(p)) return realpathSync.native(p)
  let cur = '/'
  const parts = p.split('/')
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (part === '' || part === '.') continue
    if (part === '..') {
      cur = dirname(cur)
      continue
    }
    const next = join(cur, part)
    if (existsSync(next)) {
      cur = realpathSync.native(next)
      continue
    }
    let link = null
    try {
      if (lstatSync(next).isSymbolicLink()) link = readlinkSync(next)
    } catch {}
    if (link !== null) return physicalPath([resolve(cur, link), ...parts.slice(i + 1)].join('/'), depth + 1)
    return resolve(next, ...parts.slice(i + 1))
  }
  return cur
}
const realish = physicalPath

// Every home this process could mean: the launcher's, the environment's, and
// the account's own (from the user database, which no environment changes).
// Re-read on each call: the directory may be created after the process starts.
function harnessRoots(env) {
  const homes = new Set([env.CLASSIFIER_REAL_HOME, homedir(), safe(() => userInfo().homedir)].filter(Boolean))
  const roots = new Set()
  for (const h of homes) {
    const r = join(h, HARNESS_DIR_NAME)
    roots.add(r)
    const real = safe(() => (existsSync(r) ? realpathSync(r) : null))
    if (real) roots.add(real)
  }
  return [...roots]
}
const safe = (fn) => {
  try {
    return fn()
  } catch {
    return null
  }
}

export function pathSignal(paths = [], env = process.env) {
  const out = []
  const roots = harnessRoots(env)
  for (const [kind, p] of paths) {
    if (p == null || p === '') continue
    if (typeof p !== 'string' || !isAbsolute(p)) {
      out.push(sig('path_unresolvable', `path: the ${kind} path could not be resolved (cannot evaluate)`))
      continue
    }
    let real
    try {
      real = realish(p)
    } catch {
      out.push(sig('path_unresolvable', `path: the ${kind} path could not be resolved (cannot evaluate)`))
      continue
    }
    const under = [p, resolve(p), real].some((x) => HARNESS_IN_TEXT.test(x) || roots.some((r) => x === r || x.startsWith(`${r}/`)))
    if (under) out.push(sig('path_harness', `path: the ${kind} is inside ~/.zdr-harness`))
  }
  return out
}

// Harness exports carry the extended attribute com.kickoff.zdr (set by the
// harness's export writers, apps/zdr-agent/mcps/kickoff-db/zdr-tag.mjs), and
// macOS cp, mv and Finder keep it, so a copy moved out of ~/.zdr-harness is
// still harness data. An input file carrying it, or whose attributes cannot
// be read, is PHI. Cached per file identity (inode, size, mtime) so the
// re-check before every Codex call does not spawn xattr each time.
export const ZDR_XATTR = 'com.kickoff.zdr'
const tagCache = new Map()
export function taggedSignal(paths = [], { run = spawnSync } = {}) {
  const out = []
  for (const [kind, p] of paths) {
    if (kind !== 'input file' || typeof p !== 'string' || !p) continue
    let real
    let id
    try {
      real = physicalPath(p)
      const st = statSync(real)
      if (!st.isFile()) continue
      id = `${real}\0${st.ino}\0${st.size}\0${st.mtimeMs}`
    } catch {
      continue // a missing input is refused by the reader; a path signal covers where it points
    }
    let tagged = tagCache.get(id)
    if (tagged === undefined) {
      const r = run('/usr/bin/xattr', ['-p', ZDR_XATTR, real], { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'ignore', 'pipe'] })
      tagged = r.status === 0 ? 'yes' : r.status === 1 && /no such xattr/i.test(r.stderr || '') ? 'no' : 'unknown'
      if (tagged !== 'unknown') tagCache.set(id, tagged)
    }
    if (tagged === 'yes') out.push(sig('path_tagged', `path: the ${kind} is marked as ZDR harness data`))
    else if (tagged === 'unknown') out.push(sig('path_tag_unreadable', `path: the ${kind}'s harness mark could not be read (cannot evaluate)`))
  }
  return out
}

// Walks this process's ancestors with one ps call. Not found in the listing or
// ps failing = cannot evaluate.
export function processSignal({ pid = process.pid, ps = defaultPs } = {}) {
  let listing
  try {
    listing = ps()
  } catch {
    return [sig('process_unreadable', 'process: the parent process chain could not be read (cannot evaluate)')]
  }
  const table = new Map()
  for (const line of listing.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s(.*)$/)
    if (m) table.set(Number(m[1]), { ppid: Number(m[2]), command: m[3] })
  }
  if (!table.has(pid)) return [sig('process_missing', 'process: this process is missing from the process list (cannot evaluate)')]
  const seen = new Set()
  for (let cur = pid; cur > 1 && !seen.has(cur); ) {
    seen.add(cur)
    const row = table.get(cur)
    if (!row) break
    if (HARNESS_PROCESS.test(row.command)) return [sig('process_harness', `process: an ancestor process belongs to the ZDR harness${cur === pid ? ' (this process)' : ''}`)]
    cur = row.ppid
  }
  return []
}
function defaultPs() {
  return execFileSync('/bin/ps', ['-axww', '-o', 'pid=,ppid=,command='], { encoding: 'utf8', timeout: 5000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
}

// Jobs and profiles carry the scopes that created or touched them. A profile
// with no recorded scopes predates this check: its provenance is unknown.
// Profile scopes are the union of the profile record and its append-only
// stamp file (scopes.mjs), read fresh every time.
export function recordSignal({ job = null, profile = null, stamps = stampedScopes } = {}) {
  const out = []
  if (job) {
    if (job.scope === 'zdr') out.push(sig('record_job_zdr', 'record: the job was created in the zdr scope'))
    if (job.route?.phi) out.push(sig('record_job_phi', 'record: the job was routed as PHI when it was created'))
    if (!job.route) out.push(sig('record_job_unrouted', 'record: the job has no routing record (cannot evaluate)'))
  }
  if (profile) {
    const scopes = [...(Array.isArray(profile.scopes) ? profile.scopes : ['unknown']), ...stamps(profile.name)]
    if (scopes.includes('unknown')) out.push(sig('record_profile_unknown', `record: profile ${profile.name} has no complete scope history (saved before routing; cannot evaluate)`))
    if (scopes.includes('zdr')) out.push(sig('record_profile_zdr', `record: profile ${profile.name} was created or used in the zdr scope`))
  }
  return out
}

// ---------------------------------------------------------------------------
// All signals together. ctx: { args, paths: [[kind, abs]], job, profile, env,
// ps, pid, stamps }. phiSignals returns [{code, text}]; phiReasons the texts.
// An empty list means no signal at all.

export function phiSignals(ctx = {}) {
  const env = ctx.env || process.env
  const out = []
  const guard = (name, fn) => {
    try {
      out.push(...fn())
    } catch {
      out.push(sig(`${name}_failed`, `${name}: could not be evaluated`))
    }
  }
  guard('scope', () => scopeSignal(env))
  guard('env', () => envSignal(env))
  guard('explicit', () => explicitSignal({ args: ctx.args, env, job: ctx.job }))
  guard('path', () =>
    pathSignal(
      [
        ['working directory', safeCwd()],
        ['home directory', env.HOME || null],
        ['temporary directory', env.TMPDIR || null],
        ['jobs store', env.CLASSIFIER_JOBS_DIR || null],
        ['profiles store', env.CLASSIFIER_PROFILES_DIR || null],
        ...(ctx.paths || []),
      ],
      env
    )
  )
  guard('tag', () => taggedSignal(ctx.paths || [], ctx.xattr ? { run: ctx.xattr } : {}))
  guard('process', () => processSignal({ pid: ctx.pid, ps: ctx.ps }))
  guard('record', () => recordSignal({ job: ctx.job, profile: ctx.profile, ...(ctx.stamps && { stamps: ctx.stamps }) }))
  const seen = new Set()
  return out.filter((s) => (seen.has(s.text) ? false : seen.add(s.text)))
}
export const phiReasons = (ctx = {}) => phiSignals(ctx).map((s) => s.text)
const safeCwd = () => {
  try {
    return process.cwd()
  } catch {
    return 'unresolvable'
  }
}

export class PhiRefusal extends Error {
  constructor(signals) {
    const reasons = signals.map((s) => (typeof s === 'string' ? s : s.text))
    super(`Refused: PHI signals present (${reasons.join('; ')}). This work may only use the API key.`)
    this.code = 'phi_refused'
    this.reasons = reasons
    this.codes = signals.map((s) => (typeof s === 'string' ? 'unknown' : s.code))
    this.retryable = false
  }
}

// The subscription engine calls this immediately before it spawns Codex.
export function assertNoPhi(ctx = {}) {
  const signals = phiSignals(ctx)
  if (signals.length) throw new PhiRefusal(signals)
}

// ---------------------------------------------------------------------------
// The routing decision. subscriptionStatus: () => { available, why } (only
// called when no PHI signal is present, so Codex is never even probed for PHI
// work). Returns { route, engine, stage1, phi, reasons, at }.

export function stage2ApiEngine(env = process.env) {
  return env.CLASSIFIER_STAGE2 === 'chat' ? 'chat' : 'decisions'
}

// Rollback lever: one file forces the API key for every caller in every
// scope, with no code change and no registration edits:
//   mkdir -p ~/.config/classifier && echo api > ~/.config/classifier/route
// Anything in the file other than "auto" (unreadable included) means the API
// key; remove the file (or write "auto") to go back. Read on every decision.
export function routeLeverPath(env = process.env) {
  return join(env.CLASSIFIER_REAL_HOME || safe(() => userInfo().homedir) || homedir(), '.config', 'classifier', 'route')
}
function routeLever(env) {
  const p = routeLeverPath(env)
  if (!existsSync(p)) return null
  let v
  try {
    v = readFileSync(p, 'utf8').trim().toLowerCase()
  } catch {
    return 'the route lever file cannot be read, so the API key is used'
  }
  return v === 'auto' ? null : 'the route lever (~/.config/classifier/route) forces the API key'
}

export function decideRoute(ctx = {}, { subscriptionStatus } = {}) {
  const env = ctx.env || process.env
  const at = new Date().toISOString()
  const api = (phi, list) => ({ route: 'api', engine: stage2ApiEngine(env), stage1: 'embed', phi, reasons: list.map((s) => s.text), codes: [...new Set(list.map((s) => s.code))], at })
  const phi = phiSignals(ctx)
  if (phi.length) return api(true, phi)
  const lever = routeLever(env)
  if (lever) return api(false, [sig('forced_api_file', `no PHI signal; ${lever}`)])
  const mode = (env.CLASSIFIER_ROUTE || 'auto').toLowerCase()
  if (mode === 'api') return api(false, [sig('forced_api_env', 'no PHI signal; CLASSIFIER_ROUTE=api forces the API key')])
  if (ctx.args?.engine === 'api') return api(false, [sig('forced_api_call', 'no PHI signal; the call asked for engine "api"')])
  if (mode !== 'auto' && mode !== 'subscription') return api(false, [sig('route_mode_unknown', 'no PHI signal; unknown CLASSIFIER_ROUTE value, using the API key')])
  let status
  try {
    status = subscriptionStatus ? subscriptionStatus() : { available: false, why: 'no subscription check configured' }
  } catch {
    status = { available: false, why: 'the subscription check failed' }
  }
  if (!status.available) return api(false, [sig('sub_unavailable', `no PHI signal; subscription unavailable (${status.why}), so the API key is used`)])
  const stage1 = env.CLASSIFIER_SUB_STAGE1 === 'skip' ? 'skip' : 'embed'
  return { route: 'subscription', engine: 'codex', stage1, phi: false, reasons: [`no PHI signal (scope, env, paths, process chain, records, flags all clear); ${status.why}`], codes: ['clear'], at }
}

// One line for results and logs.
export function describeRoute(r) {
  if (!r) return 'Engine: unknown.'
  const engine = r.route === 'subscription' ? 'ChatGPT subscription via Codex (app-server, exec fallback)' : r.engine === 'chat' ? 'API key, chat completions (rollback)' : 'API key, Decisions API'
  const fb = r.fallback ? ` Fallback: ${r.fallback.items} item${r.fallback.items === 1 ? '' : 's'} went to the API key (${r.fallback.reason}).` : ''
  // Short on purpose (responses stay under ~8k characters): the codes, plus
  // the first reasons in words; `classifier route` prints them all.
  const reasons = r.reasons || []
  const words = reasons.slice(0, 3).join('; ') + (reasons.length > 3 ? `; and ${reasons.length - 3} more` : '')
  const codes = r.phi && Array.isArray(r.codes) ? ` PHI signals: ${r.codes.join(', ')}.` : ''
  return `Engine: ${engine}${r.route === 'subscription' && r.stage1 === 'skip' ? ', no embedding stage' : ''}.${codes} Route reasons: ${words}.${fb}`
}
