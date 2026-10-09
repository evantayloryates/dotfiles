// Isolated socket engine fixture. Never contacts the real recorder or captures.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
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
  assert.equal(hasCaptureOptions({type:'rect',include_apps:['com.test.App']}),true)
  assert.throws(()=>requireCaptureOptions({capabilities:{target_capture_options:1}},{include_apps:['com.test.App']}),e=>e.code==='unsupported_application_filter')
  assert.doesNotThrow(()=>requireCaptureOptions({capabilities:{target_capture_options:1,application_filter:1}},{include_apps:['com.test.App']}))
})

test('MCP refuses an old engine before capture, forwards explicit false to capable engine', async () => {
  const root = mkdtempSync(join(tmpdir(), 'capture-options-mcp-')); mkdirSync(join(root, 'run'))
  const methods = []; let capable = false, forwarded, disconnectExport = false, exclusionCap = false, previewExclusionCap = false, appFilterCap = false
  const manifestPath = join(root, 'synthetic.source.json')
  const imagePath = join(root, 'synthetic.png')
  writeFileSync(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'))
  writeFileSync(manifestPath, JSON.stringify({ schema:'record-screen-derivative/v1', parent:{recording_id:'synthetic'},
    sampling:{fps:10,first_parent_tick:'5',end_parent_tick_exclusive:'6'},time_base:['1','10'],parent_time_base:['1','10'],
    frames:[{index:0,pts:'0',duration:'1',nominal_parent_tick:'5',parent_pts:'3',parent_packet_index:0}] }))
  const sockets = new Set()
  const fake = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket))
    createInterface({ input: socket }).on('line', line => {
      const row = JSON.parse(line); methods.push(row.method)
      let result
      if (row.method === 'record.export' && disconnectExport) { socket.destroy(); return }
      if (row.method === 'status') result = capable ? { capabilities: { target_capture_options: 1, source_journal: 1, action_scopes:1, input_timeline:1, derivative_source:1, ...(appFilterCap?{application_filter:1}:{}), ...(exclusionCap?{exclusion_identity:1}:{}), ...(previewExclusionCap?{preview_exclusion_identity:1}:{}) } } : { engine: { build: 'legacy-fixture' } }
      else if (row.method === 'record.export_info') result = {path:manifestPath}
      else if (row.method === 'frame.verify') { forwarded = row.params; result = {image:{path:imagePath,format:'png'}} }
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
    const shown = await request('tools/call', {name:'frame_outline',arguments:{target,hide:false}})
    assert.equal(shown.isError,false)
    assert.equal(methods.at(-1),'overlay.show')
    assert.equal(Object.hasOwn(forwarded,'hide'),false,'adapter-only show/hide selector is not a native capture field')
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
    capable=false
    const actionArgs={session_id:'fixture-session',caller:'agent',provider:'native-cua',action_id:'one',intent:'synthetic',target:{bundle_id:'com.test.Fixture'}}
    const deniedAction=await request('tools/call',{name:'action_begin',arguments:actionArgs})
    assert.equal(deniedAction.isError,true);assert.match(deniedAction.content[0].text,/unsupported_action_scopes/)
    assert.equal(methods.at(-1),'status')
    const recordingArgs={session_id:'fixture-session',target:{type:'display'},start_at:'2026-10-08T20:00:00Z',end_at:'2026-10-08T20:00:01Z',input:{enabled:false,ambiguous_keys:'none'}}
    const deniedInput=await request('tools/call',{name:'record_schedule',arguments:recordingArgs})
    assert.equal(deniedInput.isError,true);assert.match(deniedInput.content[0].text,/unsupported_input_timeline/)
    assert.equal(methods.at(-1),'status')
    capable=true
    const acceptedAction=await request('tools/call',{name:'action_begin',arguments:actionArgs})
    assert.equal(acceptedAction.isError,false);assert.equal(methods.at(-1),'action.begin');assert.deepEqual(forwarded,actionArgs)
    const acceptedInput=await request('tools/call',{name:'record_schedule',arguments:recordingArgs})
    assert.equal(acceptedInput.isError,false);assert.equal(methods.at(-1),'record.schedule');assert.deepEqual(forwarded.input,recordingArgs.input)
    const exclusionArgs={...recordingArgs,target:{type:'display',exclude_apps:['com.test.Helper']}}
    const deniedExclusion=await request('tools/call',{name:'record_schedule',arguments:exclusionArgs})
    assert.equal(deniedExclusion.isError,true);assert.match(deniedExclusion.content[0].text,/unsupported_exclusion_identity/)
    assert.equal(methods.at(-1),'status','legacy exclusion filter does not start a take')
    exclusionCap=true
    const acceptedExclusion=await request('tools/call',{name:'record_schedule',arguments:exclusionArgs})
    assert.equal(acceptedExclusion.isError,false);assert.equal(methods.at(-1),'record.schedule')
    assert.deepEqual(forwarded.target,exclusionArgs.target)
    const appArgs={...recordingArgs,target:{type:'rect',x:0,y:0,w:100,h:100,include_apps:['com.test.App']}}
    for(const [name,args] of [['record_schedule',appArgs],['frame_check',{target:appArgs.target}]]){
      const denied=await request('tools/call',{name,arguments:args});assert.equal(denied.isError,true);assert.match(denied.content[0].text,/unsupported_application_filter/);assert.equal(methods.at(-1),'status')
    }
    appFilterCap=true
    for(const [name,args,method] of [['record_schedule',appArgs,'record.schedule'],['frame_check',{target:appArgs.target},'frame.verify']]){
      const accepted=await request('tools/call',{name,arguments:args});assert.equal(accepted.isError,false);assert.equal(methods.at(-1),method);assert.deepEqual(forwarded.target,appArgs.target)
    }
    const deniedPreview=await request('tools/call',{name:'frame_check',arguments:{target:exclusionArgs.target}})
    assert.equal(deniedPreview.isError,true);assert.match(deniedPreview.content[0].text,/unsupported_preview_exclusion_identity/)
    assert.equal(methods.at(-1),'status','legacy preview does not start a stale lane')
    previewExclusionCap=true
    const acceptedPreview=await request('tools/call',{name:'frame_check',arguments:{target:exclusionArgs.target}})
    assert.equal(acceptedPreview.isError,false);assert.equal(methods.at(-1),'frame.verify')
    assert.deepEqual(forwarded.target,exclusionArgs.target)
    capable=false
    const exportArgs={recording_id:'synthetic',format:'mp4',effort:'draft',backend:'software',max_width:640,fps:12,name:'draft.mp4'}
    const deniedExport=await request('tools/call',{name:'record_export',arguments:exportArgs})
    assert.equal(deniedExport.isError,true);assert.match(deniedExport.content[0].text,/unsupported_derivative_source/)
    assert.equal(methods.at(-1),'status')
    capable=true
    const acceptedExport=await request('tools/call',{name:'record_export',arguments:exportArgs})
    assert.equal(acceptedExport.isError,false);assert.deepEqual(forwarded,exportArgs)
    const mapped=await request('tools/call',{name:'export_time_map',arguments:{recording_id:'synthetic',name:'draft.mp4',parent_relative_ns:['500000000']}})
    assert.equal(mapped.isError,false)
    const value=JSON.parse(mapped.content[0].text)
    assert.deepEqual(value.mapped[0].derivative_time_ns,{numerator:'0',denominator:'1'})
    assert.deepEqual(value.mapped[0].source_frame_parent_ns,{numerator:'300000000',denominator:'1'})
    disconnectExport=true
    const attempts=methods.filter(m=>m==='record.export').length
    const disconnected=await request('tools/call',{name:'record_export',arguments:exportArgs})
    assert.equal(disconnected.isError,true)
    assert.equal(methods.filter(m=>m==='record.export').length,attempts+1,'disconnect never replays a mutating export')
  } finally {
    rejectAll(new Error('cleanup')); child.stdin.end(); child.kill('SIGTERM'); lines.close()
    await new Promise(resolve => { if (child.exitCode !== null || child.signalCode) resolve(); else { child.once('exit', resolve); setTimeout(() => { child.kill('SIGKILL'); resolve() }, 1000).unref() } })
    for (const socket of sockets) socket.destroy()
    await new Promise(resolve => fake.close(resolve)); rmSync(root, { recursive: true, force: true })
  }
})
