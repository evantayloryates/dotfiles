import {createHash} from 'node:crypto'
import {writeFileSync,lstatSync} from 'node:fs'
import {join,dirname,resolve} from 'node:path'
import {STATE_DIR,ensureDir,withLock,writeJsonAtomic} from './state.mjs'
import {inspectMissingServiceImport} from './missing-service-plan.mjs'
import {readServiceRecoveryIdentity} from './service-recovery-identity.mjs'
import {readStandbyEnrollment,standbyEnrollmentDigest} from './standby-enrollment.mjs'
import {readReceiverFile,loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {getRecord} from './sessions.mjs'
import {unarchiveViaLink} from './tiera.mjs'
import {withFocus} from './focus.mjs'
import {RUNTIME_BUILD,runtimeFingerprint} from './build.mjs'
import {DriverError} from './paths.mjs'
export function missingServicePlanDigest(plan){
 if(plan?.action!=='prepare'||plan.importPreparationEligible!==true||plan.importAuthorized!==false||plan.effectsPerformed!==false||!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(plan.sessionId||'')||!/^[a-f0-9]{32}$/.test(plan.serviceId||'')||['identitySha256','transcriptFingerprint','enrollmentSha256'].some(k=>!/^[a-f0-9]{64}$/.test(plan[k]||'')))throw Error('qualified missing-service plan required')
 return createHash('sha256').update(JSON.stringify(plan)).digest('hex')
}
export function verifyRestoredServiceRecord(record,identity){
 if(!record||record.sessionId!==identity?.sessionId||record.isArchived!==false||record.cwd!==identity.cwd||record.cliSessionId!==identity.cliSessionId||typeof record._file!=='string'||record._file!==resolve(record._file)||!record._file.endsWith('/'+identity.sessionId+'.json')||record.worktreePath||typeof record.permissionMode!=='string'||!record.permissionMode||createHash('sha256').update(dirname(record._file)).digest('hex')!==identity.storeHash)throw Error('restored account identity unqualified')
 return {recordRestored:true,originalIdentityVerified:true,permissionMode:record.permissionMode}
}
// Only the record is restored. This sequence never installs service authority.
export async function runMissingRecordRestoration(expectedPlanSha256,d){
 const check=async()=>{await d.guard();const plan=await d.inspect();if(missingServicePlanDigest(plan)!==expectedPlanSha256)throw Error('missing-service plan changed');return plan}
 const plan=await check();await d.record('plan-qualified',plan);await check();await d.claim(plan);await d.record('claimed',plan)
 await check();await d.record('before-quiesce',plan);const quiesced=await d.quiesce(plan)
 if(quiesced?.quiescent!==true||quiesced.offline!==true||quiesced.sessionId!==plan.sessionId||quiesced.serviceId!==plan.serviceId||quiesced.terminalAttemptReviewComplete!==true)throw Error('original service quiescence unqualified')
 await d.record('after-quiesce',quiesced);await d.guard();await d.record('before-retire',plan);const retired=await d.retire(plan)
 if(retired?.filesRetired!==true||retired.terminalAttemptReviewComplete!==true||retired.serviceId!==plan.serviceId||retired.sessionId!==plan.sessionId)throw Error('original service retirement unqualified')
 await d.record('after-retire',retired)
 const checkRetired=async()=>{await d.guard();if(missingServicePlanDigest(await d.inspectRetired())!==expectedPlanSha256)throw Error('retired restoration identity changed')}
 await checkRetired();await d.record('before-import',{sessionId:plan.sessionId,serviceId:plan.serviceId,importAttempted:true})
 await checkRetired();const imported=await d.import(plan);await d.record('after-import',{ok:imported?.ok===true})
 if(imported?.ok!==true)throw Error('record import unverified')
 await d.guard();const verified=await d.verify(plan);if(verified?.recordRestored!==true||verified.originalIdentityVerified!==true||typeof verified.permissionMode!=='string')throw Error('restored account identity unqualified')
 await d.guard()
 const result={sessionId:plan.sessionId,serviceId:plan.serviceId,recordRestored:true,originalIdentityVerified:true,permissionMode:verified.permissionMode,actualBypassMode:verified.permissionMode==='bypassPermissions',humanPermissionRequired:verified.permissionMode!=='bypassPermissions',nativeEpochAssessed:false,serviceRestored:false,servingQualified:false,continuationRequired:true,importRepeated:false,replayAuthorized:false,retrySafe:false}
 await d.record('record-restored',result);return result
}
const owned=dir=>{const s=lstatSync(dir);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||s.mode&0o022)throw Error('restoration directory unqualified')}

