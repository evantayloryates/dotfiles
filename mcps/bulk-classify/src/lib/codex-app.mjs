// The subscription engine's primary path: stage two through Taylor's ChatGPT
// subscription, driven through the official `codex app-server` (JSON-RPC over
// stdio, `[experimental]` in Codex 0.169). One warm private server per
// classifier process, one ephemeral thread per batch, many turns at once.
// `codex exec` (codex.mjs) is the fallback, case by case: a batch whose
// app-server turn fails for any reason goes to `codex exec`; items a turn
// left unanswered go to `codex exec` on their own; after repeated failures a
// circuit breaker sends every batch to `codex exec` for a cooling-off period
// and then lets one probe batch through. The API key stays the last resort
// (classify.mjs), and only for non-PHI work: nothing here runs for PHI.
//
// Rules this file keeps (on top of codex.mjs's):
// - the PHI check runs again immediately before every turn (and before the
//   fallback exec), and throws if any signal is present;
// - the server is private (never the shared daemon), its environment is
//   HOME/PATH/TMPDIR/LANG only, its cwd a scratch directory;
// - before a server takes any turn, a health check proves: the account is a
//   ChatGPT login (an API-key login, or none, is refused), the sandbox is
//   read-only with no approvals, every MCP server from ~/.codex/config.toml
//   is disabled (`-c mcp_servers={}` does NOT remove them: measured
//   2026-11-23, 18 servers stayed enabled and 16 processes started on the
//   first turn), memories, notify and history are off;
// - threads are ephemeral (no rollout on disk) and unsubscribed after use;
// - item text and answers are never logged; errors carry kinds and codes.

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppServerChild } from './appserver-rpc.mjs'
import { configuredMcpServers, trackGroup, watchTree } from './codex-lockdown.mjs'
import { assertNoPhi } from './route.mjs'
import { CODEX_EFFORT, CODEX_MODEL, EXEC_PARALLEL, FATAL_KINDS, SubscriptionError, codexBin, codexCall, codexPrompt, codexSchema, parseCodexAnswers, resetSubscriptionStatus, subscriptionStatus } from './codex.mjs'

// 'app' (default): app-server first, exec as fallback. 'exec': release 1.
export const SUB_ENGINE = () => ((process.env.CLASSIFIER_CODEX_ENGINE || 'app').toLowerCase() === 'exec' ? 'exec' : 'app')
const SERVERS = () => Math.max(1, Number(process.env.CLASSIFIER_CODEX_APP_SERVERS) || 1)
const TURN_TIMEOUT_MS = () => Number(process.env.CLASSIFIER_CODEX_APP_TIMEOUT_MS) || 90_000
const IDLE_MS = () => Number(process.env.CLASSIFIER_CODEX_APP_IDLE_MS) || 120_000
// Service tier for turns: unset = the account default ("default" sends the
// standard tier explicitly). Taylor's config.toml sets "priority"; the server
// would inherit it, so it is always set here explicitly.
const TIER = () => process.env.CLASSIFIER_CODEX_APP_TIER || 'default'
// Prompt shape: 'user' (release 1's shape: the classifier instructions and
// items in the user turn) or 'base' (instructions as the thread's base
// instructions, items alone in the user turn).
const SHAPE = () => (process.env.CLASSIFIER_CODEX_APP_SHAPE === 'base' ? 'base' : 'user')
// Base instructions: 'short' (a one-line classifier persona) or 'codex'
// (Codex's own default base instructions, what `codex exec` uses).
const BASE = () => (process.env.CLASSIFIER_CODEX_APP_BASE === 'codex' ? 'codex' : 'short')

