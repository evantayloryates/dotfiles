#!/usr/bin/env node
// Execute the installed desktop tool handler with isolated manager/telemetry
// stubs. No live app IPC, prompts, session changes, permissions or process signals.
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {installedDesktopChunk} from '../lib/installed-desktop-source.mjs'
import {cutInstalledFunction} from '../lib/installed-source.mjs'
import {stopReceipt} from '../lib/stop-receipt.mjs'
import {STATE_DIR,writeJsonAtomic} from '../lib/state.mjs'
import {versions} from '../lib/paths.mjs'
import {recordMemory} from '../lib/memory.mjs'
const report=join(STATE_DIR,'pressure','native-stop-contract-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'),rows=[]
const sid='local_00000000-0000-4000-8000-000000000001',caller='local_00000000-0000-4000-8000-000000000002'
const out={scope:'installed-desktop-stop-handler-isolated',versions:versions(),rows,ok:false,limitations:['Exact installed tool handler with synthetic manager and telemetry','No live interruption, native SDK transport or broker recovery qualification']}
try{
 const source=installedDesktopChunk('/Applications/Claude.app/Contents/Resources/app.asar','.vite/build/index.chunk-B5tintml.js')
 assert.equal(source.sha256,'f5d162e3e6047c12ca0cee15d72574e316513df6a65d52e89e2d456a4a3022ff')
 const handler=cutInstalledFunction(source.text,'async function up(','async function dp(')
 out.source={member:source.member,sha256:source.sha256,handlerHash:createHash('sha256').update(handler).digest('hex')}
 const context={Au:'stop_session',ku:'unarchive_session',ju:'clear_session',zu:'detach_session',Pu:'set_remote_control',Kf:new Set(),
  _d:x=>x.session_id,ud:()=> 'stop',bu:(id,c)=>({isSelf:id===c.sessionId,sessionId:id}),lp:(m,id)=>m.sideSessionAwaitsPerson(id),W:x=>x,
  w:{n:text=>({content:[{type:'text',text}]}),t:text=>({isError:true,content:[{type:'text',text}]})},
  t:{Zt:()=>{}},require:name=>{assert.equal(name,'./index.chunk-muI2IV6k.js');return {ho:{notificationService:{isUserViewingSession:()=>false}}}}}
 const native=runInNewContext(`(${handler})`,context,{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}})
 const check=async(name,config,expected,calls)=>{
  const observed=[];const manager={permissionBroker:{consumeArchiveStandDown:()=>false},getSession:async()=>({title:'synthetic',isRunning:true,...config.record}),sideSessionAwaitsPerson:()=>config.awaitsPerson===true,interruptSession:async(id,trigger)=>{observed.push({id,trigger});return config.interruptResult??'interrupted'}}
  const value=await native('stop_session',{session_id:config.self?caller:sid},{sessionId:caller},manager)
  assert.equal(stopReceipt(value,sid).state,expected);assert.equal(observed.length,calls)
  for(const call of observed){assert.equal(call.id,sid);assert.equal(call.trigger,'agent')}
  rows.push({name,ok:true,receiptState:expected,interruptCalls:observed.length})
 }
 await check('human answer waiting refuses before interrupt',{awaitsPerson:true},'unknown',0)
 await check('held user message declines despite successful tool envelope',{interruptResult:'skipped'},'unknown',1)
 await check('reconnecting host remains requested, not stopped',{interruptResult:'queued'},'requested',1)
 await check('accepted agent interrupt has exact positive receipt',{},'stopped',1)
 await check('idle does not invoke interrupt',{record:{isRunning:false}},'already_idle',0)
 await check('starting does not invoke interrupt',{record:{starting:true}},'unknown',0)
 await check('archived does not invoke interrupt',{record:{isArchived:true}},'unknown',0)
 await check('self cannot be interrupted',{self:true},'unknown',0)
 out.ok=true
}catch(e){out.failure={name:e.name,message:String(e.message).slice(0,500)}}
writeJsonAtomic(report,out);recordMemory({kind:'test_result',topic:'native-stop-contract',source:'installed-desktop-synthetic-contract',status:out.ok?'passed':'failed',evidence:report,lesson:'Exact installed native stop handler preserves human-input and held-user-message refusal, reconnect-pending and accepted agent interruption distinctions. Isolated contract does not qualify live transport.'});console.log(JSON.stringify({report,ok:out.ok,checks:rows.length,...out.failure?{failure:out.failure}:{}}));process.exitCode=out.ok?0:1
