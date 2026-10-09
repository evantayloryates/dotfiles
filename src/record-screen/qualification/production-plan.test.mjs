// Policy and actual MCP read-only integration. No capture, UI or installation.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { planProduction, validateProductionRequest } from '../lib/production-plan.mjs'

const request = { target: { type: 'window', window_id: 119 }, mode: 'cooperative', activity: 'agent_ui', duration_s: 50, redundancy: 'window_display', alignment_until: '2026-10-09T08:00:00Z' }
const status = { clock: { wall: '2026-10-09T07:00:00Z' }, engine: { build: 'f314bb340344', pid: 123 }, permission: { screen_recording: 'granted' }, capabilities: { source_journal: 1, input_timeline: 1, target_capture_options: 1, exclusion_identity: 1 }, capture_health: { recordings: { max_concurrent: 16, unfinished: 0, quarantined: 0 } }, displays: [{ id: 1, main: true, scale: 2 }] }
const inventory = { total: 1, windows: [{ window_id: 119, pid: 71011, bundle_id: 'com.google.Chrome', on_screen: false, frame: { x: 0, y: 34, w: 1000, h: 732 } }] }

const tripleRequest = { target: { type: 'window', window_id: 119, include_child_windows: true }, mode: 'background', activity: 'passive_capture', duration_s: 75, redundancy: 'window_app_display', backup_rect: { x: 90, y: 90, w: 1140, h: 850 }, backup_max_width: 1140 }
const tripleStatus = { ...status, engine: { build: '9bfabf2dbb5c', pid: 123 }, capabilities: { ...status.capabilities, application_filter: 1 }, displays: [{ id: 1, main: true, scale: 2, frame: { x: 0, y: 0, w: 1512, h: 982 } }] }
const tripleInventory = { total: 1, windows: [{ ...inventory.windows[0], on_screen: true, frame: { x: 120, y: 110, w: 1000, h: 732 } }] }

test('three-source plan binds app identity and explicit crop without creating readiness or admission', () => {
  const p = planProduction(tripleRequest, tripleStatus, tripleInventory), r = p.resource_guidance
  assert.equal(p.assessment, 'candidate_requires_source_check')
  assert.equal(p.mutates, false); assert.equal(p.alignment.input_lock, false)
  assert.deepEqual(p.planned_sources.map(x => x.role), ['window', 'app', 'display'])
  assert.deepEqual(p.planned_sources[1].target, { type: 'rect', ...tripleRequest.backup_rect, include_apps: ['com.google.Chrome'] })
  assert.deepEqual(p.planned_sources[2].target, { type: 'rect', ...tripleRequest.backup_rect })
  assert.deepEqual(p.planned_sources.map(x => x.settings.max_width), [1000, 1140, 1140])
  assert(p.planned_sources.every(x => x.settings.codec === 'h264' && x.settings.input.enabled === false))
  assert.deepEqual(r.point_triple_profile_differences, [])
  assert.equal(r.measured_point_triple_profile.representative_for_requested_app, false)
  assert.equal(r.measured_point_triple_profile.recorder_peak_rss_mib, 463.0625)
  assert.equal(r.duration_p80_s, null); assert.equal(r.configured_limit_is_capacity, false)
  assert(p.unknowns.some(x => x.includes('coverage must be verified')))
  assert(p.user_expectations.some(x => x.includes('unrelated desktop pixels')))
  assert.match(p.planned_sources_qualification, /no scheduling/)
})

test('three-source scenario accounts for all lanes and does not extrapolate CPU or capacity', () => {
  const a = planProduction(tripleRequest, tripleStatus, tripleInventory).resource_guidance.storage_guidance
  assert.equal(a.reference, 'measured_point_triple_profile'); assert.equal(a.scenario_video_bytes, 40839659)
  assert.deepEqual(a.scenario_journal_bytes_by_source, { window: 1382019, app: 1335172, display: 1331659 })
  assert.deepEqual(a.scenario_journal_rows_by_source, { window: 4483, app: 4171, display: 4172 })
  assert.deepEqual(a.scenario_muxed_packets_by_source, { window: 2181, app: 1767, display: 1771 })
  const b = planProduction({ ...tripleRequest, duration_s: 86400 }, tripleStatus, tripleInventory).resource_guidance.storage_guidance
  assert(Object.values(b.scenario_exceeds_budgets).every(Boolean)); assert.equal(b.safe_continuous_duration_s, null)
  assert.equal(b.disk_space_reserved, false); assert(b.assumptions.some(x => x.includes('No extrapolation of CPU')))
})

