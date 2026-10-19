// A call's `sandbox` can never lift itself past the policy ceiling. No
// app-server, model or Computer Use runtime is started.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.CODEX_BRIDGE_STATE_DIR = mkdtempSync(join(tmpdir(), 'bridge-sandbox-cap-'))
const { DEFAULT_POLICY, SandboxPolicyError, capSandbox, loadPolicy } = await import('../src/lib/policy.mjs')
const { Bridge, BridgeError } = await import('../src/lib/bridge.mjs')
const { runTurn } = await import('../src/lib/turn-runner.mjs')

const policy = (extra = {}) => ({ ...DEFAULT_POLICY, ...extra })

test('the default ceiling is workspace-write', () => {
  assert.equal(DEFAULT_POLICY.sandbox, 'read-only')
  assert.equal(DEFAULT_POLICY.maxSandbox, 'workspace-write')
  assert.equal(loadPolicy().maxSandbox, 'workspace-write')
})

test('no sandbox argument keeps the thread default', () => {
  assert.equal(capSandbox(policy(), undefined), undefined)
  assert.equal(capSandbox(policy(), null), undefined)
})

test('modes at or below the ceiling pass through', () => {
  assert.equal(capSandbox(policy(), 'read-only'), 'read-only')
  assert.equal(capSandbox(policy(), 'workspace-write'), 'workspace-write')
  assert.equal(capSandbox(policy({ maxSandbox: 'danger-full-access' }), 'danger-full-access'), 'danger-full-access')
})

test('modes above the ceiling are rejected', () => {
  assert.throws(() => capSandbox(policy(), 'danger-full-access'), SandboxPolicyError)
  assert.throws(() => capSandbox(policy({ maxSandbox: 'read-only' }), 'workspace-write'), /exceeds the policy ceiling "read-only"/)
})

test('the ceiling is never below the policy default', () => {
  assert.equal(capSandbox(policy({ sandbox: 'workspace-write', maxSandbox: 'read-only' }), 'workspace-write'), 'workspace-write')
})

test('unknown modes are rejected and an unknown ceiling fails closed', () => {
  assert.throws(() => capSandbox(policy(), 'everything'), /unknown sandbox "everything"/)
  assert.throws(() => capSandbox(policy({ maxSandbox: 'bogus' }), 'workspace-write'), SandboxPolicyError)
  assert.equal(capSandbox(policy({ maxSandbox: 'bogus' }), 'read-only'), 'read-only')
})

test('Bridge.run and startAsync reject before any thread starts', async () => {
  const bridge = new Bridge()
  bridge.policy = policy()
  let touched = false
  bridge.ensureThread = async () => { touched = true; throw new Error('thread must not start') }
  await assert.rejects(bridge.run({ task: 't', sandbox: 'danger-full-access' }), (err) => err instanceof BridgeError && /exceeds the policy ceiling/.test(err.message))
  assert.throws(() => bridge.startAsync({ task: 't', sandbox: 'danger-full-access' }), BridgeError)
  assert.equal(touched, false)
  assert.equal(bridge.jobs.size, 0)
})

test('runTurn never sends a sandbox above the ceiling', async () => {
  const sent = []
  const app = { attachThread: () => () => {}, turnStart: async (p) => { sent.push(p); throw new Error('stop after turn/start') } }
  await assert.rejects(runTurn(app, { threadId: 'th', input: [], policy: policy(), overrides: { sandbox: 'danger-full-access' } }), SandboxPolicyError)
  assert.equal(sent.length, 0)
  await assert.rejects(runTurn(app, { threadId: 'th', input: [], policy: policy(), overrides: { sandbox: 'workspace-write' } }), /stop after turn\/start/)
  assert.equal(sent[0].sandboxPolicy.type, 'workspaceWrite')
})
