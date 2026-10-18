import {ordinarySessionBinding,ordinarySessionBindingValid} from './ordinary-session-control.mjs'
import {recoverEnrolledController} from './enrolled-recovery.mjs'
import {join} from 'node:path'
import {writeFileSync} from 'node:fs'
import {STATE_DIR,ensureDir,writeJsonAtomic,withLock} from './state.mjs'
import {getRecord,openPrs,callerHostSession} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {inspectIndependentService} from './independent-service-result.mjs'
import {metadataTargetRegistered} from './native-metadata-control.mjs'
import {nativeSendTargetMatches} from './native-send-control.mjs'
import {DriverError} from './paths.mjs'
const sid=/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const sameTarget=(a,b)=>!!(a&&b&&['sessionId','cwd','pid','procStart'].every(k=>a[k]===b[k]))
export function planNativeControlMaintenance(s,{count=1,capabilities=[],now=Date.now()}={}){
 const refuse=reason=>({action:'inspect',reason})
 if(!Number.isSafeInteger(now)||!Number.isInteger(count)||count<1||count>4||!Array.isArray(capabilities)||capabilities.some(k=>!['metadataModelControl','metadataSendControl','metadataStopControl','sessionManagementControl','sessionMetadataControl','sessionSendControl','sessionArchiveControl'].includes(k)))return refuse('invalid-input')
 if(!s?.verified||s.verificationMode!=='live-native'||s.sourceDisposition!=='installed'||s.nativeEpochAssessed!==true||s.admissionStopped!==false||s.nativeInputRequired!==false||s.nativeEpoch?.status!=='idle'||s.terminalAttemptReviewComplete!==true||!Array.isArray(s.unresolvedRequestIds)||s.unresolvedRequestIds.length||capabilities.some(k=>s[k]!==true))return refuse('owner-epoch-controls-or-grants')
 if(!Number.isSafeInteger(s.deadline)||!Number.isInteger(s.unreservedSlots)||s.unreservedSlots<0)return refuse('budget-unqualified')
 if(s.deadline-now<Math.max(90000,count*25000+5000)||s.unreservedSlots<count)return {action:'renew',reason:'whole-operation-margin'}
 if(!s.readinessObserved)return refuse('native-readiness-not-observed')
 if(!s.nativePolicyObserved)return s.unreservedSlots<count+1?{action:'renew',reason:'probe-and-operation-budget'}:{action:'probe',reason:'native-policy-not-observed'}
 return {action:'ready',reason:'whole-operation-admitted'}
}
export async function runNativeControlMaintenance(d,options){
 const before=await d.inspect(),plan=planNativeControlMaintenance(before.status,options)
 await d.guard(before)
 if(plan.action==='inspect')throw Error(plan.reason)
 if(plan.action==='ready')return before
 await d.record('before-'+plan.action,{previousServiceId:before.status.serviceId})
 const maintenance=await d.maintain(plan.action,before.status.serviceId)
 await d.record('after-'+plan.action,{maintenance})
 const after=await d.inspect();await d.guard(after)
 if(plan.action==='renew'&&after.status.serviceId!==maintenance.serviceId||plan.action==='probe'&&after.status.serviceId!==before.status.serviceId||!(after.status.metadataTarget===undefined&&before.status.metadataTarget===undefined||sameTarget(after.status.metadataTarget,before.status.metadataTarget))||after.status.nativeEpoch.pid!==before.status.nativeEpoch.pid||after.status.nativeEpoch.procStart!==before.status.nativeEpoch.procStart||['metadataModelControl','metadataSendControl','metadataStopControl','sessionManagementControl','sessionMetadataControl','sessionSendControl','sessionArchiveControl'].some(k=>(before.status[k]===true)!==(after.status[k]===true))||planNativeControlMaintenance(after.status,options).action!=='ready')throw Error('maintenance successor changed scope or is not admitted')
 await d.record('ready',{serviceId:after.status.serviceId})
 return {...after,maintenanceJobId:maintenance.jobId}
}
// Inspection may return an unqualified offline status instead of throwing.
// Only independently absent peers may reach the guarded recovery primitive.
export async function inspectNativeControllerOrRecover(d){
 let before,error
 try{before=await d.inspect()}catch(e){error=e}
 if(!error&&before?.status?.verified===true&&before.status.verificationMode==='live-native')return before
 if(d.recoveryAttempted()||d.hasPeer()){
  if(error)throw error
  return before
 }
 await d.recover()
 return d.inspect()
}
export async function maintainNativeController(controller,target,{jobId,signal,count=1,capabilities=[],idleTarget=false,ordinaryBinding}={}){
 if(!sid.test(controller||'')||!sid.test(target||'')||controller===target||[controller,target].includes(callerHostSession())||!/^j[a-f0-9]{32}$/.test(jobId||''))throw new DriverError('controller maintenance requires exact owned durable operation',{category:'bad_args'})
 return withLock('independent-route-'+controller,async()=>{
  let ledger,file,coldRecovery
  const save=()=>{ledger.updatedAt=Date.now();writeJsonAtomic(file,ledger)}
  try{return await runNativeControlMaintenance({
   inspect:()=>inspectNativeControllerOrRecover({
    inspect:async()=>{const selected=loadReceiverSelection(getRecord(controller).cwd),status=await inspectIndependentService(controller,selected.selector.serviceId,{signal});return {selected,status,...coldRecovery?{coldRecoveryJobId:coldRecovery.coldRecoveryJobId,standbyRebindRequired:coldRecovery.standbyRebindRequired,standbyRebindContextId:coldRecovery.standbyRebindContextId}:{}}},
    hasPeer:()=>!!peerRecord(controller),recoveryAttempted:()=>!!coldRecovery,
    recover:async()=>{coldRecovery=await recoverEnrolledController(controller,{jobId,signal,automatic:true,routeLockHeld:true,intendedTarget:target,capabilities,idleTarget,ordinaryBinding})}
   }),
   guard:async({selected,status})=>{if(signal?.aborted)throw Error('maintenance cancelled');const t=status.metadataTarget,r=getRecord(target),peer=ordinaryBinding?null:peerRecord(target);if(ordinaryBinding){if(!ordinarySessionBindingValid(ordinaryBinding,controller)||ordinaryBinding.sessionId!==target||JSON.stringify(ordinarySessionBinding(r,controller))!==JSON.stringify(ordinaryBinding)||selected.selector.sessionId!==controller||status.serviceId!==selected.selector.serviceId||status.nativeEpoch?.pid!==selected.selector.pid||status.nativeEpoch?.procStart!==selected.selector.procStart||[status,selected.policy,selected.pointer].some(x=>x.sessionManagementControl!==true)||capabilities.some(k=>selected.policy[k]!==true))throw Error('ordinary maintenance target or capability unqualified');return}if(selected.selector.sessionId!==controller||status.serviceId!==selected.selector.serviceId||status.nativeEpoch?.pid!==selected.selector.pid||status.nativeEpoch.procStart!==selected.selector.procStart||selected.pointer.nativeMetadataTargetVersion!==1||selected.policy.nativeMetadataTargetVersion!==1||!sameTarget(t,selected.policy.metadataTarget)||t?.sessionId!==target||capabilities.some(k=>selected.policy[k]!==true)||!nativeSendTargetMatches({target:t,record:r,peer,registered:t&&metadataTargetRegistered(t,{controlStateDir:STATE_DIR}),openPrCount:r?openPrs(r).length:null})||idleTarget&&peer.status!=='idle')throw Error('maintenance target or policy unqualified')},
   record:async(phase,data)=>{if(!ledger){file=join(ensureDir(join(STATE_DIR,'native-controller-maintenance')),jobId+'.json');const initial={schemaVersion:1,parentJobId:jobId,controller,target,count,capabilities,phase,steps:[],at:Date.now(),retrySafe:false};writeFileSync(file,JSON.stringify(initial),{flag:'wx',mode:0o600});ledger=initial}ledger.phase=phase;ledger.steps.push({phase,...data,at:Date.now()});save()},
   maintain:async(action,serviceId)=>{const operation=action==='renew'?'broker_service_renew':'broker_service_policy_probe',submission={operation,arguments:{session:controller,service_id:serviceId,experimental:true,...action==='renew'?{lifetime_sec:3600,max_requests:64}:{timeout_sec:20}},idempotency_key:'native-controller-maintenance:'+jobId,timeout_sec:120};ledger.submission=submission;save();const {runOp}=await import('./driver.mjs'),job=await runOp('driver_submit',submission);ledger.jobId=job.jobId;save();for(;;){if(signal?.aborted)throw Error('maintenance child may continue; inspect original');const observed=await runOp('driver_wait',{job_id:job.jobId,timeout_sec:10,include_result:true},{signal});ledger.observation=observed;save();if(observed.state==='completed')return {...observed.result,jobId:job.jobId};if(!['queued','running'].includes(observed.state))throw Error('maintenance child failed or unresolved')}}
  },{count,capabilities})}catch(error){if(error.category==='native_controller_recovery_unresolved')throw error;if(coldRecovery)throw new DriverError('primary recovered but original control admission failed',{category:'native_controller_recovery_unresolved',detail:{coldRecoveryJobId:coldRecovery.coldRecoveryJobId,targetDispatched:false,recoveryMayHaveRun:true,retrySafe:false}});if(ledger){ledger.failure={at:Date.now(),category:error.category??'controller-maintenance-unresolved'};save()}throw new DriverError('controller maintenance not admitted or unresolved; inspect original parent before effects',{category:ledger?'native_controller_maintenance_unresolved':'native_controller_unqualified',detail:{parentJobId:jobId,maintenanceJobId:ledger?.jobId??null,maintenanceFile:file??null,...!ledger?{dispatched:false}:{targetDispatched:false,maintenanceMayHaveRun:true},retrySafe:!ledger}})}
 },{timeoutMs:60000,signal})
}