test('three-source identity, crop, capability and settings uncertainty remain explicit', () => {
  for (const bundle_id of [undefined, 123, 'bad/bundle']) {
    const p = planProduction(tripleRequest, tripleStatus, { ...tripleInventory, windows: [{ ...tripleInventory.windows[0], bundle_id }] })
    assert.equal(p.planned_sources, null); assert.equal(p.assessment, 'needs_resolution')
  }
  assert(planProduction(tripleRequest, status, tripleInventory).blocking_reasons.some(x => x.includes('application_filter')))
  const outside = planProduction({ ...tripleRequest, backup_rect: { x: 9000, y: 9000, w: 100, h: 100 } }, tripleStatus, tripleInventory)
  assert.equal(outside.assessment, 'needs_resolution')
  const disjoint = planProduction({ ...tripleRequest, backup_rect: { x: 0, y: 0, w: 100, h: 100 } }, tripleStatus, tripleInventory)
  assert.equal(disjoint.assessment, 'needs_resolution'); assert(disjoint.blocking_reasons.some(x => x.includes('does not intersect the observed base')))
  const partial = planProduction({ ...tripleRequest, backup_rect: { x: 120, y: 110, w: 100, h: 100 } }, tripleStatus, tripleInventory)
  assert(partial.unknowns.some(x => x.includes('does not contain')))
  const changed = planProduction({ ...tripleRequest, codec: 'hevc', fps: 60, backup_max_width: 0 }, tripleStatus, tripleInventory)
  for (const value of ['different codec', 'different fps', 'different or unobserved backup geometry/display']) assert(changed.resource_guidance.point_triple_profile_differences.includes(value))
  assert.equal(changed.planned_sources[1].settings.codec, 'hevc'); assert.equal(changed.planned_sources[1].settings.max_width, 0)
  const duplicateDisplay = planProduction(tripleRequest, { ...tripleStatus, displays: [tripleStatus.displays[0], tripleStatus.displays[0]] }, tripleInventory)
  assert(duplicateDisplay.resource_guidance.point_triple_profile_differences.some(x => x.includes('unobserved backup')))
  const busy = planProduction(tripleRequest, { ...tripleStatus, capture_health: { recordings: { max_concurrent: 16, unfinished: 14 } } }, tripleInventory)
  assert.equal(busy.assessment, 'needs_resolution'); assert(busy.blocking_reasons.some(x => x.includes('configured recording slots')))
  assert.equal(busy.resource_guidance.configured_limit_is_capacity, false)
})

test('malformed or irrelevant three-source fields refuse rather than silently configure capture', () => {
  for (const patch of [{ backup_rect: undefined }, { backup_max_width: undefined }, { backup_max_width: true }, { backup_max_width: -1 }, { backup_rect: { ...tripleRequest.backup_rect, w: 0 } }, { backup_rect: { ...tripleRequest.backup_rect, app: 'invented' } }, { redundancy: 'none' }, { target: { type: 'display', display_id: 1 } }, { codec: 'gif' }]) assert.throws(() => validateProductionRequest({ ...tripleRequest, ...patch }), e => e.code === 'bad_production_plan')
})