// Features off: the same list as `codex exec` plus the ones that only the
// app-server turns on. skills.include_instructions=false (below) drops the
// skills catalogue from every turn (measured: 10.5k -> 6.8k input tokens on
// a trivial turn; with Taylor's MCP servers left on it was 22.9k). What is
// left is mostly ~/.codex/AGENTS.md (~4k words), which no official setting
// turns off.
export const APP_DISABLED = ['shell_snapshot', 'apps', 'browser_use', 'browser_use_external', 'computer_use', 'image_generation', 'memories', 'multi_agent', 'plugins', 'remote_plugin', 'shell_tool', 'unified_exec', 'skill_search', 'view_image', 'goals', 'hooks', 'in_app_browser', 'tool_suggest', 'sleep_tool', 'code_mode_host']
export const APP_ENABLED = ['skip_host_skill_discovery']
export const APP_CONFIG = ['web_search="disabled"', 'notify=[]', 'sandbox_mode="read-only"', 'approval_policy="never"', 'memories.generate_memories=false', 'memories.use_memories=false', 'history.persistence="none"', 'check_for_update_on_startup=false', 'project_doc_max_bytes=0', 'include_permissions_instructions=false', 'include_apps_instructions=false', 'include_environment_context=false', 'include_collaboration_mode_instructions=false', 'model_reasoning_summary="none"', 'skills.config=[]', 'skills.include_instructions=false', 'analytics.enabled=false']
const BASE_INSTRUCTIONS = 'You are a text classifier. You answer only with the JSON object the output schema asks for. You never run commands, call tools or ask questions.'
const MCP_NAME = /^[A-Za-z0-9_-]+$/

const childEnv = () => ({ HOME: process.env.CLASSIFIER_REAL_HOME || process.env.HOME, PATH: '/usr/bin:/bin', TMPDIR: process.env.TMPDIR || tmpdir(), LANG: 'en_US.UTF-8' })

// ---------------------------------------------------------------------------
// Failure kinds. The turn's codexErrorInfo is structured (protocol v2), so
// it is mapped by name; transport and parsing failures get their own kinds.
//   server_down  the child died or could not start
//   protocol     garbled or malformed messages
//   timeout      no turn/completed within the turn timeout, or an RPC hung
//   bad_output   unreadable answer
//   unhealthy    the health check refused this server
//   throttled    short-term rate limit (rateLimitExceeded, overload)
// plus codex.mjs's: not_logged_in, api_key_login, rate_limited (usage
// limit), unsupported, missing, error.
export function kindFromTurnError(err) {
  const info = err?.codexErrorInfo
  const name = typeof info === 'string' ? info : info && typeof info === 'object' ? Object.keys(info)[0] : null
  switch (name) {
    case 'usageLimitExceeded':
    case 'sessionBudgetExceeded':
      return 'rate_limited'
    case 'rateLimitExceeded':
    case 'serverOverloaded':
    case 'flexUnavailable':
    case 'policyCapacityUnavailable':
      return 'throttled'
    case 'unauthorized':
      return 'not_logged_in'
    case 'modelNotFound':
      return 'unsupported'
    default: {
      const t = String(err?.message || '')
      if (/usage limit|credits depleted|usage_limit_reached/i.test(t)) return 'rate_limited'
      if (/not logged in|unauthori[sz]ed|log ?in again|401/i.test(t)) return 'not_logged_in'
      return 'error'
    }
  }
}
// Kinds that say the subscription itself is unusable (exec would fail the
// same way): these skip the exec fallback when `codex login status` agrees.
const ACCOUNT_KINDS = new Set(['not_logged_in', 'api_key_login', 'rate_limited', 'unsupported'])
const appError = (message, kind, extra = {}) => Object.assign(new SubscriptionError(message, kind), extra)

// ---------------------------------------------------------------------------
// Streaming salvage: complete {"key":..,"label":..} objects already streamed
// before a turn failed. Each one is validated against the batch like a full
// answer, so a garbled stream can only lose items, never invent them.
export function salvageAnswers(text, entries, labelSet, multi, withConfidence = false) {
  const found = []
  const s = String(text || '')
  for (let i = s.indexOf('{"key"'); i !== -1; i = s.indexOf('{"key"', i + 1)) {
    const end = s.indexOf('}', i)
    if (end === -1) break
    try {
      found.push(JSON.parse(s.slice(i, end + 1)))
    } catch {}
  }
  try {
    return parseCodexAnswers(JSON.stringify({ answers: found }), entries, labelSet, multi, withConfidence)
  } catch {
    return new Map()
  }
}

