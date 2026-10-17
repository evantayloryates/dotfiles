import {nativeDeliveryFailure} from './native-delivery-failure.mjs'
import {isMetadataOperation,metadataTargetRegistered,metadataTargetPreflightMatches,metadataStateMatches} from './native-metadata-control.mjs'
import {peerRecord} from './peer-direct.mjs'
import {join} from 'node:path'
import {BROKER_DIR,withLock,writeJsonAtomic} from './state.mjs'
import {loadIndependentServiceContext,independentJson as json,independentOrdered as ordered} from './independent-service-context.mjs'
import {screenNativeServiceResult} from './native-peer-service-evidence.mjs'
import {nativeRequestBindingMatches} from './native-request-binding.mjs'
import {getRecord,liveProcesses,readPins,openPrs} from './sessions.mjs'
import {inspectNativeResourcePid} from './native-resource-process.mjs'
import {createHash} from 'node:crypto'
import {writeFileSync} from 'node:fs'
const refuse=()=>{throw Error('independent receipt refused')}
export async function settleIndependentServiceResult(session,serviceId,requestId){
 if(!/^rpeer[a-f0-9]{32}$/.test(requestId||''))refuse()
 return withLock('request-'+requestId,async()=>{
  const context=await loadIndependentServiceContext(session,serviceId,{allowRetired:true}),{config,epoch,pointer,policy}=context
  const {read}=context,request=read('requests/'+requestId+'.json'),receipt=read('.native-service-'+requestId+'.result.json')
  let archiveObservation,metadataObservation,retainObservation=false,retainMetadata=false
  if(request.ops?.[0]?.op==='archive_session'){
   try{archiveObservation=read('.native-service-'+requestId+'.archive-observed.json')}catch(error){
    if(error.code!=='ENOENT')throw error
    const t=config.archiveTarget,r=t&&getRecord(t.sessionId)
    if(!r||r.isArchived!==true||r.cwd!==t.cwd||inspectNativeResourcePid(t.pid)!==null||liveProcesses().some(p=>p.hostSessionId===t.sessionId))refuse()
    archiveObservation={schemaVersion:1,serviceId,requestId,sessionId:t.sessionId,cwd:t.cwd,pid:t.pid,procStart:t.procStart,archived:true,pidAbsent:true,observedAt:Date.now(),nativeTextSha256:createHash('sha256').update(receipt.content.map(b=>b.text).join('\n')).digest('hex')};retainObservation=true
   }
  }
  if(isMetadataOperation(request.ops?.[0]?.op)){try{metadataObservation=read('.native-service-'+requestId+'.metadata-observed.json')}catch(error){if(error.code!=='ENOENT')throw error;const t=config.metadataTarget,r=t&&getRecord(t.sessionId),op=request.ops[0],pinned=t&&readPins().has(t.sessionId);if(!metadataTargetPreflightMatches({target:t,record:r,peer:t&&peerRecord(t.sessionId),registered:metadataTargetRegistered(t),openPrCount:r?openPrs(r).length:null})||!metadataStateMatches(r,pinned,op.op,op.args))refuse();metadataObservation={schemaVersion:1,serviceId,requestId,sessionId:t.sessionId,cwd:t.cwd,pid:t.pid,procStart:t.procStart,operation:op.op,postcondition:op.op==='set_session_title'?{title:r.title,titleSource:r.titleSource}:op.op==='set_pinned'?{pinned}:op.op==='set_session_model'?{model:r.model}:{effort:r.effort},observedAt:Date.now(),nativeTextSha256:createHash('sha256').update(receipt.content.map(b=>b.text).join('\n')).digest('hex')};retainMetadata=true}}
  const reviewed=screenNativeServiceResult({config,epoch,pointer,request,receipt,ready:read('.native-service-'+serviceId+'.ready.json'),intent:read('.native-service-'+requestId+'.intent.json'),entry:read('broker-check-'+requestId+'-0-g'+pointer.generation+'.completed.json'),admission:read('native-admission-'+requestId+'-0.json'),control:read('controls/'+requestId+'.json'),archiveObservation,metadataObservation})
  if(!reviewed.receiptVerified||!nativeRequestBindingMatches(request,pointer)||request.nativeEffectAdmissionPolicy?.version!==1||request.nativeEffectAdmissionPolicy?.handlerSha256!==policy.sha256||request.nativeEffectAdmissionPolicy?.settingsHash!==policy.settingsHash)refuse()
  if(retainObservation)writeFileSync(join(BROKER_DIR,'.native-service-'+requestId+'.archive-observed.json'),JSON.stringify(archiveObservation),{flag:'wx',mode:0o600})
  if(retainMetadata)writeFileSync(join(BROKER_DIR,'.native-service-'+requestId+'.metadata-observed.json'),JSON.stringify(metadataObservation),{flag:'wx',mode:0o600})
  const native={id:requestId,source:'native-peer-service-result',results:[{op:request.ops[0].op,...reviewed.result,nativeToolUseId:reviewed.nativeToolUseId}]},file=join(BROKER_DIR,'results',requestId+'.native.json')
  let published=false
  try{if(JSON.stringify(ordered(json(file)))!==JSON.stringify(ordered(native)))refuse()}catch(error){if(error.code!=='ENOENT')throw error;writeJsonAtomic(file,native);published=true}
  if(JSON.stringify(ordered(json(file)))!==JSON.stringify(ordered(native)))refuse()
  const nativeFailure=request.ops[0].op==='send_message'?nativeDeliveryFailure(reviewed.result,request.ops[0].args.session_id):undefined
  return {serviceId,requestId,...nativeFailure?{nativeFailure}:{},receiptVerified:true,state:reviewed.result.ok?'completed':'failed',source:native.source,nativeToolUseId:reviewed.nativeToolUseId,published,...metadataObservation?{metadataVerified:true,targetSession:metadataObservation.sessionId,postcondition:metadataObservation.postcondition}:{},...reviewed.stopReceipt?{...reviewed.stopReceipt,targetSession:config.metadataTarget.sessionId}:{},...reviewed.sendReceipt?{...reviewed.sendReceipt,targetSession:config.metadataTarget.sessionId}:request.ops[0].op==='send_message'?{wakeNativeReceiptVerified:true,nativeProcessAssessed:false,messageApplied:false,servingQualified:false}:{},...archiveObservation?{archiveVerified:true,targetSession:archiveObservation.sessionId,previousPidObservedAbsent:true}:{},controlHistoryPreserved:true,releaseAuthorized:false}
 },{timeoutMs:5000})
}
