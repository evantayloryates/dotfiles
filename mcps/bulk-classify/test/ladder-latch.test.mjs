// One stop per run for both Codex ladder tiers (PE diff review r1, release 2,
// point 1; from the PE's probe pe/probe-unsafe-latch.mjs). Mocked HTTP and a
// stubbed Codex call; no network, no subscription.
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const scratch = mkdtempSync(join(tmpdir(), 'classifier-ladder-'))
process.env.CLASSIFIER_JOBS_DIR = join(scratch, 'jobs')
process.env.CLASSIFIER_PROFILES_DIR = join(scratch, 'profiles')
process.env.CLASSIFIER_NO_CACHE = '1'
process.env.CLASSIFIER_CODEX_BATCH = '2'
process.env.CLASSIFIER_OPENAI_KEY = 'test-key-not-real'

const { newUsage } = await import('../src/lib/openai.mjs')
const { SubscriptionError } = await import('../src/lib/codex.mjs')
const { buildTaxonomy } = await import('../src/lib/taxonomy.mjs')
const { buildBank } = await import('../src/lib/bank.mjs')
const { classifyItems } = await import('../src/lib/classify.mjs')
const L = await import('../src/lib/ladder.mjs')

// ---------------------------------------------------------------------------
// Mock OpenAI. Decisions: keyword rules with a probability chosen per text
// ("unsure" in the text = 0.55). Chat (the strong tier): answers from rules
// that know better ("unsure double charge" -> billing), or fails on demand.

const calls = []
let chatMode = 'ok'
function vec(text) {
  const v = new Float32Array(512)
  for (let i = 0; i < text.length; i++) v[(text.charCodeAt(i) * 31 + i) % 512] += 1
  return Buffer.from(v.buffer).toString('base64')
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const userMsg = (body) => JSON.parse(body.input.find((m) => m.role === 'user').content.split('\n\n')[0]).message
globalThis.fetch = async (url, init = {}) => {
  url = String(url)
  const body = JSON.parse(init.body)
  const path = url.slice('https://api.openai.com/v1/'.length)
  calls.push({ path, body })
  if (path === 'embeddings') return json(200, { data: body.input.map((t, index) => ({ index, embedding: vec(t) })), usage: { total_tokens: 10 * body.input.length } })
  if (path === 'decisions') {
    const text = userMsg(body)
    const pick = /charge|refund/i.test(text) ? 'scheduling' : /move|resched/i.test(text) ? 'scheduling' : 'none'
    const p = /unsure/.test(text) ? 0.55 : 0.97
    const choices = body.questions[0].choices.map((c) => c.value)
    const answers = [{ type: 'choice', name: 'label', choice: /unsure/.test(text) ? pick : /charge|refund/i.test(text) ? 'billing' : pick, confidence: p, probabilities: choices.map((v) => ({ value: v, probability: v === (/unsure/.test(text) ? pick : /charge|refund/i.test(text) ? 'billing' : pick) ? p : (1 - p) / (choices.length - 1) })) }]
    for (const q of body.questions.slice(1)) answers.push({ type: 'predicate', name: q.name, probability: /maybe-also/.test(text) ? 0.5 : 0.05 })
    return json(200, { answers, usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 0 }, output_tokens: 0 } })
  }
  if (path === 'chat/completions') {
    if (chatMode === 'fail') return json(400, { error: { message: 'model overloaded (test)' } })
    const items = JSON.parse(body.messages[1].content.split('\n\n')[0])
    const multi = body.response_format.json_schema.schema.properties.m1?.type === 'object' || body.response_format.json_schema.schema.$defs?.any?.type === 'object'
    const out = Object.fromEntries(items.map((it) => {
      const l = /charge|refund/i.test(it.message) ? 'billing' : /move/i.test(it.message) ? 'scheduling' : 'none'
      return [it.key, multi ? { primary: l, secondary: 'none' } : l]
    }))
    return json(200, { choices: [{ message: { content: JSON.stringify(out) } }], usage: { prompt_tokens: 2000, completion_tokens: 300 }, service_tier: 'default' })
  }
  return json(404, { error: { message: 'unexpected' } })
}

