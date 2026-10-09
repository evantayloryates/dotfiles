import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { EvidenceStore } from '../lib/capability-evidence.mjs'
import { planCapabilities, validatePlan } from '../lib/capability-planner.mjs'

const entity = { bundle_id: 'test.fixture', app_version: '1', app_build: '1', os_build: 'test', provider: 'fixture', provider_version: '1', surface: 'menu', capture_mode: 'isolated', display_profile: 'test' }
const now = Date.parse('2026-10-09T05:00:00Z')
const request = { entity, capabilities: ['menu'], environment_verified: true }
const fact = { entity, capability: 'menu', result: 'pass', sample_count: 1,
  observed_at: '2026-10-09T04:00:00Z', expires_at: '2026-10-10T04:00:00Z',
  evidence_refs: ['/tmp/authored-evidence.json'], limits: 'Authored observation only.' }
function isolated(run) {
  const root = mkdtempSync(join(tmpdir(), 'capability-plan-'))
  try { return run(new EvidenceStore(root), root) } finally { rmSync(root, { recursive: true, force: true }) }
}
const plan = (store, input = request) => planCapabilities(store, input, { now })

test('changed versions require a baseline; current reported pass keeps limits and bounded expiry', () => isolated(store => {
  assert.equal(plan(store).checks[0].next_check, 'baseline_canary')
  const saved = store.put('facts', fact)
  const before = readFileSync(saved.path)
  const check = plan(store).checks[0]
  assert.equal(check.reuse_candidate, true)
  assert.equal(Date.parse(check.not_after), Date.parse(fact.expires_at))
  assert.equal(check.evidence[0].limits, fact.limits)
  assert.deepEqual(check.observation_ids, [saved.id])
  for (const field of ['app_build', 'os_build', 'provider_version', 'capture_mode', 'display_profile']) {
    const changed = plan(store, { ...request, entity: { ...entity, [field]: 'changed' } })
    assert.equal(changed.checks[0].evidence_state, 'missing')
    assert.equal(changed.checks[0].reuse_candidate, false)
  }
  assert.deepEqual(readFileSync(saved.path), before, 'Planning must not rewrite evidence')
}))

test('expiry and future claims cannot silently reuse a prior pass', () => isolated(store => {
  store.put('facts', { ...fact, observed_at: '2026-10-08T01:00:00Z', expires_at: '2026-10-09T05:00:00Z' })
  store.put('facts', { ...fact, observed_at: '2026-10-09T06:00:00Z' })
  const result = plan(store)
  assert.equal(result.observation_coverage.future_withheld, 1)
  assert.equal(result.checks[0].evidence_state, 'expired')
  assert.equal(result.checks[0].next_check, 'refresh_canary')
  assert.equal(result.checks[0].reuse_candidate, false)
  assert.equal(result.checks[0].not_after, null)
}))

test('conflicting/mixed/unknown failures retain uncertainty; unconfirmed environment blocks reuse', () => isolated(store => {
  store.put('facts', fact)
  const unconfirmed = plan(store, { ...request, environment_verified: false }).checks[0]
  assert.equal(unconfirmed.evidence_state, 'reported_pass')
  assert.equal(unconfirmed.reuse_candidate, false)
  assert.deepEqual(unconfirmed.reasons, ['environment_unconfirmed'])
  store.put('facts', { ...fact, result: 'fail' })
  const conflict = plan(store).checks[0]
  assert.equal(conflict.evidence_state, 'conflicting')
  assert.equal(conflict.reuse_candidate, false)
  assert.equal(conflict.fresh_observations, 2)
  assert.equal(conflict.observation_ids.length, 2)
  for (const result of ['mixed', 'unknown', 'fail']) {
    const capability = 'boundary-' + result
    store.put('facts', { ...fact, capability, result })
    const check = plan(store, { ...request, capabilities: [capability] }).checks[0]
    assert.equal(check.reuse_candidate, false)
    assert.notEqual(check.next_check, 'honor_scope_and_monitor_environment_changes')
  }
}))

test('old failure hidden beyond response window forces review instead of promoting newest passes', () => isolated(store => {
  store.put('facts', { ...fact, result: 'fail', observed_at: '2026-10-08T04:00:00Z' })
  for (let i = 0; i < 100; i++) store.put('facts', { ...fact, sample_count: i + 1 })
  const result = plan(store)
  assert.equal(result.observation_coverage.stored, 101)
  assert.equal(result.observation_coverage.evaluated, 100)
  assert.equal(result.observation_coverage.truncated, true)
  const check = result.checks[0]
  assert.equal(check.reuse_candidate, false)
  assert.equal(check.next_check, 'inspect_older_observations_before_reuse')
  assert.equal(check.evidence.length, 5)
  assert.equal(check.details_omitted, 95)
}))

test('large buckets, oversized files and symlinks refuse planning rather than yielding partial certainty', () => isolated((store, root) => {
  const saved = store.put('facts', fact)
  const directory = saved.path.slice(0, saved.path.lastIndexOf('/'))
  const raw = readFileSync(saved.path)
  rmSync(saved.path)
  writeFileSync(saved.path, 'x'.repeat(65537))
  assert.throws(() => plan(store), /bounded regular evidence/)
  rmSync(saved.path)
  const target = join(root, 'outside.json'); writeFileSync(target, raw)
  symlinkSync(target, saved.path)
  assert.throws(() => plan(store), /bounded regular evidence/)
  rmSync(saved.path); writeFileSync(saved.path, raw)
  // File-count guard must fire before parsing deliberately invalid entries.
  for (let i = 1; i <= 1000; i++) writeFileSync(join(directory, i.toString(16).padStart(64, '0') + '.json'), '{}')
  assert.equal(readdirSync(directory).length, 1001)
  assert.throws(() => plan(store), /exceeds bounded planning scan/)
}))

test('runtime validation forbids malformed scopes, duplicate capabilities and fabricated clock controls', () => {
  for (const bad of [{ ...request, capabilities: [] }, { ...request, capabilities: ['menu', 'menu'] },
    { ...request, capabilities: ['x'.repeat(129)] }, { ...request, environment_verified: 'true' },
    { ...request, entity: { ...entity, extra: true } }, { ...request, now: 0 }]) assert.throws(() => validatePlan(bad))
})
