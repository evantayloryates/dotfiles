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

export const CODEX_MODEL = process.env.CLASSIFIER_CODEX_MODEL || 'gpt-6-luna'
export const CODEX_EFFORT = process.env.CLASSIFIER_CODEX_EFFORT || 'low'
export const CODEX_BATCH = Number(process.env.CLASSIFIER_CODEX_BATCH) || 100
export const CODEX_CHARS = Number(process.env.CLASSIFIER_CODEX_CHARS) || 60_000
export const CODEX_PARALLEL = Number(process.env.CLASSIFIER_CODEX_PARALLEL) || 6
const TIMEOUT_MS = Number(process.env.CLASSIFIER_CODEX_TIMEOUT_MS) || 180_000
// Tool features off: classification needs no tools, and each one adds prompt
// overhead (and a way to act). The sandbox is read-only regardless.
const DISABLED_FEATURES = ['apps', 'browser_use', 'browser_use_external', 'computer_use', 'image_generation', 'memories', 'multi_agent', 'plugins', 'remote_plugin', 'shell_tool', 'unified_exec', 'skill_search', 'view_image', 'goals', 'hooks', 'in_app_browser', 'tool_suggest', 'sleep_tool']

const realHome = () => process.env.CLASSIFIER_REAL_HOME || homedir()
export const codexBin = () => process.env.CLASSIFIER_CODEX_BIN || join(realHome(), '.local', 'bin', 'codex')

export class SubscriptionError extends Error {
  constructor(message, kind) {
    super(message)
    this.code = 'subscription'
    this.kind = kind // not_logged_in | api_key_login | rate_limited | unsupported | timeout | bad_output | error
    this.retryable = false
  }
}

const childEnv = () => ({ HOME: realHome(), PATH: '/usr/bin:/bin', TMPDIR: process.env.TMPDIR || tmpdir(), LANG: 'en_US.UTF-8' })

// ---------------------------------------------------------------------------
// Login status: cached for five minutes per process.

let statusCache = null
export function subscriptionStatus({ run = defaultStatusRun, now = Date.now() } = {}) {
  if (statusCache && now - statusCache.at < 300_000) return statusCache.value
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
export function codexSchema(labelNames, multi) {
  const e = [...labelNames, 'none']
  const props = { key: { type: 'string' }, label: { type: 'string', enum: e } }
  if (multi) props.secondary = { type: 'string', enum: e }
  return {
    type: 'object',
    properties: { answers: { type: 'array', items: { type: 'object', properties: props, required: Object.keys(props), additionalProperties: false } } },
    required: ['answers'],
    additionalProperties: false,
  }
}

export function codexPrompt(system, entries, reminder) {
  return [
    system,
    '',
    'Return a JSON object {"answers": [...]} with one answer per item, in any order, each {"key": the item\'s key, "label": its label} (plus "secondary" when asked). Do not run commands or use tools; answer directly.',
    '',
    'Items:',
    JSON.stringify(entries),
    '',
    reminder,
  ].join('\n')
}

// Checks the answer against the batch: every key answered once, every label
// allowed for that item. Returns Map key -> answer; missing keys are absent.
export function parseCodexAnswers(text, entries, labelSet, multi) {
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
    out.set(a.key, multi ? { primary: a.label, secondary: allowed(a.secondary) ? a.secondary : 'none' } : a.label)
  }
  return out
}

function classifyFailure(text, code) {
  const t = String(text || '')
  if (/usage limit|rate limit|too many requests|429|quota/i.test(t)) return 'rate_limited'
  if (/not logged in|login|unauthori[sz]ed|401|sign in/i.test(t)) return 'not_logged_in'
  if (/not supported when using codex with a chatgpt account|model .* not supported/i.test(t)) return 'unsupported'
  return code === null ? 'timeout' : 'error'
}

// ---------------------------------------------------------------------------
// One Codex call. phiContext is re-checked right before spawn.

