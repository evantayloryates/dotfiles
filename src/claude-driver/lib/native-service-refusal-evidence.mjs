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
