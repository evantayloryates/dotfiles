#!/usr/bin/env node
// Bounded, explicitly invoked native read experiment on the existing broker.
// Sequence, concurrent clients, or distinct-target batches; no new chats,
// keyboard input, replay or recovery.
import {existsSync} from 'node:fs'
import {join} from 'node:path'
import {brokerInfo,brokerRequest} from '../lib/broker.mjs'
import {installStopRescue,stopRescuePolicy} from '../lib/stop-rescue.mjs'
import {inspectRequest} from '../lib/requests.mjs'
import {BROKER_DIR,STATE_DIR,writeJsonAtomic,loadRegistry} from '../lib/state.mjs'
import {getRecord} from '../lib/sessions.mjs'
import {RUNTIME_BUILD,runtimeFingerprint} from '../lib/build.mjs'
import {recordMemory} from '../lib/memory.mjs'
import {sleep} from '../lib/paths.mjs'
if(process.argv[2]!=='--run-owned-compact-probe'||(process.argv.length-3)%2)throw Error('explicit --run-owned-compact-probe [--count 1..5] [--mode sequence|concurrent|batch] required')
const options={}
for(let i=3;i<process.argv.length;i+=2){const key=process.argv[i];if(!['--count','--mode'].includes(key)||Object.hasOwn(options,key))throw Error('unknown or repeated probe option');options[key]=process.argv[i+1]}
const count=options['--count']===undefined?2:Number(options['--count']),mode=options['--mode']??'sequence'
if(!Number.isInteger(count)||count<1||count>5)throw Error('native read count must be 1..5')
if(!['sequence','concurrent','batch'].includes(mode))throw Error('unknown native read mode')
const sid='local_35b3ba48-f02e-48de-bfbb-925192d90de1',epoch={sessionId:sid,pid:71262,procStart:'Wed Oct  7 03:24:51 2026'},report=join(STATE_DIR,'pressure','native-compact-read-sequence-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json')
const same=i=>i.sessionId===sid&&i.live?.pid===epoch.pid&&i.live.procStart===epoch.procStart&&i.live.entrypoint==='claude-desktop'&&i.runtime?.integrity&&i.permissionMode==='bypassPermissions'&&!i.handoffStopped
const timeoutMs=90000
const out={suite:'guarded native reads with compact one-shot continuation',mode,count,timeoutMs,runtimeBuild:RUNTIME_BUILD,brokerSessionId:sid,rows:[],ok:false}
let prior,installed
try{
 const before=brokerInfo();prior=stopRescuePolicy()
 if(!same(before)||before.live.status!=='idle'||before.resident?.resident||!prior||prior.quietWait||existsSync(join(BROKER_DIR,'stop-rescue-arm.json'))||existsSync(join(BROKER_DIR,'quiet-hook-owner.json')))throw Error('exact idle unarmed broker admission refused')
 out.dependencyBuild=before.runtime.build;out.generation=before.runtime.generation;out.priorHookBuild=prior.build
 installed=await installStopRescue({...epoch,upgrade:true,feedbackVersion:2,quietWaitMs:0})
 out.installedHookBuild=installed.build;out.handlerSha256=installed.sha256;out.settingsHash=installed.settingsHash
 await sleep(1500)
 const ops=[{op:'get_session',args:{session_id:sid}}]
 if(mode==='batch'){
  const fixture='local_fc1e5eab-9d24-4e4c-a09c-9a386a6ffe14',cwd=join(STATE_DIR,'probe','v2-2026-10-07T04-37-49-840Z'),owned=loadRegistry().sessions[fixture],rec=getRecord(fixture)
  if(owned?.kind!=='create'||owned.cwd!==cwd||rec?.cwd!==cwd||rec.isArchived!==true)throw Error('exact archived owned batch fixture admission refused')
  ops.push({op:'get_session',args:{session_id:fixture}})
 }
 const run=async i=>{
  const before=brokerInfo();if(!same(before))throw Error('native epoch or admission changed')
  const start=Date.now(),row={i,operations:ops.map(o=>({op:o.op,sessionId:o.args.session_id})),before:{status:before.live.status,resident:before.resident,waiterReadiness:before.waiterReadiness},progress:[]};out.rows.push(row)
  try{const r=await brokerRequest(ops,{timeoutMs,progress:x=>row.progress.push(x)});row.ok=r.receiptSource==='native-tool-result'&&r.results.length===ops.length&&r.results.every((x,i)=>x.op===ops[i].op&&x.ok===true);row.result={id:r.id,ms:r.ms,receiptSource:r.receiptSource,operations:r.results.map(x=>({op:x.op,ok:x.ok,nativeToolUseId:x.nativeToolUseId}))}}
  catch(e){row.ok=false;row.error={category:e.category,requestId:e.detail?.requestId};if(row.error.requestId){const r=inspectRequest(row.error.requestId);row.error.state=r.state;row.error.retrySafe=r.retrySafe;row.error.dispatched=r.dispatched}}
  finally{row.wallMs=Date.now()-start}
  return row
 }
 if(mode==='concurrent'){const settled=await Promise.allSettled(Array.from({length:count},(_,i)=>run(i)));out.clientFailures=settled.flatMap((r,i)=>r.status==='rejected'?[{i,error:String(r.reason?.message).slice(0,200)}]:[])}
 else for(let i=0;i<count;i++){const row=await run(i);if(!row.ok)break}
 out.sourceChanged=runtimeFingerprint()!==RUNTIME_BUILD
 out.ok=out.rows.length===count&&out.rows.every(r=>r.ok&&r.result.receiptSource==='native-tool-result')&&!out.clientFailures?.length&&!out.sourceChanged
}catch(e){out.failure=String(e.message).slice(0,300)}finally{
 if(installed&&!out.ok){
  const until=Date.now()+10000
  while(Date.now()<until&&same(brokerInfo())&&brokerInfo().live.status!=='idle')await sleep(250)
  const current=brokerInfo()
  if(same(current)&&current.live.status==='idle'&&!existsSync(join(BROKER_DIR,'stop-rescue-arm.json'))&&!existsSync(join(BROKER_DIR,'quiet-hook-owner.json'))){try{const reverted=await installStopRescue({...epoch,upgrade:true,feedbackVersion:prior.feedbackVersion??1,quietWaitMs:0});out.feedbackReverted=true;out.finalHookBuild=reverted.build}catch{out.revertPending='owned hook restore refused; preserve current policy and review'}}
  else out.revertPending='native epoch/busy/arm must be reconciled; no unsafe install'
 }
 const after=brokerInfo();out.after={pid:after.live?.pid,procStart:after.live?.procStart,status:after.live?.status,integrity:after.runtime?.integrity,handoffStopped:after.handoffStopped,quietVerified:after.quietHook?.verified}
 writeJsonAtomic(report,out);recordMemory({kind:'test_result',topic:'compact-native-continuation',source:'owned-native-experiment',status:out.ok?'passed':'failed',evidence:report,lesson:'Bounded consecutive reads, one pulse/rescue per ID; fixed shorter tool-first feedback tested without model change, new chat, keyboard input or recovery. Native receipts alone establish serving.'})
 console.log(JSON.stringify({report,...out}));process.exitCode=out.ok?0:1
}
