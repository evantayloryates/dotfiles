import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readdir, readFile, stat, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resourceAdvice, observeResourcePlan } from '../lib/resource-awareness.mjs'

const plan = { request: { duration_s: 30, fps: 30, max_width: 1000, redundancy: 'window_display' }, resource_guidance: { unfinished_recordings: 1, configured_max_concurrent: 16 }, engine: { build: 'fixture' }, observed_at: { domain: 'fixture' } }
const normal = { memory_pressure_level: 1, free_disk_bytes: 20 * 1024 ** 3, load_average_1m: 1, logical_cpu_count: 8 }

test('advice changes with pressure, disk and slots without claiming capacity or changing fidelity', () => {
  assert.equal(resourceAdvice(normal, plan).recommendation, 'no_coarse_pressure_observed')
  const warning = resourceAdvice({ ...normal, memory_pressure_level: 2 }, plan)
  assert.equal(warning.recommendation, 'review_before_start')
  assert.deepEqual(warning.reasons, ['warning_memory_pressure'])
  const critical = resourceAdvice({ ...normal, memory_pressure_level: 4, free_disk_bytes: 1, load_average_1m: 10 }, { ...plan, resource_guidance: { unfinished_recordings: 15, configured_max_concurrent: 16 } })
  assert.deepEqual(critical.reasons, ['critical_memory_pressure', 'low_disk_headroom', 'elevated_one_minute_load', 'configured_slots_exceeded'])
  assert.equal(critical.policy.settings_changed, false)
  assert.equal(critical.policy.admission_enforced, false)
  assert.equal(critical.policy.capacity_qualified, false)
  const unknown = resourceAdvice({}, plan)
  assert.equal(unknown.recommendation, 'insufficient_observations')
  assert.equal(unknown.unknowns.length, 3)
})

test('private audit retention, compact content and sensor failure remain explicit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'resource-plan-'))
  try {
    const original = structuredClone(plan)
    for (let i = 0; i < 4; i++) {
      const result = await observeResourcePlan(plan, { root, collect: async () => normal, retain: 2 })
      assert.equal(result.resource_guidance.adaptive.audit.state, 'saved')
      const path = result.resource_guidance.adaptive.audit.path
      assert.equal((await stat(path)).mode & 0o777, 0o600)
      const log = JSON.parse(await readFile(path, 'utf8'))
      assert.deepEqual(log.workload, plan.request)
      assert.equal(log.awareness.observation.freshness, 'this planning call; not a live monitor')
      assert(!JSON.stringify(log).includes('window_id'))
    }
    assert.equal((await readdir(join(root, 'diagnostics', 'resource-plans'))).length, 2)
    assert.deepEqual(plan, original)
    const unavailable = await observeResourcePlan(plan, { root, collect: async () => { throw Error('fixture sensor failure') } })
    assert.equal(unavailable.resource_guidance.adaptive.recommendation, 'insufficient_observations')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('busy audit writer does not block planning or remove another writer’s lock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'resource-plan-'))
  const lock = join(root, 'diagnostics', 'resource-plans', '.writer-lock')
  try {
    await mkdir(lock, { recursive: true })
    const result = await observeResourcePlan(plan, { root, collect: async () => normal })
    assert.equal(result.resource_guidance.adaptive.audit.state, 'unavailable')
    assert((await stat(lock)).isDirectory())
  } finally { await rm(root, { recursive: true, force: true }) }
})
