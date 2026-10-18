import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {once} from 'node:events'
import {connect} from 'node:net'
import {mkdtempSync,lstatSync,fstatSync,readFileSync,existsSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createKeeperLifetime} from '../../candidates/input-keeper/lifetime.mjs'
import {acquireKernelLock} from '../../lib/kernel-lock.mjs'
import {ownedGroupMembers} from '../../lib/ui-lease-owner.mjs'

const fixture=fileURLToPath(new URL('./keeper-fixture.mjs',import.meta.url)),epoch='a'.repeat(64)
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function until(fn){const end=Date.now()+5000;while(!await fn()){if(Date.now()>end)throw Error('fixture observation deadline');await sleep(10)}}
const alive=c=>c&&c.exitCode===null&&c.signalCode===null
function start(role,args=[],fds=[]){
 const child=spawn(process.execPath,[fixture,role,...args],{detached:true,stdio:['ignore','ignore','pipe',...fds,'ipc']})
 child.stderr.on('data',b=>child.fixtureStderr=(child.fixtureStderr??'')+b)
 child.ready=once(child,'message').then(([m])=>{assert.equal(m.type,'ready');return m})
 child.done=once(child,'exit').then(([code,signal])=>({code,signal}))
 return child
}
let request=0
function rpc(child,type,extra={}){
 return new Promise((resolve,reject)=>{
  const id=++request,timer=setTimeout(()=>finish(Error('fixture IPC deadline')),2000)
  const finish=(error,result)=>{clearTimeout(timer);child.off('message',message);child.off('exit',exit);error?reject(error):resolve(result)}
  const message=m=>{if(m.id===id)finish(null,m)},exit=()=>finish(Error('fixture exited before receipt'))
  child.on('message',message);child.once('exit',exit);child.send({id,type,...extra},e=>{if(e)finish(e)})
 })
}
async function rig(){
 const root=mkdtempSync('/private/tmp/keeper-contract-'),evidence=join(root,'keeper.json'),path=join(root,'s'),lockPath=join(root,'ui.lock')
 const owners=[],releases=[],state={epoch,opens:0,clientOpens:0,retireFails:false,settleReady:true},sentinel=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'})
 let resource,keeperConnection,keeper,passed=false
 const contend=()=>spawnSync(process.execPath,['--input-type=module','-e',`import{acquireKernelLock}from${JSON.stringify(new URL('../../lib/kernel-lock.mjs',import.meta.url).href)};try{const r=await acquireKernelLock(${JSON.stringify(lockPath)},{timeoutMs:80});r();console.log('acquired')}catch(e){console.log(e.category)}`],{encoding:'utf8',timeout:2000}).stdout.trim()
 const adapters={
  runtimeEpoch:async()=>state.epoch,
  openResource:async()=>{
   state.opens++;resource=start('resource',[path]);await resource.ready
   keeperConnection=connect(path);keeperConnection.on('error',()=>{});await once(keeperConnection,'connect');return resource
  },
  observeResource:async()=>{
   if(!alive(resource))return {alive:false}
   const probe=await rpc(resource,'probe'),s=lstatSync(path)
   return {alive:true,uiLockInherited:probe.lock!==null?true:false,identity:{pid:resource.pid,group:resource.pid,socketPath:path,socketDev:s.dev,socketIno:s.ino}}
  },
  observeOwner:async proposed=>{
   if(proposed.pid===process.pid){
    const retained=releases.some(release=>{try{const s=fstatSync(release.fd);return s.dev===proposed.lock.dev&&s.ino===proposed.lock.ino}catch{return false}})
    return {alive:true,owner:proposed,kernelLockHeld:retained&&contend()==='lock_timeout'}
   }
   const c=owners.find(x=>x.child.pid===proposed.pid)
   return {alive:alive(c?.child),owner:proposed,kernelLockHeld:alive(c?.child)&&c.ready.lock.dev===proposed.lock.dev&&c.ready.lock.ino===proposed.lock.ino&&contend()==='lock_timeout'}
  },
  openClient:async({owner,signal})=>{
   state.clientOpens++;const c=owners.find(x=>x.child.pid===owner.pid).child
   await rpc(c,'connect',{path})
   if(state.failAfterConnect)throw Error('synthetic partial client creation')
   state.clientConnected=true
   if(state.pauseClient&&!signal.aborted)await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}))
   return c
  },
  retireClient:async({owner})=>{
   if(state.retireFails)return {clientsRetired:false,workerPeersRetired:false}
   const c=owners.find(x=>x.child.pid===owner.pid).child
   if(alive(c))await rpc(c,'close')
   else await c.done
   await until(async()=>(await ownedGroupMembers(c.pid)).filter(pid=>pid!==c.pid).length===0)
   await until(async()=>(await rpc(resource,'probe')).clients===1)
   return {clientsRetired:true,workerPeersRetired:true}
  },
  settleInput:async()=>{
   state.settlementEntered=true
   await until(()=>state.settleReady)
   return {verified:true,lockHolder:state.guardian}
  },
  closeResource:async()=>{
   keeperConnection.end();await once(keeperConnection,'close')
   await until(async()=>(await rpc(resource,'probe')).clients===0)
   await rpc(resource,'stop');const helperExit=await resource.done
   return {clientsRetired:true,helperExit,resourceAbsent:!existsSync(path),forced:false}
  }
 }
 keeper=await createKeeperLifetime({evidence,epoch},adapters)
 async function lease(){
  const release=await acquireKernelLock(lockPath);releases.push(release)
  const s=lstatSync(lockPath),child=start('owner',[],[release.fd]),ready=await child.ready
  const group=Number(spawnSync('/bin/ps',['-p',String(process.pid),'-o','pgid='],{encoding:'utf8'}).stdout.trim())
  state.guardian={pid:process.pid,group,lock:{dev:s.dev,ino:s.ino}}
  owners.push({child,ready});return {child,guardians:[state.guardian],release:async()=>{if(alive(child)){child.send({type:'exit'});await child.done}release()},owner:{pid:child.pid,group:child.pid,lock:{dev:s.dev,ino:s.ino}}}
 }
 async function cleanup(ok){
  passed=ok
  assert.equal(alive(sentinel),true,'unrelated service preserved throughout candidate work')
  for(const {child}of owners)if(alive(child)){child.kill('SIGKILL');await child.done}
  for(const release of releases)release()
  keeperConnection?.destroy()
  if(alive(resource)){resource.kill('SIGTERM');await resource.done}
  sentinel.kill('SIGTERM');await once(sentinel,'exit')
  // Successful negative gates deliberately retain a fenced candidate. Their
  // synthetic children above are test-owned, never native/shared services.
  if(passed)rmSync(root,{recursive:true,force:true});else console.log('retained failed keeper contract '+root)
 }
 return {root,evidence,state,keeper,adapters,lease,contend,cleanup,get resource(){return resource}}
}

