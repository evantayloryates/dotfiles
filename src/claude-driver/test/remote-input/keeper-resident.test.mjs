import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {once} from 'node:events'
import {connect} from 'node:net'
import {mkdtempSync,readFileSync,writeFileSync,lstatSync,existsSync,chmodSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {connectKeeperResident,inspectKeeperRequest} from '../../candidates/input-keeper/resident.mjs'
import {acquireKernelLock} from '../../lib/kernel-lock.mjs'
import {readProcessSnapshot} from '../../candidates/input-keeper/process-observation.mjs'
const fixture=fileURLToPath(new URL('./keeper-resident-fixture.mjs',import.meta.url)),epoch='c'.repeat(64),sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function until(fn){const end=Date.now()+8000;while(!await fn()){if(Date.now()>end)throw Error('resident condition deadline');await sleep(20)}}
const alive=c=>c.exitCode===null&&c.signalCode===null
async function rig(){
 const dir=mkdtempSync('/private/tmp/keeper-resident-test-'),lock=await acquireKernelLock(join(dir,'ui.lock')),s=lstatSync(join(dir,'ui.lock'))
 const group=readProcessSnapshot().rows.find(p=>p.pid===process.pid).group,owner={pid:process.pid,group,lock:{dev:s.dev,ino:s.ino}}
 const child=spawn(process.execPath,[fixture,dir],{detached:true,stdio:['ignore','ignore','pipe','ipc']});child.stderr.on('data',b=>child.fixtureStderr=(child.fixtureStderr??'')+b)
 const done=once(child,'exit').then(([code,signal])=>({code,signal}));let helperPid
 await until(()=>{if(!alive(child))throw Error('resident startup failed '+child.fixtureStderr);return existsSync(join(dir,'resident.json'))&&JSON.parse(readFileSync(join(dir,'resident.json'))).phase==='ready'})
 const client=()=>connectKeeperResident({dir,epoch}),state=()=>JSON.parse(readFileSync(join(dir,'fixture.json')))
 helperPid=state().helperPid
 const sentinel=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'})
 return {dir,child,done,owner,client,state,async cleanup(ok){
  assert.equal(alive(sentinel),true)
  if(alive(child)){try{await client().request('shutdown')}catch{};if(alive(child))try{process.kill(-child.pid,'SIGKILL')}catch{};await done}
  for(const p of readProcessSnapshot().rows.filter(p=>p.group===child.pid||p.pid===helperPid))try{process.kill(p.pid,'SIGKILL')}catch{}
  await until(()=>!readProcessSnapshot().rows.some(p=>p.group===child.pid||p.pid===helperPid))
  lock();sentinel.kill('SIGTERM');await once(sentinel,'exit')
  if(ok)rmSync(dir,{recursive:true,force:true});else console.log('retained failed resident fixture '+dir)
 }}
}
test('separate client processes reconnect to one resident after bootstrap EOF',{timeout:20000},async()=>{
 const r=await rig();let ok=false
 try{
  r.child.disconnect();const before=await r.client().request('status')
  for(let i=0;i<2;i++){
   const code=`import{connectKeeperResident}from${JSON.stringify(new URL('../../candidates/input-keeper/resident.mjs',import.meta.url).href)};const r=await connectKeeperResident(${JSON.stringify({dir:r.dir,epoch})}).request('status');console.log(JSON.stringify({generation:r.generation,pid:r.result.resource.pid,live:r.result.live}));`
   // Keep the server responsive while another process communicates over UDS.
   const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b)
   const [codeExit]=await once(child,'exit');assert.equal(codeExit,0,stderr);const seen=JSON.parse(stdout)
   assert.equal(seen.generation,before.generation);assert.equal(seen.pid,before.result.resource.pid);assert.equal(seen.live,true)
  }
  assert.equal(r.state().opens,1);await r.client().request('shutdown');assert.equal((await r.done).code,0);ok=true
 }finally{await r.cleanup(ok)}
})
test('lost mutation reply reconnects by exact id without a second client start',{timeout:20000},async()=>{
 const r=await rig();let ok=false
 try{
  writeFileSync(join(r.dir,'pause-open'),'owned barrier')
  const id=randomUUID(),client=r.client(),args={owner:r.owner}
  await assert.rejects(client.request('acquire',args,{id,timeoutMs:30}),error=>error.requestId===id)
  await until(()=>r.state().clientStarts===1)
  const pending=await r.client().request('acquire',args,{id});assert.equal(pending.reused,true);assert.equal(pending.result.state,'pending')
  writeFileSync(join(r.dir,'resume-open'),'owned barrier release')
  await until(()=>inspectKeeperRequest(r.dir,id,client.generation).state==='completed')
  const recovered=await r.client().request('acquire',args,{id});assert.equal(recovered.reused,true);assert.equal(r.state().clientStarts,1)
  // Caller-supplied resource/owner observations are never retirement evidence.
  assert.throws(()=>r.client().request('release',{...recovered.result,outcome:'completed'}),/outside control scope/)
  await r.client().request('release',{token:recovered.result.token,generation:client.generation,outcome:'completed'})
  await r.client().request('shutdown');assert.equal((await r.done).code,0);ok=true
 }finally{await r.cleanup(ok)}
})
test('request-id argument mismatch refuses and stale tokens cannot close a successor',{timeout:20000},async()=>{
 const r=await rig();let ok=false
 try{
  const id=randomUUID(),a=await r.client().request('acquire',{owner:r.owner},{id})
  await assert.rejects(r.client().request('acquire',{owner:{...r.owner,pid:r.owner.pid+10000}},{id}),/different arguments/)
  const releaseId=randomUUID(),released=await r.client().request('release',{token:a.result.token,generation:a.generation,outcome:'completed'},{id:releaseId})
  const b=await r.client().request('acquire',{owner:r.owner})
  const old=await r.client().request('release',{token:a.result.token,generation:a.generation,outcome:'completed'},{id:releaseId});assert.equal(old.reused,true);assert.deepEqual(old.result,released.result)
  await assert.rejects(r.client().request('release',{token:a.result.token,generation:a.generation,outcome:'completed'}),/stale-or-foreign/)
  assert.equal((await r.client().request('status')).result.phase,'leased')
  await r.client().request('release',{token:b.result.token,generation:b.generation,outcome:'completed'});await r.client().request('shutdown');ok=true
 }finally{await r.cleanup(ok)}
})
test('wrong epoch, unsafe key permissions and failed authentication create no action',{timeout:20000},async()=>{
 const r=await rig();let ok=false
 try{
  assert.throws(()=>connectKeeperResident({dir:r.dir,epoch:'f'.repeat(64)}),/not ready/)
  const registration=JSON.parse(readFileSync(join(r.dir,'resident.json'))),key=join(r.dir,registration.authFile)
  chmodSync(key,0o644);assert.throws(()=>r.client(),/private control path/);chmodSync(key,0o600)
  const socket=connect(join(r.dir,'s'));await once(socket,'connect');let out='';socket.on('data',b=>out+=b)
  socket.end(JSON.stringify({v:1,id:randomUUID(),generation:registration.generation,auth:'0'.repeat(64),op:'acquire',args:{owner:r.owner}})+'\n');await once(socket,'close')
  assert.equal(JSON.parse(out).error.reason,'control authentication refused');assert.equal(r.state().clientStarts,0)
  await r.client().request('shutdown');ok=true
 }finally{await r.cleanup(ok)}
})
test('live inspection fences runtime drift rather than reporting saved readiness',{timeout:20000},async()=>{
 const r=await rig();let ok=false
 try{
  writeFileSync(join(r.dir,'drift'),'owned synthetic runtime drift')
  await assert.rejects(r.client().request('status'),/live-resource-inspection-failed/)
  assert.equal(JSON.parse(readFileSync(join(r.dir,'keeper.json'))).phase,'fenced')
  await assert.rejects(r.client().request('acquire',{owner:r.owner}),/not-idle/);assert.equal(r.state().clientStarts,0);ok=true
 }finally{await r.cleanup(ok)}
})
test('resident loss leaves the exact pending intent and refuses a replacement generation',{timeout:20000},async()=>{
 const r=await rig();let ok=false
 try{
  writeFileSync(join(r.dir,'pause-open'),'owned barrier');const id=randomUUID(),client=r.client()
  const pending=client.request('acquire',{owner:r.owner},{id,timeoutMs:4000});const refused=assert.rejects(pending,error=>error.requestId===id)
  await until(()=>r.state().clientStarts===1);r.child.kill('SIGKILL');await r.done;await refused
  assert.equal(inspectKeeperRequest(r.dir,id,client.generation).state,'pending')
  const next=spawn(process.execPath,[fixture,r.dir],{detached:true,stdio:['ignore','ignore','ignore']});const [code]=await once(next,'exit');assert.equal(code,1)
  assert.equal(r.state().opens,1,'replacement must not overwrite the first resource evidence or open another')
  assert.equal(JSON.parse(readFileSync(join(r.dir,'keeper.json'))).phase,'leased');ok=true
 }finally{await r.cleanup(ok)}
})
