import {join} from 'node:path'
import {writeFileSync} from 'node:fs'
import {STATE_DIR,ensureDir,writeJsonAtomic} from './state.mjs'
import {readStandbyEnrollment,standbyEnrollmentDigest,inspectEnrolledStandby} from './standby-enrollment.mjs'
import {getRecord,openPrs} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {inspectIndependentService} from './independent-service-result.mjs'
import {metadataTargetRegistered} from './native-metadata-control.mjs'
import {nativeSendTargetMatches} from './native-send-control.mjs'
import {DriverError} from './paths.mjs'
export async function runEnrolledColdRecovery(d){
 await d.guard();const plan=await d.plan()
 if(plan.action!=='recover'||plan.coldRecoveryEligible!==true)throw Error('cold recovery not eligible')
 await d.record('before-recover');await d.guard()
 const result=await d.recover();await d.record('after-recover',result)
 if(result?.nativeColdRecoveryQualified!==true||result.results?.verify?.rolePreserved!==true)throw Error('cold recovery or role preservation unverified')
 const observed=await d.verify(result);await d.record('verified',observed)
 return observed
}
export async function recoverEnrolledController(primary,{jobId,signal,expectedSha256,automatic=false,intendedTarget,capabilities=[],idleTarget=false}={}){
 if(!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(primary||'')||!/^j[a-f0-9]{32}$/.test(jobId||''))throw new DriverError('enrolled recovery requires exact durable primary',{category:'bad_args'})
 const row=readStandbyEnrollment(primary),digest=row&&standbyEnrollmentDigest(row)
 if(!automatic&&!/^[a-f0-9]{64}$/.test(expectedSha256||''))throw new DriverError('exact enrollment digest required',{category:'bad_args'})
 if(!row||expectedSha256!==undefined&&expectedSha256!==digest||automatic&&!(row.schemaVersion===2&&row.automaticRecovery===true))throw new DriverError('exact standby recovery enrollment not enabled or digest changed',{category:'native_controller_recovery_unqualified',detail:{dispatched:false,retrySafe:true}})
 const file=join(ensureDir(join(STATE_DIR,'enrolled-controller-recoveries')),jobId+'.json');let ledger
 const save=()=>{ledger.updatedAt=Date.now();writeJsonAtomic(file,ledger)}
 const guard=async()=>{
  if(signal?.aborted||standbyEnrollmentDigest(readStandbyEnrollment(primary))!==digest)throw Error('recovery cancelled or enrollment changed')
  const plan=await inspectEnrolledStandby(primary,{signal});if(plan.action!=='recover'||!plan.coldRecoveryEligible)throw Error('primary is live or recovery evidence changed')
  if(intendedTarget){const selected=loadReceiverSelection(row.primary.cwd),t=selected.policy.metadataTarget,r=getRecord(intendedTarget),peer=peerRecord(intendedTarget);if(t?.sessionId!==intendedTarget||capabilities.some(k=>!['metadataModelControl','metadataSendControl','metadataStopControl'].includes(k)||selected.policy[k]!==true)||!nativeSendTargetMatches({target:t,record:r,peer,registered:metadataTargetRegistered(t,{controlStateDir:STATE_DIR}),openPrCount:r?openPrs(r).length:null})||idleTarget&&peer.status!=='idle')throw Error('original control intent does not match retained role')}
 }
 try{return await runEnrolledColdRecovery({guard,plan:()=>inspectEnrolledStandby(primary,{signal}),
  record:async(phase,result)=>{if(!ledger){const initial={schemaVersion:1,parentJobId:jobId,primary,enrollmentSha256:digest,phase,steps:[],at:Date.now(),retrySafe:false};writeFileSync(file,JSON.stringify(initial),{flag:'wx',mode:0o600});ledger=initial}ledger.phase=phase;ledger.steps.push({phase,at:Date.now()});if(result)ledger.result=result;save()},
  recover:async()=>{const submission={operation:'broker_service_recover',arguments:{session:row.standby.sessionId,service_id:row.standby.serviceId,session_id:primary,target_service_id:row.primary.serviceId,family_request_id:row.familyRequestId,experimental:true},idempotency_key:'enrolled-controller-recovery:'+jobId,timeout_sec:180};ledger.submission=submission;save();const {runOp}=await import('./driver.mjs'),child=await runOp('driver_submit',submission);ledger.childJobId=child.jobId;save();for(;;){if(signal?.aborted)throw Error('recovery child may continue; inspect original');const observed=await runOp('driver_wait',{job_id:child.jobId,timeout_sec:10,include_result:true},{signal});ledger.observation=observed;save();if(observed.state==='completed')return observed.result;if(!['queued','running'].includes(observed.state))throw Error('recovery child failed or uncertain')}},
  verify:async result=>{if(signal?.aborted)throw Error('parent cancelled after recovery');const r=getRecord(primary),p=peerRecord(primary),selected=loadReceiverSelection(r.cwd),s=await inspectIndependentService(primary,result.serviceId,{signal});if(r.cwd!==row.primary.cwd||!p||p.pid===row.primary.pid||p.procStart===row.primary.procStart||selected.selector.serviceId!==result.serviceId||s.readinessObserved!==true||s.nativePolicyObserved!==true||s.unresolvedRequestIds?.length||s.nativeEpoch.pid!==p.pid||s.nativeEpoch.procStart!==p.procStart)throw Error('recovered primary epoch or readiness unqualified');return {primarySession:primary,serviceId:result.serviceId,coldRecoveryJobId:ledger.childJobId,coldRecoveryPerformed:true,standbyRebindRequired:true,newEpoch:{pid:p.pid,procStart:p.procStart},targetDispatched:false}}
 })}catch(error){if(error.code==='EEXIST')throw new DriverError('original recovery ledger exists; inspect original parent',{category:'native_controller_recovery_unresolved',detail:{parentJobId:jobId,recoveryFile:file,targetDispatched:false,recoveryMayHaveRun:true,retrySafe:false}});if(ledger){ledger.failure={at:Date.now(),category:error.category??'enrolled-recovery-unresolved'};save()}throw new DriverError('enrolled recovery refused or unresolved; never replay original child',{category:ledger?'native_controller_recovery_unresolved':'native_controller_recovery_unqualified',detail:{parentJobId:jobId,coldRecoveryJobId:ledger?.childJobId??null,recoveryFile:ledger?file:null,...ledger?{targetDispatched:false,recoveryMayHaveRun:true}:{dispatched:false},retrySafe:!ledger}})}
}
