import {createHash} from 'node:crypto'
import {join,dirname} from 'node:path'
import {inspectRestoredNative} from './restored-native-plan.mjs'
import {readRestoredRecordRoot} from './restored-record-proof.mjs'
import {recoveryRoleFromHistory} from './recovery-role.mjs'
import {getRecord} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {readReceiverFile,loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {inspectIndependentService} from './independent-service-result.mjs'
import {readStandbyEnrollment,standbyEnrollmentDigest} from './standby-enrollment.mjs'
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
const same=(a,b)=>!!a&&!!b&&['sessionId','cwd','pid','procStart'].every(k=>a[k]===b[k])
const epoch=e=>Object.fromEntries(['sessionId','cwd','pid','procStart'].map(k=>[k,e[k]]))
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex')
export function planRestoredPair({root,native,record,peer,selected,statuses,policies}={}){
 const result=(action,reason)=>({action,reason,pairPreparationEligible:action==='prepare',activationAuthorized:false,importAuthorized:false,replayAuthorized:false,servingQualified:false,effectsPerformed:false})
 try{
  if(native?.nativePreparationEligible!==true||native.rootJobId!==root.jobId||native.rootSha256!==hash(root))return result('inspect','restored-native-proof-required')
  const lost=root.role,other=lost==='primary'?'standby':'primary',binding=root.originalSnapshot.binding,old=binding[other],s=statuses[other]
  if(!record||record.sessionId!==old.sessionId||record.cliSessionId!==old.sessionId.slice(6)||record.cwd!==old.cwd||record.isArchived!==false||record.permissionMode!=='bypassPermissions'||record.worktreePath||typeof record._file!=='string'||createHash('sha256').update(dirname(record._file)).digest('hex')!==root.originalSnapshot.identity.storeHash)return result('inspect','survivor-account-identity-changed')
  if(peer?.hostSessionId!==old.sessionId||peer.sessionId!==record.cliSessionId||!same({...peer,sessionId:peer.hostSessionId},old)||peer.entrypoint!=='claude-desktop'||peer.version!=='2.1.299'||peer.status!=='idle')return result('wait','exact-idle-survivor-required')
  if(selected?.selector?.serviceId!==old.serviceId||!same(selected.selector,old)||s?.verified!==true||s.sessionId!==old.sessionId||s.serviceId!==old.serviceId||s.verificationMode!=='live-native'||s.sourceDisposition!=='installed'||s.nativeEpoch?.pid!==old.pid||s.nativeEpoch.procStart!==old.procStart||s.admissionStopped!==false||s.terminalAttemptReviewComplete!==true||!Array.isArray(s.unresolvedRequestIds)||s.unresolvedRequestIds.length||s.readinessObserved!==true||s.nativePolicyObserved!==true||selected.selector.build!==s.build)return result('inspect','survivor-service-unqualified')
  const history=statuses[lost]
  if(native.nativeEpoch?.sessionId!==binding[lost].sessionId||native.nativeEpoch.cwd!==binding[lost].cwd||history?.verificationMode!=='historical-retired'||history.sourceDisposition!=='files-retired'||history.admissionStopped!==true||history.stopMarkerMatchesGeneration!==true)return result('inspect','restored-role-history-changed')
  const current={...binding,[lost]:{...binding[lost],...native.nativeEpoch}},roles={}
  for(const role of ['primary','standby']){
   const target=role==='primary'?'standby':'primary',actor=binding[role],history=statuses[role]
   if(history?.sessionId!==actor.sessionId||history.serviceId!==actor.serviceId||history.nativeEpoch?.pid!==actor.pid||history.nativeEpoch.procStart!==actor.procStart)throw Error('historical epoch changed')
   const original=recoveryRoleFromHistory(history,policies[role],{sessionId:actor.sessionId,receiverCwd:actor.cwd,admitTarget:t=>same(t,binding[target])})
   if(role==='primary'?!original.bindings.metadataTarget||original.bindings.archiveTarget:!original.bindings.archiveTarget||original.bindings.metadataTarget)throw Error('reciprocal role missing')
   roles[role]={...original,bindings:Object.fromEntries(Object.keys(original.bindings).map(k=>[k,epoch(current[target])]))}
  }
  return {...result('prepare','same-identity-reciprocal-roles-qualified'),rootJobId:root.jobId,rootSha256:native.rootSha256,enrollmentSha256:root.expectedEnrollmentSha256,restoredRole:lost,originalServiceIds:{primary:binding.primary.serviceId,standby:binding.standby.serviceId},currentEpochs:{primary:epoch(current.primary),standby:epoch(current.standby)},roles,rolesSha256:hash(roles),survivorExpired:s.expired===true,reciprocalServiceAssessed:true,continuationRequired:true}
 }catch{return result('inspect','reciprocal-role-evidence-unqualified')}
}
export async function inspectRestoredPair(rootJobId,expectedRootSha256,{signal}={},d={}){
 const read=d.readRoot??readRestoredRecordRoot,nativeInspect=d.native??inspectRestoredNative,record=d.record??getRecord,peer=d.peer??peerRecord,select=d.select??loadReceiverSelection,status=d.status??((a,historical)=>inspectIndependentService(a.sessionId,a.serviceId,{historical,signal})),policy=d.policy??(a=>JSON.parse(readReceiverFile(join(a.cwd,'.claude-driver-services',a.serviceId,'broker','stop-rescue-policy.json'),65536))),binding=d.binding??readStandbyEnrollment
 try{
  const {root,claim}=read(rootJobId);if(hash(root)!==expectedRootSha256)throw Error('root changed')
  const native=await nativeInspect(rootJobId,expectedRootSha256,{signal});if(!native.nativePreparationEligible)return {action:native.action,reason:native.reason,pairPreparationEligible:false,activationAuthorized:false,effectsPerformed:false}
  const other=root.role==='primary'?'standby':'primary',actors=root.originalSnapshot.binding,old=actors[other],saved=record(old.sessionId),p=peer(old.sessionId),selection=select(old.cwd),statuses={},policies={}
  for(const role of ['primary','standby']){statuses[role]=await status(actors[role],role===root.role);policies[role]=policy(actors[role])}
  const after=read(rootJobId)
  if(signal?.aborted||hash(after.root)!==expectedRootSha256||!equal(after.claim,claim)||standbyEnrollmentDigest(binding(root.primary))!==root.expectedEnrollmentSha256||!equal(record(old.sessionId),saved)||!equal(peer(old.sessionId),p)||!equal(select(old.cwd),selection))throw Error('pair context changed')
  const fresh=await nativeInspect(rootJobId,expectedRootSha256,{signal});if(!equal(fresh,native)||signal?.aborted||!equal(record(old.sessionId),saved)||!equal(peer(old.sessionId),p)||!equal(select(old.cwd),selection)||standbyEnrollmentDigest(binding(root.primary))!==root.expectedEnrollmentSha256||['primary','standby'].some(role=>!equal(policy(actors[role]),policies[role])))throw Error('restored pair changed')
  return planRestoredPair({root,native,record:saved,peer:p,selected:selection,statuses,policies})
 }catch{return {action:'inspect',reason:'restored-pair-inspection-unqualified',pairPreparationEligible:false,activationAuthorized:false,importAuthorized:false,replayAuthorized:false,effectsPerformed:false}}
}
