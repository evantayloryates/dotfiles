import {createHash} from 'node:crypto'
import {readRestoredRecordRoot,observeRecoveryRecordProof} from './restored-record-proof.mjs'
import {inspectJob} from './jobs.mjs'
import {getRecord} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {versions,activeStore} from './paths.mjs'
import {readStandbyEnrollment,standbyEnrollmentDigest} from './standby-enrollment.mjs'
import {loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {requireIndependentEpochAbsent} from './independent-offline-review.mjs'
import {inspectIndependentService} from './independent-service-result.mjs'
import {verifyRestoredServiceRecord} from './missing-service-restoration.mjs'
import {pairImportEpochQualified} from './pair-bootstrap-proof.mjs'
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex')
export function planRestoredNative({root,proof,record,peer,absence,selected,retired,version,accountStoreHash,observedAt}={}){
 const result=(action,reason)=>({action,reason,nativePreparationEligible:action==='prepare',activationAuthorized:false,importAuthorized:false,replayAuthorized:false,serviceRestored:false,servingQualified:false,effectsPerformed:false})
 try{
  if(proof?.qualified!==true||proof.rootSha256!==hash(root)||proof.rootJobId!==root.jobId)return result('inspect','exact-restoration-proof-required')
  const actor=root.originalSnapshot.binding[root.role],identity=root.originalSnapshot.identity
  verifyRestoredServiceRecord(record,identity)
  if(accountStoreHash!==identity.storeHash)return result('inspect','current-account-changed')
  if(version?.app!=='2.42304.0'||version.cli!=='2.1.299')return result('inspect','installed-version-unqualified')
  if(record.permissionMode!=='bypassPermissions')return result('wait','person-permission-required')
  if(absence?.previousPid!==actor.pid||absence.previousProcStart!==actor.procStart||!pairImportEpochQualified({old:actor,record,peer,oldPidAbsent:absence.previousPidObservedAbsent,startedAt:proof.importStartedAt,observedAt}))return result('wait','fresh-idle-native-epoch-required')
  if(!equal(selected,root.originalSnapshot.selection))return result('inspect','original-selection-changed')
  if(retired?.verified!==true||retired.verificationMode!=='historical-retired'||retired.sourceDisposition!=='files-retired'||retired.sessionId!==actor.sessionId||retired.serviceId!==actor.serviceId||retired.nativeEpoch?.pid!==actor.pid||retired.nativeEpoch.procStart!==actor.procStart||retired.admissionStopped!==true||retired.stopMarkerMatchesGeneration!==true||retired.terminalAttemptReviewComplete!==true||!Array.isArray(retired.unresolvedRequestIds)||retired.unresolvedRequestIds.length)return result('inspect','retired-generation-unqualified')
  return {...result('prepare','restored-native-epoch-qualified'),rootJobId:root.jobId,rootSha256:proof.rootSha256,restorationKind:proof.restorationKind??'record',role:root.role,sessionId:actor.sessionId,oldServiceId:actor.serviceId,nativeEpoch:{sessionId:actor.sessionId,cwd:actor.cwd,pid:peer.pid,procStart:peer.procStart},nativeEpochAssessed:true,reciprocalServiceAssessed:false,continuationRequired:true}
 }catch{return result('inspect','restored-native-evidence-unqualified')}
}
// Re-read durable jobs independently; stored child observations alone are insufficient.
export async function inspectRestoredNative(rootJobId,expectedRootSha256,{signal,restorationKind='record'}={},d={}){
 const read=d.readRoot??(id=>readRestoredRecordRoot(id,{kind:restorationKind})),job=d.job??(id=>inspectJob(id,{includeResult:true})),binding=d.binding??readStandbyEnrollment,record=d.record??getRecord,peer=d.peer??peerRecord,select=d.select??loadReceiverSelection,absent=d.absent??requireIndependentEpochAbsent,status=d.status??((a)=>inspectIndependentService(a.sessionId,a.serviceId,{historical:true,signal})),version=d.version??versions,account=d.account??(()=>createHash('sha256').update(activeStore().dir).digest('hex'))
 try{
  const first=read(rootJobId),{root,claim}=first
  if(first.rootSha256!==expectedRootSha256)throw Error('root changed')
  const parent=await job(rootJobId),proof=await observeRecoveryRecordProof(root,parent,claim,{rootJobId,expectedRootSha256,restorationKind},{read,inspect:job})
  for(const child of Object.values(root.children)){const current=await job(child.jobId),prior=child.observation;if(!['jobId','operation','state','args','result'].every(k=>equal(current[k],prior[k])))throw Error('child job changed')}
  const actor=root.originalSnapshot.binding[root.role]
  const check=()=>{const current=read(rootJobId);if(signal?.aborted||current.rootSha256!==expectedRootSha256||!equal(current.claim,claim)||standbyEnrollmentDigest(binding(root.primary))!==root.expectedEnrollmentSha256)throw Error('restoration context changed')}
  check();const saved=record(actor.sessionId),native=peer(actor.sessionId),selected=select(actor.cwd),absence=absent(actor),retired=await status(actor)
  check();if(!equal(record(actor.sessionId),saved)||!equal(peer(actor.sessionId),native)||!equal(select(actor.cwd),selected))throw Error('native evidence changed');absent(actor)
  if(root.continuation)await observeRecoveryRecordProof(root,parent,claim,{rootJobId,expectedRootSha256,restorationKind},{read,inspect:job})
  return planRestoredNative({root,proof,record:saved,peer:native,selected,absence,retired,version:version(),accountStoreHash:account(),observedAt:Date.now()})
 }catch{return {action:'inspect',reason:'restored-native-inspection-unqualified',nativePreparationEligible:false,activationAuthorized:false,importAuthorized:false,replayAuthorized:false,effectsPerformed:false,serviceRestored:false}}
}