export function claimMissingServiceRestoration(plan,jobId,expectedPlanSha256,dir){
 if(!/^j[a-f0-9]{32}$/.test(jobId||'')||missingServicePlanDigest(plan)!==expectedPlanSha256)throw Error('exact restoration claim required')
 owned(dir)
 const claimFile=join(dir,plan.serviceId+'.json')
 try{writeFileSync(claimFile,JSON.stringify({jobId,sessionId:plan.sessionId,serviceId:plan.serviceId,expectedPlanSha256,at:Date.now()})+'\n',{flag:'wx',mode:0o600})}
 catch(e){if(e.code!=='EEXIST')throw e;const prior=JSON.parse(readReceiverFile(claimFile,4096));throw new DriverError('original restoration claim must be reconciled; no import repeated',{category:'missing_service_restoration_claimed',detail:{originalJobId:/^j[a-f0-9]{32}$/.test(prior.jobId||'')?prior.jobId:null,retrySafe:false}})}
}
export async function restoreMissingServiceRecord(primary,role,expectedEnrollmentSha256,expectedPlanSha256,{jobId,signal}={},dependencies={}){
 if(!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(primary||'')||!/^j[a-f0-9]{32}$/.test(jobId||'')||!/^[a-f0-9]{64}$/.test(expectedPlanSha256||'')||!/^[a-f0-9]{64}$/.test(expectedEnrollmentSha256||'')||!['primary','standby'].includes(role))throw new DriverError('exact durable restoration context required',{category:'bad_args'})
 return withLock('independent-route-'+primary,async()=>{
  const inspectPlan=dependencies.inspectPlan??inspectMissingServiceImport,inspectRetired=dependencies.inspectRetiredPlan??((p,r,h,o)=>inspectMissingServiceImport(p,r,h,o,{retiredByRoot:true})),select=dependencies.select??loadReceiverSelection
  const dir=ensureDir(join(STATE_DIR,'missing-service-restorations')),claims=ensureDir(join(dir,'claims'));owned(dir);owned(claims)
  const file=join(dir,jobId+'.json'),ledger={schemaVersion:1,jobId,primary,role,expectedEnrollmentSha256,expectedPlanSha256,runtimeBuild:RUNTIME_BUILD,phase:'created',steps:[],importAttempted:false,retrySafe:false,at:Date.now()}
  writeFileSync(file,JSON.stringify(ledger)+'\n',{flag:'wx',mode:0o600});const save=()=>writeJsonAtomic(file,ledger);let identity,selected
  const guard=async()=>{if(signal?.aborted||runtimeFingerprint()!==RUNTIME_BUILD||standbyEnrollmentDigest(readStandbyEnrollment(primary))!==expectedEnrollmentSha256)throw Error('restoration source/binding/cancellation changed')}
  const child=async(step,operation,plan)=>{
   if(ledger.children?.[step])throw Error('restoration child already attempted')
   ledger.children??={};const submission={operation,arguments:{session:plan.sessionId,service_id:plan.serviceId,experimental:true,offline:true,...step==='quiesce'?{require_new_stop:true}:{}},idempotency_key:'missing-record:'+jobId+':'+step,timeout_sec:90}
   ledger.children[step]={submission,phase:'before-submit'};save()
   const {runOp}=await import('./driver.mjs'),submitted=await runOp('driver_submit',submission);ledger.children[step].jobId=submitted.jobId;save()
   for(;;){if(signal?.aborted)throw Error('restoration child may continue after parent cancellation');const observed=await runOp('driver_wait',{job_id:submitted.jobId,timeout_sec:10,include_result:true},{signal});ledger.children[step].observation=observed;save();if(observed.state==='completed')return observed.result;if(!['queued','running'].includes(observed.state))throw Error('restoration child failed or uncertain')}
  }
  try{return await runMissingRecordRestoration(expectedPlanSha256,{
   guard,inspect:()=>inspectPlan(primary,role,expectedEnrollmentSha256,{signal}),inspectRetired:()=>inspectRetired(primary,role,expectedEnrollmentSha256,{signal}),
   quiesce:plan=>dependencies.quiesce?dependencies.quiesce(plan):child('quiesce','broker_service_quiesce',plan),retire:plan=>dependencies.retire?dependencies.retire(plan):child('retire','broker_service_retire',plan),
   record:async(phase,evidence)=>{ledger.phase=phase;ledger.steps.push({phase,at:Date.now()});ledger.observation=evidence;if(phase==='plan-qualified')ledger.plan=evidence;if(phase==='before-import')ledger.importAttempted=true;if(phase==='record-restored')ledger.result=evidence;if(phase==='after-quiesce')ledger.quiescence=evidence;if(phase==='after-retire')ledger.retirement=evidence;save()},
   claim:async plan=>{identity=readServiceRecoveryIdentity(plan.sessionId,plan.serviceId);selected=select(identity.cwd);ledger.originalSnapshot={identity,selection:selected,binding:readStandbyEnrollment(primary)};save();claimMissingServiceRestoration(plan,jobId,expectedPlanSha256,claims)},
   import:async plan=>{const r=dependencies.importRecord?await dependencies.importRecord(plan,identity):await withFocus('restore',()=>unarchiveViaLink({sessionId:plan.sessionId,cliSessionId:identity.cliSessionId,cwd:identity.cwd}),{target:plan.sessionId});ledger.focus=r.focus;save();return r.result},
   verify:async plan=>{const r=getRecord(plan.sessionId),currentIdentity=readServiceRecoveryIdentity(plan.sessionId,plan.serviceId);if(JSON.stringify(currentIdentity)!==JSON.stringify(identity)||JSON.stringify(select(identity.cwd))!==JSON.stringify(selected))throw Error('restored recovery identity/selection differs');return verifyRestoredServiceRecord(r,identity)}
  })}catch(error){ledger.failure={at:Date.now(),category:error.category??'missing-service-restoration-unresolved'};save();throw new DriverError('missing-service record restoration stopped; inspect original job and import intent before further recovery',{category:error.category??'missing_service_restoration_unresolved',detail:{jobId,restorationFile:file,importAttempted:ledger.importAttempted,...error.category==='missing_service_restoration_claimed'?{originalJobId:error.detail?.originalJobId}: {},retrySafe:false}})}
 },{signal,timeoutMs:60000})
}
