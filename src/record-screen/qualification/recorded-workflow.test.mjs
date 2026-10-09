import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { withRecordedWorkflow } from '../lib/recorded-workflow.mjs'
import { EvidenceStore } from '../../codex-bridge/lib/capability-evidence.mjs'

const declaration = { session_id: 'test', caller: 'agent', provider: 'fixture', action_id: 'one', intent: 'Owned fixture', target: { bundle_id: 'test.fixture' } }
const receipt = { ...declaration, schema: 'record-screen-action/v1', action_token: 'act_12345678-1234-1234-1234-123456789abc', context: {},
  clock_domain: 'CLOCK_UPTIME_RAW', start_ns: '9007199254740999', end_ns: '9007199254741010', deadline_ns: '9007200254740999',
  state: 'closed', result: 'dispatched', clock_provenance: 'recorder_service_stamped', engine_instance: 'fixture', engine_build: 'fixture', engine_pid: 100, end_kind: 'service_observed_end_request' }
const verified = { state: 'verified', method: 'authored', summary: 'Reference asserted.', evidence_refs: ['/tmp/authored.json'] }
const cleaned = { state: 'completed', summary: 'Owned handle absent.', evidence_refs: ['/tmp/owned-cleanup.json'] }
function client({ capable = true, beginError, endError } = {}) {
  const calls = []
  return { calls, async call(method, args) {
    calls.push({ method, args })
    if (method === 'status') return { capabilities: capable ? { action_scopes: 1 } : {} }
    if (method === 'action.begin') { if (beginError) throw beginError; return receipt }
    if (endError) throw endError
    return { ...receipt, result: args.result }
  } }
}
async function isolated(run) { const root = mkdtempSync(join(tmpdir(), 'recorded-workflow-')); try { return await run(new EvidenceStore(root)) } finally { rmSync(root, { recursive: true, force: true }) } }

test('unsupported or uncertain begin starts no operation, verifier or cleanup', () => isolated(async store => {
  let operations = 0, hooks = 0
  for (const c of [client({ capable: false }), client({ beginError: new Error('lost begin') })]) {
    await assert.rejects(withRecordedWorkflow(c, declaration, async () => operations++, { evidenceStore: store, verify: async () => hooks++, cleanup: async () => hooks++ }))
    assert.equal(operations, 0); assert.equal(hooks, 0)
    assert.ok(c.calls.filter(x => x.method === 'action.begin').length <= 1)
  }
}))

test('service scope closes before verification; default dispatch alone leaves verification and cleanup unproved', () => isolated(async store => {
  const c = client(); let operations = 0
  const out = await withRecordedWorkflow(c, declaration, async () => ++operations, { evidenceStore: store })
  assert.equal(operations, 1); assert.equal(c.calls.at(-1).args.result, 'dispatched')
  assert.equal(out.verification.state, 'not_checked'); assert.equal(out.cleanup.state, 'unknown')
  const audit = store.workflowAudit('test')
  assert.equal(audit.counts.receipt_result.dispatched, 1)
  assert.equal(audit.counts.verification.not_checked, 1)
  assert.equal(audit.counts.cleanup.unknown, 1)
  const c2 = client()
  await withRecordedWorkflow(c2, declaration, async () => 42, { evidenceStore: store,
    verify: async () => { assert.equal(c2.calls.at(-1).method, 'action.end'); return verified }, cleanup: async () => cleaned })
}))

test('lost end reply does not replay the operation; supplied hooks still run once and no receipt is fabricated', () => isolated(async store => {
  const c = client({ endError: new Error('lost end') }); let operations = 0, verifications = 0, cleanups = 0
  const out = await withRecordedWorkflow(c, declaration, async () => ++operations, { evidenceStore: store,
    verify: async () => { verifications++; return verified }, cleanup: async () => { cleanups++; return cleaned } })
  assert.equal(operations, 1); assert.equal(verifications, 1); assert.equal(cleanups, 1)
  assert.equal(c.calls.filter(x => x.method === 'action.end').length, 1)
  assert.equal(out.workflowOutcome, undefined); assert.match(out.outcomeError.message, /No terminal recorder reply/)
  assert.equal(store.workflowAudit('test').coverage.stored_receipts, 0)
}))

test('failed operation retains original error and attempts supplied cleanup once', () => isolated(async store => {
  const original = new Error('fixture refused'); const c = client(); let operations = 0, cleanups = 0
  await assert.rejects(withRecordedWorkflow(c, declaration, async () => { operations++; throw original }, { evidenceStore: store,
    verify: async () => ({ ...verified, state: 'failed' }), cleanup: async () => { cleanups++; return cleaned } }), e => e === original && e.workflowReport.cleanup.state === 'completed')
  assert.equal(operations, 1); assert.equal(cleanups, 1)
  assert.equal(c.calls.at(-1).args.result, 'failed')
  assert.equal(store.workflowAudit('test').counts.verification.failed, 1)
}))

test('verification errors and proofless success cannot suppress cleanup or manufacture a passed check', () => isolated(async store => {
  for (const verify of [async () => { throw new Error('private details must not enter stored summary') }, async () => ({ ...verified, evidence_refs: [] })]) {
    let cleanups = 0
    const out = await withRecordedWorkflow(client(), declaration, async () => 1, { evidenceStore: store, verify,
      cleanup: async () => { cleanups++; return cleaned } })
    assert.equal(out.verification.state, 'unknown'); assert.equal(cleanups, 1)
    assert.ok(out.verificationError)
    assert.equal(out.workflowOutcome.value.verification.summary.includes('private details'), false)
  }
}))

test('cleanup and publication errors remain distinct from successful verification; none triggers replay', () => isolated(async store => {
  let operations = 0
  const out = await withRecordedWorkflow(client(), declaration, async () => ++operations, { evidenceStore: store,
    verify: async () => verified, cleanup: async () => { throw new Error('cleanup unobservable') } })
  assert.equal(out.verification.state, 'verified'); assert.equal(out.cleanup.state, 'unknown')
  assert.ok(out.cleanupError)
  const broken = Object.create(store); broken.putOutcome = () => { throw new Error('publication failed') }
  const failed = await withRecordedWorkflow(client(), declaration, async () => ++operations, { evidenceStore: broken,
    verify: async () => verified, cleanup: async () => cleaned })
  assert.equal(operations, 2); assert.equal(failed.workflowOutcome, undefined); assert.match(failed.outcomeError.message, /publication failed/)
}))
