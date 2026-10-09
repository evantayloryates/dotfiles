import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import { EvidenceStore } from '../lib/capability-evidence.mjs'

const receipt = { session_id: 'owned', caller: 'test', action_id: 'one', provider: 'fixture', target: { bundle_id: 'test.fixture' },
  clock_domain: 'CLOCK_UPTIME_RAW', start_ns: '9007199254740993', end_ns: '9007199254740995',
  intent: 'Authored workflow', result: 'verified', evidence_refs: ['/tmp/authored.json'] }
const verification = { state: 'verified', method: 'authored-readback', summary: 'Reference checked.', evidence_refs: ['/tmp/authored.json'] }
const cleanup = { state: 'partial', summary: 'Owned fixture kept for next approved check.', evidence_refs: ['/tmp/owned-status.json'] }
const now = Date.parse('2026-10-09T06:00:00Z')
function isolated(run) { const root = mkdtempSync(join(tmpdir(), 'workflow-outcome-')); try { return run(new EvidenceStore(root), root) } finally { rmSync(root, { recursive: true, force: true }) } }
function input(id, changes = {}) { return { session_id: receipt.session_id, receipt_id: id,
  observed_at: '2026-10-09T05:00:00Z', verification, cleanup, ...changes } }

test('receipt claims do not establish verification or cleanup; joined outcomes retain exact identity and stamps', () => isolated(store => {
  const r = store.put('receipts', receipt)
  const before = readFileSync(r.path)
  const uncovered = store.workflowAudit(receipt.session_id, { now })
  assert.equal(uncovered.counts.receipt_result.verified, 1)
  assert.equal(uncovered.counts.verification.unknown, 1)
  assert.equal(uncovered.counts.cleanup.unknown, 1)
  const saved = store.putOutcome(input(r.id))
  assert.equal(saved.value.start_ns, receipt.start_ns)
  assert.equal(saved.value.provider, receipt.provider)
  assert.equal(saved.value.receipt_provenance, 'caller_claimed')
  assert.equal(store.putOutcome(Object.fromEntries(Object.entries(input(r.id)).reverse())).id, saved.id)
  const covered = store.workflowAudit(receipt.session_id, { now })
  assert.equal(covered.counts.verification.verified, 1)
  assert.equal(covered.counts.cleanup.partial, 1)
  assert.equal(covered.counts.uncovered_receipts, 0)
  assert.deepEqual(readFileSync(r.path), before)
  const interrupted = store.putRecordedAction({ ...receipt, schema: 'record-screen-action/v1',
    action_token: 'act_12345678-1234-1234-1234-123456789abc', context: {},
    deadline_ns: '9007199255740993', end_ns: null, state: 'interrupted', result: 'interrupted',
    engine_instance: 'fixture', engine_build: 'fixture', engine_pid: 100,
    clock_provenance: 'recorder_service_stamped', end_kind: 'unknown_after_engine_restart' })
  const unknown = store.putOutcome(input(interrupted.id, {
    verification: { ...verification, state: 'unknown', evidence_refs: [] },
    cleanup: { ...cleanup, state: 'unknown', evidence_refs: [] },
  }))
  assert.equal(unknown.value.end_ns, null)
  assert.equal(unknown.value.receipt_state, 'interrupted')
  assert.equal(store.workflowAudit(receipt.session_id, { now }).counts.verification.unknown, 1)
}))

test('future claims are withheld and later passed checks cannot erase prior failed verification', () => isolated(store => {
  const r = store.put('receipts', receipt)
  store.putOutcome(input(r.id, { observed_at: '2026-10-09T04:00:00Z', verification: { ...verification, state: 'failed' } }))
  store.putOutcome(input(r.id))
  store.putOutcome(input(r.id, { observed_at: '2026-10-09T07:00:00Z', cleanup: { ...cleanup, state: 'completed' } }))
  const audit = store.workflowAudit(receipt.session_id, { now })
  assert.equal(audit.coverage.future_outcomes_withheld, 1)
  assert.equal(audit.counts.verification.verified, 1)
  assert.equal(audit.counts.conflicting_verification_receipts, 1)
  assert.equal(audit.details[0].outcome_ids.length, 2)
  assert.deepEqual(new Set(audit.details[0].verification_states_seen), new Set(['verified', 'failed']))
  assert.equal(audit.counts.cleanup.partial, 1)
}))

test('wrong sessions, missing receipts, no-proof passes and oversized payloads cannot publish outcomes', () => isolated((store, root) => {
  const r = store.put('receipts', receipt)
  const huge = Array.from({ length: 16 }, () => '/' + 'x'.repeat(2047))
  for (const bad of [input('0'.repeat(64)), input(r.id, { session_id: 'someone-else' }),
    input(r.id, { verification: { ...verification, evidence_refs: [] } }),
    input(r.id, { cleanup: { ...cleanup, state: 'completed', evidence_refs: [] } }),
    input(r.id, { extra: true }), input(r.id, { observed_at: 'yesterday' }),
    input(r.id, { verification: { ...verification, evidence_refs: huge }, cleanup: { ...cleanup, evidence_refs: huge } })]) assert.throws(() => store.putOutcome(bad))
  assert.equal(existsSync(join(root, 'outcomes')), false)
  assert.equal(store.workflowAudit('someone-else', { now }).coverage.stored_receipts, 0)
}))

test('truncated outcome history cannot masquerade as complete workflow coverage', () => isolated(store => {
  const r = store.put('receipts', receipt)
  store.putOutcome(input(r.id, { observed_at: '2026-10-08T05:00:00Z', verification: { ...verification, state: 'failed' } }))
  for (let i = 0; i < 100; i++) store.putOutcome(input(r.id, { context: { observed_state: 'Authored sample ' + i } }))
  const audit = store.workflowAudit(receipt.session_id, { now })
  assert.equal(audit.coverage.outcomes_truncated, true)
  assert.equal(audit.coverage.complete_observation_window, false)
  assert.equal(audit.coverage.evaluated_outcomes, 100)
  assert.equal(audit.details[0].outcome_ids.length, 100)
}))
