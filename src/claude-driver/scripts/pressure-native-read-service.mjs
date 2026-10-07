#!/usr/bin/env node
// One owned diagnostic turn exercises one durable metadata batch shared by two
// MCP harnesses. Optional fault mode kills only this test's exact owned Node
// job worker, then recovers expired service settings. Never native processes.
import assert from 'node:assert/strict'
import {spawn,execFileSync} from 'node:child_process'
import {createInterface} from 'node:readline'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {join} from 'node:path'
import {existsSync} from 'node:fs'
import {sessionEvents} from '../lib/events.mjs'
import {sleep} from '../lib/paths.mjs'
import {brokerInfo} from '../lib/broker.mjs'
import {getRecord,readPins} from '../lib/sessions.mjs'
import {STATE_DIR,BROKER_DIR,writeJsonAtomic} from '../lib/state.mjs'
import {RUNTIME_BUILD,runtimeFingerprint} from '../lib/build.mjs'
import {recordMemory} from '../lib/memory.mjs'
import {ownedBytes,bytesHash} from '../lib/temporary-hooks.mjs'
import {jobFile} from '../lib/jobs.mjs'
const cancelPressure=process.argv[2]==='--run-owned-native-read-cancel'
const workerLoss=process.argv[2]==='--run-owned-native-read-worker-loss'
const reconciliationOnly=process.argv[2]==='--reconcile-owned-native-read'
if(reconciliationOnly?process.argv.length!==5||!/^[a-f0-9-]{36}$/.test(process.argv[3])||!/^j[a-f0-9]{32}$/.test(process.argv[4]):process.argv.length!==3||!['--run-owned-native-read-service','--run-owned-native-read-cancel','--run-owned-native-read-worker-loss'].includes(process.argv[2]))throw Error('explicit owned native read service flag required')
const sid='local_35b3ba48-f02e-48de-bfbb-925192d90de1',fixture='local_fc1e5eab-9d24-4e4c-a09c-9a386a6ffe14',epoch={sessionId:sid,pid:71262,procStart:'Wed Oct  7 03:24:51 2026'},clients=[]
const report=join(STATE_DIR,'pressure','native-read-service-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'),out={scope:'owned-cross-harness-deterministic-metadata-read',runtimeBuild:RUNTIME_BUILD,epoch,cancelPressure,workerLoss,reconciliationOnly,ok:false,releaseAuthorized:false}
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
 if(reconciliationOnly){
  const id=process.argv[3],jobId=process.argv[4],cursor=sessionEvents({session:sid}).cursor,plan=JSON.parse(ownedBytes(join(STATE_DIR,'native-reads',id+'.json'))),job=JSON.parse(ownedBytes(jobFile(jobId)))
  assert.deepEqual(plan.epoch,epoch);assert.equal(job.operation,'broker_read_batch');assert.equal(job.state,'outcome_unknown');assert.equal(job.workerPid,plan.ownerPid);assert.deepEqual(plan.targets,[fixture,sid]);assert.ok(job.progress.some(x=>x.message==='native-read:'+id+':published'))
  out.jobId=jobId;out.reconciliation=await b.call('broker_read_reconcile',{id,experimental:true});const r=out.reconciliation
  assert.equal(r.originalOutcomeUnchanged,true);assert.equal(r.originalRuntimeBuild,plan.runtimeBuild);assert.equal(r.reviewRuntimeBuild,RUNTIME_BUILD);assert.equal(r.originalPhase,'published');assert.equal(r.uniqueNativeReads,2);assert.equal(r.inferenceTurns,0);assert.equal(r.replay,false);assert.equal(r.metadataCurrent,false);assert.ok(r.results.every(x=>x.verified&&x.metadataCurrent===false))
  assert.equal((await a.call('driver_job',{job_id:jobId})).state,'outcome_unknown');assert.equal(sessionEvents({session:sid,cursor,include_causality:true,limit:100}).events.filter(x=>x.type==='user').length,0)
  assert.equal(bytesHash(ownedBytes(join(BROKER_DIR,'.claude','settings.json'))),settings);assert.equal(bytesHash(ownedBytes(join(BROKER_DIR,'stop-rescue-policy.json'))),policy);assert.equal(existsSync(join(BROKER_DIR,'mechanical-probe.json')),false);assert.ok(same());out.ok=true
 }else if(workerLoss){
  const cursor=sessionEvents({session:sid}).cursor,args={operation:'broker_read_batch',arguments:{sessions:[fixture,sid],experimental:true,timeout_sec:20},idempotency_key:'owned-native-worker-loss-'+randomUUID(),timeout_sec:40}
  const job=await a.call('driver_submit',args);out.jobId=job.jobId
  let status,plan;const until=Date.now()+8000
  while(Date.now()<until){
   const j=await a.call('driver_job',{job_id:job.jobId}),progress=j.progress?.map(x=>x.message).filter(x=>/^native-read:[a-f0-9-]{36}:/.test(x)).at(-1)
   if(progress){status=await a.call('broker_read_status',{id:progress.split(':')[1]});if(status.phase==='published'){plan=JSON.parse(ownedBytes(status.evidence));break}}
   assert.ok(!['completed','failed','cancelled','outcome_unknown'].includes(j.state),'owned job became terminal before fault boundary');await sleep(25)
  }
  assert.ok(plan,'owned worker publication boundary not observed; inspect existing job')
  const privateJob=JSON.parse(ownedBytes(jobFile(job.jobId))),pid=plan.ownerPid
  assert.equal(privateJob.workerPid,pid);assert.equal(privateJob.operation,'broker_read_batch');assert.equal(privateJob.state,'running');assert.ok(Number.isInteger(pid)&&pid>1&&pid!==epoch.pid&&pid!==process.pid)
  const ps=field=>execFileSync('/bin/ps',['-p',String(pid),'-o',field+'='],{encoding:'utf8',timeout:1000,env:{PATH:'/usr/bin:/bin',LC_ALL:'C',TZ:'UTC'}}).trim()
  assert.equal(ps('lstart'),plan.ownerStart);assert.equal(ps('command'),process.execPath+' '+fileURLToPath(new URL('./job-worker.mjs',import.meta.url))+' '+job.jobId)
  assert.ok(same());assert.equal(status.cleanupPending,true)
  out.fault={batchId:status.id,workerPid:pid,workerStart:plan.ownerStart,phase:status.phase,publicationAttempted:status.publicationAttempted};writeJsonAtomic(report,out)
  process.kill(pid,'SIGKILL')
  let gone=false;for(let i=0;i<100;i++){try{process.kill(pid,0)}catch(e){if(e.code==='ESRCH'){gone=true;break}throw e}await sleep(25)}assert.equal(gone,true,'owned worker death not established; do not retry kill')
  const lost=await b.call('driver_job',{job_id:job.jobId});assert.equal(lost.state,'outcome_unknown');assert.equal(lost.error.category,'worker_lost');out.lostState=lost.state
  const reattach=await b.call('driver_submit',args);assert.equal(reattach.jobId,job.jobId);assert.equal(reattach.reused,true);assert.equal(reattach.state,'outcome_unknown')
  const pending=await b.call('broker_read_status',{id:status.id});assert.equal(pending.ownerState,'gone');assert.equal(pending.cleanupPending,true);out.pending=pending
  while(Date.now()<=plan.expiresAt)await sleep(Math.min(250,plan.expiresAt-Date.now()+1))
  assert.ok(same());assert.equal(brokerInfo().live.status,'idle')
  out.recovery=await b.call('broker_read_recover',{id:status.id,experimental:true});assert.equal(out.recovery.originalOutcomeUnchanged,true);assert.equal(out.recovery.restorationRecorded,true);assert.equal(out.recovery.cleanupPending,false);assert.equal(out.recovery.phase,'published')
  const settled=await b.call('driver_job',{job_id:job.jobId});assert.equal(settled.state,'outcome_unknown');out.finalJobState=settled.state
  const old=await b.call('driver_submit',args);assert.equal(old.jobId,job.jobId);assert.equal(old.state,'outcome_unknown');assert.equal(old.reused,true)
  out.settingsRestored=bytesHash(ownedBytes(join(BROKER_DIR,'.claude','settings.json')))===settings&&bytesHash(ownedBytes(join(BROKER_DIR,'stop-rescue-policy.json')))===policy;assert.equal(out.settingsRestored,true);assert.equal(existsSync(join(BROKER_DIR,'mechanical-probe.json')),false);assert.ok(same())
  const users=sessionEvents({session:sid,cursor,include_causality:true,limit:100}).events.filter(e=>e.type==='user');assert.equal(users.length,1);assert.equal(users[0].peerMessageId,plan.peer.msgId);out.nativeUserTurns=users.map(e=>({id:e.id,peerMessageId:e.peerMessageId}));out.ok=true
 }else if(cancelPressure){
  const cursor=sessionEvents({session:sid}).cursor,rows=[];out.rows=rows
  const submit=async c=>{const args={operation:'broker_read_batch',arguments:{sessions:[fixture,sid,fixture],experimental:true,timeout_sec:20},idempotency_key:'owned-native-cancel-'+randomUUID(),timeout_sec:40};const j=await c.call('driver_submit',args);return {args,jobId:j.jobId}}
  const phase=async(c,j,wanted)=>{
   const until=Date.now()+8000
   while(Date.now()<until){const job=await c.call('driver_job',{job_id:j.jobId});const progress=job.progress?.map(x=>x.message).filter(x=>/^native-read:[a-f0-9-]{36}:/.test(x)).at(-1)
    if(progress){const id=progress.split(':')[1],status=await c.call('broker_read_status',{id});if(wanted.includes(status.phase))return {id,status}}
    if(['completed','cancelled','failed','outcome_unknown'].includes(job.state))throw Error('owned job became terminal before intended cancellation boundary')
    await sleep(25)
   }throw Error('owned cancellation boundary observation expired; inspect existing job')
  }
  const cancel=async(c,j,boundary)=>{const started=Date.now();await c.call('driver_cancel',{job_id:j.jobId});const terminal=await c.call('driver_wait',{job_id:j.jobId,timeout_sec:12,include_result:true});const status=await c.call('broker_read_status',{id:boundary.id});const row={jobId:j.jobId,id:boundary.id,before:boundary.status.phase,state:terminal.state,cancelMs:Date.now()-started,status};rows.push(row);assert.equal(terminal.state,'cancelled');assert.equal(status.cleanupPending,false);const old=await c.call('driver_submit',j.args);assert.equal(old.jobId,j.jobId);assert.equal(old.reused,true);assert.equal(old.state,'cancelled');return row}
  const pre=await submit(a),preBoundary=await phase(a,pre,['enrolled']);assert.equal(preBoundary.status.publicationAttempted,false);const preResult=await cancel(a,pre,preBoundary);assert.equal(preResult.status.restorationRecorded,true)
  assert.equal(existsSync(join(BROKER_DIR,'mechanical-probe.json')),false);assert.ok(same());assert.equal(brokerInfo().live.status,'idle')
  const post=await submit(a),postBoundary=await phase(a,post,['published']);assert.equal(postBoundary.status.publicationAttempted,true)
  const contender=await submit(b),contenderBoundary=await phase(b,contender,['preparing']);const contenderResult=await cancel(b,contender,contenderBoundary);assert.equal(contenderResult.status.publicationAttempted,false)
  const postResult=await cancel(a,post,postBoundary);assert.equal(postResult.status.restorationRecorded,true)
  out.settingsRestored=bytesHash(ownedBytes(join(BROKER_DIR,'.claude','settings.json')))===settings&&bytesHash(ownedBytes(join(BROKER_DIR,'stop-rescue-policy.json')))===policy;assert.equal(out.settingsRestored,true);assert.equal(existsSync(join(BROKER_DIR,'mechanical-probe.json')),false);assert.ok(same())
  const plan=JSON.parse(ownedBytes(postResult.status.evidence)),events=sessionEvents({session:sid,cursor,include_causality:true,limit:100}),users=events.events.filter(e=>e.type==='user');assert.equal(users.length,1);assert.equal(users[0].peerMessageId,plan.peer.msgId);out.nativeUserTurns=users.map(e=>({id:e.id,peerMessageId:e.peerMessageId}));out.ok=true
 }else{
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
 }
}catch(e){out.failure=String(e.message).slice(0,300)}finally{out.launchers=await Promise.all(clients.map(c=>c.close()));out.sourceChanged=runtimeFingerprint()!==RUNTIME_BUILD;out.ok=out.ok&&!out.sourceChanged;writeJsonAtomic(report,out);recordMemory({kind:'test_result',topic:'native-read-batch',source:'owned-cross-harness-native-probe',status:out.ok?'passed':'failed',evidence:report,lesson:'Two MCP harnesses share one durable experimental native metadata batch; publisher disconnect does not restart work. Duplicate targets coalesce, distinct native hook attachment receipts bind targets, exact settings restore and idempotent reattach prevent replay. Mutation routing remains unqualified.'});console.log(JSON.stringify({report,...out}));process.exitCode=out.ok?0:1}
