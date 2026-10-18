import {join} from 'node:path'
import {writeFileSync} from 'node:fs'
import {STATE_DIR,ensureDir,withLock,writeJsonAtomic} from './state.mjs'
import {readStandbyEnrollment,standbyEnrollmentDigest,inspectEnrolledStandby} from './standby-enrollment.mjs'
import {inspectPairBootstrap} from './pair-bootstrap-plan.mjs'
import {ordinarySessionBinding,ordinarySessionBindingValid,ordinarySessionsSameStore} from './ordinary-session-control.mjs'
import {getRecord} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {DriverError} from './paths.mjs'
// Runs BEFORE the controller route lock: the durable bootstrap child owns that
// lock itself. A parent must never hold it while waiting on its child.
export async function runAutomaticPairRecovery(d){
 if(await d.hasPrimary())return null
 const enrollment=await d.enrollment()
 if(!enrollment||enrollment.schemaVersion!==2||enrollment.automaticRecovery!==true||await d.hasStandby(enrollment))return null
 await d.guard(enrollment);const plan=await d.plan(enrollment)
 if(plan.bootstrapPreparationEligible!==true)throw Error('automatic pair bootstrap not eligible')
 await d.record('before-bootstrap',{enrollmentSha256:plan.enrollmentSha256});await d.guard(enrollment)
 const child=await d.submit(plan);await d.record('submitted',child)
 const result=await d.wait(child);await d.record('after-bootstrap',result)
 if(result?.qualified!==true||result.primarySession!==enrollment.primary.sessionId||result.standbySession!==enrollment.standby.sessionId||!/^[a-f0-9]{32}$/.test(result.serviceId||'')||!/^[a-f0-9]{64}$/.test(result.enrollmentSha256||''))throw Error('automatic pair result unqualified')
 const observed=await d.verify(result,enrollment);await d.record('verified',observed)
 return {...observed,pairRecoveryJobId:child.jobId,coldRecoveryJobId:child.jobId,standbyRebindRequired:false,targetDispatched:false,recoveryMode:'both-absent-pair'}
}
export async function recoverAbsentPairForControl(controller,target,{jobId,signal,ordinaryBinding,capabilities=[]}={}){
 // Fixed-target operations bind a recipient epoch, so they cannot silently
 // continue against a replacement standby. Ordinary account-bound chats can.
 if(!ordinaryBinding||peerRecord(controller))return null
 return withLock('automatic-pair-recovery-'+controller,async()=>{
  const file=join(ensureDir(join(STATE_DIR,'automatic-pair-recoveries')),jobId+'.json');let ledger
  const save=()=>{ledger.updatedAt=Date.now();writeJsonAtomic(file,ledger)}
  try{return await runAutomaticPairRecovery({
   hasPrimary:()=>!!peerRecord(controller),enrollment:()=>readStandbyEnrollment(controller),hasStandby:row=>!!peerRecord(row.standby.sessionId),
   guard:async row=>{if(signal?.aborted||row.primary.sessionId!==controller||[controller,row.standby.sessionId].includes(target)||standbyEnrollmentDigest(readStandbyEnrollment(controller))!==standbyEnrollmentDigest(row)||!ordinarySessionBindingValid(ordinaryBinding,controller)||ordinaryBinding.sessionId!==target||JSON.stringify(ordinarySessionBinding(getRecord(target),controller))!==JSON.stringify(ordinaryBinding)||!ordinarySessionsSameStore(getRecord(target),getRecord(controller),controller)||peerRecord(controller)||peerRecord(row.standby.sessionId))throw Error('automatic pair intent or absence changed');const selected=loadReceiverSelection(row.primary.cwd);if([selected.pointer,selected.policy].some(x=>x.sessionManagementControl!==true)||capabilities.some(k=>!['sessionManagementControl','sessionMetadataControl','sessionSendControl','sessionArchiveControl','sessionStopControl'].includes(k)||selected.policy[k]!==true))throw Error('automatic pair retained grants unqualified')},
   plan:row=>inspectPairBootstrap(controller,standbyEnrollmentDigest(row),{signal}),
   record:async(phase,data)=>{if(!ledger){ledger={schemaVersion:1,parentJobId:jobId,controller,target,binding:ordinaryBinding,capabilities,phase,steps:[],at:Date.now(),targetDispatched:false,retrySafe:false};writeFileSync(file,JSON.stringify(ledger),{flag:'wx',mode:0o600})}ledger.phase=phase;ledger.steps.push({phase,at:Date.now()});ledger.observation=data;save()},
   submit:async plan=>{const submission={operation:'broker_service_bootstrap_pair',arguments:{session:controller,expected_enrollment_sha256:plan.enrollmentSha256,experimental:true},idempotency_key:'automatic-pair:'+controller+':'+plan.enrollmentSha256,timeout_sec:240};ledger.submission=submission;save();const {runOp}=await import('./driver.mjs'),child=await runOp('driver_submit',submission);ledger.childJobId=child.jobId;save();return child},
   wait:async child=>{const {runOp}=await import('./driver.mjs');for(;;){if(signal?.aborted)throw Error('pair child may continue after parent cancellation');const observed=await runOp('driver_wait',{job_id:child.jobId,timeout_sec:10,include_result:true},{signal});ledger.childObservation=observed;save();if(observed.state==='completed')return observed.result;if(!['queued','running'].includes(observed.state))throw Error('automatic pair child failed or uncertain')}},
   verify:async(result,before)=>{const row=readStandbyEnrollment(controller),plan=await inspectEnrolledStandby(controller,{signal}),p=peerRecord(controller),s=peerRecord(before.standby.sessionId);if(signal?.aborted||!row||row.primary.serviceId!==result.serviceId||row.standby.serviceId!==result.standbyServiceId||standbyEnrollmentDigest(row)!==result.enrollmentSha256||row.automaticRecovery!==true||plan.action!=='wait'||plan.reason!=='primary-live'||!p||!s||p.pid===before.primary.pid||s.pid===before.standby.pid||p.pid!==row.primary.pid||p.procStart!==row.primary.procStart||s.pid!==row.standby.pid||s.procStart!==row.standby.procStart||JSON.stringify(ordinarySessionBinding(getRecord(target),controller))!==JSON.stringify(ordinaryBinding)||!ordinarySessionsSameStore(getRecord(target),getRecord(controller),controller))throw Error('automatic recovered pair or target changed');return {serviceId:row.primary.serviceId,enrollmentSha256:result.enrollmentSha256,verified:true}}
  })}catch(error){if(ledger){ledger.failure={category:error.category??'automatic-pair-recovery-unresolved',at:Date.now()};save()}throw new DriverError('automatic pair recovery refused or unresolved before target dispatch; inspect original recovery child',{category:ledger?'native_controller_recovery_unresolved':'native_controller_pair_recovery_unqualified',detail:{parentJobId:jobId,pairRecoveryJobId:ledger?.childJobId??null,recoveryFile:ledger?file:null,targetDispatched:false,recoveryMayHaveRun:!!ledger,retrySafe:!ledger}})}
 },{timeoutMs:60000,signal})
}