// ---------------------------------------------------------------------------
// One private app-server.

let knownMcp = null // MCP server names seen in config/read, cached per process

export class AppServer {
  constructor({ bin = codexBin(), spawnFn, log = () => {}, psFn, watchIntervalMs = 250, mcpConfig = null } = {}) {
    this.mcpConfig = mcpConfig // config.toml text (tests); null reads ~/.codex/config.toml
    this.bin = bin
    this.spawnFn = spawnFn
    this.psFn = psFn
    this.watchIntervalMs = watchIntervalMs
    this.unsafe = false
    this.log = log
    this.child = null
    this.cwd = null
    this.active = 0
    this.turns = new Map() // threadId -> handlers (one turn per thread)
    this.lastUsed = performance.now()
    this.dead = false
  }

  args(mcpNames) {
    const a = ['app-server', '--listen', 'stdio://']
    for (const c of APP_CONFIG) a.push('-c', c)
    for (const n of mcpNames) a.push('-c', `mcp_servers.${n}.enabled=false`)
    for (const f of APP_DISABLED) a.push('--disable', f)
    for (const f of APP_ENABLED) a.push('--enable', f)
    return a
  }

  async spawnOne(mcpNames) {
    const child = new AppServerChild({ bin: this.bin, args: this.args(mcpNames), cwd: this.cwd, env: childEnv(), ...(this.spawnFn && { spawnFn: this.spawnFn }) })
    // Events count only while this child is the server's current one (the
    // health check may replace a first child).
    child.on('notification', (m, p) => child === this.child && this.onNotification(m, p))
    child.on('protocol_error', () => child === this.child && this.onProtocolError())
    child.on('close', (why, kind) => child === this.child && this.onClose(why, kind))
    // The release-1 backstop (codex-lockdown.mjs), as for `codex exec`: the
    // server is watched for its whole life with an empty allow list (nothing
    // may run under it); any process under it ends subscription use for the
    // run (kind `unsafe`), and its group is killed when this process exits.
    const untrack = trackGroup(child.pid)
    child.watch = child.pid
      ? watchTree(child.pid, {
          ...(this.psFn && { ps: this.psFn }),
          intervalMs: this.watchIntervalMs,
          onBad: () => this.onUnsafe(child),
        })
      : null
    child.on('close', () => {
      child.watch?.stop()
      untrack()
    })
    await child.request('initialize', { clientInfo: { name: 'bulk-classify', version: '2' }, capabilities: { optOutNotificationMethods: ['item/reasoning/summaryTextDelta', 'item/reasoning/textDelta', 'item/reasoning/summaryPartAdded', 'item/plan/delta'] } }, { timeoutMs: 20_000 })
    child.notify('initialized')
    return child
  }

