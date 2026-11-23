// OpenAI client tuned for bulk classification. Zero dependencies.
//
// What the 2026-10-01 pressure tests made non-negotiable:
// - one shared HTTP/1 pool (undici's HTTP/2 made chat ~6x slower);
// - an outer watchdog on every request (aborted fetches were seen to never
//   settle, and Node then exited mid-job);
// - 429s pause the whole client (a real 429 said retry-after-ms: 6 while the
//   bucket reset in 60 s; honouring the 6 ms caused ~25k retries in 5 s);
// - hedging: a duplicate request at ~p97 latency defeats the rare ~30 s stalls
//   for under 1% extra spend;
// - base64 embeddings (float JSON blocked the event loop for ~190 ms).

export const CHAT_MODEL = process.env.CLASSIFIER_CHAT_MODEL || 'gpt-6-luna'
export const DECISION_MODEL = 'gpt-6-luna' // the only model /v1/decisions serves
export const EMBED_MODEL = 'text-embedding-3-small'
export const EMBED_DIMS = 512

// $ per 1M tokens [input, cached input, output]; the priority tier is ~2x.
// Decisions: $0.10 uncached input, output free (published 2026-11). The
// cached-input rate is not published ("discounted"); 0.01 is an assumption.
const PRICES = {
  'gpt-6-luna': [0.2, 0.02, 1.2],
  decisions: [0.1, 0.01, 0],
  'text-embedding-3-small': [0.02, 0, 0],
}

// Process-wide counters for benchmarks and logs: 429s and transient retries
// are absorbed by request() and would otherwise be invisible.
export const stats = { rate_limited: 0, transient_retries: 0 }

const KEY = () => {
  const k = process.env.CLASSIFIER_OPENAI_KEY
  if (!k) throw new ApiError('The classifier has no API key configured.', { code: 'no_key' })
  return k
}

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'error', retryable = false, delayMs = 0 } = {}) {
    super(message)
    Object.assign(this, { status, code, retryable, delayMs })
  }
}

// ---------------------------------------------------------------------------
// Connection pool

let poolReady = null
function ensurePool() {
  poolReady ||= (async () => {
    // Node 22 does not export undici, but its global dispatcher is an undici
    // Agent; a refused local connection creates it without touching the network.
    await fetch('http://127.0.0.1:9/', { signal: AbortSignal.timeout(500) }).catch(() => {})
    const sym = Symbol.for('undici.globalDispatcher.1')
    const Agent = globalThis[sym]?.constructor
    if (Agent && Agent.name === 'Agent') {
      globalThis[sym] = new Agent({ connections: 256, keepAliveTimeout: 60_000, keepAliveMaxTimeout: 600_000, connect: { timeout: 10_000 } })
    }
  })()
  return poolReady
}

// ---------------------------------------------------------------------------
// Rate gate, concurrency limiter and latency tracking (process-wide)

const gate = {
  until: 0,
  pause(ms) {
    this.until = Math.max(this.until, Date.now() + ms)
  },
  async ready(signal) {
    while (Date.now() < this.until) {
      if (signal?.aborted) throw new ApiError('cancelled', { code: 'cancelled' })
      await sleep(Math.min(1000, this.until - Date.now()))
    }
  },
}

class Limiter {
  constructor(max) {
    this.max = max
    this.limit = max
    this.active = 0
    this.queue = []
    this.wins = 0
  }
  // A released slot is handed straight to the next waiter (active is counted
  // by the releaser), so concurrency never overshoots the limit.
  async acquire() {
    if (this.active < this.limit) return void this.active++
    await new Promise((r) => this.queue.push(r))
  }
  release() {
    this.active--
    while (this.queue.length && this.active < this.limit) {
      this.active++
      this.queue.shift()()
    }
  }
  success() {
    if (this.limit < this.max && ++this.wins >= 20) {
      this.limit++
      this.wins = 0
    }
  }
  backoff() {
    this.limit = Math.max(4, Math.floor(this.limit / 2))
    this.wins = 0
  }
}

class Latency {
  constructor(floorMs) {
    this.floor = floorMs
    this.xs = []
  }
  add(ms) {
    this.xs.push(ms)
    if (this.xs.length > 300) this.xs.shift()
  }
  pct(p) {
    if (this.xs.length < 30) return null
    const s = [...this.xs].sort((a, b) => a - b)
    return s[Math.min(s.length - 1, Math.floor(p * s.length))]
  }
}

