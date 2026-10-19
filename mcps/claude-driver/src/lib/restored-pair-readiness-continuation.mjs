import {join} from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {readPairReadinessCheckpoint} from './restored-pair-readiness-checkpoint.mjs'
import {reactivateRestoredPair,restoredPairActorMatches} from './restored-pair-execute.mjs'
import {getRecord,openPrs} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {loadReceiverSelection,readReceiverFile} from './receiver-runtime-selection.mjs'
import {readStandbyEnrollment,standbyEnrollmentDigest} from './standby-enrollment.mjs'
import {inspectMetadataEnrollment} from './metadata-controller-index.mjs'
import {inspectIndependentService} from './independent-service-result.mjs'
import {requireIndependentEpochAbsent} from './independent-offline-review.mjs'
import {recoveredRoleMatches} from './recovery-role.mjs'
import {versions,DriverError} from './paths.mjs'
import {RUNTIME_BUILD,runtimeFingerprint} from './build.mjs'
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),job=/^j[a-f0-9]{32}$/,hex=/^[a-f0-9]{64}$/
const exec=promisify(execFile),digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex')
// No native calls/effects. Both actors retain exact epochs and settings. The
// standby successor is verified as the already sealed, never-published package.
export async function qualifyPairReadinessContinuation(checkpoint,{signal}={},d={}){
 const {root,proof}=checkpoint,p=root.plan,dep={record:getRecord,peer:peerRecord,prs:openPrs,select:loadReceiverSelection,binding:readStandbyEnrollment,metadata:inspectMetadataEnrollment,status:inspectIndependentService,version:versions,fingerprint:runtimeFingerprint,absent:requireIndependentEpochAbsent,...d}
 if(proof?.qualified!==true||!equal(dep.version(),root.versions)||dep.fingerprint()!==RUNTIME_BUILD)throw Error('continuation source/version changed')
 const check=()=>{if(signal?.aborted||dep.fingerprint()!==RUNTIME_BUILD||!equal(dep.version(),root.versions)||standbyEnrollmentDigest(dep.binding(p.currentEpochs.primary.sessionId))!==p.enrollmentSha256||!equal(dep.metadata(p.currentEpochs.standby.sessionId),root.metadataEnrollment))throw Error('continuation enrollment changed')}
 check()
 const policies={}
 for(const role of ['primary','standby']){
  const e=p.currentEpochs[role],r=dep.record(e.sessionId),peer=dep.peer(e.sessionId),other=p.currentEpochs[role==='primary'?'standby':'primary'].sessionId,s=root.snapshots[role]
  if(!restoredPairActorMatches(r,peer,e,s.identity,other)||dep.prs(r).length)throw Error('continuation current actor changed')
  const selected=dep.select(e.cwd);policies[role]=JSON.parse(readReceiverFile(join(e.cwd,'.claude-driver-services',p.originalServiceIds[role],'broker','stop-rescue-policy.json'),65536))
  if(!equal(policies[role],s.policy))throw Error('continuation retained policy changed')
  if(role==='primary'){
   if(selected.selector.serviceId!==proof.preparedServiceIds.primary||selected.selector.sessionId!==e.sessionId||selected.selector.pid!==e.pid||selected.selector.procStart!==e.procStart||selected.selector.receiverCwd!==e.cwd||selected.selector.build!==root.runtimeBuild)throw Error('installed primary successor changed')
   const status=await dep.status(e.sessionId,proof.preparedServiceIds.primary,{signal})
   if(status.verified!==true||status.verificationMode!=='live-native'||status.sourceDisposition!=='installed'||status.admissionStopped!==false||status.nativeInputRequired!==false||status.readinessObserved!==true||status.expired!==false||status.deadline-Date.now()<60000||status.terminalAttemptReviewComplete!==true||!Array.isArray(status.unresolvedRequestIds)||status.unresolvedRequestIds.length||!recoveredRoleMatches(p.roles.primary,status))throw Error('installed primary readiness unqualified')
   const policy=JSON.parse(readReceiverFile(join(e.cwd,'.claude-driver-services',proof.preparedServiceIds.primary,'broker','stop-rescue-policy.json'),65536))
   if(policy.settingsHash!==s.policy.settingsHash||policy.receiverHook?.anchorSha256!==s.policy.receiverHook.anchorSha256)throw Error('installed primary settings changed')
  }else{
   if(!equal(selected,s.selection))throw Error('standby original selection changed')
   const status=await dep.status(e.sessionId,p.originalServiceIds.standby,{historical:true,signal})
   if(status.verified!==true||status.verificationMode!=='historical-retired'||status.sourceDisposition!=='files-retired'||status.admissionStopped!==true||status.stopMarkerMatchesGeneration!==true||status.nativeEpoch?.pid!==e.pid||status.nativeEpoch.procStart!==e.procStart||status.terminalAttemptReviewComplete!==true||!Array.isArray(status.unresolvedRequestIds)||status.unresolvedRequestIds.length)throw Error('standby retirement changed')
   const id=proof.preparedServiceIds.standby,dir=join(e.cwd,'.claude-driver-services',id),prepared=JSON.parse(readReceiverFile(join(dir,'preparation.json'),1048576)),c=prepared.config
   if(prepared.kind!=='independent-service-preparation'||prepared.phase!=='prepared'||prepared.serviceId!==id||prepared.sessionId!==e.sessionId||prepared.receiverCwd!==e.cwd||prepared.build!==root.runtimeBuild||prepared.epoch?.pid!==e.pid||prepared.epoch.procStart!==e.procStart||c?.id!==id||c.brokerSession!==e.sessionId||c.build!==root.runtimeBuild||c.deadline<Date.now()+60000||!recoveredRoleMatches(p.roles.standby,{...c,verified:true}))throw Error('standby prepared successor changed')
   const {stdout}=await exec(process.execPath,[fileURLToPath(new URL('../scripts/inspect-prepared-continuation.mjs',import.meta.url)),id,root.runtimeBuild,digest(prepared)],{env:{...process.env,CLAUDE_DRIVER_STATE_DIR:dir},signal,timeout:15000,maxBuffer:4096})
   const packageProof=JSON.parse(stdout)
   if(packageProof.preparedPackageVerified!==true||packageProof.serviceId!==id||packageProof.build!==root.runtimeBuild||packageProof.preparationSha256!==digest(prepared)||!equal(JSON.parse(readReceiverFile(join(dir,'preparation.json'),1048576)),prepared))throw Error('prepared package changed')
  }
 }
 // Lost original epoch absence is required independently even with a new peer.
 const restoration=(d.restorationRoot??((()=>{throw Error('restoration root reader required')})))()
 dep.absent(restoration.originalSnapshot.binding[p.restoredRole]);check()
 return structuredClone(p)
}
export async function inspectPairReadinessContinuation(originalJobId,expectedRootSha256,{signal}={},d={}){
 try{
  const read=d.checkpoint??readPairReadinessCheckpoint,checkpoint=await read(originalJobId,expectedRootSha256,d),kind=checkpoint.root.plan.restorationKind??'record',readRestoration=d.readRestoration??(id=>import('./restored-record-proof.mjs').then(m=>m.readRestoredRecordRoot(id,{kind}))),restoration=await readRestoration(checkpoint.root.plan.rootJobId)
  const plan=await qualifyPairReadinessContinuation(checkpoint,{signal},{...d,restorationRoot:()=>restoration.root})
  if(!equal(await read(originalJobId,expectedRootSha256,d),checkpoint))throw Error('continuation checkpoint changed')
  return {continuationEligible:true,originalJobId,originalRootSha256:expectedRootSha256,restorationJobId:plan.rootJobId,restorationKind:kind,preparedServiceIds:checkpoint.proof.preparedServiceIds,prefixEffectsRepeated:false,servingQualified:false,effectsPerformed:false,replayAuthorized:false}
 }catch{return {continuationEligible:false,reason:'pair-readiness-continuation-unqualified',effectsPerformed:false,replayAuthorized:false}}
}
export async function continuePairReadiness(originalJobId,expectedRootSha256,{jobId,signal,progress}={},d={}){
 if(!job.test(jobId||'')||!job.test(originalJobId||'')||!hex.test(expectedRootSha256||''))throw new DriverError('exact durable pair continuation required',{category:'bad_args'})
 const read=d.checkpoint??readPairReadinessCheckpoint,checkpoint=await read(originalJobId,expectedRootSha256,d),p=checkpoint.root.plan,kind=p.restorationKind??'record',readRestoration=d.readRestoration??(async id=>(await import('./restored-record-proof.mjs')).readRestoredRecordRoot(id,{kind})),restoration=await readRestoration(p.rootJobId)
 return reactivateRestoredPair(p.rootJobId,p.rootSha256,checkpoint.root.expectedPlanSha256,{jobId,signal,progress,restorationKind:kind,readinessCheckpoint:checkpoint},{...d,
  inspectContinuation:c=>qualifyPairReadinessContinuation(c,{signal},{...d,restorationRoot:()=>restoration.root}),
  checkContinuationOrigin:async()=>{if(!equal(await read(originalJobId,expectedRootSha256,d),checkpoint))throw Error('original readiness checkpoint changed')}
 })
}