  // Starts and health-checks the server. Throws SubscriptionError on refusal.
  async start() {
    this.cwd = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'classifier-codex-app-'))
    try {
      // Release 1's rule (credits.mjs): the names come from OUR read of
      // config.toml, are disabled on the first spawn, and each must come back
      // disabled; an odd config is refused. The server's own config/read only
      // adds names, never removes them.
      const ours = configuredMcpServers(this.mcpConfig)
      if (ours.odd) throw appError('Codex app-server refused: ~/.codex/config.toml has an MCP server entry that cannot be disabled by name.', 'unhealthy')
      this.ourMcp = ours.names
      let names = [...new Set([...ours.names, ...(knownMcp || [])])]
      for (let attempt = 0; attempt < 2; attempt++) {
        this.child = null
        const child = await this.spawnOne(names)
        this.child = child
        const health = await this.health()
        if (health.ok) {
          this.dead = false
          return this
        }
        this.child = null
        await child.close()
        if (health.kind !== 'mcp_enabled' || attempt === 1) throw appError(`Codex app-server refused: ${health.why}.`, health.kind === 'mcp_enabled' ? 'unhealthy' : health.kind)
        names = [...new Set([...ours.names, ...(knownMcp || [])])] // learned from config/read: restart with them disabled
      }
    } catch (err) {
      await this.close()
      if (this.unsafe) throw appError('A process ran under the Codex app-server.', 'unsafe')
      if (err instanceof SubscriptionError) throw err
      throw appError(`Codex app-server could not start (${err.code || 'error'}).`, err.code === 'missing' ? 'missing' : err.code === 'timeout' ? 'timeout' : 'server_down')
    }
  }

  // The health check: account, then effective config. { ok, kind, why }.
  async health() {
    const acct = await this.child.request('account/read', { refreshToken: false }, { timeoutMs: 15_000 })
    const type = acct?.account?.type
    if (type === 'apiKey') return { ok: false, kind: 'api_key_login', why: 'Codex is logged in with an API key, not the ChatGPT subscription' }
    if (type !== 'chatgpt') return { ok: false, kind: 'not_logged_in', why: 'Codex has no ChatGPT login' }
    const cfg = (await this.child.request('config/read', { cwd: this.cwd }, { timeoutMs: 15_000 }))?.config || {}
    const raw = cfg.mcp_servers
    const ours = this.ourMcp || []
    // Missing or reshaped mcp_servers is no confirmation (fail closed) when
    // config.toml names any server; absent with none configured is fine.
    if (raw !== undefined && raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) return { ok: false, kind: 'unhealthy', why: 'config/read returned mcp_servers in an unknown shape' }
    if ((raw === undefined || raw === null) && ours.length) return { ok: false, kind: 'unhealthy', why: 'config/read did not report the configured MCP servers' }
    const mcp = raw || {}
    const missing = ours.filter((n) => !(n in mcp))
    if (missing.length) return { ok: false, kind: 'unhealthy', why: `config/read did not report ${missing.length} configured MCP server(s)` }
    const names = Object.keys(mcp)
    if (names.some((n) => !MCP_NAME.test(n))) return { ok: false, kind: 'unhealthy', why: 'an MCP server name cannot be disabled by override' }
    knownMcp = [...new Set([...(knownMcp || []), ...names])]
    if (names.some((n) => mcp[n]?.enabled !== false)) return { ok: false, kind: 'mcp_enabled', why: 'MCP servers are still enabled' }
    const bad = []
    if (cfg.sandbox_mode !== 'read-only') bad.push('sandbox')
    if (cfg.approval_policy !== 'never') bad.push('approvals')
    if (Array.isArray(cfg.notify) && cfg.notify.length) bad.push('notify')
    if (cfg.features?.memories !== false || cfg.memories?.generate_memories !== false || cfg.memories?.use_memories !== false) bad.push('memories')
    if (cfg.history?.persistence && cfg.history.persistence !== 'none') bad.push('history')
    if (bad.length) return { ok: false, kind: 'unhealthy', why: `effective config not locked down (${bad.join(', ')})` }
    return { ok: true }
  }

  onNotification(method, p) {
    const h = p?.threadId ? this.turns.get(p.threadId) : null
    if (!h) return
    if (method === 'item/agentMessage/delta' && typeof p.delta === 'string') h.text += p.delta
    else if (method === 'item/completed' && p.item?.type === 'agentMessage' && typeof p.item.text === 'string') h.final = p.item.text
    else if (method === 'thread/tokenUsage/updated') h.usage = p.tokenUsage?.last || h.usage
    else if (method === 'item/started' && p.item?.type && !['agentMessage', 'reasoning', 'userMessage'].includes(p.item.type)) h.tool = true
    else if (method === 'turn/completed') h.done(p.turn)
  }
  onProtocolError() {
    // One garbled line fails every turn in flight on this server: their
    // answers can no longer be trusted to be complete.
    for (const h of this.turns.values()) h.fail(appError('Codex app-server sent a garbled message.', 'protocol'))
    this.retire('protocol')
  }
  onUnsafe(child) {
    this.unsafe = true
    this.dead = true
    for (const h of this.turns.values()) h.fail(appError('A process ran under the Codex app-server.', 'unsafe'))
    child.close().catch(() => {})
  }
  onClose(why, kind) {
    this.dead = true
    for (const h of this.turns.values())
      h.fail(this.unsafe ? appError('A process ran under the Codex app-server.', 'unsafe') : appError(`Codex app-server stopped (${why}).`, kind === 'missing' ? 'missing' : 'server_down'))
  }
  retire() {
    this.dead = true
    this.child?.close().catch(() => {})
  }

  // One classification turn on a fresh ephemeral thread.
  async turn({ baseInstructions, text, schema, model, effort, tier, timeoutMs, signal }) {
    if (this.unsafe) throw appError('A process ran under the Codex app-server.', 'unsafe')
    if (this.dead || !this.child || this.child.closed) throw appError('Codex app-server is not running.', 'server_down')
    this.active++
    this.lastUsed = performance.now()
    let threadId = null
    const h = { text: '', final: null, usage: null, tool: false }
    try {
      const th = await this.child.request('thread/start', { ephemeral: true, model, cwd: this.cwd, sandbox: 'read-only', approvalPolicy: 'never', ...(baseInstructions && { baseInstructions }), serviceTier: tier }, { timeoutMs: 20_000 })
      threadId = th?.thread?.id
      if (!threadId) throw appError('Codex app-server returned no thread.', 'protocol')
      const finished = new Promise((resolve, reject) => {
        h.done = resolve
        h.fail = reject
      })
      finished.catch(() => {})
      this.turns.set(threadId, h) // before turn/start: its events can arrive before its response
      let turnId = null
      let timer
      const onAbort = () => h.fail(Object.assign(new Error('cancelled'), { code: 'cancelled' }))
      signal?.addEventListener('abort', onAbort, { once: true })
      try {
        const ts = await Promise.race([this.child.request('turn/start', { threadId, input: [{ type: 'text', text }], effort, outputSchema: schema }, { timeoutMs: 20_000 }), finished])
        turnId = ts?.turn?.id || ts?.id || null
        if (!turnId) throw appError('Codex app-server returned no turn.', 'protocol')
        const turn = await Promise.race([finished, new Promise((_, reject) => (timer = setTimeout(() => reject(appError('Codex app-server turn timed out.', 'timeout')), timeoutMs)))])
        if (turn?.status !== 'completed') {
          const kind = turn?.status === 'failed' ? kindFromTurnError(turn.error) : 'error'
          throw appError(`Codex app-server turn ${turn?.status || 'ended'} (${kind}).`, kind)
        }
        if (h.tool) throw appError('Codex app-server turn used a tool.', 'bad_output')
        // One last fresh look before the answer is used.
        if (this.unsafe || this.child?.watch?.check(true).length) {
          this.onUnsafe(this.child)
          throw appError('A process ran under the Codex app-server.', 'unsafe')
        }
        return { text: h.final ?? h.text, usage: h.usage }
      } catch (caught) {
        // Once the backstop fired, every failure is that failure.
        const err = this.unsafe && caught?.kind !== 'unsafe' ? appError('A process ran under the Codex app-server.', 'unsafe') : caught
        // The same last fresh look as a completed turn before anything streamed
        // is salvaged: a process started in the last interval counts too.
        if (!this.unsafe && this.child?.watch?.check(true).length) this.onUnsafe(this.child)
        err.partialText = h.tool || this.unsafe ? '' : h.text // nothing from a turn that used a tool, or an unsafe server, is trusted
        if (turnId && (err.code === 'cancelled' || err.kind === 'timeout')) this.child.request('turn/interrupt', { threadId, turnId }, { timeoutMs: 5000 }).catch(() => {})
        // A timed-out turn may mean the whole server hangs: if it does not
        // answer a local request within 5 s, retire it (its other turns would
        // hang too) so the pool starts a fresh one.
        if (err.kind === 'timeout') this.child.request('config/read', { cwd: this.cwd }, { timeoutMs: 5000 }).catch(() => this.retire())
        throw err
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        this.turns.delete(threadId)
      }
    } catch (err) {
      if (this.unsafe && err?.kind !== 'unsafe') throw Object.assign(appError('A process ran under the Codex app-server.', 'unsafe'), { partialText: '' })
      throw err
    } finally {
      this.active--
      this.lastUsed = performance.now()
      if (threadId && !this.dead) this.child.request('thread/unsubscribe', { threadId }, { timeoutMs: 5000 }).catch(() => {})
    }
  }

  async close() {
    this.dead = true
    try {
      await this.child?.close()
    } catch {}
    if (this.cwd) rmSync(this.cwd, { recursive: true, force: true })
    this.cwd = null
  }
}