test('app-filter planning refuses old engines and keeps crop/identity/readiness limits explicit',()=>{
  const a={target:{type:'rect',x:0,y:0,w:500,h:500,include_apps:['com.test.App']},mode:'background',activity:'passive_capture',duration_s:30}
  const s={...status,displays:[{id:1,main:true,frame:{x:0,y:0,w:1512,h:982}}]}
  assert(planProduction(a,s).blocking_reasons.some(x=>x.includes('application_filter')))
  const p=planProduction(a,{...s,capabilities:{...s.capabilities,application_filter:1}})
  assert.equal(p.assessment,'candidate_requires_source_check');assert(p.unknowns.some(x=>x.includes('app presence')));assert(p.user_expectations.some(x=>x.includes('fixed crop')))
  for(const target of [{...a.target,include_apps:[]},{...a.target,include_apps:['com.test.App','com.test.Other']},{...a.target,exclude_apps:['com.test.Other']},{type:'window',window_id:119,include_apps:['com.test.App']}])assert.throws(()=>validateProductionRequest({...a,target}),e=>e.code==='bad_production_plan')
})

test('off-Space native UI and unagreed intervals never become ready plans', () => {
  let p = planProduction(request, status, inventory)
  assert.equal(p.assessment, 'needs_resolution')
  assert.ok(p.blocking_reasons.some(s => s.includes('off screen')))
  assert.equal(p.alignment.provenance, 'caller_reported_unverified; not an authenticated permission grant')
  p = planProduction({ ...request, alignment_until: '2026-10-09T07:00:49Z' }, status, inventory)
  assert.ok(p.blocking_reasons.some(s => s.includes('user alignment')))
  p = planProduction({ ...request, mode: 'background' }, status, inventory)
  assert.ok(p.blocking_reasons.some(s => s.includes('Background mode')))
  // Passive off-Space window capture remains a candidate, not UI readiness.
  p = planProduction({ ...request, mode: 'background', activity: 'passive_capture', alignment_until: undefined }, status, inventory)
  assert.equal(p.assessment, 'candidate_requires_source_check')
  assert.equal(p.alignment.input_lock, false)
  p = planProduction({ ...request, mode: 'reserved_interval', activity: 'passive_capture', alignment_until: undefined }, status, inventory)
  assert.ok(p.blocking_reasons.some(s => s.includes('user alignment')))
})

test('matching measured dimensions preserve unqualified app/capacity and cursor limits', () => {
  const p = planProduction({ ...request, activity: 'passive_capture' }, status, inventory)
  assert.deepEqual(p.resource_guidance.profile_differences, [])
  assert.equal(p.resource_guidance.measured_profile.representative_for_requested_app, false)
  assert.equal(p.resource_guidance.configured_limit_is_capacity, false)
  assert.equal(p.resource_guidance.duration_p80_s, null)
  assert.equal(p.resource_guidance.measured_single_window_profile.representative_for_requested_app, false)
  assert.equal(p.resource_guidance.measured_single_window_profile.exact_muxed_samples, 3221)
  assert.match(p.cursor_layers.text_caret, /app content remains/)
  assert.match(p.cursor_layers.app_drawn_pointer, /does not remove/)
  assert.equal(p.mutates, false)
  const changed = planProduction({ ...request, duration_s: 600, max_width: 0, input_enabled: true }, status, inventory)
  assert.ok(changed.resource_guidance.profile_differences.includes('different duration_s'))
  assert.ok(changed.resource_guidance.profile_differences.includes('different input_enabled'))
  assert.ok(changed.unknowns.some(s => s.includes('Protected input')))
})

test('runtime obstacles and bounded missing inventory stay explicit', () => {
  const p = planProduction(request, { ...status, maintenance: { reserved: true }, capabilities: {}, clock: {} }, { total: 1000, windows: [] })
  assert.ok(p.blocking_reasons.some(s => s.includes('bounded window inventory')))
  assert.ok(p.blocking_reasons.some(s => s.includes('maintenance')))
  assert.ok(p.blocking_reasons.some(s => s.includes('clock unavailable')))
  assert.ok(p.blocking_reasons.some(s => s.includes('source journal')))
  const display = planProduction({ ...request, target: { type: 'display', display_id: 2 }, redundancy: 'none' }, status)
  assert.ok(display.blocking_reasons.some(s => s.includes('display is absent')))
  const rect = planProduction({ ...request, target: { type: 'rect', x: 9000, y: 9000, w: 100, h: 100 }, redundancy: 'none' }, status)
  assert.ok(rect.blocking_reasons.some(s => s.includes('display intersection')))
  const input = planProduction({ ...request, input_enabled: true }, status, inventory)
  assert.ok(input.blocking_reasons.some(s => s.includes('Input Monitoring')))
})

