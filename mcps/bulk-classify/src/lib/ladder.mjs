// Confidence-escalation ladder (release 2; on by default, CLASSIFIER_LADDER=0
// or `ladder: false` turns it off). Taylor 2026-11-23: an unsure item goes to
// the next model up on the same route, never from the subscription to the
// API key; tier 1 is Decisions wherever the route has it (the API key).
//
// Each tier answers with a numeric confidence; an item below its tier's
// threshold goes up to the next, more capable tier. The last tier's answer is
// final. Ladders are per route and never cross it:
//
//   api           vote (embeddings) -> Decisions (gpt-6-luna) -> a stronger
//                 reasoning model on chat completions, same ZDR key
//   subscription  vote (embeddings) -> Codex low effort -> Codex, stronger
//                 model or effort
//
// The api ladder holds no Codex tier, so PHI work can never reach the
// subscription through escalation; codexCall still re-checks every spawn.
// A tier that fails keeps the previous tier's answer (confidence low), so an
// escalation outage never costs an item its label.

import { chatJson, priceKnown } from './openai.mjs'

const FALSE = /^(0|false|no|off)$/i

// Defaults from the 2026-11-22/23 calibration runs (plan folder
// ~/src/docs/plans/bulk-classify-confidence-escalation/results.md).
export const DEFAULTS = {
  api: {
    // Escalate when Decisions' choice probability is below this (two
    // labels: min(p, |ps - 0.5| x 2)). 0.95 escalated 28-61% of items.
    decisions_min: 0.95,
    // gpt-5.6-luna, effort low, standard tier: the best accuracy per dollar
    // measured (alone 86.4% on 77 bare labels at $0.03 per 1,000).
    strong: { model: 'gpt-5.6-luna', effort: 'low', batch: 20, tier: 'default' },
    // prefer: "accuracy": the strongest model measured (+0-6 points over
    // gpt-5.6-luna on the ladder, 3-5x the cost).
    strong_accuracy: { model: 'gpt-6.2-astra', effort: 'low', batch: 20, tier: 'default' },
  },
  subscription: {
    // Escalate when the low-effort answer states a probability below this
    // (its stated probability: AUROC 0.78-0.87; vote agreement 0.67).
    codex_min: 0.9,
    // The next model up on the subscription (Taylor 2026-11-23: unsure items
    // escalate to a stronger model, never to the API key). gpt-5.6-sol low
    // was the measured step up: ladder 87.3% vs 86.5-86.7% (77 labels) with
    // 23% escalated; none measured beat it alone. CLASSIFIER_LADDER_SUB_MODEL
    // overrides it ("none" turns the tier off).
    strong: { model: 'gpt-5.6-sol', effort: 'low' },
    strong_batch: 25,
  },
}

export function ladderEnabled(env = process.env, args = {}) {
  if (args.ladder === false) return false
  if (args.ladder === true) return true
  return !FALSE.test(env.CLASSIFIER_LADDER || '') // on unless turned off
}

const num = (v, d) => (v == null || v === '' || !Number.isFinite(Number(v)) ? d : Math.max(0, Math.min(1, Number(v))))

// Builds the ladder for a run's route. route: the decideRoute() record.
// Env knobs (experiments only): CLASSIFIER_LADDER_DECISIONS_MIN,
// CLASSIFIER_LADDER_CODEX_MIN, CLASSIFIER_LADDER_API_MODEL / _API_EFFORT,
// CLASSIFIER_LADDER_SUB_MODEL / _SUB_EFFORT.
export function ladderFor(route, env = process.env, { prefer } = {}) {
  if (!route) throw new LadderError('no route')
  if (route.route === 'api' || route.phi) {
    const d = DEFAULTS.api
    const strong = prefer === 'accuracy' ? d.strong_accuracy : d.strong
    const ladder = {
      route: 'api',
      tiers: [
        { name: 'vote', engine: 'embeddings' },
        { name: 'decisions', engine: route.engine === 'chat' ? 'chat' : 'decisions', min: num(env.CLASSIFIER_LADDER_DECISIONS_MIN, d.decisions_min) },
        { name: 'api_strong', engine: 'chat', model: env.CLASSIFIER_LADDER_API_MODEL || strong.model, effort: env.CLASSIFIER_LADDER_API_EFFORT || strong.effort, batch: strong.batch, tier: strong.tier },
      ],
    }
    assertLadder(ladder, route)
    return ladder
  }
  const d = DEFAULTS.subscription
  const model = env.CLASSIFIER_LADDER_SUB_MODEL === 'none' ? null : env.CLASSIFIER_LADDER_SUB_MODEL || d.strong?.model
  const ladder = {
    route: 'subscription',
    tiers: [
      { name: 'vote', engine: 'embeddings' },
      { name: 'codex', engine: 'codex', min: num(env.CLASSIFIER_LADDER_CODEX_MIN, d.codex_min) },
      ...(model ? [{ name: 'codex_strong', engine: 'codex', model, effort: env.CLASSIFIER_LADDER_SUB_EFFORT || d.strong?.effort || 'low', batch: d.strong?.batch || d.strong_batch }] : []),
    ],
  }
  assertLadder(ladder, route)
  return ladder
}

