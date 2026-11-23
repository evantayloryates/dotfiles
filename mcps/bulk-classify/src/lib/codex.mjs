// The subscription engine: stage two through Taylor's ChatGPT subscription,
// driven only through the official Codex CLI (`codex exec`). Many items per
// call (one Codex start costs ~3 s and ~18k overhead tokens of the
// subscription's limits, whatever the batch size).
//
// Rules this file keeps:
// - it never reads, prints or reuses ~/.codex/auth.json and never calls a
//   ChatGPT endpoint itself; Codex owns its own login;
// - the child gets HOME, PATH, TMPDIR and LANG only: never the API key (Codex
//   would switch to API billing with OPENAI_API_KEY), never anything else;
// - item text goes over stdin, never argv (argv is visible to ps);
// - the PHI check runs again immediately before every spawn and throws if any
//   signal is present, so calling this directly from PHI context still fails;
// - only `codex login status` saying ChatGPT counts as the subscription. An
//   API-key login, or anything unreadable, means unavailable.

import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertNoPhi } from './route.mjs'
import { trackGroup, watchTree } from './codex-lockdown.mjs'

// Defaults from the 2026-11-23 tuning grid (public Banking77, 616 items, 77
// labels, every item to the model; plan folder results/): gpt-5.6-luna beat
// gpt-6-luna by 4-5 points (86.2-87.2% vs 82.1-82.6%; 92.3% vs 83.8% on 20
// labels with "none" items) and gpt-6-sol (70%); effort low is the floor for
// luna models and medium gained nothing; 50 items x 12 processes gave the
// most items per second (19-25/s, p95 24-32 s per call) within a point of
// the best accuracy. 0 of 440 injected labels won on two draws.
export const CODEX_MODEL = process.env.CLASSIFIER_CODEX_MODEL || 'gpt-5.6-luna'
export const CODEX_EFFORT = process.env.CLASSIFIER_CODEX_EFFORT || 'low'
export const CODEX_BATCH = Number(process.env.CLASSIFIER_CODEX_BATCH) || 50
export const CODEX_CHARS = Number(process.env.CLASSIFIER_CODEX_CHARS) || 60_000
// 24 calls at once on the app-server (one process, threads; measured 47-51
// items/s on all 3,080 Banking77 items with no failed call), 12 for `codex
// exec` (at 24 processes 2-4 of 62 calls failed and went to the API key).
export const CODEX_PARALLEL = Number(process.env.CLASSIFIER_CODEX_PARALLEL) || ((process.env.CLASSIFIER_CODEX_ENGINE || 'app').toLowerCase() === 'exec' ? 12 : 24)
export const EXEC_PARALLEL = Math.min(CODEX_PARALLEL, 12)
const WATCH_INTERVAL_MS = 250
const RETRY_DELAY_MS = Number(process.env.CLASSIFIER_CODEX_RETRY_MS) || 5000
const TIMEOUT_MS = Number(process.env.CLASSIFIER_CODEX_TIMEOUT_MS) || 180_000
// Tool features off: classification needs no tools, and each one adds prompt
// overhead (and a way to act). The sandbox is read-only regardless.
const DISABLED_FEATURES = ['shell_snapshot', 'apps', 'browser_use', 'browser_use_external', 'computer_use', 'image_generation', 'memories', 'multi_agent', 'plugins', 'remote_plugin', 'shell_tool', 'unified_exec', 'skill_search', 'view_image', 'goals', 'hooks', 'in_app_browser', 'tool_suggest', 'sleep_tool']

const realHome = () => process.env.CLASSIFIER_REAL_HOME || homedir()
export const codexBin = () => process.env.CLASSIFIER_CODEX_BIN || join(realHome(), '.local', 'bin', 'codex')

export class SubscriptionError extends Error {
  constructor(message, kind) {
    super(message)
    this.code = 'subscription'
    this.kind = kind // not_logged_in | api_key_login | rate_limited | unsupported | missing | unsafe | timeout | bad_output | error
    this.retryable = false
  }
}

