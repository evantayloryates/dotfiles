import {offlineReadAbandonmentMatches} from './offline-read-abandonment.mjs'
import {isMetadataOperation} from './native-metadata-control.mjs'
import {screenNativeServiceResult} from './native-peer-service-evidence.mjs'
import {screenNativeServiceRefusal,screenTerminalMissingRequestRefusal} from './native-service-refusal-evidence.mjs'
import {nativeRequestBindingMatches} from './native-request-binding.mjs'
import {independentOrdered as ordered} from './independent-service-context.mjs'
const requestPattern=/^rpeer[a-f0-9]{32}$/
// Diagnostic presence is not proof of execution or nonexecution. Never include
// request arguments, tool content, transcript text or arbitrary error strings.
export function unresolvedAttemptDiagnostic(context,id){
 const {read,pointer}=context,objects={}
 const names={intent:'.native-service-'+id+'.intent.json',request:'requests/'+id+'.json',control:'controls/'+id+'.json',entry:'broker-check-'+id+'-0-g'+pointer.generation+'.completed.json',admission:'native-admission-'+id+'-0.json',moduleResult:'.native-service-'+id+'.result.json',publishedResult:'results/'+id+'.native.json'}
 const evidence=Object.fromEntries(Object.entries(names).map(([key,name])=>{try{objects[key]=read(name);return [key,'present']}catch(error){return [key,error.code==='ENOENT'?'absent':'unreadable']}}))
 const request=objects.request,ops=request?.ops
 const known=new Set(['get_session','list_sessions','archive_session','send_message','stop_session','set_session_title','set_session_model','set_session_effort','set_pinned','unarchive_session'])
 const operation=Array.isArray(ops)&&ops.length===1&&known.has(ops[0]?.op)?ops[0].op:'unqualified'
 let runtimeBindingVerified=false;try{runtimeBindingVerified=pointer.nativeRequestBindingVersion===1&&nativeRequestBindingMatches(request,pointer)===true}catch{}
 return {requestId:id,operation,operationScope:runtimeBindingVerified&&['get_session','list_sessions'].includes(operation)?'metadata-read':'unqualified',runtimeBindingVerified,evidence,outcome:'unknown',replayAuthorized:false,retirementAuthorized:false}
}
// Read-only inventory. Missing, malformed and merely refused attempts remain
// unresolved; only fully reviewed, already-published results count as settled.
export function reviewIndependentAttempts({context,reservedRequestIds,names,now=Date.now()}){
 const {config,epoch,pointer,policy,read}=context
 if(!Array.isArray(names)||names.length>2048||!Array.isArray(reservedRequestIds)||reservedRequestIds.length>128)throw Error('attempt inventory bound')
 const ids=new Set(reservedRequestIds)
 for(const id of ids)if(!requestPattern.test(id))throw Error('attempt identity')
 for(const name of names){
  if(!/^\.native-service-rpeer[a-f0-9]{32}\.intent\.json$/.test(name))continue
  const intent=read(name)
  if(intent.serviceId!==config.id)continue
  const id=name.slice('.native-service-'.length,-'.intent.json'.length)
  if(intent.requestId!==id||intent.brokerSession!==config.brokerSession)throw Error('attempt ownership')
  ids.add(id)
 }
 if(ids.size>256)throw Error('attempt inventory bound')
 const settledRequestIds=[],abandonedReadRequestIds=[],unresolvedRequestIds=[],unresolvedAttempts=[],callbackRefusalRequestIds=[],terminalRefusalRequestIds=[]
 for(const id of [...ids].sort()){
  let settled=false
  try{
   const request=read('requests/'+id+'.json'),receipt=read('.native-service-'+id+'.result.json')
   const reviewed=screenNativeServiceResult({config,epoch,pointer,request,receipt,ready:read('.native-service-'+config.id+'.ready.json'),intent:read('.native-service-'+id+'.intent.json'),entry:read('broker-check-'+id+'-0-g'+pointer.generation+'.completed.json'),admission:read('native-admission-'+id+'-0.json'),control:read('controls/'+id+'.json'),...Object.hasOwn(request,'nativeSessionTargetBinding')?(['send_message','stop_session'].includes(request.ops?.[0]?.op)?{}:{ordinaryObservation:read('.native-service-'+id+'.ordinary-observed.json')}):isMetadataOperation(request.ops?.[0]?.op)?{metadataObservation:read('.native-service-'+id+'.metadata-observed.json')}:{},...!Object.hasOwn(request,'nativeSessionTargetBinding')&&request.ops?.[0]?.op==='archive_session'?{archiveObservation:read('.native-service-'+id+'.archive-observed.json')}:{},now})
   if(reviewed.receiptVerified&&nativeRequestBindingMatches(request,pointer)&&request.nativeEffectAdmissionPolicy?.version===1&&request.nativeEffectAdmissionPolicy.handlerSha256===policy.sha256&&request.nativeEffectAdmissionPolicy.settingsHash===policy.settingsHash){
    const expected={id,source:'native-peer-service-result',results:[{op:request.ops[0].op,...reviewed.result,nativeToolUseId:reviewed.nativeToolUseId}]}
    settled=JSON.stringify(ordered(read('results/'+id+'.native.json')))===JSON.stringify(ordered(expected))
   }
  }catch{/* Preserve the original evidence; absence is not a terminal outcome. */}
  if(settled){settledRequestIds.push(id);continue}
  try{if(offlineReadAbandonmentMatches(context,id,read('.offline-read-abandoned-'+id+'.json'),now)){abandonedReadRequestIds.push(id);continue}}catch{}
  let terminal=false
  try{if(screenNativeServiceRefusal({config,ready:read('.native-service-'+config.id+'.ready.json'),intent:read('.native-service-'+id+'.intent.json'),marker:read('.native-service-'+id+'.no-dispatch.json'),now}).callbackRefusalObserved)callbackRefusalRequestIds.push(id)
   const absent=name=>{try{read(name);return false}catch(error){if(error.code==='ENOENT')return true;throw error}}
   const absence={request:absent('requests/'+id+'.json'),control:absent('controls/'+id+'.json'),admission:absent('native-admission-'+id+'-0.json'),moduleResult:absent('.native-service-'+id+'.result.json'),standardResult:absent('results/'+id+'.native.json')}
   const auditNames=names.filter(n=>/^native-policy-invocation-[A-Za-z0-9_-]+\.json$/.test(n));if(auditNames.length>128)throw Error('audit bound')
   terminal=screenTerminalMissingRequestRefusal({config,pointer,policy,ready:read('.native-service-'+config.id+'.ready.json'),intent:read('.native-service-'+id+'.intent.json'),marker:read('.native-service-'+id+'.no-dispatch.json'),entry:read('broker-check-'+id+'-0-g'+pointer.generation+'.completed.json'),policyInvocations:auditNames.map(read),absence,now}).terminalRefusalVerified
  }catch{}
  if(terminal)terminalRefusalRequestIds.push(id);else{unresolvedRequestIds.push(id);unresolvedAttempts.push(unresolvedAttemptDiagnostic(context,id))}
 }
 return {settledRequestIds,abandonedReadRequestIds,unresolvedRequestIds,unresolvedAttempts,callbackRefusalRequestIds,terminalRefusalRequestIds,attemptsReviewed:ids.size,terminalAttemptReviewComplete:unresolvedRequestIds.length===0,retirementAuthorized:false,scopedUnloadQualified:false}
}
