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
    await rpc('initialize', { protocolVersion: '2025-06-18' })
    const listed = await rpc('tools/list', {})
    assert.equal(listed.tools.find(t => t.name === 'production_plan').annotations.readOnlyHint, true)
    const accepted = await rpc('tools/call', { name: 'production_plan', arguments: request })
    assert.equal(accepted.isError, false)
    assert.equal(JSON.parse(accepted.content[0].text).assessment, 'needs_resolution')
    assert.deepEqual(methods, ['status', 'windows.list'])
    const refused = await rpc('tools/call', { name: 'production_plan', arguments: { ...request, input_enabled: 'yes' } })
    assert.equal(refused.isError, true); assert.deepEqual(methods, ['status', 'windows.list'])
    const readback = await rpc('tools/call', { name: 'status', arguments: {} })
    assert.equal(JSON.parse(readback.content[0].text).mcp_adapter.production_planning, 1)
  } finally {
    child.stdin.end(); await new Promise(resolve => child.once('exit', resolve))
    for (const socket of sockets) socket.destroy()
    await new Promise(resolve => fake.close(resolve)); rmSync(root, { recursive: true, force: true })
  }
})