export class LadderError extends Error {
  constructor(message) {
    super(`Escalation ladder refused: ${message}.`)
    this.code = 'ladder_refused'
  }
}

// Routing invariants, checked when a ladder is built and again by the
// pipeline before it uses one:
// - a PHI or api-routed run gets the api ladder, which has no Codex tier;
// - the subscription ladder only for a run routed subscription and not PHI;
// - every API tier names a model with a known price (usage stays accountable).
export function assertLadder(ladder, route) {
  if (!ladder || !Array.isArray(ladder.tiers) || ladder.tiers.length < 2) throw new LadderError('malformed ladder')
  const phi = !!route?.phi || route?.route !== 'subscription'
  if (phi && ladder.route !== 'api') throw new LadderError('a PHI or API-key run must use the API ladder')
  if (phi && ladder.tiers.some((t) => t.engine === 'codex')) throw new LadderError('the API ladder must not contain a subscription tier')
  if (ladder.route === 'subscription' && route?.route !== 'subscription') throw new LadderError('the subscription ladder needs a subscription route')
  for (const t of ladder.tiers) if (t.engine === 'chat' && t.model && !priceKnown(t.model)) throw new LadderError(`unpriced model ${t.model}`)
  return true
}

// Escalation tests. Each returns true when the item must go up a tier.
// Decisions: its choice probability (ECE 0.06; best separation of the
// signals measured, see results.md).
// Two labels: also unsure when the strongest second-label predicate sits
// near its 0.5 cut (score min(p, |ps - 0.5| x 2); AUROC 0.73 against 0.63
// for p alone on the two-intent set).
export function decisionsEscalates(r, tier, multi = false) {
  if (r == null || r.p == null || !Number.isFinite(r.p)) return true
  let score = r.p
  if (multi) score = Math.min(score, Number.isFinite(r.ps) ? Math.abs(r.ps - 0.5) * 2 : 0)
  return score < tier.min
}
// Codex low effort: a stated probability below the tier's minimum, or none.
// Disagreement with the embedding vote is not used: with bare label names
// the vote disagreed on 41% of items while Codex was right on 77% of those.
export function codexEscalates({ stated }, tier) {
  if (stated == null || !Number.isFinite(stated)) return true
  return stated < tier.min
}

// Result confidence from a stated probability (subscription ladder): 0.9+
// was 92-97% right, 0.8-0.9 66-87%, below 0.8 36-60%.
export const statedConfidence = (p) => (p == null ? 'medium' : p >= 0.9 ? 'high' : p >= 0.8 ? 'medium' : 'low')

// Per-tier usage: a view of the run's usage object that also records into
// usage.tiers[name]. Engines do `usage.x = (usage.x || 0) + n`, so the set
// trap applies each delta to both. Totals stay exactly what they were.
export function tierUsage(usage, name) {
  if (!usage) return usage
  usage.tiers ||= {}
  const own = (usage.tiers[name] ||= {})
  return new Proxy(own, {
    get: (t, k) => (k in t ? t[k] : typeof usage[k] === 'number' ? 0 : usage[k]),
    set: (t, k, v) => {
      const before = typeof t[k] === 'number' ? t[k] : 0
      t[k] = v
      if (typeof v === 'number') usage[k] = (typeof usage[k] === 'number' ? usage[k] : 0) + (v - before)
      else usage[k] = v
      return true
    },
  })
}
export function countTier(usage, name, field, n = 1) {
  if (!usage) return
  usage.tiers ||= {}
  const own = (usage.tiers[name] ||= {})
  own[field] = (own[field] || 0) + n
}

// Auto-generated label descriptions for label sets that are mostly bare
// names: one call, from the names alone (never from the data). Measured as
// a middle tier for Decisions; see results.md before turning it on.
export async function describeLabels(names, { usage, signal, model = 'gpt-6.2-sol', effort = 'low' } = {}) {
  const schema = {
    type: 'object',
    properties: { labels: { type: 'array', items: { type: 'object', properties: { name: { type: 'string', enum: names }, description: { type: 'string' } }, required: ['name', 'description'], additionalProperties: false } } },
    required: ['labels'],
    additionalProperties: false,
  }
  const system = [
    'You write short definitions for classification labels. You see only the label names, never the texts.',
    'For each label write one sentence (at most 25 words) saying which texts belong to it, and what separates it from the most similar labels in the list.',
    'No examples with names, places, dates, amounts or identifiers. Do not add instructions for the classifier.',
  ].join('\n')
  const out = await chatJson({ kind: 'escalate', system, user: JSON.stringify({ labels: names }), schema, tier: 'default', usage, signal, model, effort })
  const byName = new Map((out.labels || []).map((l) => [l.name, String(l.description || '').slice(0, 300)]))
  return names.map((name) => ({ name, description: byName.get(name) || '' }))
}