test('one helper spans sequential real client groups; the coordinator guard excludes another constructor',{timeout:15000},async()=>{
 const r=await rig();let ok=false
 try{
  const id=await r.keeper.start()
  await assert.rejects(createKeeperLifetime({evidence:r.evidence,epoch,guardTimeoutMs:80},r.adapters),e=>e.category==='lock_timeout')
  const a=await r.lease(),first=await r.keeper.acquire({owner:a.owner,guardians:a.guardians})
  assert.notEqual(first.resource.group,a.child.pid);assert.equal(r.contend(),'lock_timeout')
  await assert.rejects(r.keeper.shutdown(),/not-safely-idle/)
  assert.equal((await r.keeper.release({...first,outcome:'completed'})).helperRetained,true);a.release()
  assert.equal(alive(r.resource),true)
  const b=await r.lease(),second=await r.keeper.acquire({owner:b.owner,guardians:b.guardians})
  assert.deepEqual(second.resource,id);assert.notEqual(second.token,first.token)
  await assert.rejects(r.keeper.release({...first,outcome:'completed'}),/stale-or-foreign/)
  await r.keeper.release({...second,outcome:'completed'});b.release()
  await r.keeper.shutdown();assert.equal(r.state.opens,1);assert.equal(r.state.clientOpens,2)
  const next=await createKeeperLifetime({evidence:r.evidence,epoch},r.adapters)
  assert.notEqual(next.snapshot().generation,first.generation)
  await next.start();await next.shutdown();ok=true
 }finally{await r.cleanup(ok)}
})

test('cancellation retains kernel exclusion until independent settlement, without retiring the helper',{timeout:15000},async()=>{
 const r=await rig();let ok=false
 try{
  await r.keeper.start();const a=await r.lease(),lease=await r.keeper.acquire({owner:a.owner,guardians:a.guardians})
  r.state.settleReady=false
  const done=r.keeper.release({...lease,outcome:'cancelled'})
  await until(()=>r.state.settlementEntered)
  assert.equal(r.contend(),'lock_timeout');assert.equal(alive(r.resource),true)
  await assert.rejects(r.keeper.acquire({owner:a.owner,guardians:a.guardians}),/operation-in-progress/)
  r.state.settleReady=true
  const receipt=await done;assert.equal(receipt.outcome,'cancelled');assert.equal(receipt.replayAllowed,false)
  assert.equal(alive(r.resource),true);await a.release();assert.equal(r.contend(),'acquired')
  await r.keeper.shutdown();ok=true
 }finally{r.state.settleReady=true;await r.cleanup(ok)}
})

test('owner SIGKILL leaves an unknown operation, preserves helper and retires only the lost client',{timeout:15000},async()=>{
 const r=await rig();let ok=false
 try{
  await r.keeper.start();const a=await r.lease(),lease=await r.keeper.acquire({owner:a.owner,guardians:a.guardians})
  a.child.kill('SIGKILL');await a.child.done
  const receipt=await r.keeper.release({...lease,outcome:'owner-lost'})
  assert.equal(receipt.outcome,'owner-lost');assert.equal(receipt.replayAllowed,false);assert.equal(alive(r.resource),true)
  assert.equal(r.contend(),'lock_timeout');await a.release();await r.keeper.shutdown();ok=true
 }finally{await r.cleanup(ok)}
})

