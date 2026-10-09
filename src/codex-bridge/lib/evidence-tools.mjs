import { ENTITY_FIELDS, EvidenceStore, validateQuery } from './capability-evidence.mjs'
import { planCapabilities } from './capability-planner.mjs'

const entity = { type: 'object', additionalProperties: false,
  properties: Object.fromEntries(ENTITY_FIELDS.map(key => [key, { type: 'string', minLength: 1, maxLength: 256 }])), required: ENTITY_FIELDS }
const references = { type: 'array', maxItems: 16, items: { type: 'string', description: 'Absolute path to already verified local evidence; content is not fetched.' } }
const string = { type: 'string', minLength: 1, maxLength: 256 }
const integer = { type: 'integer', minimum: 1, maximum: 4294967295 }
const ns = { type: 'string', pattern: '^[0-9]{1,20}$', description: 'Decimal nanoseconds from the recorder CLOCK_UPTIME_RAW clock; do not substitute wall time or an unqualified clock.' }
const verification = { type: 'object', additionalProperties: false, properties: {
  state: { type: 'string', enum: ['verified', 'failed', 'not_checked', 'unknown'] },
  method: { type: 'string', minLength: 1, maxLength: 128 }, summary: { type: 'string', minLength: 1, maxLength: 1000 }, evidence_refs: references,
}, required: ['state', 'method', 'summary', 'evidence_refs'] }
const cleanup = { type: 'object', additionalProperties: false, properties: {
  state: { type: 'string', enum: ['completed', 'partial', 'not_required', 'unknown'] },
  summary: { type: 'string', minLength: 1, maxLength: 1000 }, evidence_refs: references,
}, required: ['state', 'summary', 'evidence_refs'] }

export const EVIDENCE_TOOLS = [
  { name: 'computer_use_outcome', description: 'Append typed reported verification and cleanup linked to a persisted receipt in the same explicit session. Verified/failed checks and completed/partial cleanup require local evidence references; contents and ownership are not authenticated. Does not run UI, model or cleanup.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      session_id: string, receipt_id: { type: 'string', pattern: '^[a-f0-9]{64}$' }, observed_at: string, verification, cleanup,
      context: { type: 'object', additionalProperties: false, properties: Object.fromEntries(['expected_outcome', 'observed_state', 'cleanup_plan'].map(k => [k, { type: 'string', minLength: 1, maxLength: 1500 }])) },
    }, required: ['session_id', 'receipt_id', 'observed_at', 'verification', 'cleanup'] }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } },
  { name: 'computer_use_audit', description: 'Audit bounded reported outcomes for one explicit session. Receipt result, verification and cleanup stay separate; uncovered receipts remain unknown and conflicting history is retained. Counts are not task success rates. No UI, text grading, evidence fetch or model.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { session_id: string, limit: { type: 'integer', minimum: 1, maximum: 100 } }, required: ['session_id'] }, annotations: { readOnlyHint: true, openWorldHint: false } },
  { name: 'computer_use_plan', description: 'Plan targeted baseline/requalification checks from exact local environment observations. Expiry, conflicts, missing evidence and unknown environment remain explicit. Read-only: no UI/model, evidence fetch, grant, automatic canary or actor inference.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { entity,
      capabilities: { type: 'array', minItems: 1, maxItems: 16, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 128 } },
      environment_verified: { type: 'boolean', description: 'Caller confirms all entity dimensions from current metadata. Explicit unknown/unavailable/unspecified/unverified/not_available dimensions override true and block reuse. Other values are not independently inspected; false for any unconfirmed dimension.' },
    }, required: ['entity', 'capabilities', 'environment_verified'] }, annotations: { readOnlyHint: true, openWorldHint: false } },
  { name: 'computer_use_observe', description: 'Append a reported app/provider capability observation with exact version/surface/display scope and local evidence. Preserves contradictory results. Does not run UI or a model, fetch evidence content, or grant access.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      entity, capability: string, result: { type: 'string', enum: ['pass', 'fail', 'mixed', 'unknown'] },
      sample_count: { type: 'integer', minimum: 1, maximum: 1000000 }, observed_at: string, expires_at: string,
      evidence_refs: references, limits: { type: 'string', minLength: 1, maxLength: 1000 },
    }, required: ['entity', 'capability', 'result', 'sample_count', 'observed_at', 'expires_at', 'evidence_refs', 'limits'] },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } },
  { name: 'computer_use_facts', description: 'Read at most 100 observations for an exact app/OS/provider/surface/capture/display version key. Expired or future observations are excluded by default. Results are evidence, not unconditional app guarantees. No UI/model/transport connection.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { entity, include_expired: { type: 'boolean' }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, required: ['entity'] },
    annotations: { readOnlyHint: true, openWorldHint: false } },
  { name: 'computer_use_receipt', description: 'Append an agent-declared action block around supported computer-use calls. Uses recorder host-clock bounds and intended target. Ownership remains caller-claimed and requires delivery/pixel corroboration. No UI action or automatic interception.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      session_id: string, caller: string, action_id: string, provider: string,
      target: { type: 'object', additionalProperties: false, properties: { bundle_id: string, pid: integer, window_id: integer }, required: ['bundle_id'] },
      clock_domain: { type: 'string', const: 'CLOCK_UPTIME_RAW' }, start_ns: ns, end_ns: ns,
      intent: { type: 'string', minLength: 1, maxLength: 1000 }, result: { type: 'string', enum: ['dispatched', 'delivered', 'verified', 'failed', 'interrupted', 'unknown'] }, evidence_refs: references,
    }, required: ['session_id', 'caller', 'action_id', 'provider', 'target', 'clock_domain', 'start_ns', 'end_ns', 'intent', 'result', 'evidence_refs'] },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } },
  { name: 'computer_use_receipts', description: 'Read declared action blocks for one explicit agent session. Target/delivery relevance and intent ownership remain separate. Never treats a source PID or temporal match as verified agent identity.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { session_id: string, limit: { type: 'integer', minimum: 1, maximum: 100 } }, required: ['session_id'] },
    annotations: { readOnlyHint: true, openWorldHint: false } },
]

export function evidenceHandler(name, store = new EvidenceStore()) {
  switch (name) {
    case 'computer_use_outcome': return input => store.putOutcome(input)
    case 'computer_use_audit': return input => { validateQuery(input, 'receipts'); return store.workflowAudit(input.session_id, { limit: input.limit ?? 20 }) }
    case 'computer_use_plan': return input => planCapabilities(store, input)
    case 'computer_use_observe': return input => store.put('facts', input)
    case 'computer_use_facts': return input => { validateQuery(input, 'facts'); return store.facts(input.entity, { includeExpired: input.include_expired ?? false, limit: input.limit ?? 20 }) }
    case 'computer_use_receipt': return input => store.put('receipts', input)
    case 'computer_use_receipts': return input => { validateQuery(input, 'receipts'); return store.receipts(input.session_id, { limit: input.limit ?? 20 }) }
    default: return null
  }
}