const childEnv = () => ({ HOME: realHome(), PATH: '/usr/bin:/bin', TMPDIR: process.env.TMPDIR || tmpdir(), LANG: 'en_US.UTF-8' })

// ---------------------------------------------------------------------------
// Login status: cached for five minutes per process, on the monotonic clock
// (a wall-clock jump must not stretch the cache), and dropped as soon as a
// Codex call fails for a login, limit or missing-binary reason.

let statusCache = null
const STATUS_TTL_MS = 300_000
export function subscriptionStatus({ run = defaultStatusRun, now = performance.now() } = {}) {
  if (statusCache && now >= statusCache.at && now - statusCache.at < STATUS_TTL_MS) return statusCache.value
  let value
  try {
    const out = run()
    value = parseLoginStatus(out)
  } catch {
    value = { available: false, why: 'codex login status could not be read' }
  }
  statusCache = { at: now, value }
  return value
}
export function resetSubscriptionStatus() {
  statusCache = null
}
function defaultStatusRun() {
  const r = spawnSync(codexBin(), ['login', 'status'], { env: childEnv(), encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe'] })
  if (r.error) throw r.error
  return `${r.stdout || ''}\n${r.stderr || ''}`
}
export function parseLoginStatus(text) {
  const t = String(text || '')
  if (/logged in using (an )?api key/i.test(t)) return { available: false, why: 'Codex is logged in with an API key, not the ChatGPT subscription' }
  if (/logged in using chatgpt/i.test(t)) return { available: true, why: 'Codex is logged in with ChatGPT' }
  if (/not logged in/i.test(t)) return { available: false, why: 'Codex is not logged in' }
  return { available: false, why: 'Codex login status was not recognised' }
}

// ---------------------------------------------------------------------------
// Prompt and schema

// One schema for the whole batch: an array of {key, label[, secondary]}, so
// the label enum appears once (strict schemas cap enum values at 1,000 in
// total; per-key enums for 100 items x 78 labels would be 7,800).
// withConfidence (escalation ladder): each answer also carries the model's
// stated probability that its label is right.
export function codexSchema(labelNames, multi, withConfidence = false) {
  const e = [...labelNames, 'none']
  const props = { key: { type: 'string' }, label: { type: 'string', enum: e } }
  if (multi) props.secondary = { type: 'string', enum: e }
  if (withConfidence) props.confidence = { type: 'number' }
  return {
    type: 'object',
    properties: { answers: { type: 'array', items: { type: 'object', properties: props, required: Object.keys(props), additionalProperties: false } } },
    required: ['answers'],
    additionalProperties: false,
  }
}

export function codexPrompt(system, entries, reminder, withConfidence = false) {
  return [
    system,
    '',
    'Return a JSON object {"answers": [...]} with one answer per item, in any order, each {"key": the item\'s key, "label": its label} (plus "secondary" when asked). Do not run commands or use tools; answer directly.',
    ...(withConfidence ? ['For every answer also give "confidence": your probability from 0 to 1 that the label is the one a careful human would choose. Be calibrated: use values below 0.7 whenever another label is plausible.'] : []),
    '',
    'Items:',
    JSON.stringify(entries),
    '',
    reminder,
  ].join('\n')
}

// Checks the answer against the batch: every key answered once, every label
// allowed for that item. Returns Map key -> answer; missing keys are absent.
// With confidence, an answer is { answer, confidence } (confidence null when
// missing or out of range); without, the bare answer as before.
export function parseCodexAnswers(text, entries, labelSet, multi, withConfidence = false) {
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new SubscriptionError('Codex returned an unreadable answer.', 'bad_output')
  }
  const byKey = new Map(entries.map((e) => [e.key, e]))
  const out = new Map()
  for (const a of Array.isArray(json?.answers) ? json.answers : []) {
    const e = byKey.get(a?.key)
    if (!e || out.has(a.key)) continue
    const allowed = (l) => l === 'none' || (e.candidates ? e.candidates.includes(l) : labelSet.has(l))
    if (!allowed(a.label)) continue
    const answer = multi ? { primary: a.label, secondary: allowed(a.secondary) ? a.secondary : 'none' } : a.label
    if (!withConfidence) out.set(a.key, answer)
    else out.set(a.key, { answer, confidence: typeof a.confidence === 'number' && a.confidence >= 0 && a.confidence <= 1 ? a.confidence : null })
  }
  return out
}

// Failure kinds from the event stream's error and the stderr tail (neither is
// ever logged: both can echo item text). The limit wording and codes are the
// ones the Codex CLI ships (0.169: "You've hit your usage limit ...",
// usage_limit_reached, workspace_*_usage_limit_reached, *_credits_depleted,
// rate_limit_reached, usage_not_included).
export function classifyFailure(text, code) {
  const t = String(text || '')
  if (code === 126 || code === 127 || /no app-installed codex found|command not found|no such file or directory/i.test(t)) return 'missing'
  if (/usage[ _]limit|rate[ _]limit|credits[ _]depleted|usage_not_included|purchase more credits|too many requests|\b429\b|quota/i.test(t)) return 'rate_limited'
  if (/not supported when using codex with a chatgpt account|model .* not supported|unsupported model/i.test(t)) return 'unsupported'
  if (/not logged in|log ?in again|unauthori[sz]ed|\b401\b|sign in|token (has )?expired|refresh token/i.test(t)) return 'not_logged_in'
  return code === null ? 'timeout' : 'error'
}
// Kinds that end subscription use for the rest of the run (and for the
// process, until the login status is read again).
export const FATAL_KINDS = new Set(['not_logged_in', 'api_key_login', 'rate_limited', 'unsupported', 'missing', 'unsafe'])

// ---------------------------------------------------------------------------
// One Codex call. phiContext is re-checked right before spawn.

// model / effort override the defaults (the escalation ladder's stronger
// subscription tier); withConfidence asks for a stated probability per answer.
export async function codexCall({ system, entries, reminder, labelNames, multi, phiContext = {}, usage, signal, spawnFn = spawn, onCall, psFn, watchIntervalMs = WATCH_INTERVAL_MS, model = CODEX_MODEL, effort = CODEX_EFFORT, withConfidence = false }) {
  assertNoPhi(phiContext) // throws PhiRefusal: never spawn for PHI work
  const t0 = performance.now()
  const dir = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'classifier-codex-'))
  let ok = false
  try {
    const schemaPath = join(dir, 'schema.json')
    const lastPath = join(dir, 'answer.json')
    writeFileSync(schemaPath, JSON.stringify(codexSchema(labelNames, multi, withConfidence)), { mode: 0o600 })
    const args = ['exec', '-m', model, '-c', `model_reasoning_effort="${effort}"`, '-c', 'web_search="disabled"']
    for (const f of DISABLED_FEATURES) args.push('--disable', f)
    // `--ignore-user-config` keeps ~/.codex/config.toml, and so Taylor's MCP
    // servers, out of `codex exec` (verified 2026-11-23: no server process
    // during a turn). Naming them as disabled here would fail: with the
    // config ignored, `mcp_servers.<name>.enabled=false` is a server with no
    // transport. The process watch below verifies every call.
    args.push('--ephemeral', '-s', 'read-only', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules', '-C', dir, '--output-schema', schemaPath, '-o', lastPath, '--json', '-')
    let unsafe = false
    const { code, stdout, stderr } = await new Promise((resolvePromise, reject) => {
      // Its own process group (detached), so the watch below also sees
      // orphans and a kill reaches everything Codex started.
      const child = spawnFn(codexBin(), args, { cwd: dir, env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'], detached: true })
      let out = ''
      let err = ''
      let hard = null
      const signalAll = (sig) => {
        try {
          process.kill(-child.pid, sig)
        } catch {
          try {
            child.kill(sig)
          } catch {}
        }
      }
      const kill = () => {
        signalAll('SIGTERM')
        hard ||= setTimeout(() => signalAll('SIGKILL'), 5000)
      }
      const timer = setTimeout(kill, TIMEOUT_MS)
      const untrack = trackGroup(child.pid)
      // The backstop (codex-lockdown.mjs): watched for its whole life; any
      // process under it (nothing may run under `codex exec`) ends
      // subscription use for the run.
      const watch = child.pid
        ? watchTree(child.pid, {
            ...(psFn && { ps: psFn }),
            intervalMs: watchIntervalMs,
            onBad: () => {
              unsafe = true
              kill()
            },
          })
        : null
      signal?.addEventListener('abort', kill, { once: true })
      child.stdout.on('data', (d) => (out += d))
      child.stderr.on('data', (d) => (err = (err + d).slice(-4000)))
      child.on('error', (e) => {
        clearTimeout(timer)
        clearTimeout(hard)
        watch?.stop()
        untrack()
        resetSubscriptionStatus()
        reject(new SubscriptionError(`Codex could not start (${e.code || 'error'}).`, 'missing'))
      })
      let closed = false
      child.on('close', (c, sig) => {
        if (closed) return
        closed = true
        untrack()
        clearTimeout(timer)
        clearTimeout(hard)
        watch?.stop()
        // One last fresh look before the answer is used: anything left in
        // Codex's process group now is an orphan it started; the group (not
        // the exited child) gets the kill.
        if (watch && watch.check(true).length) {
          unsafe = true
          try {
            process.kill(-child.pid, 'SIGKILL')
          } catch {}
        }
        signal?.removeEventListener('abort', kill)
        resolvePromise({ code: sig ? null : c, stdout: out, stderr: err })
      })
      child.stdin.on('error', () => {})
      child.stdin.end(codexPrompt(system, entries, reminder, withConfidence))
    })
    // Usage and errors from the JSONL event stream (never echoed: it can hold
    // item text).
    let failure = ''
    for (const line of stdout.split('\n')) {
      if (!line.startsWith('{')) continue
      let e
      try {
        e = JSON.parse(line)
      } catch {
        continue
      }
      if (e.type === 'turn.completed' && e.usage && usage) {
        usage.codex_input_tokens = (usage.codex_input_tokens || 0) + (e.usage.input_tokens || 0)
        usage.codex_output_tokens = (usage.codex_output_tokens || 0) + (e.usage.output_tokens || 0)
      }
      if (e.type === 'error' || e.type === 'turn.failed') failure = e.message || e.error?.message || 'error'
    }
    if (usage) usage.codex_calls = (usage.codex_calls || 0) + 1
    if (signal?.aborted) throw Object.assign(new Error('cancelled'), { code: 'cancelled' })
    if (unsafe) {
      resetSubscriptionStatus()
      throw new SubscriptionError('Codex started a process it should not have (an MCP server?); the subscription is off for this run.', 'unsafe')
    }
    if (code !== 0 || failure) {
      const kind = classifyFailure(`${failure}\n${stderr}`, code)
      if (FATAL_KINDS.has(kind)) resetSubscriptionStatus()
      throw new SubscriptionError(`Codex failed (${kind}).`, kind)
    }
    let text
    try {
      text = readFileSync(lastPath, 'utf8')
    } catch {
      throw new SubscriptionError('Codex wrote no answer.', 'bad_output')
    }
    const answers = parseCodexAnswers(text, entries, new Set(labelNames), multi, withConfidence)
    if (usage) usage.codex_items = (usage.codex_items || 0) + answers.size
    ok = true
    return answers
  } finally {
    onCall?.({ engine: 'codex', kind: 'batch', model, effort, ms: performance.now() - t0, items: entries.length, ok })
    rmSync(dir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// Micro-batcher: entries added from anywhere in a run are grouped into Codex
// calls of up to CODEX_BATCH items / CODEX_CHARS characters, at most
// CODEX_PARALLEL at once. add() resolves with the entry's answer, or rejects
// (SubscriptionError / PhiRefusal) so the caller can fall back to the API key.

// Codex processes are capped process-wide, not per batcher: the escalation
// ladder runs two batchers (low effort, then the stronger tier) at once.
const slots = { active: 0, batchers: new Set() }
function pumpAll() {
  for (const b of slots.batchers) b.pump()
}

export class CodexBatcher {
  constructor(opts) {
    this.opts = opts // { system, reminder, labelNames, multi, phiContext, usage, signal, onCall, call, model, effort, withConfidence, batch }
    this.size = opts.batch || CODEX_BATCH
    this.pending = []
    this.chars = 0
    this.timer = null
    this.active = 0
    this.queue = []
    this.broken = null // first fatal failure: later entries reject at once
    this.seq = 0
  }
  add(entry) {
    if (this.broken) return Promise.reject(this.broken)
    return new Promise((resolveEntry, rejectEntry) => {
      const key = `i${++this.seq}`
      this.pending.push({ entry: { ...entry, key }, resolve: resolveEntry, reject: rejectEntry })
      this.chars += (entry.message || '').length
      if (this.pending.length >= this.size || this.chars >= CODEX_CHARS) this.flush()
      else if (!this.timer) this.timer = setTimeout(() => this.flush(), 25)
    })
  }
  // A full batch goes as one call. A partial one (the run's tail, or a small
  // classify_texts call) is split across the idle parallel slots, at least 25
  // items each: one Codex call costs ~3 s plus ~0.18 s per item (measured
  // 2026-11-22), so 50 items as 2 x 25 answer in ~8 s instead of ~12 s.
  flush() {
    clearTimeout(this.timer)
    this.timer = null
    if (!this.pending.length) return
    const batch = this.pending
    this.pending = []
    this.chars = 0
    const full = batch.length >= this.size
    const idle = Math.max(1, CODEX_PARALLEL - slots.active - this.queue.length)
    const size = full ? batch.length : Math.max(Math.min(25, this.size), Math.ceil(batch.length / idle))
    for (let i = 0; i < batch.length; i += size) this.queue.push(batch.slice(i, i + size))
    this.pump()
  }
  pump() {
    while (slots.active < CODEX_PARALLEL && this.queue.length) {
      const batch = this.queue.shift()
      this.active++
      slots.active++
      slots.batchers.add(this)
      this.run(batch).finally(() => {
        this.active--
        slots.active--
        if (!this.active && !this.queue.length) slots.batchers.delete(this)
        pumpAll()
      })
    }
    if (this.queue.length) slots.batchers.add(this)
  }
  async run(batch) {
    if (this.broken) return batch.forEach((b) => b.reject(this.broken))
    const call = this.opts.call || codexCall
    try {
      const answers = await call({ ...this.opts, entries: batch.map((b) => b.entry) })
      for (const b of batch) {
        const a = answers.get(b.entry.key)
        if (a === undefined) b.reject(new SubscriptionError('Codex left an item unanswered.', 'bad_output'))
        else b.resolve(a)
      }
    } catch (err) {
      // Login, limits and PHI refusals end subscription use for this run; a
      // one-off error or timeout gets one more try after a short pause (the
      // backend sometimes fails every call of a burst for a minute: seen in
      // 3 of 7 runs on 2026-11-23, each recovering on the next call), then
      // fails only its own batch, whose items go to the API key. Answers the
      // engine salvaged before failing (err.partial, already validated)
      // stand; only the rest is retried or rejected, so each item is
      // answered exactly once.
      if (err.code === 'phi_refused' || FATAL_KINDS.has(err.kind)) this.broken = err
      const partial = err.code !== 'phi_refused' && err.partial instanceof Map ? err.partial : null
      const rest = partial
        ? batch.filter((b) => {
            const a = partial.get(b.entry.key)
            if (a === undefined) return true
            b.resolve(a)
            return false
          })
        : batch
      if (!rest.length) return
      if (!this.broken && !batch.retried && ['error', 'timeout'].includes(err.kind) && !this.opts.signal?.aborted) {
        rest.retried = true
        await new Promise((r) => setTimeout(r, this.opts.retryDelayMs ?? RETRY_DELAY_MS))
        return this.run(rest)
      }
      for (const b of rest) b.reject(err)
    }
  }
}
