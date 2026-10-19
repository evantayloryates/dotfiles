import {join} from 'node:path'
import {writeFileSync} from 'node:fs'
import {STATE_DIR,ensureDir,writeJsonAtomic,withLock} from './state.mjs'
import {readReceiverFile,loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {readStandbyEnrollment,standbyEnrollmentDigest} from './standby-enrollment.mjs'
import {readImportContinuation} from './import-recovery-continuation.mjs'
import {getRecord} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {inspectIndependentService} from './independent-service-result.mjs'
import {DriverError} from './paths.mjs'
const job=/^j[a-f0-9]{32}$/
export async function continueEnrolledImport(primary,originalParentJobId,expectedSha256,{jobId,signal}={}){
 if(!job.test(jobId||'')||!job.test(originalParentJobId||'')||jobId===originalParentJobId||!/^[a-f0-9]{64}$/.test(expectedSha256||''))throw new DriverError('exact original parent, binding and distinct durable continuation required',{category:'bad_args'})
 return withLock('independent-route-'+primary,async()=>{
 const read=(dir,id)=>JSON.parse(readReceiverFile(join(STATE_DIR,dir,id+'.json'),1048576)),binding=readStandbyEnrollment(primary),original=read('enrolled-controller-recoveries',originalParentJobId),worker=read('jobs',originalParentJobId)
 const guard=()=>{if(signal?.aborted||!binding||standbyEnrollmentDigest(readStandbyEnrollment(primary))!==expectedSha256||standbyEnrollmentDigest(binding)!==expectedSha256||original.parentJobId!==originalParentJobId||original.primary!==primary||original.enrollmentSha256!==expectedSha256||!original.failure||original.phase!=='before-recover'||worker.id!==originalParentJobId||worker.state!=='failed'||!job.test(original.childJobId||''))throw Error('original enrolled import continuation unqualified');return readImportContinuation(original.childJobId,{session:binding.standby.sessionId,serviceId:binding.standby.serviceId,target:primary,targetServiceId:binding.primary.serviceId,familyRequestId:binding.familyRequestId,actorCwd:binding.standby.cwd})}
 guard();const file=join(ensureDir(join(STATE_DIR,'enrolled-controller-recoveries')),jobId+'.json'),ledger={schemaVersion:1,parentJobId:jobId,originalRecoveryParentJobId:originalParentJobId,primary,enrollmentSha256:expectedSha256,phase:'created',steps:[],retrySafe:false,at:Date.now()},save=()=>writeJsonAtomic(file,ledger)
 writeFileSync(file,JSON.stringify(ledger),{flag:'wx',mode:0o600})
 try{
  guard();ledger.phase='before-recover';save()
  const {runOp}=await import('./driver.mjs'),submission={operation:'broker_service_recover',arguments:{session:binding.standby.sessionId,service_id:binding.standby.serviceId,session_id:primary,target_service_id:binding.primary.serviceId,family_request_id:binding.familyRequestId,import_continuation_job_id:original.childJobId,experimental:true},idempotency_key:'enrolled-import-continuation:'+jobId,timeout_sec:180};ledger.submission=submission;save();const child=await runOp('driver_submit',submission);ledger.childJobId=child.jobId;save()
  let result;for(;;){if(signal?.aborted)throw Error('continuation cancelled; inspect original child');const observed=await runOp('driver_wait',{job_id:child.jobId,timeout_sec:10,include_result:true},{signal});ledger.observation=observed;save();if(observed.state==='completed'){result=observed.result;break}if(!['queued','running'].includes(observed.state))throw Error('continuation child failed; never replay')}
  ledger.phase='after-recover';save();guard()
  const r=getRecord(primary),p=peerRecord(primary),selection=loadReceiverSelection(r?.cwd),s=await inspectIndependentService(primary,result.serviceId,{signal})
  if(result.nativeColdRecoveryQualified!==true||result.recoveryPath!=='verified-import-started-epoch'||result.results?.verify?.rolePreserved!==true||!p||p.pid===binding.primary.pid||p.procStart===binding.primary.procStart||selection.selector.serviceId!==result.serviceId||!s.verified||s.readinessObserved!==true||s.nativePolicyObserved!==true||s.admissionStopped||s.expired||!Array.isArray(s.unresolvedRequestIds)||s.unresolvedRequestIds.length||s.nativeEpoch?.pid!==p.pid||s.nativeEpoch.procStart!==p.procStart)throw Error('continued primary serving evidence unqualified')
  ledger.result={primarySession:primary,serviceId:result.serviceId,coldRecoveryJobId:child.jobId,coldRecoveryPerformed:true,standbyRebindRequired:true,newEpoch:{pid:p.pid,procStart:p.procStart},targetDispatched:false,originalRecoveryParentJobId:originalParentJobId,recoveryPath:result.recoveryPath};ledger.phase='verified';save();return ledger.result
 }catch(error){ledger.failure={at:Date.now(),category:error.category??'import-continuation-unresolved'};save();throw new DriverError('import continuation stopped; reconcile original jobs',{category:'import_continuation_unresolved',detail:{parentJobId:jobId,coldRecoveryJobId:ledger.childJobId,retrySafe:false}})}
 },{timeoutMs:60000,signal})
}
