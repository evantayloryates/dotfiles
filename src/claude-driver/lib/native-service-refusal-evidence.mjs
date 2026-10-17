import {screenNativeServiceReady} from './native-peer-service-evidence.mjs'
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===keys.sort().join(',')
// Callback observation only. Helper/control/admission and source/epoch evidence
// must be reviewed independently before retirement or lifecycle settlement.
export function screenNativeServiceRefusal({config,ready,intent,marker,now=Date.now()}={}){
 const refused={callbackRefusalObserved:false,noEffectQualified:false,standardLifecycleSettlementAssessed:false,releaseAuthorized:false}
 try{
  if(!config||!Number.isSafeInteger(now)||!exact(marker,['schemaVersion','scope','serviceId','requestId','brokerSession','observedAt','reason','nativeMcpCallsRequested','modelCallsRequested'])||!exact(intent,['schemaVersion','scope','serviceId','requestId','brokerSession','startedAt']))return refused
  if(marker.schemaVersion!==1||marker.scope!=='owned-native-service-no-dispatch'||marker.serviceId!==config.id||marker.brokerSession!==config.brokerSession||!/^rpeer[a-f0-9]{32}$/.test(marker.requestId)||marker.nativeMcpCallsRequested!==0||marker.modelCallsRequested!==0||!['invalid_request','request_generation_mismatch','cancelled','expired','already_dispatched_or_unclaimed'].includes(marker.reason))return refused
  if(intent.schemaVersion!==1||intent.scope!=='owned-native-service-intent'||intent.serviceId!==config.id||intent.requestId!==marker.requestId||intent.brokerSession!==config.brokerSession)return refused
  const start=Date.parse(intent.startedAt),at=Date.parse(marker.observedAt)
  if(!Number.isFinite(start)||new Date(start).toISOString()!==intent.startedAt||!Number.isFinite(at)||new Date(at).toISOString()!==marker.observedAt||at<start||at>now||!screenNativeServiceReady({config,ready,now:at})||start<Date.parse(ready.registeredAt))return refused
  return {...refused,callbackRefusalObserved:true,requestId:marker.requestId,reason:marker.reason,observedAt:marker.observedAt,nativeMcpCallsRequested:0}
 }catch{return refused}
}

// Narrow terminal review for a missing-request self-test only. This does not
// settle a protocol request or qualify other refusal reasons (especially an
// already-dispatched request). Caller must verify installed sealed context.
export function screenTerminalMissingRequestRefusal({config,ready,intent,marker,pointer,policy,entry,policyInvocations,absence,now=Date.now()}={}){
 const refused={terminalRefusalVerified:false,scopedNoNativeMcpQualified:false,standardLifecycleSettlementAssessed:false,releaseAuthorized:false}
 try{
  const callback=screenNativeServiceRefusal({config,ready,intent,marker,now})
  if(!callback.callbackRefusalObserved||marker.reason!=='invalid_request'||!exact(absence,['request','control','admission','moduleResult','standardResult'])||Object.values(absence).some(x=>x!==true))return refused
  const start=Date.parse(intent.startedAt),end=Date.parse(marker.observedAt),activated=Date.parse(pointer.activatedAt)
  if(pointer.sessionId!==config.brokerSession||pointer.build!==config.build||!Number.isInteger(pointer.pid)||pointer.pid<=1||!pointer.procStart||!Number.isInteger(pointer.generation)||pointer.generation<1||! /^[a-f0-9]{64}$/.test(pointer.bootstrapHash)||!Number.isFinite(activated)||activated>start)return refused
  if(typeof policy?.script!=='string'||!policy.script.endsWith('/scripts/broker-stop-rescue.mjs')||entry.script!==policy.script.replace(/broker-stop-rescue\.mjs$/,'broker-check.mjs'))return refused
  if(entry.phase!=='completed'||entry.requestId!==intent.requestId||entry.index!==0||entry.build!==pointer.build||entry.bootstrapHash!==pointer.bootstrapHash||entry.generation!==pointer.generation||entry.nativeBinding?.ancestorVerified!==true||entry.nativeBinding.brokerPid!==pointer.pid||entry.nativeBinding.brokerProcStart!==pointer.procStart||entry.nativeBinding.brokerSessionId!==pointer.sessionId||!Number.isSafeInteger(entry.at)||entry.at<start||entry.at>end)return refused
  if(!Array.isArray(policyInvocations)||policyInvocations.length>128||policy.nativeEffectAdmissionVersion!==1||policy.nativeRequestBindingVersion!==1||policy.maximumRescuesPerRequest!==0||policy.build!==pointer.build||policy.sessionId!==pointer.sessionId||policy.pid!==pointer.pid||policy.procStart!==pointer.procStart)return refused
  const audit=policyInvocations.filter(a=>a.schemaVersion===1&&a.scope==='owned-native-policy-invocation'&&a.tool==='Bash'&&/^toolu_plugin_[a-f0-9]{30,32}$/.test(a.toolUseId)&&a.pid===pointer.pid&&a.procStart===pointer.procStart&&a.sessionId===pointer.sessionId&&a.build===pointer.build&&a.generation===pointer.generation&&a.handlerSha256===policy.sha256&&a.settingsHash===policy.settingsHash&&Number.isSafeInteger(a.at)&&a.at>=start&&a.at<=entry.at)
  // The policy audit has no request ID; use it only as a unique temporal
  // policy observation, never native call admission or a standalone effect proof.
  if(audit.length!==1)return refused
  return {...refused,terminalRefusalVerified:true,scopedNoNativeMcpQualified:true,requestId:intent.requestId,reason:marker.reason,helperCompletedAt:entry.at,policyInvocationObserved:true}
 }catch{return refused}
}