// ---------------------------------------------------------------------------
// Pool: SERVERS private servers, started on first use, replaced when they die,
// closed when idle and on exit. Turns go to the least busy live server.

export class AppPool {
  constructor({ size = SERVERS(), factory = (o) => new AppServer(o), log = () => {} } = {}) {
    this.size = size
    this.factory = factory
    this.log = log
    this.servers = []
    this.starting = new Map() // slot -> Promise<AppServer>
    this.idleTimer = null
  }
  async acquire() {
    this.servers = this.servers.filter((s) => !s.dead)
    if (this.servers.length < this.size && this.starting.size < this.size - this.servers.length) {
      const slot = Symbol('slot')
      const p = this.factory({ log: this.log })
        .start()
        .then((s) => {
          this.servers.push(s)
          return s
        })
        .finally(() => this.starting.delete(slot))
      this.starting.set(slot, p)
      if (!this.servers.length) return p
      p.catch(() => {})
    }
    if (!this.servers.length) return Promise.any([...this.starting.values()]).catch((e) => Promise.reject(e.errors?.[0] || e))
    this.armIdle()
    return this.servers.reduce((a, b) => (b.active < a.active ? b : a))
  }
  armIdle() {
    if (this.idleTimer) return
    this.idleTimer = setInterval(() => {
      const now = performance.now()
      for (const s of this.servers) if (s.active === 0 && now - s.lastUsed > IDLE_MS()) s.close()
      this.servers = this.servers.filter((s) => !s.dead)
      if (!this.servers.length) {
        clearInterval(this.idleTimer)
        this.idleTimer = null
      }
    }, 10_000)
    this.idleTimer.unref?.()
  }
  async close() {
    clearInterval(this.idleTimer)
    this.idleTimer = null
    const all = [...this.servers, ...(await Promise.allSettled([...this.starting.values()])).filter((r) => r.status === 'fulfilled').map((r) => r.value)]
    this.servers = []
    await Promise.allSettled(all.map((s) => s.close()))
  }
}

