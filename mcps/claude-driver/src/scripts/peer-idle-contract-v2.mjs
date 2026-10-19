#!/usr/bin/env node
// Exact installed idle-subscription mechanics on synthetic queues/timers.
// No socket, credential, session registration, app call or inference.
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {installedModuleContaining,installedWindowContaining,cutInstalledFunction as cut} from '../lib/installed-source.mjs'
import {resolveClaudeBinary,versions} from '../lib/paths.mjs'
import {STATE_DIR,writeJsonAtomic} from '../lib/state.mjs'
import {recordMemory} from '../lib/memory.mjs'
const report=join(STATE_DIR,'pressure','peer-idle-contract-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'),rows=[],hash=s=>createHash('sha256').update(s).digest('hex')
let out={scope:'installed-peer-idle-isolated',versions:versions(),rows,ok:false,limitations:['Synthetic policy, timers, queues, registry and sender; not a native notification','Idle notice is a host-state signal, not complete queue quiescence or release authority']}
try{
 const binary=resolveClaudeBinary(),source=installedModuleContaining(binary,'function m_r('),host=installedWindowContaining(binary,'notePeerIdleStatus:be,enqueueIdleNoticesForModel:Te}',{before:180,after:2000})
 assert.ok(source.text.includes('p_r=f(()=>u({action:R("notify_when_idle"),from:o(),msg_id:o(),from_mode:ie().optional()}))'))
 assert.ok(host.text.includes('K(r.sessionState.stateChanged.subscribe((Ie)=>{be(Ie==="idle",Ie==="running")}))'))
 const clazz=cut(source.text,'class z{','var d='),core=cut(source.text,'function m_r(','function ee('),requeue=cut(source.text,'function B(e){','function UJt('),announce=cut(source.text,'function F(e,n,i=!1){','function $Ln(')
 out.sources={module:{offset:source.offset,sha256:source.sha256},host:{offset:host.offset,sha256:host.sha256},coreHash:hash(clazz+core+requeue+announce)}
 function make(){
  const notices=[],timers=[],unavailable=[];let now=1000,queued=0,parked=0,policy='accept'
  const context={T:43200000,Hst:32,j:8,Y:4,Q:4,L:750,K:30000,Date:{now:()=>now},MXe:x=>/^[a-f0-9-]{36}$/.test(x),dC:x=>x,uAe:()=>policy,x_r:()=>policy,q:()=> 'synthetic',j3n:()=>queued,Bst:()=>parked,
   t:()=>{},p:()=>{},m:()=>{},y:()=>{},c:()=>{},Rm:String,p2:String,G:(xs,p)=>xs.filter(p).length,ee:()=> 'PRIVATE_DETAIL',H:(pid,auth)=>pid!==undefined||auth,W:()=> 'failed',UJt:(...x)=>unavailable.push(x),
   setTimeout:(fn,ms)=>{const timer={fn,ms,unref(){}};timers.push(timer);return timer},clearTimeout:timer=>timer.cancelled=true}
  const api=runInNewContext(`(()=>{${clazz};const d=new z;${core}${requeue}${announce};return {subscribe:m_r,status:HLn,flush:MLn,tick:Z,state:d}})()`,context,{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}})
  api.state.sendNotice=async(target,notice)=>notices.push({target,...notice})
  api.state.registeredInboxOfPid=async()=>new Map()
  const subscribe=(id='11111111-1111-4111-8111-111111111111',target='/synthetic/reply.sock',pid=2)=>api.subscribe('uds:'+target,target,id,pid,'synthetic-start',true,'bypass',false)
  return {api,notices,timers,unavailable,subscribe,time:v=>now=v,queued:v=>queued=v,parked:v=>parked=v,policy:v=>policy=v,settle:()=>Promise.all([...api.state.inflight])}
 }
 const check=async(name,fn)=>{await fn();rows.push({name,ok:true})}
 await check('headless host mounts real idle/running state subscription; registration itself does not start a model',async()=>{
  const x=make();assert.equal(x.subscribe(),'recorded');assert.equal(x.api.state.pendingAnnounces.length,1);assert.equal(x.notices.length,0);assert.equal(x.timers.length,0)
 })
 await check('busy-to-idle notice is correlated, debounced and consumed once without private detail for an unregistered caller',async()=>{
  const x=make();x.subscribe();x.api.status(false,true);x.api.status(true,false);assert.equal(x.timers[0].ms,750);x.api.tick();await x.settle();assert.equal(x.notices.length,1);assert.equal(x.notices[0].state,'idle');assert.equal(x.notices[0].finished_at,1000);assert.equal(x.notices[0].orig_msg_id,'11111111-1111-4111-8111-111111111111');assert.equal(x.notices[0].detail,undefined);x.api.tick();await x.settle();assert.equal(x.notices.length,1)
 })
 await check('already-idle registration schedules a notice but cannot claim a newly completed turn',async()=>{
  const x=make();x.api.status(true,false);x.subscribe();x.api.tick();await x.settle();assert.equal(x.notices.length,1);assert.equal(x.notices[0].finished_at,undefined)
 })
 await check('queued work or parked approval holds back idle delivery',async()=>{
  for(const kind of ['queued','parked']){const x=make();x.subscribe();x.api.status(true,false);x[kind](1);x.api.tick();await x.settle();assert.equal(x.notices.length,0);x[kind](0);x.api.tick();await x.settle();assert.equal(x.notices.length,1)}
 })
 await check('same verified PID/address refreshes subscription; policy and twelve-hour expiry refuse stale firing',async()=>{
  const x=make();x.subscribe();x.subscribe('22222222-2222-4222-8222-222222222222');assert.equal(x.api.state.subscribers.length,1);assert.equal(x.api.state.subscribers[0].origMsgId,'22222222-2222-4222-8222-222222222222');x.time(43201001);x.api.status(true,false);x.api.tick();await x.settle();assert.equal(x.notices.length,0);assert.equal(x.api.state.subscribers.length,0)
  const denied=make();denied.policy('refuse');assert.equal(denied.subscribe(),'refused');assert.equal(denied.api.state.subscribers.length,0)
 })
 await check('exit while not idle produces exited, not a fabricated completion notice',async()=>{
  const x=make();x.subscribe();await x.api.flush('exited');assert.equal(x.notices[0].state,'exited');assert.equal(x.api.state.exited,true);assert.equal(x.subscribe(),'full')
 })
 out.ok=true
}catch(e){out.failure=String(e.message).slice(0,500)}
writeJsonAtomic(report,out);recordMemory({kind:'test_result',topic:'peer-idle-control',source:'installed-source-isolated',status:out.ok?'passed':'failed',evidence:report,lesson:'Exact headless peer idle subscription uses host state, debounce and queue/approval holdback without user-message dispatch. Already-idle signals do not prove a new turn or full release quiescence.'});console.log(JSON.stringify({report,ok:out.ok,checks:rows.length,...out.failure?{failure:out.failure}:{}}));process.exitCode=out.ok?0:1
