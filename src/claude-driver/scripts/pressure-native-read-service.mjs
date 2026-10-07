#!/usr/bin/env node
// One owned diagnostic turn exercises one durable metadata batch shared by two
// MCP harnesses. No mutations, recovery, keyboard input or new desktop chats.
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {join} from 'node:path'
import {brokerInfo} from '../lib/broker.mjs'
import {getRecord,readPins} from '../lib/sessions.mjs'
import {STATE_DIR,BROKER_DIR,writeJsonAtomic} from '../lib/state.mjs'
import {RUNTIME_BUILD,runtimeFingerprint} from '../lib/build.mjs'
import {recordMemory} from '../lib/memory.mjs'
import {ownedBytes,bytesHash} from '../lib/temporary-hooks.mjs'
if(process.argv.length!==3||process.argv[2]!=='--run-owned-native-read-service')throw Error('explicit owned native read service flag required')
const sid='local_35b3ba48-f02e-48de-bfbb-925192d90de1',fixture='local_fc1e5eab-9d24-4e4c-a09c-9a386a6ffe14',epoch={sessionId:sid,pid:71262,procStart:'Wed Oct  7 03:24:51 2026'},clients=[]
const report=join(STATE_DIR,'pressure','native-read-service-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'),out={scope:'owned-cross-harness-deterministic-metadata-read',runtimeBuild:RUNTIME_BUILD,epoch,ok:false,releaseAuthorized:false}
function client(name){
 const child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{stdio:['pipe','pipe','pipe']}),rl=createInterface({input:child.stdout}),pending=new Map();let id=0,stderrBytes=0
 child.stderr.on('data',x=>stderrBytes+=x.length);rl.on('line',line=>{let r;try{r=JSON.parse(line)}catch{return};const p=pending.get(r.id);if(p){pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error('owned MCP protocol failure')):p.resolve(r.result)}})
 const request=(method,params)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('owned MCP wait expired; reconcile existing job'))},45000);pending.set(n,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,method,params})+'\n')})
 const c={request,call:async(name,args)=>{const r=await request('tools/call',{name,arguments:args});if(r.isError)throw Error('owned MCP tool refused');return r.structuredContent},ready:request('initialize',{protocolVersion:'2025-06-18',clientInfo:{name,version:'native-read-v2'}}),close:async()=>{if(child.exitCode===null){child.stdin.end();await new Promise(resolve=>{const timer=setTimeout(()=>child.kill('SIGTERM'),2000);child.once('close',()=>{clearTimeout(timer);resolve()})})}rl.close();return {name,exitCode:child.exitCode,stderrBytes}}};clients.push(c);return c
}
const same=()=>{const b=brokerInfo();return b.sessionId===sid&&b.live?.pid===epoch.pid&&b.live.procStart===epoch.procStart&&b.runtime.integrity}
try{
 assert.ok(same());assert.equal(brokerInfo().live.status,'idle');const f=getRecord(fixture);assert.equal(f.cwd,join(STATE_DIR,'probe','v2-2026-10-07T04-37-49-840Z'));assert.equal(f.isArchived,true);assert.equal(readPins().has(fixture),false)
 const settings=bytesHash(ownedBytes(join(BROKER_DIR,'.claude','settings.json'))),policy=bytesHash(ownedBytes(join(BROKER_DIR,'stop-rescue-policy.json')))
 const a=client('claude-driver-native-read-a'),b=client('claude-driver-native-read-b');await Promise.all([a.ready,b.ready])
 const args={operation:'broker_read_batch',arguments:{sessions:[fixture,sid,fixture],experimental:true,timeout_sec:20},idempotency_key:'owned-native-read-'+randomUUID(),timeout_sec:40}
 const started=Date.now(),submitted=await Promise.all([a.call('driver_submit',args),b.call('driver_submit',args)]);assert.equal(submitted[0].jobId,submitted[1].jobId);out.jobId=submitted[0].jobId
 out.publisher=await a.close();assert.equal(out.publisher.exitCode,0)
 const result=await b.call('driver_wait',{job_id:out.jobId,timeout_sec:35,include_result:true});out.jobState=result.state;out.elapsedMs=Date.now()-started
 if(result.error)out.jobError={category:result.error.category,detail:result.error.detail}
 assert.equal(result.state,'completed');const r=result.result
 assert.equal(r.receiptSource,'native-hook-result');assert.equal(r.uniqueNativeReads,2);assert.equal(r.requestedReads,3);assert.equal(r.triggerInferenceTurns,1);assert.equal(r.executionInference,false);assert.equal(r.results[0].receipt.uuid,r.results[2].receipt.uuid)
 assert.notEqual(r.results[0].receipt.uuid,r.results[1].receipt.uuid);assert.ok(r.results.every(x=>x.verified&&x.metadata.sessionId===x.sessionId))
 for(const row of r.results){const rec=getRecord(row.sessionId);assert.equal(row.metadata.isArchived,rec.isArchived);if(row.metadata.pinned!==null)assert.equal(row.metadata.pinned,readPins().has(row.sessionId))}
 out.native={id:r.id,evidence:r.evidence,uniqueReads:r.uniqueNativeReads,requestedReads:r.requestedReads,triggerInferenceTurns:r.triggerInferenceTurns,executionInference:r.executionInference,receipts:r.results.map(x=>({sessionId:x.sessionId,...x.receipt}))}
 const reattached=await b.call('driver_submit',args);assert.equal(reattached.jobId,out.jobId);assert.equal(reattached.reused,true);assert.equal(reattached.state,'completed')
 out.settingsRestored=bytesHash(ownedBytes(join(BROKER_DIR,'.claude','settings.json')))===settings&&bytesHash(ownedBytes(join(BROKER_DIR,'stop-rescue-policy.json')))===policy;assert.equal(out.settingsRestored,true)
 assert.ok(same());out.ok=true
}catch(e){out.failure=String(e.message).slice(0,300)}finally{out.launchers=await Promise.all(clients.map(c=>c.close()));out.sourceChanged=runtimeFingerprint()!==RUNTIME_BUILD;out.ok=out.ok&&!out.sourceChanged;writeJsonAtomic(report,out);recordMemory({kind:'test_result',topic:'native-read-batch',source:'owned-cross-harness-native-probe',status:out.ok?'passed':'failed',evidence:report,lesson:'Two MCP harnesses share one durable experimental native metadata batch; publisher disconnect does not restart work. Duplicate targets coalesce, distinct native hook attachment receipts bind targets, exact settings restore and idempotent reattach prevent replay. Mutation routing remains unqualified.'});console.log(JSON.stringify({report,...out}));process.exitCode=out.ok?0:1}
