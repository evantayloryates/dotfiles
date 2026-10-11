#!/usr/bin/env node
// Real installed readback through the supported workflow wrapper. No new take,
// export, model, UI action, grant, installing builder or mutation replay.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { EngineClient } from '../lib/client.mjs'
import { withRecordedWorkflow } from '../lib/recorded-workflow.mjs'
import { EvidenceStore } from '../../codex-bridge/lib/capability-evidence.mjs'

const args = Object.fromEntries(Array.from({ length: (process.argv.length - 2) / 2 }, (_, i) => [process.argv[2 + i * 2], process.argv[3 + i * 2]]))
for (const key of ['--output', '--session', '--recording', '--retained', '--proof']) if (!args[key]) throw new Error('Required: --output --session --recording --retained --proof')
const output = resolve(args['--output']); mkdirSync(output, { recursive: false, mode: 0o700 })
const save = (name, data) => { const p = join(output, name); writeFileSync(p, JSON.stringify(data, null, 2)); return p }
const read = p => JSON.parse(readFileSync(p, 'utf8'))
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex')
const client = new EngineClient(), store = new EvidenceStore()
try {
  const before = await client.call('status'); save('status-before.json', before)
  const record = await client.call('record.get', { recording_id: args['--recording'] })
  assert.equal(record.session_id, args['--session']); assert.equal(record.state, 'done')
  const proof = read(resolve(args['--proof'])); assert.equal(proof.passed, true)
  const declaration = { session_id: args['--session'], caller: 'recorded-workflow-smoke', provider: 'qualification-readback',
    action_id: 'persisted-source-readback', intent: 'Read retained source/media and verify the exact existing decoded proof; no app input',
    target: { bundle_id: before.engine.bundle_id, pid: before.engine.pid }, timeout_s: 120,
    context: { before_state: 'Explicit owned completed recording', expected_change: 'No source/media mutation; retained proof readback', verification_plan: 'Compare live source/video bytes with retained proven copies, then observe own action closure' } }
  let verificationPath, cleanupPath
  const out = await withRecordedWorkflow(client, declaration,
    () => client.call('record.source', { recording_id: args['--recording'] }), {
      evidenceStore: store,
      context: { expected_outcome: 'Existing source/media readback matches retained independent mux proof; input remains separately incomplete',
        observed_state: 'No new capture or native input was requested', cleanup_plan: 'Confirm own action closed; do not stop production or pre-existing fixtures' },
      verify: async ({ value, receipt }) => {
        assert.equal(receipt.state, 'closed'); assert.equal(receipt.result, 'dispatched')
        assert.equal(value.state, 'done'); assert.equal(value.frames.written, proof.actual_muxed_packets)
        assert.equal(value.source_packet.complete, true); assert.equal(value.source_packet.rows_lost, 0)
        const bytes = ['source.jsonl', 'video.mp4'].map(name => {
          const current = name === 'source.jsonl' ? value.source_packet.path : value.video.path
          const retained = join(resolve(args['--retained']), name)
          assert.equal(hash(current), hash(retained))
          return { name, sha256: hash(current), byte_identical_to_retained: true }
        })
        verificationPath = save('verification.json', { passed: true, decoded_proof: resolve(args['--proof']),
          packets: proof.actual_muxed_packets, retained_media: bytes, input_coverage: 'No completeness promotion from video or journal closure' })
        return { state: 'verified', method: 'independent-proof-plus-byte-identical-readback',
          summary: 'Existing retained decoded source/media proof matched live byte-identical readback; input coverage remains separate.',
          evidence_refs: [verificationPath, resolve(args['--proof'])] }
      },
      cleanup: async ({ actionToken }) => {
        const actions = await client.call('action.list', { session_id: args['--session'], caller: declaration.caller })
        const own = actions.actions.find(r => r.action_token === actionToken)
        assert.equal(own.state, 'closed'); assert.equal(own.result, 'dispatched')
        cleanupPath = save('cleanup.json', { scope: 'This readback action only; pre-existing fixture/session retained',
          own_token: actionToken, own_state: own.state, active_own_actions: actions.actions.filter(a => a.state === 'active').length,
          created_capture_or_ui_resources: false })
        assert.equal(actions.actions.some(a => a.state === 'active'), false)
        return { state: 'completed', summary: 'Own recorder readback action is closed; this operation created no capture or UI resources.', evidence_refs: [cleanupPath] }
      },
    })
  assert.equal(out.receiptError, undefined); assert.equal(out.outcomeError, undefined)
  assert.equal(out.verificationError, undefined); assert.equal(out.cleanupError, undefined)
  save('recorded-reply.json', out.receipt); save('outcome-entry.json', out.workflowOutcome)
  const audit = store.workflowAudit(args['--session']); save('audit.json', audit)
  assert.equal(audit.details.find(d => d.receipt_id === out.sharedReceipt.id).verification, 'verified')
  const after = await client.call('status'); save('status-after.json', after)
  assert.equal(after.engine.pid, before.engine.pid); assert.equal(after.engine.build, before.engine.build)
  const summary = { schema: 'installed-recorded-workflow-smoke/v1', passed: true, recording_id: args['--recording'],
    actual_packets_reused: proof.actual_muxed_packets, receipt_result: out.receipt.result,
    verification: out.verification.state, cleanup: out.cleanup.state, pid: after.engine.pid, build: after.engine.build,
    receipt_id: out.sharedReceipt.id, outcome_id: out.workflowOutcome.id,
    limits: ['Read-only persisted source consumer, not an additional native UI/input qualification',
      'Reported typed outcomes reference independently checked files; no authenticated actor identity',
      'Only this readback action cleanup; previous fixtures/permission handoff remain pending'] }
  save('workflow-proof.json', summary); console.log(JSON.stringify(summary))
} catch (error) {
  save('failure.json', { type: error?.constructor?.name, message: String(error?.message ?? error) })
  process.exitCode = 1
  console.error('Recorded workflow qualification failed; preserved private failure artifact. No replay.')
} finally { client.close() }
