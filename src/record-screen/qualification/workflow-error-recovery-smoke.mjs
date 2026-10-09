#!/usr/bin/env node
// Installed recorder, controlled local callback failures and one withheld end
// reply. No UI/input/capture, native fault/restart, grant or automatic replay.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { EngineClient } from '../lib/client.mjs'
import { withRecordedWorkflow, RecordedWorkflowError } from '../lib/recorded-workflow.mjs'
import { EvidenceStore } from '../../codex-bridge/lib/capability-evidence.mjs'

if (process.argv.length !== 3) throw new Error('Usage: workflow-error-recovery-smoke.mjs ABSOLUTE_FRESH_OUTPUT_DIRECTORY')
const output = resolve(process.argv[2]); assert.equal(output, process.argv[2])
mkdirSync(output, { mode: 0o700 })
const save = (name, data) => {
  const path = join(output, name)
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  return path
}
const native = new EngineClient(), store = new EvidenceStore()
let session
try {
  const before = await native.call('status'); save('status-before.json', before)
  session = await native.call('session.create', { title: 'Workflow failure-report preservation', purpose: 'Controlled callback error shapes and local withheld reply recovery; no app input or capture' })
  save('session.json', session)
  const cases = [
    ['frozen', Object.freeze(new Error('controlled provider failure'))],
    ['primitive', 'controlled provider failure'],
    ['readonly', Object.defineProperty(new Error('controlled provider failure'), 'workflowReport', { value: 'provider-owned', writable: false })],
    ['withheld-end', Object.freeze(new Error('controlled provider failure'))],
  ]
  const episodes = []
  for (const [kind, original] of cases) {
    const calls = [], replies = [], proofRefs = []; let operations = 0, verifications = 0, cleanups = 0
    const client = { async call(method, args) {
      calls.push(method)
      const value = await native.call(method, args)
      if (method === 'action.end' && kind === 'withheld-end') {
        replies.push(value) // Private diagnostic only; later action.list independently recovers.
        throw new Error('Controlled local adapter withheld successful end reply')
      }
      return value
    } }
    const declaration = { session_id: session.session_id, caller: 'workflow-error-recovery-smoke', provider: 'qualification-callback',
      action_id: 'failure-report-' + kind, intent: 'Read current native status once, then throw a controlled ' + kind + ' failure; observe scope/cleanup without replay',
      target: { bundle_id: before.engine.bundle_id, pid: before.engine.pid }, timeout_s: 120 }
    let caught
    try {
      await withRecordedWorkflow(client, declaration, async () => {
        operations++
        const live = await native.call('status')
        assert.equal(live.engine.pid, before.engine.pid)
        proofRefs.push(save(kind + '-operation.json', { status_read: true, engine_pid: live.engine.pid, controlled_failure_after_read: true }))
        throw original
      }, { evidenceStore: store,
        verify: async ({ operationError, receipt, receiptError, actionToken }) => {
          verifications++
          assert.equal(operationError, original)
          const list = await native.call('action.list', { session_id: session.session_id, caller: declaration.caller })
          const own = list.actions.find(a => a.action_token === actionToken)
          assert.equal(own.state, 'closed'); assert.equal(own.result, 'failed')
          if (kind === 'withheld-end') { assert.equal(receipt, undefined); assert.ok(receiptError) }
          else { assert.equal(receipt.action_token, own.action_token); assert.equal(receiptError, undefined) }
          proofRefs.push(save(kind + '-verification.json', { operation_failed: true, controlled: true, own_terminal: own, receipt_available_to_wrapper: Boolean(receipt) }))
          return { state: 'failed', method: 'actual-scope-readback-after-controlled-failure', summary: 'Read-only callback deliberately failed after native status observation; actual own scope is closed/failed. No real UI/provider outage inferred.', evidence_refs: proofRefs }
        },
        cleanup: async ({ actionToken }) => {
          cleanups++
          const list = await native.call('action.list', { session_id: session.session_id, caller: declaration.caller })
          assert.equal(list.actions.find(a => a.action_token === actionToken).state, 'closed')
          assert.equal(list.actions.some(a => a.state === 'active'), false)
          const proof = save(kind + '-cleanup.json', { own_token: actionToken, active_owned_scopes: 0, created_ui_capture_or_child_resources: false })
          return { state: 'completed', summary: 'Own failed scope closed; this callback created no UI, capture or child resources. Parent session settles separately.', evidence_refs: [proof] }
        },
      })
    } catch (error) { caught = error }
    assert.ok(caught instanceof RecordedWorkflowError); assert.equal(caught.cause, original)
    const report = caught.workflowReport
    assert.equal(operations, 1); assert.equal(verifications, 1); assert.equal(cleanups, 1)
    assert.equal(calls.filter(m => m === 'action.begin').length, 1)
    assert.equal(calls.filter(m => m === 'action.end').length, 1)
    assert.equal(report.verification.state, 'failed'); assert.equal(report.cleanup.state, 'completed')
    assert.equal(report.verificationError, undefined); assert.equal(report.cleanupError, undefined)
    let receiptId, outcomeId
    if (kind === 'withheld-end') {
      assert.equal(report.receipt, undefined); assert.equal(report.workflowOutcome, undefined)
      assert.match(report.outcomeError.message, /No terminal recorder reply/)
      save('withheld-private-reply.json', replies[0])
      const observed = await native.call('action.list', { session_id: session.session_id, caller: declaration.caller })
      const recovered = observed.actions.find(a => a.action_token === report.actionToken)
      save('independent-terminal-recovery.json', recovered)
      const shared = store.putRecordedAction(recovered)
      const outcome = store.putOutcome({ session_id: session.session_id, receipt_id: shared.id, observed_at: new Date().toISOString(), verification: report.verification, cleanup: report.cleanup })
      receiptId = shared.id; outcomeId = outcome.id
      assert.equal(report.workflowOutcome, undefined) // Earlier report is never backfilled.
    } else {
      assert.equal(report.receiptError, undefined); assert.equal(report.outcomeError, undefined)
      save(kind + '-receipt.json', report.receipt)
      receiptId = report.sharedReceipt.id; outcomeId = report.workflowOutcome.id
    }
    if (kind === 'readonly') assert.equal(original.workflowReport, 'provider-owned')
    episodes.push({ kind, wrapper: caught.name, cause_identity_preserved: true, report_available: true, operations, verifications, cleanups,
      begin_requests: 1, end_requests: 1, action_token: report.actionToken, receipt_id: receiptId, outcome_id: outcomeId,
      original_report_backfilled: false, terminal_recovery: kind === 'withheld-end' ? 'one independent action.list; no action.end/provider replay' : 'wrapper received original terminal reply' })
  }
  const audit = new EvidenceStore().workflowAudit(session.session_id, { limit: 100 }); save('audit.json', audit)
  assert.equal(audit.counts.uncovered_receipts, 0)
  assert.deepEqual(audit.counts.verification, { failed: 4 }); assert.deepEqual(audit.counts.cleanup, { completed: 4 })
  const closed = await native.call('session.close', { session_id: session.session_id }); save('session-closed.json', closed)
  assert.equal(closed.state, 'closed')
  const after = await native.call('status'); save('status-after.json', after)
  assert.equal(after.engine.pid, before.engine.pid); assert.equal(after.engine.build, before.engine.build)
  assert.equal(after.action_timeline.active, before.action_timeline.active)
  assert.equal(after.capture_health.recordings.unfinished, before.capture_health.recordings.unfinished)
  assert.equal(after.input_timeline.subscribers, before.input_timeline.subscribers)
  const proof = { schema: 'installed-workflow-error-recovery/v1', passed: true, session_id: session.session_id, episodes,
    wrapper_source_sha256: createHash('sha256').update(readFileSync(new URL('../lib/recorded-workflow.mjs', import.meta.url))).digest('hex'),
    engine: { pid: after.engine.pid, build: after.engine.build }, audit_counts: audit.counts, session_closed: true,
    limits: ['Controlled read-only callback failures, not real native UI/provider outages or natural transport loss', 'Local adapter deliberately withheld one successful end reply; no native failure/restart or replay', 'No current or historical automatic native interception, physical-event or loaded MCP adoption claim'] }
  save('proof.json', proof); console.log(JSON.stringify(proof))
} catch (error) {
  save('failure.json', { name: error?.name ?? 'unknown', message: String(error?.message ?? 'failure') })
  process.exitCode = 1
  console.error('Workflow error recovery qualification failed; private proof retained, no replay.')
} finally { native.close() }