// ---------------------------------------------------------------------------
// Circuit breaker: after THRESHOLD consecutive app-server failures (or one
// that says the server cannot work: missing binary, refused health check),
// batches skip the app-server for a cooling-off period that doubles on every
// failed probe (30 s up to 10 min). After it, one probe batch goes through;
// success closes the breaker.

export class Breaker {
  constructor({ threshold = 3, baseMs = 30_000, maxMs = 600_000, now = () => performance.now() } = {}) {
    Object.assign(this, { threshold, baseMs, maxMs, now })
    this.failures = 0
    this.openUntil = 0
    this.opens = 0
    this.probing = false
    this.state = 'closed'
  }
  allow() {
    if (this.state === 'closed') return true
    if (this.now() < this.openUntil || this.probing) return false
    this.probing = true
    this.state = 'half_open'
    return true
  }
  success() {
    this.failures = 0
    this.opens = 0
    this.probing = false
    this.state = 'closed'
  }
  failure(kind) {
    this.failures++
    const hard = kind === 'missing' || kind === 'unhealthy' || kind === 'api_key_login'
    if (this.state === 'half_open' || hard || this.failures >= this.threshold) {
      this.opens++
      this.openUntil = this.now() + Math.min(this.maxMs, this.baseMs * 2 ** (this.opens - 1))
      this.state = 'open'
    }
    this.probing = false
  }
}

// Process-wide state.
let pool = null
export const breaker = new Breaker()
export function appPool() {
  pool ||= new AppPool()
  return pool
}
export async function closeAppPool() {
  const p = pool
  pool = null
  if (p) await p.close()
}
export function resetAppState() {
  Object.assign(breaker, new Breaker())
  knownMcp = null
}

