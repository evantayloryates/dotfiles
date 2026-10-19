import {createHash} from 'node:crypto'
import {nativeRequestBindingMatches} from './native-request-binding.mjs'
const ordered=x=>Array.isArray(x)?x.map(ordered):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordered(x[k])])):x
const hash=x=>createHash('sha256').update(JSON.stringify(ordered(x))).digest('hex')
const sid=/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
// This qualifies abandonment of an unavailable read RESULT, never success,
// nonexecution, retry, or a native terminal receipt. No mutation can enter here.
export function qualifyOfflineReadAbandonment(context,id,now=Date.now()){
 const {config,pointer,policy,read}=context
 if(!/^rpeer[a-f0-9]{32}$/.test(id||'')||!Number.isSafeInteger(now)||pointer.nativeRequestBindingVersion!==1)throw Error('abandonment identity')
 const request=read('requests/'+id+'.json'),intent=read('.native-service-'+id+'.intent.json'),control=read('controls/'+id+'.json'),op=request.ops?.[0]
 if(request.id!==id||request.protocol!==7||request.ops?.length!==1||!nativeRequestBindingMatches(request,pointer)||request.nativeEffectAdmissionPolicy?.version!==1||request.nativeEffectAdmissionPolicy.handlerSha256!==policy.sha256||request.nativeEffectAdmissionPolicy.settingsHash!==policy.settingsHash||!Number.isFinite(request.expiresAt)||request.expiresAt>=now)throw Error('abandonment request binding')
 if(op?.op==='list_sessions'){
  if(JSON.stringify(ordered(op.args))!==JSON.stringify(ordered({include_archived:true,limit:100,linked:true}))||request.nativeObservation?.brokerSessionId!==config.brokerSession||request.nativeObservation?.cliSessionId!==config.brokerSession.slice(6))throw Error('abandonment family scope')
 }else if(op?.op==='get_session'){
  if(Object.keys(op.args??{}).join(',')!=='session_id'||!sid.test(op.args.session_id))throw Error('abandonment read scope')
 }else throw Error('abandonment forbids mutations')
 if(Object.keys(request).some(k=>/^native(?:Session|Metadata|Archive|Send|Stop|Wake)/.test(k))||intent.serviceId!==config.id||intent.requestId!==id||intent.brokerSession!==config.brokerSession||!Number.isFinite(Date.parse(intent.startedAt))||Date.parse(intent.startedAt)>now||control.id!==id||control.state!=='native-service-read-finished'||!Array.isArray(control.dispatched)||control.dispatched.length)throw Error('abandonment worker or intent unqualified')
 for(const name of ['native-admission-'+id+'-0.json','broker-check-'+id+'-0-g'+pointer.generation+'.completed.json','.native-service-'+id+'.result.json','results/'+id+'.native.json']){try{read(name);throw Error('abandonment preserves native evidence')}catch(error){if(error.code!=='ENOENT')throw error}}
 return {operation:op.op,requestSha256:hash(request)}
}
export function offlineReadAbandonmentMatches(context,id,marker,now=Date.now()){
 try{
  if(Object.keys(marker??{}).sort().join(',')!=='at,build,generation,jobId,kind,pid,previousPidObservedAbsent,procStart,requestId,requestSha256,sameHostAbsent,schemaVersion,serviceId,sessionId'||marker.schemaVersion!==1||marker.kind!=='offline-read-result-abandoned'||marker.serviceId!==context.config.id||marker.requestId!==id||!/^j[a-f0-9]{32}$/.test(marker.jobId||'')||!['sessionId','build','generation','pid','procStart'].every(k=>marker[k]===context.pointer[k])||marker.previousPidObservedAbsent!==true||marker.sameHostAbsent!==true||!Number.isSafeInteger(marker.at)||marker.at>now)return false
  return qualifyOfflineReadAbandonment(context,id,marker.at).requestSha256===marker.requestSha256
 }catch{return false}
}
export async function runOfflineReadAbandonment(id,jobId,d){
 if(!/^j[a-f0-9]{32}$/.test(jobId||''))throw Error('durable abandonment job required')
 return d.lock(async()=>{
  const context=await d.context();await d.absence(context.pointer)
  const now=d.now(),qualified=qualifyOfflineReadAbandonment(context,id,now),marker={schemaVersion:1,kind:'offline-read-result-abandoned',serviceId:context.config.id,requestId:id,...Object.fromEntries(['sessionId','build','generation','pid','procStart'].map(k=>[k,context.pointer[k]])),requestSha256:qualified.requestSha256,at:now,jobId,previousPidObservedAbsent:true,sameHostAbsent:true}
  await d.absence(context.pointer);await d.write(marker)
  const after=await d.context();await d.absence(after.pointer)
  if(!offlineReadAbandonmentMatches(after,id,await d.read(),d.now()))throw Error('abandonment checkpoint unqualified')
  return {serviceId:marker.serviceId,requestId:id,operation:qualified.operation,resultAbandoned:true,outcome:'unknown',nativeReceiptVerified:false,replayAuthorized:false,nativeEffectsRequested:0}
 })
}
