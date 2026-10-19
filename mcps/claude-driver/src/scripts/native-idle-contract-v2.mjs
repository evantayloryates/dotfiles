#!/usr/bin/env node
// Execute the exact installed native idle predicate and export projection on
// synthetic state. No app IPC, settings, tools, conversations or inference.
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {installedDesktopChunk,SNAPSHOT_SOURCE_SHA} from '../lib/installed-desktop-source.mjs'
import {cutInstalledFunction} from '../lib/installed-source.mjs'
import {summarizeNativeSnapshot} from '../lib/native-export-snapshot.mjs'
import {STATE_DIR,writeJsonAtomic} from '../lib/state.mjs'
import {versions} from '../lib/paths.mjs'
import {recordMemory} from '../lib/memory.mjs'
const report=join(STATE_DIR,'pressure','native-idle-contract-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'),rows=[]
const hash=x=>createHash('sha256').update(x).digest('hex')
let source,out={scope:'installed-desktop-idle-and-export-contract',versions:versions(),rows,ok:false,limitations:['Exact installed functions with synthetic state, not a live queue observation','Idle predicate alone cannot authorize release or retire historical unknown effects']}
try{
 source=installedDesktopChunk('/Applications/Claude.app/Contents/Resources/app.asar');assert.equal(source.sha256,SNAPSHOT_SOURCE_SHA)
 const names=[['wC','TC'],['PC','FC'],['FC','IC'],['LC','RC'],['RC','zC'],['BC','VC'],['HC','UC']]
 const functions=names.map(([a,b])=>cutInstalledFunction(source.text,'function '+a+'(','function '+b+'(')).join('')
 const capture=cutInstalledFunction(source.text,'c={capturedAt:new Date(o).toISOString()',';return n.xt(').slice(2)
 out.source={member:source.member,sha256:source.sha256,functionsHash:hash(functions),projectionHash:hash(capture)}
 let now=1_000_000,featureFlag=false
 const context={bC:120000,Date:class extends Date{static now(){return now}},t:{WJ:()=>featureFlag},wn:()=> 'synthetic',dy:()=>false,Qr:messages=>messages.some(x=>x.type==='tool_use')}
 const native=runInNewContext(`(()=>{${functions};return {idle:HC,capture:(i)=>{const o=Date.now(),e='owned',a='owned-cli',s={hasPendingPermission:false,hasLiveWorkflows:false,hasBackgroundWork:false};return ${capture}}}})()`,context,{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}})
 const baseline=()=>({isRunning:false,cliLastTurnMessageWasResult:true,cliAtTurnBoundaryHint:true,messageBuffer:[]})
 const options=()=>({sessionId:'owned',cliSessionId:'owned-cli',notBefore:now,notAfter:now,projectionSourceSha:source.sha256})
 const check=(name,fn)=>{fn();rows.push({name,ok:true})}
 check('actual baseline idle projection represents absent queues as null and background tasks as a map',()=>{
  const state=baseline(),raw=native.capture(state);assert.equal(native.idle(state),true);assert.equal(raw.awaitingTurnResult,null);assert.equal(raw.activeBackgroundTasks,null)
  const sanitized=summarizeNativeSnapshot(raw,options());assert.equal(sanitized.queueStateComplete,true);assert.equal(sanitized.idleCandidate,true);assert.equal(sanitized.releaseAuthorized,false)
  const active=summarizeNativeSnapshot(native.capture({...state,activeBackgroundTasks:new Map([['private',{prompt:'PRIVATE'}]])}),options());assert.equal(active.activeBackgroundTasks,1);assert.equal(active.idleCandidate,false);assert.ok(!JSON.stringify(active).includes('PRIVATE'))
 })
 check('native idle requires a true result boundary; undefined or false refuses by default',()=>{
  for(const value of [undefined,false])assert.equal(native.idle({...baseline(),cliLastTurnMessageWasResult:value}),false)
  assert.equal(native.idle({...baseline(),cliLastTurnMessageWasResult:undefined},{acceptUndefinedBoundary:true}),true)
 })
 check('pending cycle, fresh echo, held steer, input and fresh interrupt block native idle',()=>{
  for(const change of [{pendingCycle:{}},{pendingEchoUuids:new Map([['private',now]])},{heldSteers:{entries:[{msg:{uuid:'private'}}]}},{inputStream:{hasPending:()=>true}},{interruptResultPending:{since:now}}])assert.equal(native.idle({...baseline(),...change}),false)
 })
 check('two-minute expiry does not erase pending echoes but native idle ignores them',()=>{
  const state={...baseline(),pendingEchoUuids:new Map([['private',now-120000]])};assert.equal(native.idle(state),false);now++;assert.equal(native.idle(state),true);assert.equal(state.pendingEchoUuids.size,1)
  assert.equal(summarizeNativeSnapshot(native.capture(state),options()).idleCandidate,false)
 })
 check('expired interrupt or enabled feature gate can be native idle while interrupt remains',()=>{
  for(const since of [now-120001,now]){featureFlag=since===now;const state={...baseline(),interruptResultPending:{since,cycleArmed:true}};assert.equal(native.idle(state),true);assert.equal(summarizeNativeSnapshot(native.capture(state),options()).idleCandidate,false)}featureFlag=false
 })
 check('native predicate does not gate visible running, next cycle, deferred send, awaiting result, tools or task map',()=>{
  for(const change of [{isRunning:true},{nextCycleUuid:'private'},{deferredSends:[{msg:{uuid:'private'}}]},{awaitingTurnResultSince:now},{messageBuffer:[{type:'tool_use'}]},{activeBackgroundTasks:new Map([['private',{}]])}]){const state={...baseline(),...change};assert.equal(native.idle(state),true);assert.equal(summarizeNativeSnapshot(native.capture(state),options()).idleCandidate,false)}
 })
 const current=installedDesktopChunk('/Applications/Claude.app/Contents/Resources/app.asar');assert.equal(current.sha256,source.sha256);out.ok=true
}catch(e){out.failure=String(e.message).slice(0,500)}
writeJsonAtomic(report,out);recordMemory({kind:'test_result',topic:'native-idle-contract',source:'installed-desktop-synthetic-contract',status:out.ok?'passed':'failed',evidence:report,lesson:'Native idle is a bounded app predicate, not complete service quiescence. Exact source/export projection contracts retain old echoes and queued markers; no release or historical effect authority.'})
console.log(JSON.stringify({report,ok:out.ok,checks:rows.length,...(out.failure?{failure:out.failure}:{})}));process.exitCode=out.ok?0:1
