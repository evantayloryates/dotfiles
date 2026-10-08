// Isolated socket engine fixture. Never contacts the real recorder or captures.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import net from 'node:net'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { hasCaptureOptions, requireCaptureOptions } from '../lib/capture-options.mjs'

test('optional controls require the exact contract; legacy callers bypass it', () => {
  assert.equal(hasCaptureOptions({ type: 'display' }), false)
  assert.equal(hasCaptureOptions(null), false)
  assert.equal(hasCaptureOptions({ type: 'display', include_child_windows: false }), true)
  assert.equal(hasCaptureOptions({ type: 'display', exclude_apps: [] }), true)
  for (const value of [undefined, {}, { capabilities: {} }, { capabilities: { target_capture_options: true } }, { capabilities: { target_capture_options: 2 } }]) assert.throws(() => requireCaptureOptions(value), error => error.code === 'unsupported_capture_options')
  assert.doesNotThrow(() => requireCaptureOptions({ capabilities: { target_capture_options: 1 } }))
})

test('MCP refuses an old engine before capture, forwards explicit false to capable engine', async () => {
  const root = mkdtempSync(join(tmpdir(), 'capture-options-mcp-')); mkdirSync(join(root, 'run'))
  const methods = []; let capable = false, forwarded
  const sockets = new Set()
  const fake = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket))
    createInterface({ input: socket }).on('line', line => {
      const row = JSON.parse(line); methods.push(row.method)
      let result
      if (row.method === 'status') result = capable ? { capabilities: { target_capture_options: 1, source_journal: 1 } } : { engine: { build: 'legacy-fixture' } }
      else { forwarded = row.params; result = { overlay_id: 'synthetic-no-ui' } }
      socket.write(JSON.stringify({ id: row.id, result }) + '\n')
    })
  })
  await new Promise((resolve, reject) => { fake.once('error', reject); fake.listen(join(root, 'run/engine.sock'), resolve) })
  const child = spawn(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url))], { env: { ...process.env, RECORD_SCREEN_HOME: root }, stdio: ['pipe', 'pipe', 'pipe'] })
  child.stderr.resume()
  let serial = 0; const pending = new Map()
  const rejectAll = error => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error) }; pending.clear() }
  const lines = createInterface({ input: child.stdout })
  lines.on('line', line => {
    const row = JSON.parse(line), p = pending.get(row.id)
    if (p) { clearTimeout(p.timer); pending.delete(row.id); row.error ? p.reject(new Error('protocol failure')) : p.resolve(row.result) }
  })
  child.on('error', rejectAll); child.on('exit', () => rejectAll(new Error('server exited')))
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++serial; const timer = setTimeout(() => { pending.delete(id); reject(new Error('deadline')) }, 3000)
    pending.set(id, { resolve, reject, timer }); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
  try {
    await request('initialize', { protocolVersion: '2025-06-18' })
    const call = target => request('tools/call', { name: 'frame_outline', arguments: { target } })
    const target = { type: 'display', include_child_windows: false, exclude_apps: ['com.test.Helper'] }
    const denied = await call(target)
    assert.equal(denied.isError, true)
    assert.match(denied.content[0].text, /unsupported_capture_options|does not advertise/)
    assert.deepEqual(methods, ['status'])
    capable = true
    const accepted = await call(target)
    assert.equal(accepted.isError, false)
    assert.deepEqual(methods, ['status', 'status', 'overlay.show'])
    assert.equal(forwarded.target.include_child_windows, false)
    assert.deepEqual(forwarded.target.exclude_apps, ['com.test.Helper'])
    capable = false
    const legacy = await call({ type: 'display' })
    assert.equal(legacy.isError, false)
    assert.deepEqual(methods.slice(-1), ['overlay.show'])
    const deniedSource = await request('tools/call', { name:'recording_source', arguments:{recording_id:'synthetic'} })
    assert.equal(deniedSource.isError, true)
    assert.match(deniedSource.content[0].text, /unsupported_source_journal|does not advertise/)
    assert.equal(methods.at(-1),'status')
    capable = true
    const acceptedSource = await request('tools/call', { name:'recording_source', arguments:{recording_id:'synthetic'} })
    assert.equal(acceptedSource.isError,false)
    assert.deepEqual(methods.slice(-2),['status','record.source'])
    assert.deepEqual(forwarded,{recording_id:'synthetic'})
  } finally {
    rejectAll(new Error('cleanup')); child.stdin.end(); child.kill('SIGTERM'); lines.close()
    await new Promise(resolve => { if (child.exitCode !== null || child.signalCode) resolve(); else { child.once('exit', resolve); setTimeout(() => { child.kill('SIGKILL'); resolve() }, 1000).unref() } })
    for (const socket of sockets) socket.destroy()
    await new Promise(resolve => fake.close(resolve)); rmSync(root, { recursive: true, force: true })
  }
})
