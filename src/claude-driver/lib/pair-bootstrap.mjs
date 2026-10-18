import {pairBootstrapSourceActors} from './interrupted-renewal-lineage.mjs'
import {claimPairBootstrapContinuation} from './pair-bootstrap-claim.mjs'
import {inspectPairImportContinuation,pairBootstrapRootDigest} from './pair-bootstrap-continuation.mjs'
import {inspectMetadataEnrollment} from './metadata-controller-index.mjs'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {writeFileSync} from 'node:fs'
import {STATE_DIR,ensureDir,withLock,writeJsonAtomic} from './state.mjs'
import {readStandbyEnrollment,standbyEnrollmentDigest,enrollStandby} from './standby-enrollment.mjs'
import {inspectPairBootstrap} from './pair-bootstrap-plan.mjs'
import {ordinarySessionBinding} from './ordinary-session-control.mjs'
import {getRecord,openPrs,liveProcesses,callerHostSession} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {inspectNativeResourcePid} from './native-resource-process.mjs'
import {loadReceiverSelection,readReceiverFile} from './receiver-runtime-selection.mjs'
import {inspectIndependentService,readIndependentService} from './independent-service-result.mjs'
import {recoveryRoleFromHistory,recoveredRoleMatches} from './recovery-role.mjs'
import {waitIndependentReadiness} from './independent-service-renew.mjs'
import {pairImportEpochQualified,readPairBootstrapRoot,pairMetadataEnrollmentMatches} from './pair-bootstrap-proof.mjs'
import {unarchiveViaLink} from './tiera.mjs'
import {withFocus} from './focus.mjs'
import {DriverError,versions,sleep} from './paths.mjs'
import {RUNTIME_BUILD,runtimeFingerprint} from './build.mjs'
const roles=['primary','standby'],job=/^j[a-f0-9]{32}$/
const same=(a,b)=>!!a&&!!b&&['sessionId','cwd','pid','procStart'].every(k=>a[k]===b[k])
export const pairBootstrapChildId=(root,step)=>{if(!job.test(root||'')||!/^[-a-z]{1,48}$/.test(step))throw Error('pair child identity');return 'j'+createHash('sha256').update('pair-bootstrap:'+root+':'+step).digest('hex').slice(0,32)}
// Before/after checkpoint failure stops all later effects. A caller must inspect
// the original root, not call this sequence again to retry an uncertain step.
export async function runPairBootstrap(d,{retained={}}={}){
 const allowed=['preflight','quiesce-primary','retire-primary','quiesce-standby','retire-standby','import-primary','import-standby'],keys=Object.keys(retained);if(keys.some(k=>!allowed.includes(k))||keys.length&&allowed.slice(0,keys.length).some(k=>!Object.hasOwn(retained,k)))throw Error('retained pair steps must be a verified initial prefix')
 const result={}
 const step=async(name,fn,check)=>{await d.guard(name);if(Object.hasOwn(retained,name)){const value=retained[name];if(check&&!check(value))throw Error('retained pair step unqualified');result[name]=value;await d.record('retained-'+name,result);return value}await d.record('before-'+name,result);const value=await fn();result[name]=value;await d.record('after-'+name,result);if(check&&!check(value))throw Error('pair bootstrap '+name+' unqualified');return value}
 await step('preflight',d.preflight,r=>r.bootstrapPreparationEligible===true)
 for(const role of roles){await step('quiesce-'+role,()=>d.quiesce(role),r=>r.quiescent===true&&r.terminalAttemptReviewComplete===true&&r.offline===true);await step('retire-'+role,()=>d.retire(role),r=>r.filesRetired===true&&r.terminalAttemptReviewComplete===true)}
 for(const role of roles)await step('import-'+role,()=>d.importActor(role),r=>r.newEpochVerified===true)
 for(const role of roles)await step('prepare-'+role,()=>d.prepare(role),r=>r.prepared===true&&r.verified===true)
 for(const role of roles){await step('activate-'+role,()=>d.activate(role,result['prepare-'+role].serviceId),r=>r.installed===true);await step('readiness-'+role,()=>d.readiness(role),r=>r.verified===true&&r.readinessObserved===true);await step('policy-'+role,()=>d.policy(role),r=>r.terminalRefusalVerified===true&&r.policyInvocationObserved===true)}
 for(const role of roles)await step('read-'+role,()=>d.read(role),r=>r.receiptVerified===true&&r.state==='completed')
 await step('verifyPair',d.verifyPair,r=>r.qualified===true&&r.rolesPreserved===true&&r.settingsPreserved===true&&r.noUnresolvedAttempts===true)
 await step('family',d.family,r=>r.receiptVerified===true&&r.state==='completed')
 await step('enroll',()=>d.enroll(result.family.requestId),r=>r.enrolled===true&&r.verified===true)
 await step('metadataEnrollment',d.metadataEnrollment,r=>r.qualified===true)
 await step('verifyEnrollment',d.verifyEnrollment,r=>r.qualified===true)
 return result
}
export async function bootstrapIndependentPair(primary,expectedSha256,{jobId,signal,progress,originalRootJobId,expectedRootSha256}={}){
 if(!job.test(jobId||'')||!/^[a-f0-9]{64}$/.test(expectedSha256||''))throw new DriverError('pair bootstrap requires durable job and exact binding digest',{category:'bad_args'})
 return withLock('independent-route-'+primary,async()=>{
  let continuation,initialPlan
  if(originalRootJobId!==undefined){if(originalRootJobId===jobId||!job.test(originalRootJobId)||!/^[a-f0-9]{64}$/.test(expectedRootSha256||''))throw new DriverError('exact distinct original root and digest required',{category:'bad_args'});try{continuation=await inspectPairImportContinuation(primary,expectedSha256,originalRootJobId,expectedRootSha256,{signal})}catch{throw new DriverError('original failed import or changed-condition evidence unqualified; no effects',{category:'pair_bootstrap_continuation_unqualified',detail:{originalRootJobId,dispatched:false,retrySafe:true}})}}
  else{initialPlan=await inspectPairBootstrap(primary,expectedSha256,{signal});if(initialPlan.bootstrapPreparationEligible!==true)throw new DriverError('pair bootstrap prerequisites not admitted; no effects',{category:'pair_bootstrap_unqualified',detail:{dispatched:false,retrySafe:true,reason:initialPlan.reason}})}
  const binding=continuation?.root.binding??readStandbyEnrollment(primary),renewalLineage=continuation?.root.renewalLineage??initialPlan?.renewalLineage,sources=pairBootstrapSourceActors(binding,renewalLineage);if(roles.some(r=>binding[r].sessionId===callerHostSession()))throw new DriverError('pair bootstrap cannot target caller',{category:'gate_self'})
  const file=join(ensureDir(join(STATE_DIR,'pair-bootstraps')),jobId+'.json'),ledger={schemaVersion:1,jobId,binding,...renewalLineage?{renewalLineage,sourceActors:sources}:{},enrollmentSha256:expectedSha256,runtimeBuild:RUNTIME_BUILD,versions:versions(),phase:'created',newEffectsStarted:false,children:{},results:{},snapshots:{},steps:[],at:Date.now(),retrySafe:false},epochs=structuredClone(continuation?.epochs??{}),activated={},prepared={}
  if(continuation){ledger.continuationOf=originalRootJobId;ledger.originalRootSha256=expectedRootSha256;ledger.originStartedAt=continuation.root.originStartedAt??continuation.root.at;ledger.snapshots=structuredClone(continuation.root.snapshots);ledger.children=structuredClone(continuation.root.children);ledger.importIntents=structuredClone(continuation.root.importIntents);ledger.metadataEnrollment=structuredClone(continuation.root.metadataEnrollment);ledger.changedConditionObserved=true;ledger.originalOutcomePreserved=true;ledger.continuationClaim=await claimPairBootstrapContinuation(originalRootJobId,expectedRootSha256,jobId,continuation.root)}
  writeFileSync(file,JSON.stringify(ledger),{flag:'wx',mode:0o600});const save=()=>{ledger.updatedAt=Date.now();writeJsonAtomic(file,ledger)}
  const policy=(role,service=sources[role].serviceId)=>JSON.parse(readReceiverFile(join(binding[role].cwd,'.claude-driver-services',service,'broker','stop-rescue-policy.json'),65536))
  const guard=async()=>{
   if(renewalLineage&&createHash('sha256').update(readReceiverFile(join(STATE_DIR,'independent-service-renewals',renewalLineage.renewalJobId+'.json'),1048576)).digest('hex')!==renewalLineage.renewalLedgerSha256)throw Error('original renewal lineage changed')
   if(continuation&&pairBootstrapRootDigest(readPairBootstrapRoot(originalRootJobId))!==expectedRootSha256)throw Error('original failed root changed')
   if(signal?.aborted||runtimeFingerprint()!==ledger.runtimeBuild||JSON.stringify(versions())!==JSON.stringify(ledger.versions)||standbyEnrollmentDigest(readStandbyEnrollment(primary))!==(ledger.results.enroll?.enrollmentSha256??expectedSha256))throw Error('bootstrap source/version/binding changed or cancelled')
   if(ledger.metadataEnrollment&&!pairMetadataEnrollmentMatches(ledger.metadataEnrollment,inspectMetadataEnrollment(binding.standby.sessionId),ledger.results.metadataEnrollment))throw Error('public metadata enrollment changed')
   const processes=liveProcesses()
   for(const role of roles){const old=binding[role],other=binding[role==='primary'?'standby':'primary'],r=getRecord(old.sessionId),p=peerRecord(old.sessionId),snap=ledger.snapshots[role];if(!r||r.cwd!==old.cwd||r.permissionMode!=='bypassPermissions'||r.worktreePath||openPrs(r).length||inspectNativeResourcePid(old.pid)!==null)throw Error('bootstrap owner or predecessor changed');if(snap&&JSON.stringify(ordinarySessionBinding(r,other.sessionId))!==JSON.stringify(snap.identity))throw Error('bootstrap account/session identity changed');if(epochs[role]){if(!p||!same(epochs[role],{sessionId:r.sessionId,cwd:r.cwd,pid:p.pid,procStart:p.procStart})||p.status!=='idle'||r.isArchived)throw Error('new bootstrap epoch changed')}else if(p||processes.some(x=>x.hostSessionId===old.sessionId))throw Error('unexpected live actor before import');const selected=loadReceiverSelection(old.cwd);if(selected.selector.serviceId!==(activated[role]??sources[role].serviceId)||selected.selector.sessionId!==old.sessionId||activated[role]&&(selected.selector.pid!==epochs[role].pid||selected.selector.procStart!==epochs[role].procStart||selected.selector.build!==ledger.runtimeBuild)||!activated[role]&&snap&&JSON.stringify(selected)!==JSON.stringify(snap.selection))throw Error('bootstrap selection changed')}
  }
  const child=async(step,operation,args)=>{
   if(ledger.children[step])throw Error('pair child already attempted')
   ledger.newEffectsStarted=true;save()
   const childId=pairBootstrapChildId(jobId,step),submission={operation,arguments:args,idempotency_key:'pair-bootstrap:'+jobId+':'+step,timeout_sec:120};ledger.children[step]={contextId:childId,submission,phase:'before-submit'};save()
   // Stable submission key survives disconnects; retain the scheduler's actual
   // job ID before observing. Derived contexts are not scheduler job IDs.
   const {runOp}=await import('./driver.mjs'),submitted=await runOp('driver_submit',submission);ledger.children[step].jobId=submitted.jobId;save();progress?.(step+' '+submitted.jobId)
   for(;;){if(signal?.aborted)throw Error('pair child may continue after parent cancellation');const observed=await runOp('driver_wait',{job_id:submitted.jobId,timeout_sec:10,include_result:true},{signal});ledger.children[step].observation=observed;save();if(observed.state==='completed')return observed.result;if(!['queued','running'].includes(observed.state))throw Error('pair child failed or unknown')}
  }
  try{
   const result=await runPairBootstrap({guard,record:async(phase,result)=>{ledger.phase=phase;ledger.results=result;ledger.steps.push({phase,at:Date.now()});save()},
    preflight:async()=>{const plan=await inspectPairBootstrap(primary,expectedSha256,{signal});if(JSON.stringify(plan.sourceActors??pairBootstrapSourceActors(binding))!==JSON.stringify(sources)||plan.renewalLineage?.renewalLedgerSha256!==renewalLineage?.renewalLedgerSha256)throw Error('pair source lineage changed');for(const role of roles){const e=binding[role],other=binding[role==='primary'?'standby':'primary'],r=getRecord(e.sessionId),status=await inspectIndependentService(e.sessionId,sources[role].serviceId,{signal,offline:true}),p=policy(role),restoredRole=recoveryRoleFromHistory(status,p,{sessionId:e.sessionId,receiverCwd:e.cwd,admitTarget:t=>same(t,other)});ledger.snapshots[role]={selection:loadReceiverSelection(e.cwd),identity:ordinarySessionBinding(r,other.sessionId),policy:p,role:restoredRole}}const metadata=inspectMetadataEnrollment(binding.standby.sessionId);if(metadata.enrolled&&(metadata.enrollment.controllerSession!==primary||!same(metadata.enrollment.target,binding.standby)))throw Error('old metadata enrollment changed');ledger.metadataEnrollment=metadata;save();return plan},
    quiesce:role=>child('quiesce-'+role,'broker_service_quiesce',{session:binding[role].sessionId,service_id:sources[role].serviceId,experimental:true,offline:true,require_new_stop:true}),
    retire:role=>child('retire-'+role,'broker_service_retire',{session:binding[role].sessionId,service_id:sources[role].serviceId,experimental:true,offline:true}),
    importActor:async role=>{
     const e=binding[role],startedAt=Date.now();ledger.newEffectsStarted=true;save();ledger.importIntents??={};if(ledger.importIntents[role])throw Error('import already attempted');ledger.importIntents[role]={startedAt,sessionId:e.sessionId,cliSessionId:e.sessionId.slice(6),dispatchMayOccur:true};save()
     const {result,focus}=await withFocus('restore',async()=>{const imported=await unarchiveViaLink(getRecord(e.sessionId));if(!imported.ok)throw Error('pair import did not verify saved unarchive');const end=Date.now()+30000;for(;;){if(signal?.aborted)throw Error('import observation cancelled');const peer=peerRecord(e.sessionId),record=getRecord(e.sessionId);if(pairImportEpochQualified({old:e,record,peer,oldPidAbsent:inspectNativeResourcePid(e.pid)===null,startedAt,observedAt:Date.now()})){epochs[role]={sessionId:e.sessionId,cwd:e.cwd,pid:peer.pid,procStart:peer.procStart};return {...imported,newEpochVerified:true,epoch:epochs[role],startedAt,observedAt:Date.now(),processStartAttribution:'bounded-import-window',servingQualified:false}}if(peer?.status==='waiting')throw Error('native person input required');if(Date.now()>=end)throw Error('import completed without qualified native startup');await sleep(100)}} ,{target:e.sessionId});delete result.navigatedTo;return {...result,focus}
    },
    prepare:async role=>{const r=await child('prepare-'+role,'broker_service_prepare',{session:binding[role].sessionId,experimental:true,lifetime_sec:3600,max_requests:32,...ledger.snapshots[role].role.prepareArguments});prepared[role]=r.serviceId;return r},
    activate:async(role,id)=>{const r=await child('activate-'+role,'broker_service_activate',{session:binding[role].sessionId,service_id:id,experimental:true,stable_hook:true,cold_rebind:true});activated[role]=id;return r},
    readiness:role=>waitIndependentReadiness({signal},{guard,inspect:()=>inspectIndependentService(binding[role].sessionId,prepared[role],{signal}),now:Date.now,wait:()=>sleep(100)}),
    policy:role=>child('policy-'+role,'broker_service_policy_probe',{session:binding[role].sessionId,service_id:prepared[role],experimental:true,timeout_sec:20}),
    read:role=>readIndependentService(binding[role].sessionId,prepared[role],binding[role==='primary'?'standby':'primary'].sessionId,{signal,jobId:pairBootstrapChildId(jobId,'read-'+role),timeoutMs:20000}),
    verifyPair:async()=>{const result={qualified:true,rolesPreserved:true,settingsPreserved:true,noUnresolvedAttempts:true};for(const role of roles){const other=role==='primary'?'standby':'primary',status=await inspectIndependentService(binding[role].sessionId,prepared[role],{signal}),snapshot=ledger.snapshots[role],nextRole=structuredClone(snapshot.role),after=policy(role,prepared[role]);for(const key of Object.keys(nextRole.bindings)){if(!same(nextRole.bindings[key],binding[other]))throw Error('pair role target expanded');nextRole.bindings[key]={...epochs[other]}}if(!status.verified||!status.readinessObserved||!status.nativePolicyObserved||status.admissionStopped||status.expired||status.unresolvedRequestIds?.length||!recoveredRoleMatches(nextRole,status)||after.settingsHash!==snapshot.policy.settingsHash||after.receiverHook?.anchorSha256!==snapshot.policy.receiverHook?.anchorSha256)throw Error('pair final role/settings/readiness unqualified');result[role]={...epochs[role],serviceId:prepared[role]}}return result},
    family:()=>readIndependentService(primary,prepared.primary,primary,{family:true,signal,jobId:pairBootstrapChildId(jobId,'family'),timeoutMs:20000}),
    enroll:familyRequestId=>enrollStandby({session:binding.standby.sessionId,service_id:prepared.standby,session_id:primary,target_service_id:prepared.primary,family_request_id:familyRequestId},{signal,expectedSha256,pairBootstrapJobId:jobId}),
    metadataEnrollment:async()=>{const original=ledger.metadataEnrollment,current=inspectMetadataEnrollment(binding.standby.sessionId);if(JSON.stringify(original)!==JSON.stringify(current))throw Error('metadata enrollment changed during bootstrap');if(!original.enrolled)return {qualified:true,enrolled:false};const result=await child('rebind-metadata','broker_service_rebind_metadata',{session:primary,session_id:binding.standby.sessionId,expected_enrollment_sha256:original.enrollmentSha256,experimental:true});if(result.rebound!==true||result.verified!==true)throw Error('metadata rebind unverified');return {qualified:true,...result}},
    verifyEnrollment:async()=>{await guard();const row=readStandbyEnrollment(primary);const metadata=inspectMetadataEnrollment(binding.standby.sessionId);if(ledger.metadataEnrollment.enrolled&&(!metadata.enrolled||metadata.enrollment.controllerSession!==primary||!same(metadata.enrollment.target,epochs.standby)))throw Error('final public metadata enrollment stale');if(row.primary.serviceId!==prepared.primary||row.standby.serviceId!==prepared.standby||row.automaticRecovery!==binding.automaticRecovery)throw Error('pair final binding unqualified');return {qualified:true,enrollmentSha256:standbyEnrollmentDigest(row)}}
   },{retained:continuation?.retained??{}});ledger.phase='completed';ledger.results=result;save();return {primarySession:primary,standbySession:binding.standby.sessionId,serviceId:prepared.primary,standbyServiceId:prepared.standby,qualified:true,...continuation?{continuationOf:originalRootJobId,originalOutcomePreserved:true,changedConditionObserved:true}:{},unattendedBootstrapQualified:false,bootstrapFile:file,enrollmentSha256:result.verifyEnrollment.enrollmentSha256,childJobs:Object.fromEntries(Object.entries(ledger.children).map(([k,v])=>[k,v.jobId])),retrySafe:false}
  }catch(error){ledger.failure={category:error.category??'pair-bootstrap-step-unresolved',at:Date.now()};save();throw new DriverError('pair bootstrap stopped; inspect original root and children, never replay imports or uncertain effects',{category:'pair_bootstrap_unresolved',detail:{jobId,phase:ledger.phase,bootstrapFile:file,childJobs:Object.fromEntries(Object.entries(ledger.children).map(([k,v])=>[k,v.jobId??null])),retrySafe:false}})}
 },{signal,timeoutMs:60000})
}
