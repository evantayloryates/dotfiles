#!/usr/bin/env node
// Actual current MCP launchers, exact owned broker and native host signal.
// Idle-only mode uses no model turn; fresh-turn mode uses one owned diagnostic.
// Neither mode uses app restart, keyboard input or broker recovery.
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {brokerInfo} from '../lib/broker.mjs'
import {STATE_DIR,writeJsonAtomic} from '../lib/state.mjs'
import {sessionEvents} from '../lib/events.mjs'
import {RUNTIME_BUILD,runtimeFingerprint} from '../lib/build.mjs'
import {recordMemory} from '../lib/memory.mjs'
import {deliver} from '../lib/peer.mjs'
import {randomBytes} from 'node:crypto'
import {recipientReplyEvidence} from '../lib/qualification.mjs'
if(process.argv.length!==3||!['--run-owned-native-idle-service','--run-owned-native-turn-idle-service'].includes(process.argv[2]))throw Error('explicit owned native idle service flag required')
const freshTurn=process.argv[2]==='--run-owned-native-turn-idle-service'
const sid='local_35b3ba48-f02e-48de-bfbb-925192d90de1',epoch={sessionId:sid,pid:71262,procStart:'Wed Oct  7 03:24:51 2026'},clients=[]
const report=join(STATE_DIR,'pressure','native-idle-service-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'),out={scope:'owned-native-idle-cross-harness-service',freshTurn,epoch,runtimeBuild:RUNTIME_BUILD,ok:false,releaseAuthorized:false}
const same=()=>{const i=brokerInfo();return i.sessionId===sid&&i.live?.pid===epoch.pid&&i.live.procStart===epoch.procStart&&i.runtime?.integrity}
function client(name){
 const child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{stdio:['pipe','pipe','pipe']}),rl=createInterface({input:child.stdout}),pending=new Map();let id=0,stderrBytes=0
 child.stderr.on('data',x=>stderrBytes+=x.length)
 rl.on('line',line=>{let r;try{r=JSON.parse(line)}catch{return};const p=pending.get(r.id);if(p){pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error('MCP protocol failure')):p.resolve(r.result)}})
 child.on('exit',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('owned MCP closed before response'))}pending.clear()})
 const request=(method,params)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('owned MCP request timeout'))},7000);pending.set(n,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,method,params})+'\n')})
 const c={request,call:args=>request('tools/call',{name:'broker_idle',arguments:args}),ready:request('initialize',{protocolVersion:'2025-06-18',clientInfo:{name,version:'native-idle-v2'}}),close:async()=>{
  if(child.exitCode===null){child.stdin.end();await new Promise(resolve=>{const timer=setTimeout(()=>child.kill('SIGTERM'),2000);child.once('close',()=>{clearTimeout(timer);resolve()})})}rl.close();return {name,exitCode:child.exitCode,stderrBytes}
 }};clients.push(c);return c
}
try{
 assert.ok(same());const cursor=sessionEvents({session:sid}).cursor
 const a=client('claude-driver-native-idle-a'),b=client('claude-driver-native-idle-b');await Promise.all([a.ready,b.ready])
 const schema=(await a.request('tools/list',{})).tools.find(t=>t.name==='broker_idle');assert.equal(schema.annotations.readOnlyHint,true);assert.equal(schema.inputSchema.properties.session,undefined)
 out.startedAt=Date.now();let pulse,marker
 if(freshTurn){
  const i=brokerInfo();assert.equal(i.live.status,'idle');marker=randomBytes(16).toString('hex')
  pulse=await deliver(i,'claude-driver owned idle-signal qualification '+marker+'. Complete this diagnostic turn with exactly '+marker+'. No tools, requests, waiter, maintenance, recovery or settings changes.',{method:'direct',priority:'now',timeoutMs:5000})
  out.pulse={msgId:pulse.msgId,pid:pulse.pid,procStart:pulse.procStart}
 }
 const replies=await Promise.all([a.call({not_before:out.startedAt,cache_ms:0,timeout_sec:freshTurn?5:3}),b.call({not_before:out.startedAt,cache_ms:0,timeout_sec:freshTurn?5:3})]);assert.ok(replies.every(r=>!r.isError))
 out.initial=replies.map(r=>r.structuredContent);assert.equal(out.initial[0].observationId,out.initial[1].observationId)
 const final=await Promise.all([a.call({not_before:out.startedAt,cache_ms:3000}),b.call({not_before:out.startedAt,cache_ms:3000})]);assert.ok(final.every(r=>!r.isError));out.final=final.map(r=>r.structuredContent)
 assert.ok(out.final.every(r=>r.verified&&r.observedIdle&&r.observationId===out.initial[0].observationId&&r.joined&&r.freshTurnCompletion===freshTurn&&r.releaseAuthorized===false&&r.quiescenceVerified===false))
 out.elapsedMs=Date.now()-out.startedAt;out.afterSameEpoch=same();assert.ok(out.afterSameEpoch)
 const events=sessionEvents({session:sid,cursor,include_text:freshTurn,include_causality:true,limit:100});out.turnEvents=events.events.filter(r=>['user','assistant'].includes(r.type)).map(r=>({id:r.id,type:r.type}))
 if(freshTurn){
  out.replyEvidence=recipientReplyEvidence(events.events,{messageId:pulse.msgId,marker});assert.ok(out.replyEvidence.verified)
  assert.ok(events.events.filter(e=>e.type==='user').every(e=>e.peerMessageId===pulse.msgId));assert.ok(events.events.filter(e=>e.type==='assistant').every(e=>!e.tools?.length))
  const terminal=events.events.find(e=>out.replyEvidence.replyEventIds.includes(e.id));assert.ok(out.final[0].finishedAt>=Date.parse(terminal.at))
 }else assert.equal(out.turnEvents.length,0)
 out.ok=true
}catch(e){out.failure=String(e.message).slice(0,300)}finally{out.launchers=await Promise.all(clients.map(c=>c.close()))}
out.sourceChanged=runtimeFingerprint()!==RUNTIME_BUILD;out.ok=out.ok&&!out.sourceChanged
writeJsonAtomic(report,out);recordMemory({kind:'test_result',topic:'native-idle-observer',source:'owned-cross-harness-native-probe',status:out.ok?'passed':'failed',evidence:report,lesson:'Actual current MCP harnesses share native host idle signaling and distinguish stale from fresh completion. A fresh diagnostic uses one short tool-free model turn; observation has no inference. Host signal is not serving readiness, full queue quiescence or native task success.'});console.log(JSON.stringify({report,...out}));process.exitCode=out.ok?0:1
