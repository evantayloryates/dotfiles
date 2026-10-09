// Guard behavior against an isolated fake engine. No real capture or stop.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'

async function run({ session = 'ses_owned1', state = 'recording', unknown = false, pressureFresh = true, pressureLevel = 3, thermalLevel, thermalFresh = true, thermalPid = process.pid, thermalBadState = false, thermalSymlink = false }) {
  const root = mkdtempSync(join(tmpdir(), 'resource-guard-')); mkdirSync(join(root, 'run'))
  const methods = [], sockets = new Set(), output = join(root, 'samples')
  const pressure = join(root, 'pressure.json'), config = join(root, 'config.json')
  writeFileSync(pressure, JSON.stringify({ timestamp: new Date(Date.now() - (pressureFresh ? 0 : 120000)).toISOString(), pressure_level: pressureLevel, paging_mib_s: 0, compressor_mib_s: 0 }))
  const thermal=join(root,'thermal.json')
  if(thermalLevel!==undefined){
    const data=JSON.stringify({timestamp:new Date(Date.now()-(thermalFresh?0:120000)).toISOString(),pid:thermalPid,level:thermalLevel,state:thermalBadState?'nominal':['nominal','fair','serious','critical'][thermalLevel]})
    if(thermalSymlink){writeFileSync(thermal+'-target',data);symlinkSync(thermal+'-target',thermal)}else writeFileSync(thermal,data)
  }
  writeFileSync(config, JSON.stringify({ pids: [process.pid], seconds: 1.1, interval_ms: 500, pressure_path: pressure, ...(thermalLevel!==undefined?{thermal_path:thermal}:{}), guard_session_id: 'ses_owned1', guard_recording_ids: ['rec_owned1'] }))
  const fake = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket))
    createInterface({ input: socket }).on('line', line => {
      const row = JSON.parse(line); methods.push(row.method)
      if (row.method === 'record.stop' && unknown) { socket.destroy(); return }
      socket.write(JSON.stringify({ id: row.id, result: { recording_id: 'rec_owned1', session_id: session, state } }) + '\n')
    })
  })
  await new Promise((resolve, reject) => { fake.once('error', reject); fake.listen(join(root, 'run/engine.sock'), resolve) })
  const child = spawn(process.execPath, [fileURLToPath(new URL('./sample-resources.mjs', import.meta.url)), config, output], { env: { ...process.env, RECORD_SCREEN_HOME: root }, stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''; child.stderr.on('data', v => { stderr += v }); child.stdout.resume()
  try {
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
    assert.equal(code, 0, stderr)
    const result = JSON.parse(readFileSync(join(output, 'result.json'), 'utf8'))
    assert.ok(result.samples >= 2)
    return { methods, result }
  } finally {
    for (const socket of sockets) socket.destroy()
    await new Promise(resolve => fake.close(resolve)); rmSync(root, { recursive: true, force: true })
  }
}

test('fresh critical pressure stops the explicit owned take once', async () => {
  const { methods, result } = await run({})
  assert.deepEqual(methods, ['record.get', 'record.stop'])
  assert.equal(result.guard_results[0].stop_submissions, 1)
  assert.equal(result.guard_results[0].outcome, 'stop_reply_received')
})
test('session mismatch or settled take never receives a stop', async () => {
  for (const configuration of [{ session: 'ses_peer1' }, { state: 'done' }]) {
    const { methods, result } = await run(configuration)
    assert.deepEqual(methods, ['record.get']); assert.equal(result.guard_results[0].stop_submissions, 0)
  }
})
test('unknown accepted stop reply is never replayed', async () => {
  const { methods, result } = await run({ unknown: true })
  assert.deepEqual(methods, ['record.get', 'record.stop'])
  assert.match(result.guard_results[0].outcome, /outcome_unknown/)
})
test('stale critical pressure stays unknown and cannot stop anything', async () => {
  const { methods, result } = await run({ pressureFresh: false })
  assert.deepEqual(methods, []); assert.equal(result.guarded, false)
})
test('fresh serious thermal can stop an owned take despite normal pressure',async()=>{
  const {methods,result}=await run({pressureLevel:1,thermalLevel:2})
  assert.deepEqual(methods,['record.get','record.stop']);assert.equal(result.guard_results[0].trigger,'fresh_serious_or_critical_thermal');assert.equal(result.guard_results[0].stop_submissions,1)
})
test('fresh nominal or stale critical thermal does not stop a take',async()=>{
  for(const options of [{thermalLevel:0},{thermalLevel:3,thermalFresh:false}]){
    const {methods,result}=await run({pressureLevel:1,...options});assert.deepEqual(methods,[]);assert.equal(result.guarded,false)
  }
})
test('wrong thermal identity or inconsistent state cannot trigger a stop',async()=>{
  for(const options of [{thermalPid:1},{thermalBadState:true}]){
    const {methods,result}=await run({pressureLevel:1,thermalLevel:2,...options});assert.deepEqual(methods,[]);assert.equal(result.guarded,false)
  }
})
test('substituted thermal symlink cannot trigger a stop',async()=>{
  const {methods,result}=await run({pressureLevel:1,thermalLevel:2,thermalSymlink:true});assert.deepEqual(methods,[]);assert.equal(result.guarded,false)
})
