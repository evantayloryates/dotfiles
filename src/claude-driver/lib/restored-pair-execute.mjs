import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {inspectRestoredPair} from './restored-pair-plan.mjs'
import {readRestoredRecordRoot} from './restored-record-proof.mjs'
import {runRestoredPairReactivation,continueRestoredPairFromReadiness} from './restored-pair-reactivation.mjs'
import {createRestoredPairLedger,createRestoredPairReadinessLedger,restoredPairPlanDigest,restoredPairChildSubmission,runRestoredPairChild} from './restored-pair-ledger.mjs'
import {readStandbyEnrollment,standbyEnrollmentDigest,enrollStandby} from './standby-enrollment.mjs'
import {inspectMetadataEnrollment} from './metadata-controller-index.mjs'
import {pairMetadataEnrollmentMatches} from './pair-bootstrap-proof.mjs'
import {ordinarySessionBinding} from './ordinary-session-control.mjs'
import {getRecord,openPrs,callerHostSession} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {loadReceiverSelection,readReceiverFile} from './receiver-runtime-selection.mjs'
import {requireIndependentEpochAbsent} from './independent-offline-review.mjs'
import {inspectIndependentService,readIndependentService} from './independent-service-result.mjs'
import {waitIndependentReadiness} from './independent-service-renew.mjs'
import {recoveredRoleMatches} from './recovery-role.mjs'
import {withLock} from './state.mjs'
import {RUNTIME_BUILD,runtimeFingerprint} from './build.mjs'
import {DriverError,versions,sleep} from './paths.mjs'
const roles=['primary','standby'],job=/^j[a-f0-9]{32}$/,hex=/^[a-f0-9]{64}$/
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
const same=(a,b)=>!!a&&!!b&&['sessionId','cwd','pid','procStart'].every(k=>a[k]===b[k])
export const restoredPairReadJobId=(root,step)=>{if(!job.test(root||'')||!['read-primary','read-standby','family'].includes(step))throw Error('exact reactivation read identity required');return 'j'+createHash('sha256').update('restored-pair:'+root+':'+step).digest('hex').slice(0,32)}
export function restoredPairActorMatches(record,peer,epoch,identity,controller){
 try{return !!(record&&record.isArchived===false&&record.permissionMode==='bypassPermissions'&&!record.worktreePath&&equal(ordinarySessionBinding(record,controller),identity)&&same({...peer,sessionId:peer?.hostSessionId},epoch)&&peer.sessionId===record.cliSessionId&&peer.status==='idle'&&peer.entrypoint==='claude-desktop'&&peer.version==='2.1.299')}catch{return false}
}
// Explicit durable operation only; missing records are never inferred as permission
// to replay an import or to replace controller identities.
export async function reactivateRestoredPair(restorationJobId,expectedRootSha256,expectedPlanSha256,{jobId,signal,progress,restorationKind='record',readinessCheckpoint}={},dependencies={}){
 const dep={readRoot:id=>readRestoredRecordRoot(id,{kind:restorationKind}),inspectPlan:inspectRestoredPair,caller:callerHostSession,select:loadReceiverSelection,record:getRecord,version:versions,fingerprint:runtimeFingerprint,enrollment:readStandbyEnrollment,metadata:inspectMetadataEnrollment,absent:requireIndependentEpochAbsent,peer:peerRecord,prs:openPrs,status:inspectIndependentService,nativeRead:readIndependentService,enroll:enrollStandby,...dependencies}
 if(!['record','seeded'].includes(restorationKind)||!job.test(restorationJobId||'')||!job.test(jobId||'')||jobId===restorationJobId||!hex.test(expectedRootSha256||'')||!hex.test(expectedPlanSha256||''))throw new DriverError('exact durable restored pair context required',{category:'bad_args'})
 const original=dep.readRoot(restorationJobId),primary=original.root.primary
 if(original.rootSha256!==expectedRootSha256)throw new DriverError('restoration root changed; no effects',{category:'restored_pair_unqualified'})
 return withLock('independent-route-'+primary,async()=>{
  const plan=readinessCheckpoint?await dependencies.inspectContinuation(readinessCheckpoint,{signal}):await dep.inspectPlan(restorationJobId,expectedRootSha256,{signal,restorationKind})
  if(plan.pairPreparationEligible!==true||restoredPairPlanDigest(plan)!==expectedPlanSha256)throw new DriverError('restored pair plan unqualified or changed; no effects',{category:'restored_pair_unqualified',detail:{reason:plan.reason,dispatched:false,retrySafe:true}})
  const binding=original.root.originalSnapshot.binding,lost=plan.restoredRole
  if(roles.some(role=>binding[role].sessionId===dep.caller()))throw new DriverError('reactivation cannot target caller',{category:'gate_self'})
  const policy=(role,id=binding[role].serviceId)=>JSON.parse(readReceiverFile(join(binding[role].cwd,'.claude-driver-services',id,'broker','stop-rescue-policy.json'),65536))
  const snapshots=readinessCheckpoint?structuredClone(readinessCheckpoint.root.snapshots):Object.fromEntries(roles.map(role=>[role,{selection:dep.select(binding[role].cwd),identity:ordinarySessionBinding(dep.record(binding[role].sessionId),binding[role==='primary'?'standby':'primary'].sessionId),policy:policy(role)}]))
  for(const role of roles)if(!hex.test(snapshots[role].policy.settingsHash||'')||!hex.test(snapshots[role].policy.receiverHook?.anchorSha256||''))throw Error('stable settings evidence missing')
  const metadata=dep.metadata(binding.standby.sessionId)
  if(metadata.enrolled&&(metadata.enrollment.controllerSession!==primary||!same(metadata.enrollment.target,binding.standby)))throw Error('original metadata enrollment changed')
  if(readinessCheckpoint&&!equal(metadata,readinessCheckpoint.root.metadataEnrollment))throw Error('continuation metadata changed')
  const context=readinessCheckpoint?createRestoredPairReadinessLedger(readinessCheckpoint,jobId):createRestoredPairLedger(plan,expectedPlanSha256,jobId),{ledger,save}=context,prepared=readinessCheckpoint?{...readinessCheckpoint.proof.preparedServiceIds}:{},activated=readinessCheckpoint?{primary:readinessCheckpoint.proof.installedPrimaryServiceId}:{},preparedBuild=readinessCheckpoint?.root.runtimeBuild??RUNTIME_BUILD;ledger.snapshots=snapshots;ledger.metadataEnrollment=metadata;ledger.versions=dep.version();save()
  const guard=async()=>{
   if(readinessCheckpoint)await dependencies.checkContinuationOrigin(readinessCheckpoint)
   const currentRoot=dep.readRoot(restorationJobId)
   if(signal?.aborted||dep.fingerprint()!==RUNTIME_BUILD||!equal(dep.version(),ledger.versions)||currentRoot.rootSha256!==expectedRootSha256||!equal(currentRoot.claim,original.claim)||standbyEnrollmentDigest(dep.enrollment(primary))!==(ledger.results.enroll?.enrollmentSha256??plan.enrollmentSha256)||!pairMetadataEnrollmentMatches(metadata,dep.metadata(binding.standby.sessionId),ledger.results.metadataEnrollment))throw Error('reactivation source/root/enrollment changed')
   dep.absent(binding[lost])
   for(const role of roles){const e=plan.currentEpochs[role],r=dep.record(e.sessionId),p=dep.peer(e.sessionId),other=binding[role==='primary'?'standby':'primary'].sessionId
    if(!restoredPairActorMatches(r,p,e,snapshots[role].identity,other)||dep.prs(r).length||!equal(policy(role),snapshots[role].policy))throw Error('reactivation actor/policy changed')
    const selected=dep.select(e.cwd)
    if(activated[role]){if(selected.selector.serviceId!==activated[role]||!same({...selected.selector,cwd:selected.selector.receiverCwd},e)||selected.selector.build!==preparedBuild)throw Error('reactivation successor selection changed')}
    else if(!equal(selected,snapshots[role].selection))throw Error('reactivation predecessor selection changed')
   }
  }
  const child=(step,submission)=>runRestoredPairChild(context,step,submission,{signal,run:dependencies.run})
  const scopedChild=(step,operation,args)=>child(step,{operation,arguments:args,idempotency_key:'restored-pair:'+jobId+':'+step,timeout_sec:120})
  const read=(role,id,family=false)=>dep.nativeRead(binding[role].sessionId,id,binding[family?role:role==='primary'?'standby':'primary'].sessionId,{family,signal,jobId:restoredPairReadJobId(jobId,family?'family':'read-'+role),timeoutMs:20000})
  try{
   const callbacks={guard,record:context.record,preflight:()=>dep.inspectPlan(restorationJobId,expectedRootSha256,{signal,restorationKind}),
    prepare:async role=>{const r=await child('prepare-'+role,restoredPairChildSubmission(plan,jobId,'prepare-'+role));prepared[role]=r.serviceId;progress?.('prepared '+role);return r},
    quiesce:()=>child('quiesce-survivor',restoredPairChildSubmission(plan,jobId,'quiesce-survivor')),
    retire:()=>child('retire-survivor',restoredPairChildSubmission(plan,jobId,'retire-survivor')),
    activate:async(role,id)=>{const r=await scopedChild('activate-'+role,'broker_service_activate',{session:binding[role].sessionId,service_id:id,experimental:true,stable_hook:true,...role===lost?{cold_rebind:true}:{}});activated[role]=id;return r},
    readiness:(role,id)=>waitIndependentReadiness({signal},{guard,inspect:()=>dep.status(binding[role].sessionId,id,{signal}),now:Date.now,wait:()=>sleep(100)}),
    policy:(role,id)=>scopedChild('policy-'+role,'broker_service_policy_probe',{session:binding[role].sessionId,service_id:id,experimental:true,timeout_sec:20}),
    read,
    verifyPair:async()=>{const result={qualified:true,rolesPreserved:true,settingsPreserved:true,noUnresolvedAttempts:true};for(const role of roles){const status=await dep.status(binding[role].sessionId,prepared[role],{signal}),after=policy(role,prepared[role]),before=snapshots[role].policy;if(status.verified!==true||!status.readinessObserved||!status.nativePolicyObserved||status.admissionStopped||status.expired||status.terminalAttemptReviewComplete!==true||!Array.isArray(status.unresolvedRequestIds)||status.unresolvedRequestIds.length||!recoveredRoleMatches(plan.roles[role],status)||after.settingsHash!==before.settingsHash||after.receiverHook?.anchorSha256!==before.receiverHook.anchorSha256)throw Error('reactivated role/settings/readiness unqualified');result[role]={...plan.currentEpochs[role],serviceId:prepared[role]}}return result},
    family:id=>read('primary',id,true),
    enroll:r=>dep.enroll({session:binding.standby.sessionId,service_id:prepared.standby,session_id:primary,target_service_id:prepared.primary,family_request_id:r.family.requestId},{signal,expectedSha256:plan.enrollmentSha256,restoredPairJobId:jobId}),
    metadataEnrollment:async()=>{if(!equal(metadata,dep.metadata(binding.standby.sessionId)))throw Error('metadata enrollment changed before rebind');if(!metadata.enrolled)return {qualified:true,enrolled:false};const r=await scopedChild('rebind-metadata','broker_service_rebind_metadata',{session:primary,session_id:binding.standby.sessionId,expected_enrollment_sha256:metadata.enrollmentSha256,experimental:true});if(r.rebound!==true||r.verified!==true)throw Error('metadata rebind unverified');return {qualified:true,...r}},
    verifyEnrollment:async()=>{await guard();const row=dep.enrollment(primary),m=dep.metadata(binding.standby.sessionId);if(roles.some(role=>row[role].serviceId!==prepared[role]||!same(row[role],plan.currentEpochs[role]))||row.automaticRecovery!==binding.automaticRecovery||metadata.enrolled&&(!m.enrolled||m.enrollment.controllerSession!==primary||!same(m.enrollment.target,plan.currentEpochs.standby)))throw Error('final restored pair enrollment differs');return {qualified:true,enrollmentSha256:standbyEnrollmentDigest(row)}}
   };const result=await(readinessCheckpoint?continueRestoredPairFromReadiness(readinessCheckpoint,callbacks):runRestoredPairReactivation(plan,callbacks));ledger.phase='completed';ledger.results=result;save();return {qualified:true,restorationJobId,reactivationJobId:jobId,primarySession:primary,standbySession:binding.standby.sessionId,serviceId:prepared.primary,standbyServiceId:prepared.standby,enrollmentSha256:result.verifyEnrollment.enrollmentSha256,importRepeated:false,replayAuthorized:false,reactivationFile:context.file,retrySafe:false}
  }catch(error){context.fail(error);throw new DriverError('restored pair reactivation stopped; inspect original root and children without replay',{category:'restored_pair_unresolved',detail:{jobId,reactivationFile:context.file,phase:ledger.phase,childJobs:Object.fromEntries(Object.entries(ledger.children).map(([k,c])=>[k,c.jobId??null])),retrySafe:false}})}
 },{signal,timeoutMs:60000})
}