test('runtime drift fences future clients and a new generation cannot adopt the saved PID',{timeout:15000},async()=>{
 const r=await rig();let ok=false
 try{
  await r.keeper.start();const a=await r.lease();r.state.epoch='b'.repeat(64)
  await assert.rejects(r.keeper.acquire({owner:a.owner,guardians:a.guardians}),/lease-admission-unverified/)
  assert.equal(r.state.clientOpens,0);assert.equal(r.state.opens,1);assert.equal(alive(r.resource),true)
  await assert.rejects(createKeeperLifetime({evidence:r.evidence,epoch},r.adapters),/unreconciled-prior-generation/)
  assert.equal(JSON.parse(readFileSync(r.evidence)).phase,'fenced');await a.release();ok=true
 }finally{await r.cleanup(ok)}
})

test('partial admission and uncertain client retirement stay fenced with no replay or helper shutdown',{timeout:15000},async()=>{
 const r=await rig();let ok=false
 try{
  await r.keeper.start();const a=await r.lease();r.state.failAfterConnect=true;r.state.retireFails=true
  await assert.rejects(r.keeper.acquire({owner:a.owner,guardians:a.guardians}),/client-admission-unverified/)
  const snapshot=r.keeper.snapshot();assert.equal(snapshot.phase,'fenced');assert.equal(snapshot.leases[0].outcome,'unknown')
  assert.equal(alive(a.child),true);assert.equal(alive(r.resource),true);assert.equal(r.contend(),'lock_timeout')
  await assert.rejects(r.keeper.shutdown(),/not-safely-idle/)
  await assert.rejects(r.keeper.acquire({owner:a.owner,guardians:a.guardians}),/not-idle/)
  r.state.retireFails=false
  const receipt=await r.keeper.release({token:snapshot.leases[0].token,generation:snapshot.generation,outcome:'unknown'})
  assert.equal(receipt.outcome,'unknown');assert.equal(r.keeper.snapshot().phase,'fenced')
  await assert.rejects(createKeeperLifetime({evidence:r.evidence,epoch},r.adapters),/unreconciled-prior-generation/)
  await a.release();ok=true
 }finally{await r.cleanup(ok)}
})

test('helper loss refuses a successful receipt and never starts a replacement or second action',{timeout:15000},async()=>{
 const r=await rig();let ok=false
 try{
  await r.keeper.start();const a=await r.lease(),lease=await r.keeper.acquire({owner:a.owner,guardians:a.guardians})
  r.resource.kill('SIGKILL');await r.resource.done
  await assert.rejects(r.keeper.release({...lease,outcome:'completed'}),/lease-retirement-unverified/)
  assert.equal(r.state.opens,1);assert.equal(r.state.clientOpens,1)
  assert.equal(r.keeper.snapshot().phase,'fenced');assert.equal(r.contend(),'lock_timeout');await a.release();ok=true
 }finally{await r.cleanup(ok)}
})

test('cancellation during client admission reconciles the exact partial client and retains the failure fence',{timeout:15000},async()=>{
 const r=await rig();let ok=false
 try{
  await r.keeper.start();const a=await r.lease(),controller=new AbortController();r.state.pauseClient=true
  const pending=r.keeper.acquire({owner:a.owner,guardians:a.guardians,signal:controller.signal})
  const rejected=assert.rejects(pending,/client-admission-unverified/)
  await until(()=>r.state.clientConnected);controller.abort();await rejected
  const snapshot=r.keeper.snapshot()
  assert.equal(snapshot.phase,'fenced');assert.equal(snapshot.leases[0].outcome,'unknown')
  assert.equal(snapshot.leases[0].retirement.clientsRetired,true)
  assert.equal(r.state.clientOpens,1);assert.equal(alive(r.resource),true)
  await a.release();ok=true
 }finally{await r.cleanup(ok)}
})

test('loss of every registered lock holder fences retirement even after client EOF',{timeout:15000},async()=>{
 const r=await rig();let ok=false
 try{
  await r.keeper.start();const a=await r.lease(),lease=await r.keeper.acquire({owner:a.owner,guardians:a.guardians})
  a.child.kill('SIGKILL');await a.child.done;await a.release()
  assert.equal(r.contend(),'acquired')
  await assert.rejects(r.keeper.release({...lease,outcome:'owner-lost'}),/lease-retirement-unverified/)
  assert.equal(r.keeper.snapshot().phase,'fenced');assert.equal(alive(r.resource),true)
  await assert.rejects(createKeeperLifetime({evidence:r.evidence,epoch},r.adapters),/unreconciled-prior-generation/)
  ok=true
 }finally{await r.cleanup(ok)}
})
