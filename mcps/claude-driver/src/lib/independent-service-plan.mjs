import {getRecord} from './sessions.mjs'
import {loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {inspectIndependentService} from './independent-service-result.mjs'
const id=/^[a-f0-9]{32}$/
// Pure policy. A recommendation never dispatches, resumes or repairs anything.
export function planIndependentService(status,{now=Date.now(),readTimeoutMs=20000}={}){
 const result=(action,reason)=>({serviceId:status?.serviceId??null,action,reason,effectsPerformed:false,readAdmissionQualified:action==='read',renewalAuthorized:false})
 if(!Number.isSafeInteger(now)||now<0||!Number.isInteger(readTimeoutMs)||readTimeoutMs<1000||readTimeoutMs>60000)return result('inspect','invalid-planning-input')
 if(!status||!id.test(status.serviceId||'')||status.verified!==true||status.verificationMode!=='live-native'||status.nativeEpochAssessed!==true||status.sourceDisposition!=='installed')return result('inspect','live-context-unqualified')
 if(status.admissionStopped===true)return result(status.stopMarkerMatchesGeneration===true?'stop':'inspect',status.stopMarkerMatchesGeneration===true?'owned-stop':'unqualified-stop')
 if(status.admissionStopped!==false||status.terminalAttemptReviewComplete!==true||!Array.isArray(status.unresolvedRequestIds)||status.unresolvedRequestIds.length)return result('inspect','unresolved-attempts-or-controls')
 if(typeof status.nativeInputRequired!=='boolean'||!['idle','busy','waiting'].includes(status.nativeEpoch?.status)||typeof status.readinessObserved!=='boolean'||typeof status.nativePolicyObserved!=='boolean')return result('inspect','native-observation-unqualified')
 if(status.nativeInputRequired===true||status.nativeEpoch?.status==='waiting')return result('wait','native-input-required')
 if(status.nativeEpoch?.status!=='idle')return result('wait','native-peer-not-idle')
 if(!Number.isSafeInteger(status.deadline)||status.deadline<0||!Number.isInteger(status.configuredMaxRequests)||status.configuredMaxRequests<1||status.configuredMaxRequests>128||!Number.isInteger(status.reservedSlots)||status.reservedSlots<0||!Number.isInteger(status.unreservedSlots)||status.unreservedSlots<0||status.reservedSlots+status.unreservedSlots!==status.configuredMaxRequests)return result('inspect','budget-or-deadline-unqualified')
 const remainingMs=status.deadline-now
 if(remainingMs<=Math.max(90000,readTimeoutMs+1000))return result('renew','lifetime-margin')
 if(status.unreservedSlots===0)return result('renew','capacity-exhausted')
 if(status.readinessObserved!==true)return result('wait','native-readiness-not-observed')
 if(status.nativePolicyObserved!==true)return result(status.unreservedSlots>=2?'probe':'renew',status.unreservedSlots>=2?'native-policy-not-observed':'capacity-for-probe-and-read')
 return {...result('read','current-read-gates-observed'),remainingMs,unreservedSlots:status.unreservedSlots}
}
export async function inspectIndependentServicePlan(session,serviceId,{signal,readTimeoutMs=20000}={}){
 const record=getRecord(session),selected=loadReceiverSelection(record.cwd)
 const refused={serviceId,action:'inspect',reason:'selected-generation-changed',effectsPerformed:false,readAdmissionQualified:false,renewalAuthorized:false}
 if(selected.selector.serviceId!==serviceId||selected.selector.sessionId!==session)return refused
 const status=await inspectIndependentService(session,serviceId,{signal}),after=loadReceiverSelection(record.cwd)
 if(JSON.stringify(selected)!==JSON.stringify(after)||status.build!==selected.selector.build||status.generation!==selected.selector.generation||status.nativeEpoch?.pid!==selected.selector.pid||status.nativeEpoch.procStart!==selected.selector.procStart)return refused
 return {...planIndependentService(status,{readTimeoutMs}),sessionId:session,observedAt:Date.now()}
}