// ---------------------------------------------------------------------------
// One batch on the app-server. Same contract as codexCall (codex.mjs):
// resolves Map key -> answer for the keys it answered, throws
// SubscriptionError / PhiRefusal. A failure carries .partial: the answers
// salvaged from the stream before it failed (already validated).

// model / effort / withConfidence: the escalation ladder's tiers (ladder.mjs),
// as for codexCall; unset means the subscription defaults.
const CONFIDENCE_ASK = 'For every answer also give "confidence": your probability from 0 to 1 that the label is the one a careful human would choose. Be calibrated: use values below 0.7 whenever another label is plausible.'
export async function codexAppCall({ system, entries, reminder, labelNames, multi, phiContext = {}, usage, signal, onCall, getPool = appPool, model, effort, withConfidence = false }) {
  model ||= CODEX_MODEL
  effort ||= CODEX_EFFORT
  assertNoPhi(phiContext) // throws PhiRefusal: never send PHI work to the subscription
  const t0 = performance.now()
  const labelSet = new Set(labelNames)
  let ok = false
  try {
    const server = await getPool().acquire()
    assertNoPhi(phiContext) // again: acquiring may have taken a server start
    const shape = SHAPE()
    const text = shape === 'base' ? `Items:\n${JSON.stringify(entries)}\n\n${reminder}` : codexPrompt(system, entries, reminder, withConfidence)
    const baseInstructions = shape === 'base' ? `${BASE_INSTRUCTIONS}\n\n${system}\n\nReturn a JSON object {"answers": [...]} with one answer per item, in any order, each {"key": the item's key, "label": its label} (plus "secondary" when asked).${withConfidence ? ` ${CONFIDENCE_ASK}` : ''}` : BASE() === 'short' ? BASE_INSTRUCTIONS : undefined
    let res
    try {
      res = await server.turn({ baseInstructions, text, schema: codexSchema(labelNames, multi, withConfidence), model, effort, tier: TIER(), timeoutMs: TURN_TIMEOUT_MS(), signal })
    } catch (e) {
      // Transport errors (closed child, RPC timeout, RPC error) become kinds.
      const err = e instanceof SubscriptionError || e?.code === 'cancelled' ? e : Object.assign(appError(`Codex app-server failed (${e?.code || 'error'}).`, { server_down: 'server_down', closed: 'server_down', timeout: 'timeout', protocol: 'protocol', missing: 'missing' }[e?.code] || 'error'), { partialText: e?.partialText })
      if (usage) usage.codex_app_calls = (usage.codex_app_calls || 0) + 1
      if (err.code !== 'cancelled') err.partial = salvageAnswers(err.partialText, entries, labelSet, multi, withConfidence)
      delete err.partialText
      throw err
    }
    if (usage) {
      usage.codex_app_calls = (usage.codex_app_calls || 0) + 1
      usage.codex_input_tokens = (usage.codex_input_tokens || 0) + (res.usage?.inputTokens || 0)
      usage.codex_cached_input_tokens = (usage.codex_cached_input_tokens || 0) + (res.usage?.cachedInputTokens || 0)
      usage.codex_output_tokens = (usage.codex_output_tokens || 0) + (res.usage?.outputTokens || 0)
    }
    let answers
    try {
      answers = parseCodexAnswers(res.text, entries, labelSet, multi, withConfidence)
    } catch (err) {
      err.partial = salvageAnswers(res.text, entries, labelSet, multi, withConfidence)
      throw err
    }
    if (usage) usage.codex_items = (usage.codex_items || 0) + answers.size
    ok = true
    return answers
  } finally {
    onCall?.({ engine: 'codex', via: 'app', kind: 'batch', ms: performance.now() - t0, items: entries.length, ok })
  }
}

// Exec fallbacks share at most EXEC_PARALLEL processes, whatever the batcher's
// parallelism (an open breaker would otherwise start 24 `codex exec` at once).
let execActive = 0
const execWaiters = []
async function limitedExec(exec, o) {
  while (execActive >= EXEC_PARALLEL) await new Promise((r) => execWaiters.push(r))
  execActive++
  try {
    return await exec(o)
  } finally {
    execActive--
    execWaiters.shift()?.()
  }
}

