import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {writeFileSync} from 'node:fs'
import {STATE_DIR,ensureDir,withLock,writeJsonAtomic} from './state.mjs'
import {readReceiverFile,loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {getRecord} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {inspectJob} from './jobs.mjs'
import {inspectIndependentService,readIndependentService} from './independent-service-result.mjs'
import {readStandbyEnrollment,standbyEnrollmentDigest,enrollStandby,inspectEnrolledStandby} from './standby-enrollment.mjs'
import {recoveryRoleFromHistory,recoveryRoleProofMatches} from './recovery-role.mjs'
import {DriverError} from './paths.mjs'
const hash=x=>createHash('sha256').update(x).digest('hex'),job=/^j[a-f0-9]{32}$/
const same=(a,b)=>a&&b&&['pid','procStart'].every(k=>a[k]===b[k])
export function qualifyLateRenewalReadiness({original,parent,binding,selection,predecessor,current,oldPolicy,newPolicy,now=Date.now()}={}){
 const r=original,sid=binding?.primary?.sessionId,old=binding?.primary
 if(!r||!job.test(r.jobId||'')||r.sessionId!==sid||r.serviceId!==old?.serviceId||r.successorServiceId!==r.jobId.slice(1)||r.phase!=='before-readiness'||r.failureCategory!=='independent_service_readiness_timeout'||!Number.isSafeInteger(r.failedAt)||r.failedAt>now||r.standbyRefresh!==undefined||Object.keys(r.results??{}).sort().join(',')!=='activate,prepare,quiesce,retire')throw Error('exact readiness-timeout renewal required')
 if(parent?.jobId!==r.jobId||parent.operation!=='broker_service_renew'||parent.state!=='failed'||parent.args?.session!==sid||parent.args.service_id!==r.serviceId||parent.error?.category!=='independent_service_renew_unresolved'||parent.error.detail?.phase!==r.phase||parent.error.detail?.successorServiceId!==r.successorServiceId)throw Error('original failed job changed')
 const a=r.results;if(a.prepare.serviceId!==r.successorServiceId||a.prepare.prepared!==true||a.prepare.verified!==true||a.activate.serviceId!==r.successorServiceId||a.activate.installed!==true||a.quiesce.serviceId!==r.serviceId||a.quiesce.quiescent!==true||a.quiesce.terminalAttemptReviewComplete!==true||a.retire.serviceId!==r.serviceId||a.retire.filesRetired!==true||a.retire.terminalAttemptReviewComplete!==true)throw Error('original completed turnover unqualified')
 if(selection?.selector?.sessionId!==sid||selection.selector.serviceId!==r.successorServiceId||!same(selection.selector,old)||selection.selector.build!==a.prepare.build||!current?.verified||current.verificationMode!=='live-native'||current.sourceDisposition!=='installed'||current.serviceId!==r.successorServiceId||current.sessionId!==sid||!same(current.nativeEpoch,old)||current.nativeEpoch.status!=='idle'||current.nativeInputRequired!==false||current.build!==selection.selector.build||current.readinessObserved!==true||current.nativePolicyObserved!==false||current.admissionStopped!==false||current.expired!==false||!Number.isSafeInteger(current.deadline)||!Number.isInteger(current.unreservedSlots)||current.deadline-now<90000||current.unreservedSlots<3||current.attemptsReviewed!==0||current.terminalAttemptReviewComplete!==true||current.unresolvedRequestIds?.length)throw Error('late readiness or untouched same-epoch successor unqualified')
 if(!predecessor?.verified||predecessor.serviceId!==r.serviceId||predecessor.verificationMode!=='historical-retired'||predecessor.sourceDisposition!=='files-retired'||predecessor.admissionStopped!==true||predecessor.stopMarkerMatchesGeneration!==true||!same(predecessor.nativeEpoch,old))throw Error('retired predecessor changed')
 const roleArgs={sessionId:sid,receiverCwd:old.cwd,admitTarget:t=>['sessionId','cwd','pid','procStart'].every(k=>t[k]===binding.standby[k])}
 if(!recoveryRoleProofMatches(recoveryRoleFromHistory(current,newPolicy,roleArgs),recoveryRoleFromHistory(predecessor,oldPolicy,roleArgs))||oldPolicy.settingsHash!==newPolicy.settingsHash||oldPolicy.receiverHook?.anchorSha256!==newPolicy.receiverHook?.anchorSha256)throw Error('late readiness authority changed')
 return {qualified:true,sessionId:sid,serviceId:r.successorServiceId,originalRenewalJobId:r.jobId,originalOutcomePreserved:true,repeatInstallationAuthorized:false}
}
export async function runLateRenewalContinuation(d){
 await d.guard();await d.record('before-policy');const policy=await d.policy();await d.record('after-policy',policy)
 if(policy?.terminalRefusalVerified!==true||policy.policyInvocationObserved!==true)throw Error('continued policy unqualified')
 await d.guard();await d.record('before-family');const family=await d.family();await d.record('after-family',family)
 if(family?.receiptVerified!==true||family.state!=='completed')throw Error('continued family unresolved')
 await d.guard();await d.record('before-enroll');const enrollment=await d.enroll(family);await d.record('after-enroll',enrollment)
 if(enrollment?.verified!==true||enrollment.enrolled!==true||enrollment.automaticRecoveryEnabled!==true)throw Error('continued enrollment unqualified')
 const result=await d.verify(enrollment);await d.record('completed',result);return result
}
export async function continueRenewalReadiness(primary,originalJobId,expectedOriginalSha256,expectedEnrollmentSha256,{jobId,signal}={}){
 if(!job.test(jobId||'')||!job.test(originalJobId||'')||jobId===originalJobId||![expectedOriginalSha256,expectedEnrollmentSha256].every(x=>/^[a-f0-9]{64}$/.test(x||'')))throw new DriverError('exact failed renewal, digests and distinct durable continuation required',{category:'bad_args'})
 return withLock('independent-route-'+primary,async()=>{
  const originalFile=join(STATE_DIR,'independent-service-renewals',originalJobId+'.json'),bytes=readReceiverFile(originalFile,1048576),original=JSON.parse(bytes),binding=readStandbyEnrollment(primary),record=getRecord(primary),selection=loadReceiverSelection(record.cwd)
  if(hash(bytes)!==expectedOriginalSha256||standbyEnrollmentDigest(binding)!==expectedEnrollmentSha256||binding.schemaVersion!==2||binding.automaticRecovery!==true)throw Error('continuation source or binding changed')
  const serviceId=original.successorServiceId,policy=id=>JSON.parse(readReceiverFile(join(record.cwd,'.claude-driver-services',id,'broker','stop-rescue-policy.json'),65536)),parent=await inspectJob(originalJobId,{includeResult:true}),predecessor=await inspectIndependentService(primary,original.serviceId,{historical:true,signal}),current=await inspectIndependentService(primary,serviceId,{signal})
  qualifyLateRenewalReadiness({original,parent,binding,selection,predecessor,current,oldPolicy:policy(original.serviceId),newPolicy:policy(serviceId)})
  const file=join(ensureDir(join(STATE_DIR,'renewal-readiness-continuations')),jobId+'.json'),ledger={schemaVersion:1,jobId,originalRenewalJobId:originalJobId,originalRenewalSha256:expectedOriginalSha256,expectedEnrollmentSha256,serviceId,sessionId:primary,phase:'prepared',originalOutcomePreserved:true,children:{},steps:[],at:Date.now(),retrySafe:false};let finalDigest
  const claim=join(ensureDir(join(STATE_DIR,'renewal-readiness-claims')),originalJobId+'.json');writeFileSync(claim,JSON.stringify({schemaVersion:1,originalRenewalJobId:originalJobId,originalRenewalSha256:expectedOriginalSha256,continuationJobId:jobId,at:Date.now()}),{flag:'wx',mode:0o600})
  writeFileSync(file,JSON.stringify(ledger),{flag:'wx',mode:0o600});const save=()=>writeJsonAtomic(file,ledger)
  const guard=async()=>{const r=getRecord(primary),p=peerRecord(primary),s=loadReceiverSelection(record.cwd);if(signal?.aborted||hash(readReceiverFile(originalFile,1048576))!==expectedOriginalSha256||standbyEnrollmentDigest(readStandbyEnrollment(primary))!==(finalDigest??expectedEnrollmentSha256)||JSON.stringify(s)!==JSON.stringify(selection)||r.cwd!==binding.primary.cwd||r.isArchived||r.permissionMode!=='bypassPermissions'||!p||p.pid!==binding.primary.pid||p.procStart!==binding.primary.procStart||p.status!=='idle')throw Error('late continuation owner changed')}
  try{const result=await runLateRenewalContinuation({guard,record:async(phase,value)=>{ledger.phase=phase;ledger.steps.push({phase,at:Date.now()});if(value)ledger[phase]=value;save()},
   policy:async()=>{const submission={operation:'broker_service_policy_probe',arguments:{session:primary,service_id:serviceId,experimental:true,timeout_sec:20},idempotency_key:'late-readiness-policy:'+jobId,timeout_sec:60};ledger.policySubmission=submission;save();const {runOp}=await import('./driver.mjs'),child=await runOp('driver_submit',submission);ledger.children.policy=child.jobId;save();for(;;){if(signal?.aborted)throw Error('policy child may continue');const observed=await runOp('driver_wait',{job_id:child.jobId,timeout_sec:10,include_result:true},{signal});ledger.policyObservation=observed;save();if(observed.state==='completed')return observed.result;if(!['queued','running'].includes(observed.state))throw Error('continued policy failed or uncertain')}},
   family:()=>readIndependentService(primary,serviceId,primary,{family:true,jobId:'j'+hash('late-readiness-family:'+jobId).slice(0,32),signal,timeoutMs:20000}),
   enroll:async family=>{const e=await enrollStandby({session:binding.standby.sessionId,service_id:binding.standby.serviceId,session_id:primary,target_service_id:serviceId,family_request_id:family.requestId},{signal,expectedSha256:expectedEnrollmentSha256});finalDigest=e.enrollmentSha256;return e},
   verify:async e=>{await guard();const status=await inspectIndependentService(primary,serviceId,{signal}),plan=await inspectEnrolledStandby(primary,{signal});if(!status.verified||!status.readinessObserved||!status.nativePolicyObserved||status.unresolvedRequestIds?.length||status.expired||plan.action!=='wait'||plan.reason!=='primary-live')throw Error('continued service or pair not admitted');return {sessionId:primary,serviceId,verified:true,readAdmissionQualified:true,enrollmentSha256:e.enrollmentSha256,standbyRefreshQualified:true,originalRenewalJobId:originalJobId,originalOutcomePreserved:true,installationRepeated:false,servingQualified:false,continuationFile:file}}
  });return result}catch(error){ledger.failure={category:error.category??'late-readiness-continuation-unresolved',at:Date.now()};save();throw new DriverError('late readiness continuation stopped; inspect original root and children without replay',{category:'late_readiness_continuation_unresolved',detail:{jobId,originalJobId,phase:ledger.phase,continuationFile:file,policyJobId:ledger.children.policy??null,retrySafe:false}})}
 },{timeoutMs:60000,signal})
}