const labels = [{ name: 'billing', description: 'charges, refunds, invoices' }, { name: 'scheduling', description: 'booking or moving sessions' }]
const taxonomy = buildTaxonomy({ labels })
const apiRoute = { route: 'api', engine: 'decisions', phi: false, reasons: ['test'] }
const phiRoute = { route: 'api', engine: 'decisions', phi: true, reasons: ['test'] }
const subRoute = { route: 'subscription', engine: 'codex', phi: false, reasons: ['test'] }
const SUB_ENV = { CLASSIFIER_LADDER_SUB_MODEL: 'gpt-5.6-sol' }

// ---------------------------------------------------------------------------
// Routing invariants
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function run(stub) {
  const bank = await buildBank(taxonomy, null, {})
  const usage = newUsage()
  const out = new Map()
  const log = []
  const route = { ...subRoute }
  await classifyItems(['unsure: charged twice A', 'refund please A', 'unsure: charged twice B', 'refund please B', 'move my session C', 'refund please C'].map((text) => ({ text })), bank, (i, r) => out.set(i, r), { engine: 'codex', usage, route, ladder: L.ladderFor(subRoute, SUB_ENV), codexCall: stub(log) })
  return { log, route, out }
}

test('unsafe on the low tier: the strong tier makes no Codex call afterwards, and the run is marked fatal', async () => {
  let n = 0
  let unsafeAt = null
  const r = await run((log) => async ({ entries, model, withConfidence }) => {
    const tier = model && model !== 'gpt-5.6-luna' ? 'strong' : 'low'
    log.push({ tier, i: ++n, t: performance.now() })
    if (tier === 'low' && entries.some((e) => /B/.test(e.message))) {
      unsafeAt = performance.now()
      throw new SubscriptionError('A process ran under the Codex app-server.', 'unsafe')
    }
    if (tier === 'low') await sleep(50)
    return new Map(entries.map((e) => [e.key, withConfidence ? { answer: 'billing', confidence: /unsure/.test(e.message) ? 0.5 : 0.99 } : 'billing']))
  })
  assert.ok(unsafeAt, 'the low tier went unsafe')
  assert.equal(r.log.filter((c) => c.tier === 'strong').length, 0)
  assert.equal(r.route.fallback?.kind, 'unsafe')
  assert.equal(r.route.fallback?.fatal, true)
})

test('unsafe on the strong tier: no low-tier call starts afterwards, and the run is marked fatal', async () => {
  let n = 0
  let unsafeAt = null
  const r = await run((log) => async ({ entries, model, withConfidence }) => {
    const tier = model && model !== 'gpt-5.6-luna' ? 'strong' : 'low'
    log.push({ tier, i: ++n, t: performance.now() })
    if (tier === 'strong') {
      unsafeAt ??= performance.now()
      throw new SubscriptionError('A process ran under the Codex app-server.', 'unsafe')
    }
    if (/C/.test(entries[0].message)) await sleep(150)
    return new Map(entries.map((e) => [e.key, withConfidence ? { answer: 'billing', confidence: /unsure/.test(e.message) ? 0.5 : 0.99 } : 'billing']))
  })
  assert.ok(unsafeAt, 'the strong tier went unsafe')
  assert.equal(r.log.filter((c) => c.tier === 'low' && c.t > unsafeAt).length, 0)
  assert.equal(r.route.fallback?.kind, 'unsafe')
  assert.equal(r.route.fallback?.fatal, true)
})

test('fallback items escalate on the API key, API to API, honouring prefer: accuracy (PE diff r1 point 5)', async () => {
  for (const [prefer, model] of [[undefined, 'gpt-5.6-luna'], ['accuracy', 'gpt-6.2-astra']]) {
    calls.length = 0
    const bank = await buildBank(taxonomy, null, {})
    const out = new Map()
    const route = { ...subRoute }
    const stub = async () => Promise.reject(new SubscriptionError('limit (test)', 'rate_limited'))
    await classifyItems(['unsure: charged twice', 'refund please'].map((text) => ({ text })), bank, (i, r) => out.set(i, r), { engine: 'codex', usage: newUsage(), route, prefer, ladder: L.ladderFor(subRoute, SUB_ENV, { prefer }), codexCall: stub })
    const chat = calls.filter((c) => c.path === 'chat/completions')
    assert.ok(chat.length >= 1, 'the unsure fallback item escalated')
    assert.ok(chat.every((c) => c.body.model === model), `strong model ${model}`)
    assert.equal(out.get(0).path, 'escalated')
    assert.equal(route.fallback?.fatal, true)
  }
})
