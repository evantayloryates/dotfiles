import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdtempSync,rmSync,readFileSync,writeFileSync,symlinkSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const isolatedState=mkdtempSync(join(tmpdir(),'idle-test-state-'))
process.env.CLAUDE_DRIVER_STATE_DIR=isolatedState
const {observeNativeIdle,idleLeaseKey}=await import('../lib/native-idle.mjs')
after(()=>rmSync(isolatedState,{recursive:true,force:true}))
const target={sessionId:'local_00000000-0000-4000-8000-000000000001',live:{pid:12345,procStart:'synthetic exact epoch'}}
const meta=()=>({msgId:randomUUID(),listenerSourceHash:'a'.repeat(64),hostSourceHash:'b'.repeat(64),moduleSourceHash:'c'.repeat(64)})
const notice=state=>({state,finishedAt:Date.now()-1000,receivedAt:Date.now(),kernelPeerPid:target.live.pid,kernelPeerUid:process.getuid(),detailPresent:false})
function scope(){const dir=mkdtempSync(join(tmpdir(),'idle-lease-'));return {dir,sameEpoch:()=>true}}
test('concurrent harnesses share publication; timestamp freshness never becomes release authority',async()=>{
 const deps=scope();let calls=0,release,started
 deps.exchange=async(_,{onPublishing})=>{calls++;onPublishing(meta());started=true;await new Promise(r=>release=r);return {notice:notice('idle'),listenerRemoved:true}}
 try{
  const first=observeNativeIdle(target,{notBefore:Date.now()},deps)
  while(!started)await new Promise(r=>setTimeout(r,5))
  const other=await observeNativeIdle(target,{},deps);assert.equal(other.state,'pending');assert.equal(other.joined,true);assert.equal(calls,1)
  release();const r=await first;assert.equal(r.verified,true);assert.equal(r.observedIdle,true);assert.equal(r.freshTurnCompletion,false);assert.equal(r.releaseAuthorized,false);assert.equal(r.quiescenceVerified,false)
  const reused=await observeNativeIdle(target,{notBefore:1},deps);assert.equal(reused.observationId,r.observationId);assert.equal(reused.freshTurnCompletion,true);assert.equal(calls,1)
 }finally{release?.();rmSync(deps.dir,{recursive:true,force:true})}
})
test('zero cache never reuses a received observation even in the same clock millisecond',async()=>{
 const deps=scope(),clock=Date.now,now=clock();let calls=0
 deps.exchange=async(_,{onPublishing})=>{calls++;onPublishing(meta());return {notice:notice('idle'),listenerRemoved:true}}
 try{Date.now=()=>now;const first=await observeNativeIdle(target,{cacheMs:0},deps),second=await observeNativeIdle(target,{cacheMs:0},deps);assert.notEqual(second.observationId,first.observationId);assert.equal(calls,2)}finally{Date.now=clock;rmSync(deps.dir,{recursive:true,force:true})}
})
test('cancelled, dead or timed-out listeners retain native debt; later harness does not republish',async()=>{
 for(const failureCategory of ['cancelled','idle_observer_timeout','idle_observer_unconfirmed']){
  const deps=scope();let calls=0;deps.exchange=async(_,{onPublishing})=>{calls++;onPublishing(meta());return {failureCategory,listenerRemoved:true}}
  try{const r=await observeNativeIdle(target,{},deps);assert.equal(r.pendingRemoteSubscription,true);assert.equal(r.nativeSubscriptionCancelled,false);const joined=await observeNativeIdle(target,{},deps);assert.equal(joined.observationId,r.observationId);assert.equal(joined.joined,true);assert.equal(calls,1)}finally{rmSync(deps.dir,{recursive:true,force:true})}
 }
})
test('pre-publication cancellation creates no native subscription; proven no-write can retry',async()=>{
 const deps=scope();let calls=0;deps.exchange=async(_,{onPublishing})=>{calls++;onPublishing(meta());return {definitelyUndispatched:true,listenerRemoved:true}}
 try{const controller=new AbortController();controller.abort();await assert.rejects(observeNativeIdle(target,{signal:controller.signal},deps),e=>e.category==='cancelled');assert.equal(calls,0);const r=await observeNativeIdle(target,{},deps);assert.equal(r.pendingRemoteSubscription,false);await observeNativeIdle(target,{},deps);assert.equal(calls,2)}finally{rmSync(deps.dir,{recursive:true,force:true})}
})
test('unavailable and exited are observations, never idle; changed epoch or private malformed receipt cannot verify',async()=>{
 for(const state of ['unavailable','exited','idle']){
  const deps=scope();deps.sameEpoch=()=>state!=='idle';deps.exchange=async(_,{onPublishing})=>{onPublishing(meta());return {notice:notice(state),listenerRemoved:true}}
  try{const r=await observeNativeIdle(target,{},deps);assert.equal(r.observedIdle,false);assert.equal(r.verified,state!=='idle');assert.equal(r.releaseAuthorized,false)}finally{rmSync(deps.dir,{recursive:true,force:true})}
 }
 const deps=scope();deps.exchange=async(_,{onPublishing})=>{onPublishing(meta());return {notice:{...notice('idle'),state:{PRIVATE_CONTENT:true}},listenerRemoved:true}}
 try{const r=await observeNativeIdle(target,{},deps);assert.equal(r.verified,false);assert.equal(r.pendingRemoteSubscription,true);assert.ok(!JSON.stringify(r).includes('PRIVATE_CONTENT'))}finally{rmSync(deps.dir,{recursive:true,force:true})}
})
test('native expiry admits a new subscription, but corrupt or symlinked leases fail closed',async()=>{
 const deps=scope();let calls=0;deps.exchange=async(_,{onPublishing})=>{calls++;onPublishing(meta());return {listenerRemoved:true}}
 const file=join(deps.dir,idleLeaseKey({sessionId:target.sessionId,pid:target.live.pid,procStart:target.live.procStart})+'.json')
 try{
  await observeNativeIdle(target,{},deps);const row=JSON.parse(readFileSync(file));row.createdAt=Date.now()-43220000;row.remoteExpiresAt=row.createdAt+43210000;writeFileSync(file,JSON.stringify(row));await observeNativeIdle(target,{},deps);assert.equal(calls,2)
  writeFileSync(file,'corrupt');await assert.rejects(observeNativeIdle(target,{},deps),e=>e.category==='idle_observer_invalid');assert.equal(calls,2)
  rmSync(file);symlinkSync(join(deps.dir,'missing'),file);await assert.rejects(observeNativeIdle(target,{},deps),e=>e.category==='idle_observer_invalid');assert.equal(calls,2)
 }finally{rmSync(deps.dir,{recursive:true,force:true})}
})
test('service mailbox survives caller cancellation or deadline and is adopted without republishing',async()=>{
 for(const cancel of [true,false]){
  const deps=scope();let calls=0,mailbox,id,timer,abort
  const controller=new AbortController()
  deps.exchange=async(_,{onPublishing})=>{calls++;const m=meta();id=m.msgId;mailbox=onPublishing({...m,helperPid:process.pid}).mailbox
   if(cancel)abort=setTimeout(()=>controller.abort(),50)
   timer=setTimeout(()=>writeFileSync(mailbox,JSON.stringify({...notice('idle'),ok:true,msgId:id,listenerRemoved:true,writeAttempted:true,subscriptionSent:true})),1500)
   return {serviceOwned:true,publicationConfirmed:true}
  }
  try{
   const first=await observeNativeIdle(target,{signal:controller.signal,timeoutSec:1},deps)
   assert.equal(first.callerWait,cancel?'cancelled':'timed_out');assert.equal(first.pendingRemoteSubscription,true)
   const adopted=await observeNativeIdle(target,{timeoutSec:2},deps)
   assert.equal(adopted.verified,true);assert.equal(adopted.callerWait,'completed');assert.equal(adopted.observationId,first.observationId);assert.equal(adopted.joined,true);assert.equal(calls,1)
  }finally{clearTimeout(timer);clearTimeout(abort);rmSync(deps.dir,{recursive:true,force:true})}
 }
})
test('durable mailbox receipt requires its nonce and refuses linked evidence',async()=>{
 const deps=scope();let mailbox,calls=0
 deps.exchange=async(_,{onPublishing})=>{calls++;mailbox=onPublishing({...meta(),helperPid:process.pid}).mailbox;writeFileSync(mailbox,JSON.stringify({...notice('idle'),ok:true,msgId:randomUUID(),listenerRemoved:true}));return {serviceOwned:true}}
 try{
  const result=await observeNativeIdle(target,{timeoutSec:0.1},deps);assert.equal(result.verified,false);assert.equal(result.pendingRemoteSubscription,true)
  await observeNativeIdle(target,{timeoutSec:0.1},deps);assert.equal(calls,1)
 }finally{rmSync(deps.dir,{recursive:true,force:true})}
 const other=scope();other.exchange=async(_,{onPublishing})=>{const path=onPublishing({...meta(),helperPid:process.pid}).mailbox;symlinkSync(join(other.dir,'private'),path);return {serviceOwned:true}}
 try{await assert.rejects(observeNativeIdle(target,{timeoutSec:0.1},other),e=>e.category==='idle_observer_invalid')}finally{rmSync(other.dir,{recursive:true,force:true})}
})