test('Retina reference profile never becomes admission or a safe duration', () => {
  const retinaStatus = { ...status, displays: [{ id: 1, main: true, scale: 2, frame: { x: 0, y: 0, w: 1512, h: 982 } }] }
  const a = { ...request, activity: 'passive_capture', duration_s: 330, fps: 60, max_width: 0 }
  const p = planProduction(a, retinaStatus, inventory), r = p.resource_guidance
  assert.deepEqual(r.retina_pair_profile_differences, [])
  assert.equal(r.measured_retina_pair_profile.representative_for_requested_app, false)
  assert.equal(r.measured_retina_pair_profile.exact_muxed_samples, 35345)
  assert.equal(r.storage_guidance.scenario_video_bytes, 513518205)
  assert.deepEqual(r.storage_guidance.scenario_journal_bytes_by_source, { primary: 11037570, backup: 11593393 })
  assert.equal(r.storage_guidance.scenario_exceeds_measured_journal_limit, false)
  assert.deepEqual(r.storage_guidance.scenario_exceeds_budgets, { native_journal_bytes: false, source_reader_rows: false, media_reader_packets: false })
  assert.deepEqual(r.storage_guidance.scenario_journal_rows_by_source, { primary: 35725, backup: 37193 })
  for (const k of ['free_disk_bytes','safe_continuous_duration_s']) assert.equal(r.storage_guidance[k], null)
  assert.equal(r.storage_guidance.disk_space_reserved, false)
  assert.equal(r.duration_p80_s, null)
  const changed = planProduction({ ...a, input_enabled: true }, retinaStatus, inventory)
  assert.ok(changed.resource_guidance.retina_pair_profile_differences.includes('different input_enabled'))
  for (const displays of [[], [{ scale: 1, frame: { x: 0, y: 0, w: 1512, h: 982 } }], [retinaStatus.displays[0], retinaStatus.displays[0]]]) {
    const uncertain = planProduction(a, { ...retinaStatus, displays }, inventory)
    assert.ok(uncertain.resource_guidance.retina_pair_profile_differences.some(s=>s.includes('unobserved native parent')))
  }
})

test('long-duration storage scenario warns without inventing a failure time or capture', () => {
  const a = { ...request, mode: 'background', activity: 'passive_capture', duration_s: 3600, fps: 60, max_width: 0 }
  const p = planProduction(a, status, inventory), s = p.resource_guidance.storage_guidance
  assert.equal(s.scenario_exceeds_measured_journal_limit, true)
  assert.deepEqual(s.scenario_exceeds_budgets, { native_journal_bytes: true, source_reader_rows: true, media_reader_packets: true })
  assert.ok(p.unknowns.some(s=>s.includes('scenario warning')))
  assert.equal(p.assessment, 'candidate_requires_source_check')
  assert.equal(s.safe_continuous_duration_s, null)
  assert.match(s.qualification, /not a prediction, bound/)
  assert.ok(s.assumptions.some(s=>s.includes('does not imply video stopped')))
  assert.equal(s.scenario_video_bytes, Math.ceil(513518205 * 3600/330))
  assert.equal(p.mutates, false)
})

test('invalid or contradictory requests refuse rather than silently change settings', () => {
  for (const patch of [{ duration_s: true }, { duration_s: Infinity }, { fps: 1.2 }, { max_width: -1 }, { mode: 'lock_user' }, { show_cursor: 0 }, { alignment_until: '2026-10-09T08:00:00' }, { grant: true }, { target: { type: 'window', app: 'Chrome' } }, { target: { type: 'window', window_id: 119, exclude_apps: [] } }, { target: { type: 'rect', x: 0, y: 0, w: 0, h: 1 }, redundancy: 'none' }]) assert.throws(() => validateProductionRequest({ ...request, ...patch }), e => e.code === 'bad_production_plan')
  const a = validateProductionRequest({ ...request, fps: 60, max_width: 3024, show_cursor: true, input_enabled: true })
  assert.equal(a.fps, 60); assert.equal(a.max_width, 3024); assert.equal(a.show_cursor, true)
})