// ---------------------------------------------------------------------------
// The subscription engine CodexBatcher calls (classify.mjs): app-server first,
// `codex exec` for what it could not answer, per batch and per item. Every
// entry ends with exactly one answer or is absent from the map (the batcher
// then sends it to the API key); nothing is answered twice.

export async function subscriptionCall(opts, { app = codexAppCall, exec = codexCall, status = subscriptionStatus, brk = breaker } = {}) {
  assertNoPhi(opts.phiContext || {})
  const note = (k, n = 1) => opts.usage && (opts.usage[k] = (opts.usage[k] || 0) + n)
  if (SUB_ENGINE() === 'exec') return exec(opts)
  if (!brk.allow()) {
    note('codex_app_skipped_batches')
    return limitedExec(exec, opts)
  }
  let answers
  let rest = opts.entries
  try {
    answers = await app(opts)
    brk.success()
    rest = opts.entries.filter((e) => !answers.has(e.key))
    if (!rest.length) return answers
    note('codex_app_unanswered_items', rest.length)
  } catch (err) {
    if (err?.code === 'cancelled' || err?.code === 'phi_refused' || opts.signal?.aborted) throw err
    brk.failure(err?.kind)
    const kind = err?.kind || 'error'
    // The process backstop fired: nothing from that server is trusted and
    // no Codex runs again this run (exec included); the batcher moves the
    // run to the API key, as it does for `codex exec`'s own `unsafe`.
    if (kind === 'unsafe') throw appError('A process ran under the Codex app-server.', 'unsafe', { partial: new Map() })
    note('codex_app_failed_batches')
    if (opts.usage) (opts.usage.codex_app_failures ||= {})[kind] = (opts.usage.codex_app_failures[kind] || 0) + 1
    answers = err?.partial instanceof Map ? err.partial : new Map()
    if (answers.size) note('codex_app_salvaged_items', answers.size)
    rest = opts.entries.filter((e) => !answers.has(e.key))
    // The subscription itself unusable (usage limit, logged out, API-key
    // login, model refused)? Then exec would fail too: say so at once so the
    // batcher moves this run to the API key. A login error is believed only
    // when `codex login status` agrees (a stale app-server login is not the
    // account's state).
    if (ACCOUNT_KINDS.has(kind)) {
      resetSubscriptionStatus()
      const loginGone = kind === 'not_logged_in' && !status().available
      if (kind !== 'not_logged_in' || loginGone) throw appError(`Codex failed (${kind}).`, kind, { partial: answers }) // the batcher keeps the partial answers, sends the rest to the API key and stops using the subscription
    }
  }
  if (!rest.length) return answers
  note('codex_app_fallback_items', rest.length)
  let more
  try {
    more = await limitedExec(exec, { ...opts, entries: rest })
  } catch (err) {
    // The app-server's answers stand even when exec fails for the rest
    // (measured 2026-11-23: a failed one-item exec otherwise sent a whole
    // batch of 25 to the API key).
    if (err && typeof err === 'object' && err.code !== 'phi_refused' && answers.size) {
      const prior = err.partial instanceof Map ? err.partial : new Map()
      err.partial = new Map([...answers, ...prior])
    }
    throw err
  }
  for (const [k, v] of more) answers.set(k, v)
  return answers
}

// The pre-use health check on its own (CLI `classifier app-health`): PHI
// check, then a fresh private server started and checked, then closed.
export async function appHealth({ phiContext = {}, factory = (o) => new AppServer(o) } = {}) {
  const t0 = performance.now()
  try {
    assertNoPhi(phiContext)
  } catch (err) {
    return { ok: false, kind: 'phi_refused', why: 'PHI signals present; the subscription is never used for this work', codes: err.codes }
  }
  const s = factory()
  try {
    await s.start()
    return { ok: true, kind: null, ms: Math.round(performance.now() - t0), breaker: breaker.state }
  } catch (err) {
    return { ok: false, kind: err.kind || 'error', why: err.message, ms: Math.round(performance.now() - t0) }
  } finally {
    await s.close()
  }
}

export { FATAL_KINDS }
