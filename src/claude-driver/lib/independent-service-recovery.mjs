import {join} from 'node:path'
import {writeFileSync} from 'node:fs'
import {STATE_DIR,ensureDir,writeJsonAtomic,withLock} from './state.mjs'
import {getRecord,liveProcesses,readPins,openPrs,callerHostSession} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {inspectIndependentService} from './independent-service-result.mjs'
import {loadReceiverSelection,readReceiverFile} from './receiver-runtime-selection.mjs'
import {inspectNativeResourcePid} from './native-resource-process.mjs'
import {parseNativeFamilyMetadata} from './native-family-preflight.mjs'
import {archiveTargetValid} from './native-archive-control.mjs'
import {waitIndependentReadiness} from './independent-service-renew.mjs'
import {DriverError,sleep} from './paths.mjs'
const sid=/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,hex=/^[a-f0-9]{32}$/
const requireResult=(value,keys)=>{if(!value||!keys.every(k=>value[k]===true))throw Error('recovery child result unqualified');return value}
// A one-shot parent composes existing durable operations. Every child identity
// and before/after boundary is retained; uncertainty stops rather than replays.
export async function runIndependentRecovery(d,{cycle=false,familyRequestId}={}){
 const results={}
 const step=async(name,work)=>{await d.guard();await d.record('before-'+name,results);results[name]=await work();await d.record('after-'+name,results);return results[name]}
 await step('preflight',d.preflight)
 if(cycle){const family=await step('family',()=>d.family());requireResult(family,['receiptVerified']);if(family.state!=='completed')throw Error('family failed');familyRequestId=family.requestId}
 if(!/^rpeer[a-f0-9]{32}$/.test(familyRequestId||''))throw Error('retained native family receipt required')
 if(!results.preflight.retired){
  requireResult(await step('quiesce',()=>d.quiesce(!cycle)),['quiescent','terminalAttemptReviewComplete'])
  requireResult(await step('retire',()=>d.retire(!cycle)),['filesRetired','terminalAttemptReviewComplete'])
 }
 if(cycle){const archive=await step('archive',()=>d.archive(familyRequestId));requireResult(archive,['receiptVerified','archiveVerified','previousPidObservedAbsent']);if(archive.state!=='completed')throw Error('archive failed')}
 if(cycle||results.preflight.archived)requireResult(await step('unarchive',d.unarchive),['unarchived'])
 await step('observeBeforeWake',d.observeBeforeWake)
 const wake=await step('wake',()=>d.wake(familyRequestId));requireResult(wake,['receiptVerified','wakeNativeReceiptVerified']);if(wake.state!=='completed')throw Error('native wake failed; preserve native trust/refusal')
 await step('newEpoch',d.newEpoch)
 await step('reply',d.reply)
 const prepared=requireResult(await step('prepare',d.prepare),['prepared','verified']);if(!hex.test(prepared.serviceId||''))throw Error('preparation identity')
 requireResult(await step('activate',()=>d.activate(prepared.serviceId)),['installed'])
 requireResult(await step('readiness',()=>d.readiness(prepared.serviceId)),['verified','readinessObserved'])
 requireResult(await step('policy',()=>d.policy(prepared.serviceId)),['terminalRefusalVerified','policyInvocationObserved','scopedNoNativeMcpQualified'])
 const read=await step('read',()=>d.read(prepared.serviceId));requireResult(read,['receiptVerified']);if(read.state!=='completed')throw Error('native read failed')
 requireResult(await step('verify',()=>d.verify(prepared.serviceId)),['settingsPreserved','anchorPreserved','noUnresolvedAttempts'])
 return {serviceId:prepared.serviceId,results,nativeColdRecoveryQualified:true,unattendedSupervisionQualified:false}
}
export function recoveryReplyObserved(events){
 if(!Array.isArray(events)||events.some(e=>e.type==='assistant'&&(!Array.isArray(e.tools)||e.tools.length))||events.filter(e=>e.type==='user'&&!e.sidechain).length!==1)return false
 const byId=new Map(events.map(e=>[e.id,e]))
 for(const reply of events){
  if(reply.type!=='assistant'||reply.sidechain||reply.stopReason!=='end_turn'||reply.text!=='COLD_RECEIVER_READY'||reply.textTruncated||!Array.isArray(reply.tools)||reply.tools.length)continue
  let parent=reply.parentId;const seen=new Set()
  for(let n=0;parent&&n<32;n++){if(seen.has(parent))break;seen.add(parent);const e=byId.get(parent);if(!e)break;if(e.type==='user'&&!e.sidechain)return true;if(e.type!=='metadata')break;parent=e.parentId}
 }
 return false
}
export async function recoverIndependentTarget(session,serviceId,target,targetServiceId,{jobId,signal,cycle=false,familyRequestId}={}){
 if(!sid.test(session||'')||!sid.test(target||'')||session===target||!hex.test(serviceId||'')||!hex.test(targetServiceId||'')||!/^j[a-f0-9]{32}$/.test(jobId||'')||typeof cycle!=='boolean'||!cycle&&!/^rpeer[a-f0-9]{32}$/.test(familyRequestId||''))throw new DriverError('recovery requires durable exact controller/target identities and retained family for cold mode',{category:'bad_args'})
 if(callerHostSession()===target)throw new DriverError('recovery must be controlled from a different session; refusing self archive or retirement',{category:'gate_self'})
 return withLock('independent-recovery-'+target,async()=>{
  const file=join(ensureDir(join(STATE_DIR,'independent-service-recoveries')),jobId+'.json'),ledger={schemaVersion:1,kind:'independent-service-recovery',jobId,session,target,serviceId,targetServiceId,cycle,phase:'created',children:{},steps:[],retrySafe:false,at:Date.now()}
  writeFileSync(file,JSON.stringify(ledger),{flag:'wx',mode:0o600})
  const save=()=>{ledger.updatedAt=Date.now();writeJsonAtomic(file,ledger)}
  const controller=peerRecord(session),record=getRecord(target);let sealed,cursor,newPeer,baseline
  const policy=id=>JSON.parse(readReceiverFile(join(record.cwd,'.claude-driver-services',id,'broker','stop-rescue-policy.json'),65536))
  const guard=async()=>{if(signal?.aborted)throw Error('recovery cancelled; child may continue');const p=peerRecord(session);if(!controller||!p||p.pid!==controller.pid||p.procStart!==controller.procStart||p.status!=='idle'||getRecord(target)?.cwd!==record?.cwd)throw Error('recovery controller or target changed')}
  const child=async(stage,operation,args,timeoutSec=90)=>{
   await guard();if(ledger.children[stage])throw Error('recovery child already attempted')
   const submission={operation,arguments:args,idempotency_key:'independent-recovery:'+jobId+':'+stage,timeout_sec:timeoutSec};ledger.children[stage]={submission,state:'before-submit'};save()
   const {runOp}=await import('./driver.mjs'),job=await runOp('driver_submit',submission);ledger.children[stage].jobId=job.jobId;save()
   const end=Date.now()+timeoutSec*1000+5000
   for(;;){if(signal?.aborted)throw Error('recovery cancelled while child may continue');const observed=await runOp('driver_wait',{job_id:job.jobId,timeout_sec:10,include_result:true},{signal});ledger.children[stage].observation=observed;save();if(observed.state==='completed')return observed.result;if(!['queued','running'].includes(observed.state)||Date.now()>end)throw Error('recovery child failed, uncertain or observation deadline')}
  }
  const familyReceipt=ref=>{const r=JSON.parse(readReceiverFile(join(record.cwd,'.claude-driver-services',targetServiceId,'broker','results',ref+'.native.json'),65536));if(r.id!==ref||r.source!=='native-peer-service-result'||r.results?.length!==1||r.results[0].op!=='list_sessions'||r.results[0].ok!==true||parseNativeFamilyMetadata(r.results[0].result,target)?.length!==0)throw Error('empty native family receipt unqualified')}
  const targetArgs={session:target,service_id:targetServiceId,experimental:true},controlArgs=ref=>({session,service_id:serviceId,session_id:target,target_service_id:targetServiceId,family_request_id:ref,experimental:true,timeout_sec:30})
  try{
   const result=await runIndependentRecovery({guard,record:async(phase,results)=>{ledger.phase=phase;ledger.results=results;ledger.steps.push({phase,at:Date.now()});save()},
    preflight:async()=>{
     const c=await inspectIndependentService(session,serviceId,{signal});sealed=c.archiveTarget
     if(!record||!c.verified||!c.readinessObserved||!c.nativePolicyObserved||c.admissionStopped||c.expired||c.deadline-Date.now()<180000||c.unresolvedRequestIds?.length||c.unreservedSlots<2||!archiveTargetValid(sealed,{sessionId:session,receiverCwd:getRecord(session).cwd})||sealed.sessionId!==target||sealed.cwd!==record.cwd||record.permissionMode!=='bypassPermissions'||record.worktreePath||readPins().has(target)||openPrs(record).length)throw Error('recovery sealed scope unqualified')
     const selected=loadReceiverSelection(record.cwd);if(selected.selector.serviceId!==targetServiceId||selected.selector.pid!==sealed.pid||selected.selector.procStart!==sealed.procStart)throw Error('target selector changed')
     const p=peerRecord(target)
     if(cycle){if(record.isArchived||!p||p.pid!==sealed.pid||p.procStart!==sealed.procStart||p.status!=='idle')throw Error('cycle target not exact idle epoch')}
     else if(p||liveProcesses().some(p=>p.hostSessionId===target)||inspectNativeResourcePid(sealed.pid)!==null)throw Error('cold recovery requires absent original process and no current peer')
     let t=await inspectIndependentService(target,targetServiceId,{signal,...cycle?{}:{offline:true}});if(!cycle&&!t.verified)t=await inspectIndependentService(target,targetServiceId,{signal,historical:true});if(!t.verified||!t.terminalAttemptReviewComplete||t.unresolvedRequestIds?.length||t.nativeEpoch?.pid!==sealed.pid||t.nativeEpoch?.procStart!==sealed.procStart||selected.pointer.build!==t.build||selected.pointer.generation!==t.generation)throw Error('target terminal inventory unqualified')
     if(!cycle){familyReceipt(familyRequestId);if(!t.settledRequestIds?.includes(familyRequestId))throw Error('family not terminal in target history')}
     baseline=policy(targetServiceId);if(!/^[a-f0-9]{64}$/.test(baseline.settingsHash||'')||!/^[a-f0-9]{64}$/.test(baseline.receiverHook?.anchorSha256||''))throw Error('stable settings evidence missing');return {retired:t.sourceDisposition==='files-retired'&&t.admissionStopped===true&&t.stopMarkerMatchesGeneration===true,archived:record.isArchived,oldEpoch:{pid:sealed.pid,procStart:sealed.procStart},settingsHash:baseline.settingsHash,anchorSha256:baseline.receiverHook?.anchorSha256}
    },
    family:async()=>{const r=await child('family','broker_service_family',targetArgs);familyReceipt(r.requestId);return r},quiesce:offline=>child('quiesce','broker_service_quiesce',{...targetArgs,...offline?{offline:true}:{}}),retire:offline=>child('retire','broker_service_retire',{...targetArgs,...offline?{offline:true}:{}}),archive:ref=>child('archive','broker_service_archive',controlArgs(ref)),unarchive:()=>child('unarchive','unarchive_session',{session:target}),
    observeBeforeWake:async()=>{const {runOp}=await import('./driver.mjs');const r=await runOp('session_events',{session:target,include_causality:true});cursor=r.cursor;return r},wake:ref=>child('wake','broker_service_wake_target',controlArgs(ref)),
    newEpoch:async()=>{const end=Date.now()+30000;for(;;){await guard();if(inspectNativeResourcePid(sealed.pid)!==null)throw Error('original PID present');const p=peerRecord(target);if(p){if(p.cwd!==record.cwd||p.hostSessionId!==target||p.version!=='2.1.299'||p.entrypoint!=='claude-desktop'||p.pid===sealed.pid||p.procStart===sealed.procStart)throw Error('new native epoch unqualified');if(p.status==='idle'){newPeer=p;return {pid:p.pid,procStart:p.procStart,cwd:p.cwd}}}if(Date.now()>end)throw Error('new native epoch deadline');await sleep(100)}},
    reply:async()=>{const {runOp}=await import('./driver.mjs');const r=await runOp('session_wait',{session:target,cursor,include_causality:true,include_text:true,limit:100,timeout_sec:20});ledger.replyObservation=r;save();if(r.hasMore||!recoveryReplyObserved(r.events))throw Error('fixed wake reply not independently observed');return r},
    prepare:()=>child('prepare','broker_service_prepare',{session:target,experimental:true,lifetime_sec:3600,max_requests:32}),activate:id=>child('activate','broker_service_activate',{session:target,service_id:id,experimental:true,stable_hook:true,cold_rebind:true}),
    readiness:id=>waitIndependentReadiness({signal},{guard,inspect:()=>inspectIndependentService(target,id,{signal}),now:Date.now,wait:()=>sleep(100)}),policy:id=>child('policy','broker_service_policy_probe',{session:target,service_id:id,experimental:true,timeout_sec:20}),read:id=>child('read','broker_service_read',{session:target,service_id:id,session_id:session,experimental:true,timeout_sec:20}),
    verify:async id=>{const s=await inspectIndependentService(target,id,{signal}),p=peerRecord(target),after=policy(id);if(!s.verified||!s.readinessObserved||!s.nativePolicyObserved||s.admissionStopped||s.expired||s.unresolvedRequestIds?.length||!p||p.pid!==newPeer.pid||p.procStart!==newPeer.procStart||s.nativeEpoch.pid!==p.pid||after.settingsHash!==baseline.settingsHash||after.receiverHook?.anchorSha256!==baseline.receiverHook?.anchorSha256)throw Error('final recovery identity or settings changed');return {serviceId:id,pid:p.pid,procStart:p.procStart,settingsPreserved:true,anchorPreserved:true,noUnresolvedAttempts:true}}
   },{cycle,familyRequestId})
   ledger.phase='completed';save();return {...result,recoveryFile:file,childJobs:Object.fromEntries(Object.entries(ledger.children).map(([k,v])=>[k,v.jobId])),retrySafe:false}
  }catch(error){ledger.failure={category:error.category??'recovery_step_failed',at:Date.now()};save();throw new DriverError('recovery stopped; inspect retained parent/children, never replay unknown effects',{category:'independent_service_recovery_unresolved',detail:{jobId,phase:ledger.phase,recoveryFile:file,childJobs:Object.fromEntries(Object.entries(ledger.children).map(([k,v])=>[k,v.jobId??null])),retrySafe:false}})}
 },{timeoutMs:5000,signal})
}
