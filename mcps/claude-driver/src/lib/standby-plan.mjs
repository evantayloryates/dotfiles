import {join} from 'node:path'
import {getRecord,openPrs} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {loadReceiverSelection,readReceiverFile} from './receiver-runtime-selection.mjs'
import {inspectIndependentService} from './independent-service-result.mjs'
import {inspectNativeResourcePid} from './native-resource-process.mjs'
import {archiveTargetValid} from './native-archive-control.mjs'
import {metadataTargetRegistered} from './native-metadata-control.mjs'
import {parseNativeFamilyMetadata} from './native-family-preflight.mjs'
import {STATE_DIR} from './state.mjs'
const sid=/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,id=/^[a-f0-9]{32}$/,request=/^rpeer[a-f0-9]{32}$/
export function planStandbyRecovery({standby,primary,record,primaryPeer,oldPidAbsent,scopeVerified,familyVerified,familyRequestId,allowStandbyMaintenance=false,now=Date.now()}={}){
 const result=(action,reason)=>({action,reason,coldRecoveryEligible:action==='recover',effectsPerformed:false,recoveryAttempted:false,absenceCause:'unclassified'})
 if(!standby?.verified||standby.verificationMode!=='live-native'||standby.sourceDisposition!=='installed'||standby.admissionStopped!==false||standby.nativeInputRequired!==false||standby.nativeEpoch?.status!=='idle'||standby.readinessObserved!==true||standby.nativePolicyObserved!==true||standby.terminalAttemptReviewComplete!==true||!Array.isArray(standby.unresolvedRequestIds)||standby.unresolvedRequestIds.length||!Number.isInteger(standby.unreservedSlots)||standby.unreservedSlots<0||!Number.isSafeInteger(standby.deadline))return result('inspect','standby-unqualified')
 const needsRenewal=standby.expired===true||standby.unreservedSlots<2||standby.deadline-now<180000
 const target=standby.archiveTarget
 if(scopeVerified!==true||!target||!primary?.verified||primary.sourceDisposition!=='installed'||primary.admissionStopped!==false||primary.terminalAttemptReviewComplete!==true||!Array.isArray(primary.unresolvedRequestIds)||primary.unresolvedRequestIds.length||primary.sessionId!==target.sessionId||primary.nativeEpoch?.pid!==target.pid||primary.nativeEpoch.procStart!==target.procStart||!record||record.sessionId!==target.sessionId||record.cwd!==target.cwd||record.permissionMode!=='bypassPermissions'||record.worktreePath)return result('inspect','primary-scope-history-or-stop-unqualified')
 if(!request.test(familyRequestId||'')||familyVerified!==true||!primary.settledRequestIds?.includes(familyRequestId))return result('inspect','retained-empty-family-unqualified')
 if(primaryPeer){if(primaryPeer.pid!==target.pid||primaryPeer.procStart!==target.procStart||primaryPeer.hostSessionId!==target.sessionId)return result('inspect','primary-epoch-changed');return needsRenewal?result('inspect','standby-lease-unqualified'):result('wait','primary-live')}
 if(oldPidAbsent!==true)return result('wait','original-os-process-still-present')
 if(!['offline-installed','historical-retired'].includes(primary.verificationMode))return result('inspect','primary-absence-not-independently-assessed')
 if(needsRenewal)return allowStandbyMaintenance===true?result('renew-standby','exact-absent-primary-standby-lease-renewal'):result('inspect','standby-lease-unqualified')
 return result('recover','exact-primary-absent-with-retained-empty-family')
}
export async function inspectStandbyRecovery(session,serviceId,target,targetServiceId,familyRequestId,{signal,allowStandbyMaintenance=false}={}){
 if(!sid.test(session||'')||!sid.test(target||'')||session===target||!id.test(serviceId||'')||!id.test(targetServiceId||'')||!request.test(familyRequestId||''))throw Error('standby plan requires exact distinct identities')
 const standby=await inspectIndependentService(session,serviceId,{signal}),r=getRecord(target),c=getRecord(session),binding=standby.archiveTarget
 if(!r||!c||!archiveTargetValid(binding,{sessionId:session,receiverCwd:c.cwd})||binding.sessionId!==target)return {action:'inspect',reason:'standby-target-binding-unqualified',coldRecoveryEligible:false,effectsPerformed:false,recoveryAttempted:false}
 const selected=loadReceiverSelection(r.cwd),peer=peerRecord(target),primary=await inspectIndependentService(target,targetServiceId,{signal,...peer?{}:{offline:true}})
 const receipt=JSON.parse(readReceiverFile(join(r.cwd,'.claude-driver-services',targetServiceId,'broker','results',familyRequestId+'.native.json'),65536)),familyVerified=receipt.id===familyRequestId&&receipt.source==='native-peer-service-result'&&receipt.results?.length===1&&receipt.results[0].op==='list_sessions'&&receipt.results[0].ok===true&&parseNativeFamilyMetadata(receipt.results[0].result,target)?.length===0
 const scopeVerified=archiveTargetValid(binding,{sessionId:session,receiverCwd:c.cwd})&&metadataTargetRegistered(binding,{controlStateDir:STATE_DIR})&&openPrs(r).length===0&&selected.selector.serviceId===targetServiceId&&selected.selector.pid===binding.pid&&selected.selector.procStart===binding.procStart&&selected.selector.build===primary.build&&selected.selector.generation===primary.generation
 const plan=planStandbyRecovery({standby,primary,record:r,primaryPeer:peer,oldPidAbsent:inspectNativeResourcePid(binding.pid)===null,scopeVerified,familyVerified,familyRequestId,allowStandbyMaintenance})
 return {...plan,standbySession:session,standbyServiceId:serviceId,primarySession:target,primaryServiceId:targetServiceId,familyRequestId,observedAt:Date.now()}
}
