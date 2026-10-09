// Deterministic planning from typed local observations. No text grading, model,
// native UI, evidence-content fetch or automatic requalification is performed.
import { ENTITY_FIELDS, validateEntity } from './capability-evidence.mjs'

// Explicit metadata sentinels are not verified dimensions even when the caller
// checks the confirmation flag. This is not inference from arbitrary prose.
const UNKNOWN_DIMENSIONS = new Set(['unknown', 'unavailable', 'unspecified', 'unverified', 'not_available'])

export function validatePlan(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('plan requires an object')
  const fields = ['entity', 'capabilities', 'environment_verified']
  if (Object.keys(input).some(k => !fields.includes(k)) || fields.some(k => !(k in input))) throw new Error('plan requires only entity, capabilities and environment_verified')
  validateEntity(input.entity)
  if (typeof input.environment_verified !== 'boolean') throw new Error('environment_verified must be boolean; this is caller-reported')
  if (!Array.isArray(input.capabilities) || input.capabilities.length < 1 || input.capabilities.length > 16
      || input.capabilities.some(c => typeof c !== 'string' || !c.trim() || c.length > 128 || /[\x00-\x1f]/.test(c))
      || new Set(input.capabilities).size !== input.capabilities.length) throw new Error('plan requires 1–16 distinct capability names')
  return input
}

export function planCapabilities(store, input, { now = Date.now() } = {}) {
  validatePlan(input)
  const unknownDimensions = ENTITY_FIELDS.filter(key => UNKNOWN_DIMENSIONS.has(input.entity[key].trim().toLowerCase()))
  const environmentVerified = input.environment_verified && unknownDimensions.length === 0
  const snapshot = store.factSnapshot(input.entity, { now })
  const checks = input.capabilities.map(capability => {
    const observations = snapshot.entries.filter(e => e.value.capability === capability)
    const fresh = observations.filter(e => !e.expired)
    const results = new Set(fresh.map(e => e.value.result))
    let state, next
    if (!observations.length) { state = 'missing'; next = 'baseline_canary' }
    else if (!fresh.length) { state = 'expired'; next = 'refresh_canary' }
    else if (results.size > 1) { state = 'conflicting'; next = 'resolve_conflict_with_targeted_canary' }
    else if (results.has('pass')) { state = 'reported_pass'; next = 'honor_scope_and_monitor_environment_changes' }
    else if (results.has('fail')) { state = 'reported_failure'; next = 'inspect_evidence_and_choose_recovery_or_targeted_retest' }
    else if (results.has('mixed')) { state = 'mixed'; next = 'qualify_the_unresolved_boundary' }
    else { state = 'unknown'; next = 'observe_delivery_and_outcome' }
    const reasons = []
    if (!environmentVerified) { reasons.push('environment_unconfirmed'); next = 'verify_exact_environment_before_using_observations' }
    if (unknownDimensions.length) reasons.push('unknown_entity_dimensions')
    if (snapshot.truncated) { reasons.push('observation_window_truncated'); next = 'inspect_older_observations_before_reuse' }
    const reusable = environmentVerified && !snapshot.truncated && state === 'reported_pass'
    const summaries = (fresh.length ? fresh : observations).slice(0, 5)
    return { capability, evidence_state: state, next_check: next, reuse_candidate: reusable,
      reasons, fresh_observations: fresh.length, expired_observations: observations.length - fresh.length,
      observation_ids: observations.map(e => e.id), details_omitted: Math.max(0, (fresh.length || observations.length) - summaries.length),
      not_after: reusable ? new Date(Math.min(...fresh.map(e => Date.parse(e.value.expires_at)))).toISOString() : null,
      evidence: summaries.map(e => ({ id: e.id, result: e.value.result, observed_at: e.value.observed_at,
        expires_at: e.value.expires_at, sample_count: e.value.sample_count,
        evidence_refs: e.value.evidence_refs, limits: e.value.limits, provenance: e.value.provenance })) }
  })
  return { schema: 'computer-use-capability-plan/v1', entity: input.entity,
    planned_at: new Date(now).toISOString(), environment_verified: environmentVerified,
    environment_policy_version: 1,
    environment_claimed_verified: input.environment_verified, unknown_dimensions: unknownDimensions,
    environment_provenance: 'caller_reported; explicit unknown dimension sentinels override confirmation; other values not independently inspected',
    observation_coverage: { stored: snapshot.total, evaluated: snapshot.entries.length,
      future_withheld: snapshot.future_withheld, truncated: snapshot.truncated,
      max_scanned_files: 1000, max_file_bytes: 65536, max_evaluated_observations: 100 },
    checks, limits: ['Exact entity scope only; changed app/OS/provider/display/capture keys do not inherit results',
      'Reported pass is a scoped reuse candidate, not a guarantee of current readiness or a verified actor',
      'Caller must confirm every environment dimension; unknown versions must use environment_verified=false',
      'Reserved unknown/unavailable/unspecified/unverified/not_available dimensions block reuse even if caller claims verified; case and surrounding whitespace ignored',
      'No automatic UI canary, evidence-content validation, text classification, app mutation or model training'] }
}
