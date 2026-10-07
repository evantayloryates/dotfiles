import {screenNativeServiceReady} from './native-peer-service-evidence.mjs'
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===keys.sort().join(',')
// A marker can prove the callback observed cancellation, never by itself prove
// complete absence of an effect or settle a request whose helper admitted it.
export function screenNativeServiceCancellation({config,ready,intent,marker,request,control,now=Date.now()}={}){
 const refused={cancellationObserved:false,noEffectQualified:false,standardLifecycleSettlementAssessed:false,releaseAuthorized:false}
 try{
  if(config.controlCheck!==true||!/^rpeer[a-f0-9]{32}$/.test(request.id)||!Number.isSafeInteger(now)||!exact(marker,['schemaVersion','scope','serviceId','requestId','brokerSession','observedAt','nativeMcpCallsRequested','modelCallsRequested'])||!exact(intent,['schemaVersion','scope','serviceId','requestId','brokerSession','startedAt']))return refused
  if(marker.schemaVersion!==1||marker.scope!=='owned-native-service-cancel-before-call'||marker.serviceId!==config.id||marker.requestId!==request.id||marker.brokerSession!==config.brokerSession||marker.nativeMcpCallsRequested!==0||marker.modelCallsRequested!==0||intent.schemaVersion!==1||intent.scope!=='owned-native-service-intent'||intent.serviceId!==config.id||intent.requestId!==request.id||intent.brokerSession!==config.brokerSession)return refused
  const at=Date.parse(marker.observedAt),start=Date.parse(intent.startedAt),created=Date.parse(request.createdAt)
  if(!Number.isFinite(at)||new Date(at).toISOString()!==marker.observedAt||!Number.isFinite(start)||new Date(start).toISOString()!==intent.startedAt||!Number.isFinite(created)||created>start||start>at||at>now||!Number.isSafeInteger(request.expiresAt)||at>request.expiresAt||request.expiresAt>config.deadline||!screenNativeServiceReady({config,ready,now:at})||start<Date.parse(ready.registeredAt))return refused
  if(request.protocol!==7||!Array.isArray(request.ops)||request.ops.length!==1||request.ops[0].op!=='get_session'||!exact(request.ops[0].args,['session_id'])||!/^local_[a-f0-9-]{36}$/.test(request.ops[0].args.session_id)||request.ops[0].args.session_id===config.brokerSession)return refused
  if(control.id!==request.id||control.cancelRequested!==true||!Array.isArray(control.dispatched)||control.dispatched.length!==1||control.dispatched[0]!==0||!Number.isFinite(control.at)||control.at<start||control.at>at)return refused
  return {...refused,cancellationObserved:true,requestId:request.id,observedAt:marker.observedAt,nativeMcpCallsRequested:0,modelCallsRequested:0}
 }catch{return refused}
}
