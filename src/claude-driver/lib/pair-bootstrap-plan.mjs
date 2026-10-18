import {join} from 'node:path'
import {standbyEnrollmentDigest,readStandbyEnrollment} from './standby-enrollment.mjs'
import {getRecord,openPrs,liveProcesses} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {loadReceiverSelection,readReceiverFile} from './receiver-runtime-selection.mjs'
import {inspectIndependentService} from './independent-service-result.mjs'
import {requireIndependentOfflineMutation} from './independent-offline-review.mjs'
import {metadataTargetRegistered} from './native-metadata-control.mjs'
import {parseNativeFamilyMetadata} from './native-family-preflight.mjs'
import {ordinarySessionBinding} from './ordinary-session-control.mjs'
import {versions} from './paths.mjs'
import {STATE_DIR} from './state.mjs'
const same=(a,b)=>!!a&&!!b&&['sessionId','cwd','pid','procStart'].every(k=>a[k]===b[k])
const hash=/^[a-f0-9]{64}$/
// A plan admits preparation only. It never authorizes importing, starting an
// app, changing permissions, replacing actors, dropping STOP or replaying work.
export function planPairBootstrap({binding,expectedSha256,actors,familyVerified,version}={}){
 const result=(action,reason)=>({action,reason,bootstrapPreparationEligible:action==='prepare',effectsPerformed:false,importAuthorized:false,processStartupAssessed:false,servingQualified:false,recoveryAttempted:false})
 let digest;try{digest=standbyEnrollmentDigest(binding)}catch{return result('inspect','enrollment-unqualified')}
 if(!hash.test(expectedSha256||'')||digest!==expectedSha256||binding.schemaVersion!==2||binding.automaticRecovery!==true)return result('inspect','explicit-automatic-enrollment-required')
 if(version?.app!=='2.42304.0'||version.cli!=='2.1.299')return result('inspect','installed-version-unqualified')
 if(!Array.isArray(actors)||actors.length!==2)return result('inspect','exact-pair-required')
 for(let i=0;i<2;i++){
  const old=i===0?binding.primary:binding.standby,a=actors[i],other=i===0?binding.standby:binding.primary,s=a?.status,r=a?.record,p=a?.policy,selection=a?.selection
  if(a?.peerPresent===true)return result('wait','surviving-controller-present')
  if(a?.oldPidAbsent!==true||a?.sameHostAbsent!==true)return result('inspect','independent-pair-absence-unqualified')
  if(!r||r.sessionId!==old.sessionId||r.cwd!==old.cwd||r.sessionId!=='local_'+r.cliSessionId||r.permissionMode!=='bypassPermissions'||typeof r.isArchived!=='boolean'||r.worktreePath||a.registered!==true||a.openPrCount!==0||a.recordIdentityQualified!==true)return result('inspect','owned-importable-record-unqualified')
  if(!s?.verified||s.verificationMode!=='offline-installed'||s.sourceDisposition!=='installed'||s.sessionId!==old.sessionId||s.serviceId!==old.serviceId||s.nativeEpoch?.pid!==old.pid||s.nativeEpoch?.procStart!==old.procStart||s.admissionStopped!==false||s.terminalAttemptReviewComplete!==true||!Array.isArray(s.unresolvedRequestIds)||s.unresolvedRequestIds.length)return result('inspect','offline-history-or-stop-unqualified')
  if(selection?.selector?.sessionId!==old.sessionId||selection.selector.serviceId!==old.serviceId||selection.selector.pid!==old.pid||selection.selector.procStart!==old.procStart||selection.selector.build!==s.build||selection.selector.generation!==s.generation||p?.sessionId!==old.sessionId||p.pid!==old.pid||p.procStart!==old.procStart||p.build!==s.build||!hash.test(p.settingsHash||'')||!hash.test(p.receiverHook?.anchorSha256||''))return result('inspect','selector-policy-or-stable-settings-unqualified')
  if(i===0?!same(s.metadataTarget,other)||s.archiveTarget!==undefined:!same(s.archiveTarget,other)||s.metadataTarget!==undefined)return result('inspect','pair-role-target-unqualified')
  if(i===0&&!same(p.metadataTarget,s.metadataTarget))return result('inspect','pair-role-policy-unqualified')
  for(const k of ['metadataModelControl','metadataSendControl','metadataStopControl','sessionManagementControl','sessionMetadataControl','sessionSendControl','sessionArchiveControl'])if((s[k]===true)!==(p[k]===true)||i===1&&s[k]===true)return result('inspect','pair-role-grants-unqualified')
 }
 if(familyVerified!==true||!actors[0].status.settledRequestIds?.includes(binding.familyRequestId))return result('inspect','retained-empty-family-unqualified')
 return {...result('prepare','exact-owned-pair-absent-with-terminal-history'),enrollmentSha256:digest,rolesPreserved:true,unresolvedRequests:0,requiresNewNativeEpochs:true,requiresFreshPolicyAndReadiness:true,requiresControlledPairRebind:true,importMayRequireHumanTrust:true,absenceCause:'unclassified'}
}
export async function inspectPairBootstrap(primary,expectedSha256,{signal}={}){
 const binding=readStandbyEnrollment(primary)
 if(!binding)return {action:'inspect',reason:'enrollment-missing',bootstrapPreparationEligible:false,effectsPerformed:false,recoveryAttempted:false}
 if(standbyEnrollmentDigest(binding)!==expectedSha256)return {action:'inspect',reason:'enrollment-changed',bootstrapPreparationEligible:false,effectsPerformed:false,recoveryAttempted:false}
 const peers=[peerRecord(binding.primary.sessionId),peerRecord(binding.standby.sessionId)]
 if(peers.some(Boolean))return {action:'wait',reason:'surviving-controller-present',bootstrapPreparationEligible:false,effectsPerformed:false,recoveryAttempted:false,enrollmentSha256:expectedSha256}
 const actors=[]
 try{
  const currentProcesses=liveProcesses()
  for(const [i,e]of [binding.primary,binding.standby].entries()){
   if(signal?.aborted)throw Error('cancelled')
   const record=getRecord(e.sessionId),selection=loadReceiverSelection(e.cwd),absence=requireIndependentOfflineMutation({...e},e.sessionId,{processes:()=>currentProcesses}),status=await inspectIndependentService(e.sessionId,e.serviceId,{signal,offline:true}),policy=JSON.parse(readReceiverFile(join(e.cwd,'.claude-driver-services',e.serviceId,'broker','stop-rescue-policy.json'),65536))
   ordinarySessionBinding(record,(i===0?binding.standby:binding.primary).sessionId)
   actors.push({record,selection,status,policy,peerPresent:false,oldPidAbsent:absence.previousPidObservedAbsent,sameHostAbsent:!currentProcesses.some(p=>p.hostSessionId===e.sessionId),registered:metadataTargetRegistered(e,{controlStateDir:STATE_DIR}),openPrCount:openPrs(record).length,recordIdentityQualified:true})
  }
  const receipt=JSON.parse(readReceiverFile(join(binding.primary.cwd,'.claude-driver-services',binding.primary.serviceId,'broker','results',binding.familyRequestId+'.native.json'),65536)),familyVerified=receipt.id===binding.familyRequestId&&receipt.source==='native-peer-service-result'&&receipt.results?.length===1&&receipt.results[0].op==='list_sessions'&&receipt.results[0].ok===true&&parseNativeFamilyMetadata(receipt.results[0].result,primary)?.length===0
  // Observe absence and selection again after potentially slow offline reviews.
  for(const [i,e]of [binding.primary,binding.standby].entries()){requireIndependentOfflineMutation(e,e.sessionId);if(peerRecord(e.sessionId)||JSON.stringify(loadReceiverSelection(e.cwd))!==JSON.stringify(actors[i].selection))throw Error('pair changed')}
  if(standbyEnrollmentDigest(readStandbyEnrollment(primary))!==expectedSha256)throw Error('enrollment changed')
  return {...planPairBootstrap({binding,expectedSha256,actors,familyVerified,version:versions()}),primarySession:primary,standbySession:binding.standby.sessionId,observedAt:Date.now()}
 }catch{return {action:'inspect',reason:'offline-pair-evidence-unqualified',bootstrapPreparationEligible:false,effectsPerformed:false,recoveryAttempted:false,enrollmentSha256:expectedSha256}}
}
