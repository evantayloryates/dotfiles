import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {mkdirSync,lstatSync,writeFileSync} from 'node:fs'
import {STATE_DIR,withLock,writeJsonAtomic} from './state.mjs'
import {readReceiverFile,loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {readRestoredRecordRoot} from './restored-record-proof.mjs'
import {inspectJob} from './jobs.mjs'
import {validateSeededRetirementCheckpoint,seededCheckpointDigest as hash} from './seeded-retirement-checkpoint.mjs'
import {inspectServiceSeedPlan} from './service-seed-plan.mjs'
import {serviceSeedPlanDigest,finishSeededRecordRestoration} from './seeded-record-restoration.mjs'
import {readStandbyEnrollment,standbyEnrollmentDigest} from './standby-enrollment.mjs'
import {readServiceRecoveryIdentity} from './service-recovery-identity.mjs'
import {getRecord,callerHostSession} from './sessions.mjs'
import {versions,activeStore,runCli,DriverError} from './paths.mjs'
import {RUNTIME_BUILD,runtimeFingerprint} from './build.mjs'
import {requireIndependentOfflineMutation} from './independent-offline-review.mjs'
import {inspectIndependentService} from './independent-service-result.mjs'
import {inspectServiceSeedTranscript} from './service-seed-absence.mjs'
import {recoveryRoleFromHistory} from './recovery-role.mjs'
import {validateMissingServiceOwnerEvidence} from './missing-service-plan.mjs'
import {verifyRestoredServiceRecord} from './missing-service-restoration.mjs'
import {unarchiveViaLink} from './tiera.mjs'
import {withFocus} from './focus.mjs'
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),job=/^j[a-f0-9]{32}$/,hex=/^[a-f0-9]{64}$/
const same=(a,b)=>!!a&&!!b&&['sessionId','cwd','pid','procStart'].every(k=>a[k]===b[k])
const base=join(STATE_DIR,'seeded-service-restorations')
const owned=dir=>{const s=lstatSync(dir);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||s.mode&0o022)throw Error('continuation directory unqualified')}
export async function readSeededCheckpoint(originalJobId,expectedRootSha256,d={}){
 const read=d.readRoot??(id=>readRestoredRecordRoot(id,{kind:'seeded'})),inspect=d.job??(id=>inspectJob(id,{includeResult:true}))
 const first=read(originalJobId),parent=await inspect(originalJobId)
 validateSeededRetirementCheckpoint(first.root,parent,first.claim,{rootJobId:originalJobId,expectedRootSha256})
 for(const c of Object.values(first.root.children)){const actual=await inspect(c.jobId);if(!['jobId','operation','state','args','result'].every(k=>equal(actual[k],c.observation[k])))throw Error('original retirement child changed')}
 if(!equal(read(originalJobId),first)||!equal(await inspect(originalJobId),parent))throw Error('original checkpoint changed')
 return {...first,parent}
}
export async function inspectSeededContinuation(originalJobId,expectedRootSha256,{signal}={},d={}){
 try{
  const origin=await readSeededCheckpoint(originalJobId,expectedRootSha256,d),r=origin.root
  const plan=await (d.plan??inspectServiceSeedPlan)(r.primary,r.role,r.expectedEnrollmentSha256,{signal},{retiredByRoot:true})
  if(signal?.aborted||plan.oldGenerationRetired!==true||serviceSeedPlanDigest({...plan,oldGenerationRetired:false})!==r.expectedPlanSha256)throw Error('retired seed plan changed')
  if(!equal(await readSeededCheckpoint(originalJobId,expectedRootSha256,d),origin))throw Error('origin changed')
  return {continuationEligible:true,originalJobId,originalRootSha256:expectedRootSha256,sessionId:r.plan.sessionId,serviceId:r.plan.serviceId,bootstrapAttempted:false,importAttempted:false,retirementRepeated:false,servingQualified:false,effectsPerformed:false,replayAuthorized:false}
 }catch{return {continuationEligible:false,reason:'seeded-retirement-continuation-unqualified',effectsPerformed:false,replayAuthorized:false}}
}
export function createSeededContinuationLedger(origin,jobId,{dir=base}={}){
 if(!job.test(jobId)||jobId===origin.root.jobId)throw Error('distinct continuation job required')
 mkdirSync(dir,{recursive:true,mode:0o700});owned(dir);const claims=join(dir,'continuation-claims');mkdirSync(claims,{recursive:true,mode:0o700});owned(claims)
 const old=origin.root,claim={jobId,originalJobId:old.jobId,originalRootSha256:hash(old),sessionId:old.plan.sessionId,serviceId:old.plan.serviceId,expectedPlanSha256:old.expectedPlanSha256,recipeSha256:old.plan.recipeSha256},claimFile=join(claims,old.plan.serviceId+'.json')
 try{writeFileSync(claimFile,JSON.stringify(claim)+'\n',{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST')throw e;const prior=JSON.parse(readReceiverFile(claimFile,4096));throw new DriverError('seeded continuation already claimed; inspect original continuation',{category:'seeded_continuation_claimed',detail:{originalJobId:prior.jobId,retrySafe:false}})}
 const ledger=structuredClone(old);delete ledger.failure;ledger.jobId=jobId;ledger.runtimeBuild=RUNTIME_BUILD;ledger.continuation={originalJobId:old.jobId,originalRootSha256:hash(old)};ledger.at=Date.now()
 const file=join(dir,jobId+'.json');writeFileSync(file,JSON.stringify(ledger)+'\n',{flag:'wx',mode:0o600})
 const save=()=>{if(!readReceiverFile(claimFile,4096).equals(Buffer.from(JSON.stringify(claim)+'\n')))throw Error('continuation claim changed');writeJsonAtomic(file,ledger)}
 const record=async(phase,evidence)=>{ledger.phase=phase;ledger.steps.push({phase,at:Date.now()});if(phase==='seed-before-bootstrap')ledger.bootstrapAttempted=true;if(phase==='before-import')ledger.importAttempted=true;if(phase==='seed-created')ledger.seed=structuredClone(evidence);if(phase==='record-restored')ledger.result=structuredClone(evidence);ledger.observation=structuredClone(evidence);save()}
 return {ledger,file,save,record,fail:e=>{ledger.failure={category:/^[a-z][a-z0-9_-]{0,79}$/.test(e.category??'')?e.category:'seeded-continuation-unresolved',at:Date.now()};save()}}
}
export async function continueSeededRestoration(originalJobId,expectedRootSha256,{jobId,signal}={},d={}){
 if(!job.test(jobId||'')||!job.test(originalJobId||'')||!hex.test(expectedRootSha256||''))throw new DriverError('exact durable continuation required',{category:'bad_args'})
 const initial=await readSeededCheckpoint(originalJobId,expectedRootSha256,d),old=initial.root
 return withLock('independent-route-'+old.primary,async()=>{
  const origin=await readSeededCheckpoint(originalJobId,expectedRootSha256,d),snapshot=origin.root.originalSnapshot,actor=snapshot.binding[old.role],other=snapshot.binding[old.role==='primary'?'standby':'primary'],identity=snapshot.identity
  if(actor.sessionId===(d.caller??callerHostSession)())throw Error('cannot rebuild caller')
  const dep={record:getRecord,binding:readStandbyEnrollment,identity:readServiceRecoveryIdentity,select:loadReceiverSelection,account:()=>createHash('sha256').update(activeStore().dir).digest('hex'),version:versions,fingerprint:runtimeFingerprint,absent:a=>requireIndependentOfflineMutation(a,a.sessionId),policy:a=>JSON.parse(readReceiverFile(join(a.cwd,'.claude-driver-services',a.serviceId,'broker','stop-rescue-policy.json'),65536)),status:a=>inspectIndependentService(a.sessionId,a.serviceId,{offline:true,signal}),plan:inspectServiceSeedPlan,transcript:inspectServiceSeedTranscript,bootstrap:(args,cwd)=>runCli(args,{cwd,signal,timeoutMs:60000}),importRecord:i=>withFocus('restore',()=>unarchiveViaLink(i),{target:i.sessionId}),...d}
  if(!equal(origin,initial)||(await inspectSeededContinuation(originalJobId,expectedRootSha256,{signal},dep)).continuationEligible!==true)throw Error('continuation origin or retired plan changed')
  const guardContext=async()=>{if(signal?.aborted||dep.fingerprint()!==RUNTIME_BUILD||!equal(dep.version(),old.versions)||!equal(await readSeededCheckpoint(originalJobId,expectedRootSha256,dep),origin)||standbyEnrollmentDigest(dep.binding(old.primary))!==old.expectedEnrollmentSha256||dep.account()!==identity.storeHash||!equal(dep.identity(actor.sessionId,actor.serviceId),identity)||!equal(dep.select(actor.cwd),snapshot.selection)||!equal(dep.policy(actor),snapshot.policy))throw Error('continuation source/account/ownership changed')}
  await guardContext();dep.absent(actor);if(dep.record(actor.sessionId))throw Error('record appeared before claim')
  const c=createSeededContinuationLedger(origin,jobId),{ledger,save}=c
  const guard=async()=>{await guardContext();if(!ledger.importAttempted)dep.absent(actor);const r=dep.record(actor.sessionId);if(r){if(!ledger.importAttempted)throw Error('record appeared before import');verifyRestoredServiceRecord(r,identity)}}
  try{return await finishSeededRecordRestoration(old.plan,old.recipe,{guard,record:c.record,inspectRetired:()=>dep.plan(old.primary,old.role,old.expectedEnrollmentSha256,{signal},{retiredByRoot:true}),bootstrap:dep.bootstrap,verifyTranscript:()=>dep.transcript(identity.cliSessionId),
   inspectSeed:async()=>{await guard();const status=await dep.status(actor),policy=dep.policy(actor);validateMissingServiceOwnerEvidence({binding:snapshot.binding,expectedSha256:old.expectedEnrollmentSha256,role:old.role,record:dep.record(actor.sessionId),identity,accountStoreHash:dep.account(),absence:dep.absent(actor),status,selected:snapshot.selection,version:dep.version(),retiredByRoot:true});const role=recoveryRoleFromHistory(status,policy,{sessionId:actor.sessionId,receiverCwd:actor.cwd,admitTarget:t=>same(t,other)}),transcript=dep.transcript(identity.cliSessionId);await guard();return {...transcript,recordAbsent:!dep.record(actor.sessionId),oldPidAbsent:true,oldGenerationRetired:true,identitySha256:hash(identity),roleSha256:hash(role)}},
   import:async()=>{const r=await dep.importRecord(identity);ledger.focus=r.focus;save();return r.result},verifyRecord:async()=>verifyRestoredServiceRecord(dep.record(actor.sessionId),identity)
  })}catch(e){c.fail(e);throw new DriverError('seeded continuation stopped; inspect its own intents and preserve original failed root',{category:'seeded_continuation_unresolved',detail:{jobId,originalJobId,phase:ledger.phase,bootstrapAttempted:ledger.bootstrapAttempted,importAttempted:ledger.importAttempted,retrySafe:false}})}
 },{signal,timeoutMs:60000})
}
