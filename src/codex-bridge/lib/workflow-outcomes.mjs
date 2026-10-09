// Typed reported verification/cleanup, linked to a persisted action receipt.
// References are not fetched; these claims are never authenticated app success.
import { isAbsolute } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

function shape(value, names, required = names) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(k => !names.includes(k)) || required.some(k => !(k in value))) throw new Error('invalid workflow outcome fields')
}
function text(value, max = 1000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f]/.test(value)) throw new Error('invalid workflow outcome text')
  return value
}
function references(value, required = false) {
  if (!Array.isArray(value) || value.length > 16 || (required && !value.length)) throw new Error('workflow outcome needs bounded evidence references')
  return value.map(p => { text(p, 2048); if (!isAbsolute(p)) throw new Error('workflow evidence paths must be absolute'); return p })
}
export function validateVerification(value) {
  shape(value, ['state', 'method', 'summary', 'evidence_refs'])
  if (!['verified', 'failed', 'not_checked', 'unknown'].includes(value.state)) throw new Error('invalid verification state')
  return { state: value.state, method: text(value.method, 128), summary: text(value.summary),
    evidence_refs: references(value.evidence_refs, ['verified', 'failed'].includes(value.state)) }
}
export function validateCleanup(value) {
  shape(value, ['state', 'summary', 'evidence_refs'])
  if (!['completed', 'partial', 'not_required', 'unknown'].includes(value.state)) throw new Error('invalid cleanup state')
  return { state: value.state, summary: text(value.summary),
    evidence_refs: references(value.evidence_refs, ['completed', 'partial'].includes(value.state)) }
}
export function validateOutcomeRequest(input) {
  shape(input, ['session_id', 'receipt_id', 'observed_at', 'verification', 'cleanup', 'context'],
    ['session_id', 'receipt_id', 'observed_at', 'verification', 'cleanup'])
  text(input.session_id, 256)
  if (typeof input.receipt_id !== 'string' || !/^[a-f0-9]{64}$/.test(input.receipt_id)) throw new Error('outcome requires persisted receipt ID')
  text(input.observed_at, 64)
  if (!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(input.observed_at) || !Number.isFinite(Date.parse(input.observed_at))) throw new Error('invalid outcome observation time')
  const context = input.context ?? {}
  shape(context, ['expected_outcome', 'observed_state', 'cleanup_plan'], [])
  return { session_id: input.session_id, receipt_id: input.receipt_id,
    observed_at: new Date(input.observed_at).toISOString(),
    verification: validateVerification(input.verification), cleanup: validateCleanup(input.cleanup),
    context: Object.fromEntries(Object.entries(context).map(([k, v]) => [k, text(v, 1500)])) }
}
export function outcomeValue(input, receipt) {
  const value = validateOutcomeRequest(input)
  if (!receipt || receipt.id !== value.receipt_id || receipt.value.session_id !== value.session_id) throw new Error('persisted receipt does not belong to this outcome session')
  const r = receipt.value
  return { ...value, schema: 'computer-use-workflow-outcome/v1', action_id: r.action_id,
    caller: r.caller, provider: r.provider, target: r.target, start_ns: r.start_ns, end_ns: r.end_ns,
    clock_domain: r.clock_domain, receipt_result: r.result, receipt_state: r.state ?? 'declared',
    receipt_provenance: r.provenance, provenance: 'reported_verification_and_cleanup',
    ownership: 'Caller/result unverified; evidence references are not fetched or authenticated' }
}

export function auditOutcomes(receipts, outcomes, { now = Date.now(), limit = 20 } = {}) {
  if (!Number.isFinite(now) || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('invalid audit clock or detail limit')
  const known = new Map(receipts.map(r => [r.id, r]))
  for (const entry of outcomes) {
    const v = entry.value
    const normalized = outcomeValue(Object.fromEntries(['session_id', 'receipt_id', 'observed_at', 'verification', 'cleanup', 'context'].map(k => [k, v[k]])), known.get(v.receipt_id))
    // Stored outcomes must continue to agree with the linked immutable receipt.
    if (!isDeepStrictEqual(normalized, v)) throw new Error('workflow outcome disagrees with its persisted receipt')
  }
  const eligible = outcomes.filter(e => Date.parse(e.value.observed_at) <= now)
    .sort((a, b) => Date.parse(b.value.observed_at) - Date.parse(a.value.observed_at) || a.id.localeCompare(b.id))
  const selected = receipts.slice().sort((a, b) => BigInt(a.value.start_ns) > BigInt(b.value.start_ns) ? -1 : BigInt(a.value.start_ns) < BigInt(b.value.start_ns) ? 1 : a.id.localeCompare(b.id)).slice(0, 100)
  const window = eligible.slice(0, 100)
  const counts = { receipt_result: {}, verification: {}, cleanup: {}, uncovered_receipts: 0, conflicting_verification_receipts: 0 }
  const increment = (group, state) => { counts[group][state] = (counts[group][state] ?? 0) + 1 }
  const details = selected.map(receipt => {
    const matches = window.filter(e => e.value.receipt_id === receipt.id)
    const latest = matches[0]
    const states = [...new Set(matches.map(e => e.value.verification.state))]
    const conflict = states.includes('verified') && states.includes('failed')
    if (!latest) counts.uncovered_receipts++
    if (conflict) counts.conflicting_verification_receipts++
    increment('receipt_result', receipt.value.result)
    increment('verification', latest?.value.verification.state ?? 'unknown')
    increment('cleanup', latest?.value.cleanup.state ?? 'unknown')
    return { receipt_id: receipt.id, action_id: receipt.value.action_id, receipt_result: receipt.value.result,
      latest_outcome_id: latest?.id ?? null, verification: latest?.value.verification.state ?? 'unknown',
      cleanup: latest?.value.cleanup.state ?? 'unknown', verification_states_seen: states,
      conflicting_verification_claims: conflict, outcome_ids: matches.map(e => e.id) }
  })
  return { schema: 'computer-use-workflow-audit/v1', audited_at: new Date(now).toISOString(),
    coverage: { stored_receipts: receipts.length, evaluated_receipts: selected.length,
      stored_outcomes: outcomes.length, evaluated_outcomes: window.length, future_outcomes_withheld: outcomes.length - eligible.length,
      receipts_truncated: receipts.length > 100, outcomes_truncated: eligible.length > 100,
      complete_observation_window: receipts.length <= 100 && eligible.length <= 100 },
    counts, details: details.slice(0, limit), detail_rows_omitted: Math.max(0, details.length - limit),
    limits: ['Counts describe persisted reported receipts/outcomes, not all UI operations or a task success rate',
      'No typed outcome means verification/cleanup unknown even when a receipt claims delivered or verified',
      'Latest claims and conflicting verification history stay distinct; truncation can hide older claims',
      'Caller/result ownership and evidence contents are unverified; no text grading, UI replay or model is invoked'] }
}
