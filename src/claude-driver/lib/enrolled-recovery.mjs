import {ordinarySessionBinding,ordinarySessionBindingValid} from './ordinary-session-control.mjs'
import {renewIndependentService} from './independent-service-renew.mjs'
import {createHash} from 'node:crypto'
import {rebindEnrolledStandby} from './standby-rebind.mjs'
import {join} from 'node:path'
import {writeFileSync} from 'node:fs'
import {STATE_DIR,ensureDir,writeJsonAtomic} from './state.mjs'
import {readStandbyEnrollment,standbyEnrollmentDigest,inspectEnrolledStandby,standbyRefreshAllowed} from './standby-enrollment.mjs'
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
export async function runEnrolledStandbyAdmission(d){
 const before=await d.inspect()
 if(before.action==='recover'&&before.coldRecoveryEligible===true)return
 if(before.action!=='renew-standby')throw Error('standby is not eligible for cold admission or lease renewal')
 await d.record('before-standby-renew');await d.guard()
 const renewed=await d.renew();await d.record('after-standby-renew',renewed)
 await d.refresh(renewed)
 const after=await d.inspect()
 if(after.action!=='recover'||after.coldRecoveryEligible!==true)throw Error('renewed standby cold admission unqualified')
}
export async function runEnrolledRecoveryAndRebind(d){
 const recovered=await d.recover()
 if(recovered?.coldRecoveryPerformed!==true||recovered.standbyRebindRequired!==true)throw Error('verified cold recovery required before rebind')
 await d.record('before-rebind')
 const rebound=await d.rebind(recovered);await d.record('after-rebind',rebound)
 if(rebound?.verified!==true||rebound.standbyRebindRequired!==false||rebound.primarySession!==recovered.primarySession||rebound.enrollment?.verified!==true||rebound.enrollment.automaticRecoveryEnabled!==true||rebound.enrollment.primaryServiceId!==recovered.serviceId||!/^[a-f0-9]{64}$/.test(rebound.enrollment.enrollmentSha256||'')||!/^j[a-f0-9]{32}$/.test(rebound.contextId||''))throw Error('standby rebind not verified for recovered primary')
 return {...recovered,standbyRebindRequired:false,standbyRebindContextId:rebound.contextId,enrollmentSha256:rebound.enrollment.enrollmentSha256}
}
export async function recoverEnrolledController(primary,{jobId,signal,expectedSha256,automatic=false,intendedTarget,capabilities=[],idleTarget=false,ordinaryBinding,routeLockHeld=false}={}){
 if(!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(primary||'')||!/^j[a-f0-9]{32}$/.test(jobId||''))throw new DriverError('enrolled recovery requires exact durable primary',{category:'bad_args'})
 let row=readStandbyEnrollment(primary),digest=row&&standbyEnrollmentDigest(row)
 if(!automatic&&!/^[a-f0-9]{64}$/.test(expectedSha256||''))throw new DriverError('exact enrollment digest required',{category:'bad_args'})
 if(!row||expectedSha256!==undefined&&expectedSha256!==digest||automatic&&!(row.schemaVersion===2&&row.automaticRecovery===true))throw new DriverError('exact standby recovery enrollment not enabled or digest changed',{category:'native_controller_recovery_unqualified',detail:{dispatched:false,retrySafe:true}})
 const file=join(ensureDir(join(STATE_DIR,'enrolled-controller-recoveries')),jobId+'.json');let ledger
 const save=()=>{ledger.updatedAt=Date.now();writeJsonAtomic(file,ledger)}
 const guard=async({allowStandbyMaintenance=false}={})=>{
  if(signal?.aborted||standbyEnrollmentDigest(readStandbyEnrollment(primary))!==digest)throw Error('recovery cancelled or enrollment changed')
  const plan=await inspectEnrolledStandby(primary,{signal,allowStandbyMaintenance});if(!(plan.action==='recover'&&plan.coldRecoveryEligible)&&!(allowStandbyMaintenance&&plan.action==='renew-standby'))throw Error('primary is live or recovery evidence changed')
  if(intendedTarget&&ordinaryBinding){const selected=loadReceiverSelection(row.primary.cwd);if(!ordinarySessionBindingValid(ordinaryBinding,primary)||ordinaryBinding.sessionId!==intendedTarget||JSON.stringify(ordinarySessionBinding(getRecord(intendedTarget),primary))!==JSON.stringify(ordinaryBinding)||[selected.policy,selected.pointer].some(x=>x.sessionManagementControl!==true)||capabilities.some(k=>k!=='sessionManagementControl'||selected.policy[k]!==true))throw Error('ordinary control intent does not match retained role')}
  if(intendedTarget&&!ordinaryBinding){const selected=loadReceiverSelection(row.primary.cwd),t=selected.policy.metadataTarget,r=getRecord(intendedTarget),peer=peerRecord(intendedTarget);if(t?.sessionId!==intendedTarget||capabilities.some(k=>!['metadataModelControl','metadataSendControl','metadataStopControl'].includes(k)||selected.policy[k]!==true)||!nativeSendTargetMatches({target:t,record:r,peer,registered:metadataTargetRegistered(t,{controlStateDir:STATE_DIR}),openPrCount:r?openPrs(r).length:null})||idleTarget&&peer.status!=='idle')throw Error('original control intent does not match retained role')}
 }
 const record=async(phase,result)=>{if(!ledger){const initial={schemaVersion:1,parentJobId:jobId,primary,enrollmentSha256:digest,phase,steps:[],at:Date.now(),retrySafe:false};writeFileSync(file,JSON.stringify(initial),{flag:'wx',mode:0o600});ledger=initial}ledger.phase=phase;ledger.steps.push({phase,at:Date.now()});if(result)ledger.result=result;save()}
 try{
 await runEnrolledStandbyAdmission({
  inspect:async()=>{await guard({allowStandbyMaintenance:true});return inspectEnrolledStandby(primary,{signal,allowStandbyMaintenance:true})},guard:()=>guard({allowStandbyMaintenance:true}),
  record:async(phase,result)=>{await record(phase,result);if(phase==='before-standby-renew'){ledger.standbyRenewContextId='j'+createHash('sha256').update('enrolled-standby-renew:'+jobId).digest('hex').slice(0,32);save()}},
  renew:()=>renewIndependentService(row.standby.sessionId,row.standby.serviceId,{jobId:ledger.standbyRenewContextId,signal,lifetimeSec:3600,maxRequests:32,absentPrimaryBinding:{sessionId:primary,expectedSha256:digest}}),
  refresh:async renewed=>{const entry=renewed.standbyEnrollmentRefreshes?.find(x=>x.primarySession===primary),next=readStandbyEnrollment(primary);if(entry?.qualified!==true||!next||!standbyRefreshAllowed(row,next,digest)||next.standby.serviceId!==renewed.serviceId||next.primary.serviceId!==row.primary.serviceId||next.familyRequestId!==row.familyRequestId||entry.result?.enrollmentSha256!==standbyEnrollmentDigest(next)||(next.automaticRecovery===true)!==(row.automaticRecovery===true))throw Error('renewal binding refresh unqualified');ledger.priorEnrollmentSha256=digest;row=next;digest=standbyEnrollmentDigest(next);ledger.enrollmentSha256=digest;save()}
 })
 const recover=()=>runEnrolledColdRecovery({guard,plan:()=>inspectEnrolledStandby(primary,{signal}),record,
  recover:async()=>{const submission={operation:'broker_service_recover',arguments:{session:row.standby.sessionId,service_id:row.standby.serviceId,session_id:primary,target_service_id:row.primary.serviceId,family_request_id:row.familyRequestId,experimental:true},idempotency_key:'enrolled-controller-recovery:'+jobId,timeout_sec:180};ledger.submission=submission;save();const {runOp}=await import('./driver.mjs'),child=await runOp('driver_submit',submission);ledger.childJobId=child.jobId;save();for(;;){if(signal?.aborted)throw Error('recovery child may continue; inspect original');const observed=await runOp('driver_wait',{job_id:child.jobId,timeout_sec:10,include_result:true},{signal});ledger.observation=observed;save();if(observed.state==='completed')return observed.result;if(!['queued','running'].includes(observed.state))throw new DriverError('recovery child failed or uncertain',{category:observed.error?.detail?.failureCategory??observed.error?.category??'recovery-child-unresolved',detail:{nativeFailure:observed.error?.detail?.nativeFailure}})}},
  verify:async result=>{if(signal?.aborted)throw Error('parent cancelled after recovery');const r=getRecord(primary),p=peerRecord(primary),selected=loadReceiverSelection(r.cwd),s=await inspectIndependentService(primary,result.serviceId,{signal});if(r.cwd!==row.primary.cwd||!p||p.pid===row.primary.pid||p.procStart===row.primary.procStart||selected.selector.serviceId!==result.serviceId||s.readinessObserved!==true||s.nativePolicyObserved!==true||s.unresolvedRequestIds?.length||s.nativeEpoch.pid!==p.pid||s.nativeEpoch.procStart!==p.procStart)throw Error('recovered primary epoch or readiness unqualified');return {primarySession:primary,serviceId:result.serviceId,coldRecoveryJobId:ledger.childJobId,coldRecoveryPerformed:true,standbyRebindRequired:true,newEpoch:{pid:p.pid,procStart:p.procStart},targetDispatched:false}}
 })
 if(!automatic)return await recover()
 const contextId='j'+createHash('sha256').update('enrolled-recovery-rebind:'+jobId).digest('hex').slice(0,32)
 return await runEnrolledRecoveryAndRebind({recover,
  record:async(phase,result)=>{ledger.rebindPhase=phase;ledger.standbyRebindContextId=contextId;ledger.steps.push({phase,at:Date.now()});if(result)ledger.rebindResult=result;save()},
  rebind:async()=>({...await rebindEnrolledStandby(primary,jobId,digest,{jobId:contextId,signal,routeLockHeld}),contextId})
 })
 }catch(error){if(error.code==='EEXIST')throw new DriverError('original recovery ledger exists; inspect original parent',{category:'native_controller_recovery_unresolved',detail:{parentJobId:jobId,recoveryFile:file,targetDispatched:false,recoveryMayHaveRun:true,retrySafe:false}});if(ledger){ledger.failure={at:Date.now(),category:error.category??'enrolled-recovery-unresolved',nativeFailure:error.detail?.nativeFailure};save()}throw new DriverError('enrolled recovery refused or unresolved; never replay original child',{category:ledger?'native_controller_recovery_unresolved':'native_controller_recovery_unqualified',detail:{parentJobId:jobId,failureCategory:error.category??'enrolled-recovery-unresolved',nativeFailure:error.detail?.nativeFailure,coldRecoveryJobId:ledger?.childJobId??null,standbyRebindContextId:ledger?.standbyRebindContextId??null,standbyRenewContextId:ledger?.standbyRenewContextId??null,recoveryFile:ledger?file:null,...ledger?{targetDispatched:false,recoveryMayHaveRun:true}:{dispatched:false},retrySafe:!ledger}})}
}