const KINDS = {
  embed: { limiter: new Limiter(64), lat: new Latency(1500), timeoutMs: 10_000, hedge: (l) => Math.max(1500, 2.5 * (l.pct(0.5) ?? 600)) },
  chat: { limiter: new Limiter(128), lat: new Latency(1300), timeoutMs: 8_000, hedge: (l) => Math.max(1300, l.pct(0.97) ?? 1300) },
  batch: { limiter: new Limiter(160), lat: new Latency(2600), timeoutMs: 15_000, hedge: (l) => Math.max(2600, l.pct(0.97) ?? 2600) },
  long: { limiter: new Limiter(128), lat: new Latency(8000), timeoutMs: 120_000, hedge: (l) => Math.max(8000, l.pct(0.97) ?? 8000) },
  // /v1/decisions takes one text per request (no batching), so short items
  // need more requests in flight than chat batches of 20. Probed 2026-11-22:
  // 30,000 requests and 180M tokens per minute on the key, ~150-450 ms each.
  decide: { limiter: new Limiter(192), lat: new Latency(1200), timeoutMs: 8_000, hedge: (l) => Math.max(1200, l.pct(0.97) ?? 1200) },
  decide_long: { limiter: new Limiter(128), lat: new Latency(6000), timeoutMs: 120_000, hedge: (l) => Math.max(6000, l.pct(0.97) ?? 6000) },
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// One HTTP attempt, bounded by a watchdog that does not rely on fetch's signal.

// Test-only fault injection: CLASSIFIER_FAULTS="429:0.05,500:0.05,timeout:0.02,reset:0.03"
const FAULTS = (process.env.CLASSIFIER_FAULTS || '')
  .split(',')
  .filter(Boolean)
  .map((f) => f.split(':'))
  .map(([kind, p]) => [kind, Number(p)])
function injectFault() {
  for (const [kind, p] of FAULTS) {
    if (Math.random() >= p) continue
    if (kind === '429') throw new ApiError('Rate limited.', { status: 429, code: 'rate_limit', retryable: true, delayMs: 300 })
    if (kind === '500') throw new ApiError('OpenAI error 500: injected', { status: 500, code: 'api', retryable: true })
    if (kind === 'timeout') return 'timeout'
    if (kind === 'reset') throw new ApiError('Network error: ECONNRESET', { code: 'network', retryable: true })
  }
  return null
}

async function once(path, body, timeoutMs, signal) {
  if (FAULTS.length && injectFault() === 'timeout') {
    await sleep(Math.min(timeoutMs, 3000))
    throw new ApiError('The request timed out.', { code: 'timeout', retryable: true })
  }
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  let timer
  const watchdog = new Promise((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort()
      reject(new ApiError('The request timed out.', { code: 'timeout', retryable: true }))
    }, timeoutMs)
  })
  const work = (async () => {
    const res = await fetch(`https://api.openai.com/v1/${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${KEY()}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {}
    return { res, json }
  })()
  work.catch(() => {})
  try {
    const { res, json } = await Promise.race([work, watchdog])
    if (res.ok && json) return { json, headers: res.headers }
    const message = json?.error?.message || `HTTP ${res.status}`
    if (res.status === 429) {
      const h = res.headers
      const reset = (name) => parseDuration(h.get(name))
      let delayMs = Math.max(Number(h.get('retry-after-ms')) || 0, (Number(h.get('retry-after')) || 0) * 1000, 250)
      if (h.get('x-ratelimit-remaining-requests') === '0') delayMs = Math.max(delayMs, reset('x-ratelimit-reset-requests'))
      if (h.get('x-ratelimit-remaining-tokens') === '0') delayMs = Math.max(delayMs, reset('x-ratelimit-reset-tokens'))
      const quota = /quota|billing/i.test(message)
      throw new ApiError(quota ? `OpenAI refused the request: ${message}` : 'Rate limited.', { status: 429, code: quota ? 'quota' : 'rate_limit', retryable: !quota, delayMs: Math.min(delayMs, 65_000) })
    }
    const retryable = res.status === 408 || res.status === 409 || res.status >= 500 || (res.ok && !json)
    throw new ApiError(`OpenAI error ${res.status}: ${message}`, { status: res.status, code: res.status === 401 ? 'auth' : 'api', retryable })
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (signal?.aborted) throw new ApiError('cancelled', { code: 'cancelled' })
    throw new ApiError(`Network error: ${err.cause?.code || err.name || err.message}`, { code: 'network', retryable: true })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

// "1m2.5s", "59.999s", "250ms" -> milliseconds
function parseDuration(v) {
  if (!v) return 0
  let ms = 0
  for (const [, n, unit] of String(v).matchAll(/([\d.]+)(ms|s|m|h)/g)) ms += Number(n) * { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[unit]
  return ms
}

// One attempt plus at most one hedge. A fast non-429 failure inside the hedge
// window counts as an instant retry; a 429 or a fatal error ends the attempt.
function hedged(path, body, timeoutMs, hedgeMs, signal) {
  return new Promise((resolve, reject) => {
    const ctrls = []
    let done = false
    let running = 0
    let hedgeFired = false
    let hedgeTimer = null
    const finish = (fn, v) => {
      if (done) return
      done = true
      clearTimeout(hedgeTimer)
      for (const c of ctrls) c.abort()
      fn(v)
    }
    const launch = () => {
      const c = new AbortController()
      ctrls.push(c)
      running++
      once(path, body, timeoutMs, signal ? AbortSignal.any([signal, c.signal]) : c.signal).then(
        (v) => finish(resolve, v),
        (err) => {
          running--
          if (done) return
          if (!err.retryable || err.code === 'rate_limit') return finish(reject, err)
          if (running > 0) return
          if (hedgeMs && !hedgeFired) {
            hedgeFired = true
            clearTimeout(hedgeTimer)
            return launch()
          }
          finish(reject, err)
        }
      )
    }
    launch()
    if (hedgeMs) {
      hedgeTimer = setTimeout(() => {
        if (!done && !hedgeFired) {
          hedgeFired = true
          launch()
        }
      }, hedgeMs)
    }
  })
}

// Retries: 5 attempts for transient errors, more patience for 429s (which
// pause the whole process and halve concurrency until things recover).
async function request(kind, path, body, { signal } = {}) {
  await ensurePool()
  const k = KINDS[kind]
  let transient = 0
  for (let attempt = 0; attempt < 12; attempt++) {
    await gate.ready(signal)
    await k.limiter.acquire()
    const t0 = performance.now()
    try {
      const r = await hedged(path, body, k.timeoutMs, k.hedge(k.lat), signal)
      k.lat.add(performance.now() - t0)
      k.limiter.success()
      return r
    } catch (err) {
      if (signal?.aborted) throw new ApiError('cancelled', { code: 'cancelled' })
      if (err.code === 'rate_limit') {
        stats.rate_limited++
        gate.pause(err.delayMs)
        k.limiter.backoff()
        continue
      }
      if (!err.retryable || ++transient >= 5) throw err
      stats.transient_retries++
      await sleep(Math.min(8000, 250 * 2 ** transient) * (0.5 + Math.random()))
    } finally {
      k.limiter.release()
    }
  }
  throw new ApiError('OpenAI kept rate limiting the requests.', { code: 'rate_limit' })
}

// ---------------------------------------------------------------------------
// Usage accounting

// chat_calls / decision_calls / codex_calls count stage-two requests per
// engine; codex_* tokens are the ChatGPT subscription's (no dollar cost, but
// they draw on its usage limits). usd counts API-key spend only.
export function newUsage() {
  return { chat_calls: 0, decision_calls: 0, embed_calls: 0, codex_calls: 0, codex_items: 0, codex_input_tokens: 0, codex_output_tokens: 0, subscription_fallback_items: 0, subscription_recheck_items: 0, input_tokens: 0, cached_tokens: 0, output_tokens: 0, embed_tokens: 0, usd: 0 }
}
function account(usage, model, u, tier) {
  if (!usage || !u) return
  if (model === 'decisions') {
    const p = PRICES.decisions
    const input = u.input_tokens || 0
    const cached = u.input_tokens_details?.cached_tokens || 0
    usage.decision_calls = (usage.decision_calls || 0) + 1
    usage.input_tokens += input
    usage.cached_tokens += cached
    usage.output_tokens += u.output_tokens || 0
    usage.usd += ((input - cached) * p[0] + cached * p[1]) / 1e6
    return
  }
  const p = PRICES[model] || [0, 0, 0]
  const factor = tier === 'priority' || tier === 'fast' ? 2 : 1
  if (model === EMBED_MODEL) {
    usage.embed_calls++
    usage.embed_tokens += u.total_tokens || 0
    usage.usd += ((u.total_tokens || 0) * p[0]) / 1e6
    return
  }
  const input = u.prompt_tokens || 0
  const cached = u.prompt_tokens_details?.cached_tokens || 0
  const output = u.completion_tokens || 0
  usage.chat_calls++
  usage.input_tokens += input
  usage.cached_tokens += cached
  usage.output_tokens += output
  usage.usd += (((input - cached) * p[0] + cached * p[1] + output * p[2]) / 1e6) * factor
}

// ---------------------------------------------------------------------------
// Public calls

// Embeds up to 256 texts in one request; returns unit Float32Array vectors.
export async function embedBatch(texts, { usage, signal } = {}) {
  const { json } = await request('embed', 'embeddings', { model: EMBED_MODEL, input: texts, dimensions: EMBED_DIMS, encoding_format: 'base64' }, { signal })
  account(usage, EMBED_MODEL, json.usage)
  return json.data
    .sort((a, b) => a.index - b.index)
    .map((d) => {
      const buf = Buffer.from(d.embedding, 'base64')
      const v = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
      return unit(Float32Array.from(v))
    })
}

// Embeds any number of texts: batches of 128, run concurrently.
export async function embedMany(texts, { usage, signal, batch = 128 } = {}) {
  const out = new Array(texts.length)
  const jobs = []
  for (let i = 0; i < texts.length; i += batch) {
    const slice = texts.slice(i, i + batch)
    jobs.push(
      embedBatch(slice, { usage, signal }).then((vs) => {
        vs.forEach((v, j) => (out[i + j] = v))
      })
    )
  }
  await Promise.all(jobs)
  return out
}

function unit(v) {
  let n = 0
  for (let i = 0; i < v.length; i++) n += v[i] * v[i]
  n = Math.sqrt(n) || 1
  for (let i = 0; i < v.length; i++) v[i] /= n
  return v
}

// Chat completion with a strict JSON schema. kind: chat (one short item),
// batch (many short items) or long (one long item).
export async function chatJson({ kind = 'chat', system, user, schema, tier = 'priority', usage, signal, maxOut, cacheKey, onCall, items = 1 }) {
  const body = {
    model: CHAT_MODEL,
    reasoning_effort: 'none',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'labels', strict: true, schema } },
  }
  if (tier && tier !== 'default') body.service_tier = tier
  if (maxOut) body.max_completion_tokens = maxOut
  // Requests sharing a prefix (one label set) are routed to the same cache.
  if (cacheKey) body.prompt_cache_key = cacheKey
  const t0 = performance.now()
  let json
  try {
    ;({ json } = await request(kind, 'chat/completions', body, { signal }))
  } catch (err) {
    onCall?.({ engine: 'chat', kind, ms: performance.now() - t0, items, ok: false })
    throw err
  }
  onCall?.({ engine: 'chat', kind, ms: performance.now() - t0, items, ok: true })
  account(usage, CHAT_MODEL, json.usage, json.service_tier)
  const choice = json.choices?.[0]
  if (choice?.message?.refusal) throw new ApiError('The model declined to label this text.', { code: 'refused' })
  try {
    return JSON.parse(choice.message.content)
  } catch {
    throw new ApiError('The model returned an unreadable answer.', { code: 'bad_output', retryable: false })
  }
}

// ---------------------------------------------------------------------------
// Decisions API: POST /v1/decisions answers typed questions about one input.
// No service_tier (rejected as an unknown parameter, 2026-11-22), no
// reasoning_effort, no batching of independent texts, no file_id.

// Builds the request body. input: a string or a messages array.
export function decisionBody({ input, questions, cacheKey }) {
  const body = { model: DECISION_MODEL, input, questions }
  if (cacheKey) body.prompt_cache_key = String(cacheKey).slice(0, 64)
  return body
}

// Parses answers into a map by question name. A refusal answer becomes
// { refused: true }; a missing answer is an error (bad_output).
export function parseDecisionAnswers(json, questions) {
  const answers = Array.isArray(json?.answers) ? json.answers : null
  if (!answers) throw new ApiError('The Decisions API returned no answers.', { code: 'bad_output', retryable: false })
  const byName = new Map()
  answers.forEach((a, i) => byName.set(a?.name ?? questions[i]?.name, a))
  const out = {}
  for (const q of questions) {
    const a = byName.get(q.name)
    if (!a) throw new ApiError('The Decisions API left a question unanswered.', { code: 'bad_output', retryable: false })
    if (a.type === 'refusal') out[q.name] = { refused: true }
    else if (a.type === 'choice') {
      const probs = Object.fromEntries((a.probabilities || []).map((p) => [String(p.value), Number(p.probability) || 0]))
      out[q.name] = { choice: a.choice, probability: probs[String(a.choice)] ?? null, confidence: Number(a.confidence ?? 0), probabilities: probs }
    } else if (a.type === 'predicate') out[q.name] = { probability: Number(a.probability ?? 0) }
    else if (a.type === 'score') out[q.name] = { score: Number(a.score), confidence: Number(a.confidence ?? 0) }
    else throw new ApiError('The Decisions API returned an unknown answer type.', { code: 'bad_output', retryable: false })
  }
  return out
}

// kind: decide (one short item) or decide_long (one long item or window).
export async function decision({ kind = 'decide', input, questions, usage, signal, cacheKey, onCall }) {
  const t0 = performance.now()
  let ok = false
  try {
    const { json } = await request(kind, 'decisions', decisionBody({ input, questions, cacheKey }), { signal })
    account(usage, 'decisions', json.usage)
    const out = parseDecisionAnswers(json, questions)
    ok = true
    return out
  } finally {
    onCall?.({ engine: 'decisions', kind, ms: performance.now() - t0, items: 1, ok })
  }
}
