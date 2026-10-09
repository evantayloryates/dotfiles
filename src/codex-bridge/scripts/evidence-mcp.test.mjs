// Protocol smoke with all child spawning and network connections forbidden in
// each server process. This cannot start an app-server or delegated model turn.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const entity = { bundle_id: 'test.fixture', app_version: '1', app_build: '1', os_build: 'test', provider: 'fixture', provider_version: '1', surface: 'menu', capture_mode: 'isolated', display_profile: 'test' }
async function server(relative, run) {
  const root = mkdtempSync(join(tmpdir(), 'offline-evidence-mcp-'))
  const guard = join(root, 'guard.mjs')
  writeFileSync(guard, `import cp from 'node:child_process'; import net from 'node:net'; import {syncBuiltinESMExports} from 'node:module'; const deny=()=>{throw new Error('TRANSPORT_FORBIDDEN_IN_QUALIFICATION')}; for(const k of ['spawn','spawnSync','fork','exec','execSync','execFile','execFileSync']) cp[k]=deny; net.Socket.prototype.connect=deny; syncBuiltinESMExports();`)
  const state = join(root, 'state')
  const child = spawn(process.execPath, ['--import', guard, fileURLToPath(new URL(relative, import.meta.url))], { env: { ...process.env, CODEX_BRIDGE_STATE_DIR: state, RECORD_SCREEN_HOME: join(root, 'recorder'), CODEX_BRIDGE_TRANSPORT: 'stdio' }, stdio: ['pipe', 'pipe', 'pipe'] })
  let serial = 0, stderr = ''; const pending = new Map()
  const lines = createInterface({ input: child.stdout })
  child.stderr.on('data', bytes => { stderr += bytes })
  lines.on('line', line => {
    try {
      const message = JSON.parse(line), p = pending.get(message.id)
      if (p) { pending.delete(message.id); clearTimeout(p.timer); message.error ? p.reject(new Error(JSON.stringify(message.error))) : p.resolve(message.result) }
    } catch (error) { for (const p of pending.values()) p.reject(error) }
  })
  const rejectAll = error => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error) }; pending.clear() }
  child.on('error', rejectAll)
  child.on('exit', () => rejectAll(new Error('server exited')))
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('request deadline')) }, 4000)
    pending.set(id, { resolve, reject, timer })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
  try {
    const hello = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'offline-evidence-test', version: '1' } })
    assert.equal(hello.protocolVersion, '2025-06-18')
    await run(request, state)
    assert.equal(stderr.includes('TRANSPORT_FORBIDDEN_IN_QUALIFICATION'), false)
  } finally {
    rejectAll(new Error('cleanup')); child.stdin.end(); child.kill('SIGTERM'); lines.close()
    await new Promise(resolve => { if (child.exitCode !== null || child.signalCode) resolve(); else { child.once('exit', resolve); setTimeout(() => { child.kill('SIGKILL'); resolve() }, 1000).unref() } })
    rmSync(root, { recursive: true, force: true })
  }
}
function output(result, key) {
  assert.equal(result.isError, false)
  assert.equal(result.content[0].type, 'text')
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent)
  return result.structuredContent[key]
}

