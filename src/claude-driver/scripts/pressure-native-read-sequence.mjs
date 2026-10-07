#!/usr/bin/env node
// Bounded, explicitly invoked native experiment. Two read-only requests on the
// existing broker; no other chats, keyboard input, retries or recovery.
import {existsSync} from 'node:fs'
import {join} from 'node:path'
import {brokerInfo,brokerRequest} from '../lib/broker.mjs'
import {installStopRescue,stopRescuePolicy} from '../lib/stop-rescue.mjs'
import {inspectRequest} from '../lib/requests.mjs'
import {BROKER_DIR,STATE_DIR,writeJsonAtomic} from '../lib/state.mjs'
import {RUNTIME_BUILD,runtimeFingerprint} from '../lib/build.mjs'
import {recordMemory} from '../lib/memory.mjs'
import {sleep} from '../lib/paths.mjs'
if(process.argv[2]!=='--run-owned-compact-probe'||![3,5].includes(process.argv.length)||process.argv.length===5&&process.argv[3]!=='--count')throw Error('explicit --run-owned-compact-probe [--count 1..5] required')
const count=process.argv.length===5?Number(process.argv[4]):2
if(!Number.isInteger(count)||count<1||count>5)throw Error('native read count must be 1..5')
const sid='local_35b3ba48-f02e-48de-bfbb-925192d90de1',epoch={sessionId:sid,pid:71262,procStart:'Wed Oct  7 03:24:51 2026'},report=join(STATE_DIR,'pressure','native-compact-read-sequence-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json')
const same=i=>i.sessionId===sid&&i.live?.pid===epoch.pid&&i.live.procStart===epoch.procStart&&i.live.entrypoint==='claude-desktop'&&i.runtime?.integrity&&i.permissionMode==='bypassPermissions'&&!i.handoffStopped
const timeoutMs=90000
const out={suite:'consecutive native reads with compact one-shot continuation',count,timeoutMs,runtimeBuild:RUNTIME_BUILD,brokerSessionId:sid,rows:[],ok:false}
let prior,installed
try{
 const before=brokerInfo();prior=stopRescuePolicy()
 if(!same(before)||before.live.status!=='idle'||before.resident?.resident||!prior||prior.quietWait||existsSync(join(BROKER_DIR,'stop-rescue-arm.json'))||existsSync(join(BROKER_DIR,'quiet-hook-owner.json')))throw Error('exact idle unarmed broker admission refused')
 out.dependencyBuild=before.runtime.build;out.generation=before.runtime.generation;out.priorHookBuild=prior.build
 installed=await installStopRescue({...epoch,upgrade:true,feedbackVersion:2,quietWaitMs:0})
 out.installedHookBuild=installed.build;out.handlerSha256=installed.sha256;out.settingsHash=installed.settingsHash
 await sleep(1500)
 for(let i=0;i<count;i++){
  const before=brokerInfo();if(!same(before))throw Error('native epoch or admission changed')
  const row={i,before:{status:before.live.status,resident:before.resident,waiterReadiness:before.waiterReadiness},progress:[]};out.rows.push(row)
  try{const r=await brokerRequest([{op:'get_session',args:{session_id:sid}}],{timeoutMs,progress:x=>row.progress.push(x)});row.ok=r.receiptSource==='native-tool-result'&&r.results.length===1&&r.results[0].op==='get_session'&&r.results[0].ok===true;row.result={id:r.id,ms:r.ms,receiptSource:r.receiptSource,operations:r.results.map(x=>({op:x.op,ok:x.ok,nativeToolUseId:x.nativeToolUseId}))};if(!row.ok)break}
  catch(e){row.ok=false;row.error={category:e.category,requestId:e.detail?.requestId};if(row.error.requestId){const r=inspectRequest(row.error.requestId);row.error.state=r.state;row.error.retrySafe=r.retrySafe;row.error.dispatched=r.dispatched}break}
 }
 out.sourceChanged=runtimeFingerprint()!==RUNTIME_BUILD
 out.ok=out.rows.length===count&&out.rows.every(r=>r.ok&&r.result.receiptSource==='native-tool-result')&&!out.sourceChanged
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