export async function codexCall({ system, entries, reminder, labelNames, multi, phiContext = {}, usage, signal, spawnFn = spawn, onCall }) {
  assertNoPhi(phiContext) // throws PhiRefusal: never spawn for PHI work
  const t0 = performance.now()
  const dir = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'classifier-codex-'))
  let ok = false
  try {
    const schemaPath = join(dir, 'schema.json')
    const lastPath = join(dir, 'answer.json')
    writeFileSync(schemaPath, JSON.stringify(codexSchema(labelNames, multi)), { mode: 0o600 })
    const args = ['exec', '-m', CODEX_MODEL, '-c', `model_reasoning_effort="${CODEX_EFFORT}"`, '-c', 'web_search="disabled"']
    for (const f of DISABLED_FEATURES) args.push('--disable', f)
    args.push('--ephemeral', '-s', 'read-only', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules', '-C', dir, '--output-schema', schemaPath, '-o', lastPath, '--json', '-')
    const { code, stdout } = await new Promise((resolvePromise, reject) => {
      const child = spawnFn(codexBin(), args, { cwd: dir, env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] })
      let out = ''
      let err = ''
      const kill = () => child.kill('SIGTERM')
      const timer = setTimeout(kill, TIMEOUT_MS)
      signal?.addEventListener('abort', kill, { once: true })
      child.stdout.on('data', (d) => (out += d))
      child.stderr.on('data', (d) => (err = (err + d).slice(-4000)))
      child.on('error', (e) => {
        clearTimeout(timer)
        reject(new SubscriptionError(`Codex could not start (${e.code || 'error'}).`, 'not_logged_in'))
      })
      child.on('close', (c, sig) => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', kill)
        resolvePromise({ code: sig ? null : c, stdout: out, stderr: err })
      })
      child.stdin.on('error', () => {})
      child.stdin.end(codexPrompt(system, entries, reminder))
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
    if (code !== 0 || failure) {
      const kind = classifyFailure(failure, code)
      throw new SubscriptionError(`Codex failed (${kind}).`, kind)
    }
    let text
    try {
      text = readFileSync(lastPath, 'utf8')
    } catch {
      throw new SubscriptionError('Codex wrote no answer.', 'bad_output')
    }
    const answers = parseCodexAnswers(text, entries, new Set(labelNames), multi)
    if (usage) usage.codex_items = (usage.codex_items || 0) + answers.size
    ok = true
    return answers
  } finally {
    onCall?.({ engine: 'codex', kind: 'batch', ms: performance.now() - t0, items: entries.length, ok })
    rmSync(dir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// Micro-batcher: entries added from anywhere in a run are grouped into Codex
// calls of up to CODEX_BATCH items / CODEX_CHARS characters, at most
// CODEX_PARALLEL at once. add() resolves with the entry's answer, or rejects
// (SubscriptionError / PhiRefusal) so the caller can fall back to the API key.

export class CodexBatcher {
  constructor(opts) {
    this.opts = opts // { system, reminder, labelNames, multi, phiContext, usage, signal, onCall, call }
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
      if (this.pending.length >= CODEX_BATCH || this.chars >= CODEX_CHARS) this.flush()
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
    const full = batch.length >= CODEX_BATCH
    const slots = Math.max(1, CODEX_PARALLEL - this.active - this.queue.length)
    const size = full ? batch.length : Math.max(25, Math.ceil(batch.length / slots))
    for (let i = 0; i < batch.length; i += size) this.queue.push(batch.slice(i, i + size))
    this.pump()
  }
  pump() {
    while (this.active < CODEX_PARALLEL && this.queue.length) {
      const batch = this.queue.shift()
      this.active++
      this.run(batch).finally(() => {
        this.active--
        this.pump()
      })
    }
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
      // one-off bad answer or error only fails its own batch.
      if (err.code === 'phi_refused' || ['not_logged_in', 'api_key_login', 'rate_limited', 'unsupported'].includes(err.kind)) this.broken = err
      for (const b of batch) b.reject(err)
    }
  }
}