test('evidence MCP mutation and readback work with transport/model paths forbidden', () => server('../server.mjs', async (request, state) => {
  const roster = await request('tools/list')
  assert.equal(roster.tools.filter(t => t.name.startsWith('computer_use_')).length, 7)
  const call = (name, args) => request('tools/call', { name, arguments: args })
  const fact = { entity, capability: 'menu', result: 'pass', sample_count: 1, observed_at: '2026-01-01T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', evidence_refs: ['/tmp/synthetic.json'], limits: 'Synthetic only.' }
  const saved = output(await call('computer_use_observe', fact), 'entry')
  const read = output(await call('computer_use_facts', { entity }), 'entries')
  assert.equal(read.length, 1); assert.equal(read[0].id, saved.id)
  const planned = output(await call('computer_use_plan', { entity, capabilities: ['menu', 'missing'], environment_verified: true }), 'entry')
  assert.equal(planned.schema, 'computer-use-capability-plan/v1')
  assert.equal(planned.checks[0].reuse_candidate, true)
  assert.equal(planned.checks[1].next_check, 'baseline_canary')
  const unknownEntity = { ...entity, provider_version: 'unknown' }
  const unknownFact = output(await call('computer_use_observe', { ...fact, entity: unknownEntity }), 'entry')
  const unknownPlan = output(await call('computer_use_plan', { entity: unknownEntity, capabilities: ['menu'], environment_verified: true }), 'entry')
  assert.equal(unknownPlan.environment_policy_version, 1)
  assert.equal(unknownPlan.environment_claimed_verified, true)
  assert.equal(unknownPlan.environment_verified, false)
  assert.deepEqual(unknownPlan.unknown_dimensions, ['provider_version'])
  assert.equal(unknownPlan.checks[0].reuse_candidate, false)
  assert.equal(unknownPlan.checks[0].not_after, null)
  assert.deepEqual(unknownPlan.checks[0].observation_ids, [unknownFact.id])
  assert.deepEqual(output(await call('computer_use_facts', { entity: { ...entity, app_version: '2' } }), 'entries'), [])
  const receipt = { session_id: 'synthetic-session', caller: 'test', action_id: '1', provider: 'fixture', target: { bundle_id: 'test.fixture' }, clock_domain: 'CLOCK_UPTIME_RAW', start_ns: '9007199254740993', end_ns: '9007199254740995', intent: 'Synthetic', result: 'unknown', evidence_refs: [] }
  const receiptSaved = output(await call('computer_use_receipt', receipt), 'entry')
  const receipts = output(await call('computer_use_receipts', { session_id: receipt.session_id }), 'entries')
  assert.equal(receipts[0].id, receiptSaved.id)
  assert.equal(receipts[0].value.start_ns, receipt.start_ns)
  const uncovered = output(await call('computer_use_audit', { session_id: receipt.session_id }), 'entry')
  assert.equal(uncovered.counts.verification.unknown, 1)
  const outcome = { session_id: receipt.session_id, receipt_id: receiptSaved.id, observed_at: '2026-01-01T00:00:00Z',
    verification: { state: 'unknown', method: 'none', summary: 'Synthetic delivery unqualified.', evidence_refs: [] },
    cleanup: { state: 'not_required', summary: 'No native operation started.', evidence_refs: [] } }
  const recorded = output(await call('computer_use_outcome', outcome), 'entry')
  const audit = output(await call('computer_use_audit', { session_id: receipt.session_id }), 'entry')
  assert.equal(audit.details[0].latest_outcome_id, recorded.id)
  assert.equal(audit.counts.cleanup.not_required, 1)
  for (const [name, args] of [['computer_use_outcome', { ...outcome, receipt_id: '0'.repeat(64) }], ['computer_use_audit', { session_id: receipt.session_id, extra: true }], ['computer_use_plan', { entity, capabilities: [], environment_verified: true }], ['computer_use_facts', { entity, include_expired: 'false' }], ['computer_use_facts', { entity, limit: 1000 }], ['computer_use_receipts', { session_id: 'synthetic-session', keys: 'accidental' }], ['computer_use_receipt', { ...receipt, clock_domain: 'wall' }]]) {
    const result = await call(name, args); assert.equal(result.isError, true); assert.equal(result.content[0].type, 'text')
  }
  assert.deepEqual(readdirSync(state), ['capability-evidence'])
}))

test('recorder target options are discoverable without engine capture or transport', () => server('../../record-screen/server.mjs', async request => {
  const roster = await request('tools/list')
  const aimed = roster.tools.filter(t => ['frame_check', 'frame_outline', 'record_schedule'].includes(t.name))
  assert.equal(aimed.length, 3)
  for (const tool of aimed) {
    assert.equal(tool.inputSchema.properties.target.properties.include_child_windows.type, 'boolean')
    assert.equal(tool.inputSchema.properties.target.properties.exclude_apps.maxItems, 8)
  }
}))
