import {createHash} from 'node:crypto'
import {lstatSync} from 'node:fs'
import {dirname} from 'node:path'
import {readStandbyEnrollment,standbyEnrollmentDigest} from './standby-enrollment.mjs'
import {readServiceRecoveryIdentity,validateServiceRecoveryIdentity} from './service-recovery-identity.mjs'
import {getRecord} from './sessions.mjs'
import {activeStore,versions} from './paths.mjs'
import {loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {inspectIndependentService} from './independent-service-result.mjs'
import {requireIndependentOfflineMutation} from './independent-offline-review.mjs'
import {transcriptPath} from './peer-direct.mjs'
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex')
const same=(a,b)=>['sessionId','cwd','pid','procStart'].every(k=>a?.[k]===b?.[k])
export function validateMissingServiceOwnerEvidence({binding,expectedSha256,role,record,identity,accountStoreHash,absence,status,selected,version,retiredByRoot=false}={}){
 const fail=reason=>{throw Object.assign(Error('missing-service owner unqualified'),{reason})}
  if(!['primary','standby'].includes(role)||standbyEnrollmentDigest(binding)!==expectedSha256||binding.schemaVersion!==2||binding.automaticRecovery!==true)fail('exact-automatic-pair-required')
  if(record)fail('saved-service-record-present')
  const actor=binding[role],other=binding[role==='primary'?'standby':'primary']
  if(version?.app!=='2.42304.0'||version.cli!=='2.1.299')fail('installed-version-unqualified')
  if(!identity)fail('retained-recovery-identity-missing')
  validateServiceRecoveryIdentity(identity,{session:actor.sessionId,serviceId:actor.serviceId})
  if(identity.cwd!==actor.cwd||identity.storeHash!==accountStoreHash)fail('retained-account-identity-mismatch')
  if(absence?.previousPidObservedAbsent!==true||absence.previousPid!==actor.pid||absence.previousProcStart!==actor.procStart)fail('independent-absence-unqualified')
  if(!status?.verified||status.verificationMode!==(retiredByRoot?'offline-retired':'offline-installed')||status.sourceDisposition!==(retiredByRoot?'files-retired':'installed')||status.sessionId!==actor.sessionId||status.serviceId!==actor.serviceId||status.nativeEpoch?.pid!==actor.pid||status.nativeEpoch.procStart!==actor.procStart||status.admissionStopped!==retiredByRoot||retiredByRoot&&status.stopMarkerMatchesGeneration!==true||status.terminalAttemptReviewComplete!==true||!Array.isArray(status.unresolvedRequestIds)||status.unresolvedRequestIds.length)fail('terminal-history-or-stop-unqualified')
  if(selected?.selector?.sessionId!==actor.sessionId||selected.selector.serviceId!==actor.serviceId||selected.selector.pid!==actor.pid||selected.selector.procStart!==actor.procStart||selected.selector.build!==status.build)fail('retained-generation-mismatch')
  if(role==='primary'?!same(status.metadataTarget,other)||status.archiveTarget!==undefined:!same(status.archiveTarget,other)||status.metadataTarget!==undefined)fail('retained-role-unqualified')
 return {actor,other}
}
export function planMissingServiceImport({binding,expectedSha256,role,record,identity,accountStoreHash,absence,status,selected,transcript,version,retiredByRoot=false}={}){
 const result=(action,reason)=>({action,reason,importPreparationEligible:action==='prepare',importAuthorized:false,replacementAuthorized:false,permissionRaiseAuthorized:false,replayAuthorized:false,effectsPerformed:false,servingQualified:false})
 try{
  const {actor}=validateMissingServiceOwnerEvidence({binding,expectedSha256,role,record,identity,accountStoreHash,absence,status,selected,version,retiredByRoot})
  if(transcript?.verified!==true||!/^[a-f0-9]{64}$/.test(transcript.fingerprint||''))return result('inspect','exact-transcript-unavailable')
  return {...result('prepare','same-identity-import-evidence-qualified'),role,sessionId:actor.sessionId,serviceId:actor.serviceId,enrollmentSha256:expectedSha256,identitySha256:hash(identity),transcriptFingerprint:transcript.fingerprint,requiresFreshNativeEpoch:true,requiresActualBypassMode:true,mayRequireHumanPermission:true,originalOutcomePreserved:true}
 }catch(error){return result(error.reason==='saved-service-record-present'?'wait':'inspect',error.reason??'missing-service-evidence-unqualified')}
}
function transcriptMetadata(identity){
 const path=transcriptPath({cwd:identity.cwd,sessionId:identity.cliSessionId}),dir=lstatSync(dirname(path)),s=lstatSync(path)
 if(!dir.isDirectory()||dir.isSymbolicLink()||dir.uid!==process.getuid()||!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid()||s.size<1)throw Error('transcript metadata unqualified')
 return {verified:true,fingerprint:hash({sessionId:identity.sessionId,cliSessionId:identity.cliSessionId,cwd:identity.cwd,dev:s.dev,ino:s.ino,size:s.size,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs})}
}
// Exact actor only, no directory scan for substitutes or private transcript reads.
export async function inspectMissingServiceImport(primary,role,expectedSha256,{signal}={},d={}){
 const read=d.readBinding??readStandbyEnrollment,record=d.record??getRecord,identityRead=d.readIdentity??readServiceRecoveryIdentity,select=d.select??loadReceiverSelection,absent=d.absent??(actor=>requireIndependentOfflineMutation(actor,actor.sessionId)),inspect=d.inspect??((actor)=>inspectIndependentService(actor.sessionId,actor.serviceId,{offline:true,signal})),transcriptRead=d.transcript??transcriptMetadata,account=d.accountHash??(()=>createHash('sha256').update(activeStore().dir).digest('hex')),version=d.version??versions
 let phase='binding'
 try{
  const binding=read(primary);if(!binding||!['primary','standby'].includes(role)||standbyEnrollmentDigest(binding)!==expectedSha256)throw Error('binding')
  const actor=binding[role],saved=record(actor.sessionId)
  if(saved)return planMissingServiceImport({binding,expectedSha256,role,record:saved})
  phase='recovery-identity';const identity=identityRead(actor.sessionId,actor.serviceId)
  if(!identity)return {action:'inspect',reason:'retained-recovery-identity-missing',importPreparationEligible:false,effectsPerformed:false,importAuthorized:false}
  phase='absence';const absence=absent(actor)
  phase='generation';const selected=select(actor.cwd)
  phase='terminal-history';const status=await inspect(actor)
  phase='transcript';const transcript=transcriptRead(identity),accountStoreHash=account()
  phase='final-recheck';if(signal?.aborted||record(actor.sessionId)||standbyEnrollmentDigest(read(primary))!==expectedSha256||JSON.stringify(select(actor.cwd))!==JSON.stringify(selected)||JSON.stringify(identityRead(actor.sessionId,actor.serviceId))!==JSON.stringify(identity)||JSON.stringify(transcriptRead(identity))!==JSON.stringify(transcript))throw Error('changed')
  absent(actor)
  return planMissingServiceImport({binding,expectedSha256,role,record:null,identity,accountStoreHash,absence,status,selected,transcript,version:version(),retiredByRoot:d.retiredByRoot===true})
 }catch{return {action:'inspect',reason:'missing-service-inspection-unqualified',inspectionPhase:phase,importPreparationEligible:false,importAuthorized:false,effectsPerformed:false}}
}