test('MCP planning does only readbacks; malformed input performs no RPC', async () => {
  const root = mkdtempSync(join(tmpdir(), 'production-plan-mcp-')); mkdirSync(join(root, 'run'))
  const methods = [], sockets = new Set()
  const fake = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket))
    createInterface({ input: socket }).on('line', line => {
      const row = JSON.parse(line); methods.push(row.method)
      const result = row.method === 'status' ? status : inventory
      socket.write(JSON.stringify({ id: row.id, result }) + '\n')
    })
  })
  await new Promise((resolve, reject) => { fake.once('error', reject); fake.listen(join(root, 'run/engine.sock'), resolve) })
  const child = spawn(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url))], { env: { ...process.env, RECORD_SCREEN_HOME: root }, stdio: ['pipe', 'pipe', 'pipe'] })
  child.stderr.resume()
  let serial = 0; const pending = new Map()
  const lines = createInterface({ input: child.stdout })
  lines.on('line', line => { const row = JSON.parse(line), p = pending.get(row.id); if (p) { clearTimeout(p.timer); pending.delete(row.id); row.error ? p.reject(new Error('protocol failure')) : p.resolve(row.result) } })
  const rpc = (method, params) => new Promise((resolve, reject) => { const id = ++serial; const timer = setTimeout(() => { pending.delete(id); reject(new Error('deadline')) }, 3000); pending.set(id, { resolve, reject, timer }); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n') })
  try {
    assert.equal((await rpc('initialize', { protocolVersion: '2025-06-18' })).serverInfo.version, '0.15.0')
    const listed = await rpc('tools/list', {})
    assert.equal(listed.tools.find(t => t.name === 'production_plan').annotations.readOnlyHint, true)
    const accepted = await rpc('tools/call', { name: 'production_plan', arguments: request })
    assert.equal(accepted.isError, false)
    assert.equal(JSON.parse(accepted.content[0].text).assessment, 'needs_resolution')
    assert.deepEqual(methods, ['status', 'windows.list'])
    const refused = await rpc('tools/call', { name: 'production_plan', arguments: { ...request, input_enabled: 'yes' } })
    assert.equal(refused.isError, true); assert.deepEqual(methods, ['status', 'windows.list'])
    const triple = await rpc('tools/call', { name: 'production_plan', arguments: tripleRequest })
    assert.equal(triple.isError, false)
    const triplePlan = JSON.parse(triple.content[0].text)
    assert.equal(triplePlan.resource_guidance.storage_guidance.reference, 'measured_point_triple_profile')
    assert.equal(triplePlan.resource_guidance.storage_guidance.scenario_video_bytes, 40839659)
    assert.deepEqual(methods, ['status', 'windows.list', 'status', 'windows.list'])
    const invalidTriple = await rpc('tools/call', { name: 'production_plan', arguments: { ...tripleRequest, backup_max_width: undefined } })
    assert.equal(invalidTriple.isError, true)
    assert.deepEqual(methods, ['status', 'windows.list', 'status', 'windows.list'])
    const readback = await rpc('tools/call', { name: 'status', arguments: {} })
    assert.equal(JSON.parse(readback.content[0].text).mcp_adapter.production_planning, 1)
    assert.equal(JSON.parse(readback.content[0].text).mcp_adapter.production_storage_guidance, 1)
    assert.equal(JSON.parse(readback.content[0].text).mcp_adapter.triple_source_planning, 1)
  } finally {
    child.stdin.end(); await new Promise(resolve => child.once('exit', resolve))
    for (const socket of sockets) socket.destroy()
    await new Promise(resolve => fake.close(resolve)); rmSync(root, { recursive: true, force: true })
  }
})
