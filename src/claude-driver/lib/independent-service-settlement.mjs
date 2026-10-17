import {join} from 'node:path'
import {BROKER_DIR,withLock,writeJsonAtomic} from './state.mjs'
import {loadIndependentServiceContext,independentJson as json,independentOrdered as ordered} from './independent-service-context.mjs'
import {screenNativeServiceResult} from './native-peer-service-evidence.mjs'
import {nativeRequestBindingMatches} from './native-request-binding.mjs'
import {getRecord,liveProcesses} from './sessions.mjs'
import {inspectNativeResourcePid} from './native-resource-process.mjs'
import {createHash} from 'node:crypto'
import {writeFileSync} from 'node:fs'
const refuse=()=>{throw Error('independent receipt refused')}
export async function settleIndependentServiceResult(session,serviceId,requestId){
 if(!/^rpeer[a-f0-9]{32}$/.test(requestId||''))refuse()
 return withLock('request-'+requestId,async()=>{
  const context=await loadIndependentServiceContext(session,serviceId,{allowRetired:true}),{config,epoch,pointer,policy}=context
  const {read}=context,request=read('requests/'+requestId+'.json'),receipt=read('.native-service-'+requestId+'.result.json')
  let archiveObservation,retainObservation=false
  if(request.ops?.[0]?.op==='archive_session'){
   try{archiveObservation=read('.native-service-'+requestId+'.archive-observed.json')}catch(error){
    if(error.code!=='ENOENT')throw error
    const t=config.archiveTarget,r=t&&getRecord(t.sessionId)
    if(!r||r.isArchived!==true||r.cwd!==t.cwd||inspectNativeResourcePid(t.pid)!==null||liveProcesses().some(p=>p.hostSessionId===t.sessionId))refuse()
    archiveObservation={schemaVersion:1,serviceId,requestId,sessionId:t.sessionId,cwd:t.cwd,pid:t.pid,procStart:t.procStart,archived:true,pidAbsent:true,observedAt:Date.now(),nativeTextSha256:createHash('sha256').update(receipt.content.map(b=>b.text).join('\n')).digest('hex')};retainObservation=true
   }
  }
  const reviewed=screenNativeServiceResult({config,epoch,pointer,request,receipt,ready:read('.native-service-'+serviceId+'.ready.json'),intent:read('.native-service-'+requestId+'.intent.json'),entry:read('broker-check-'+requestId+'-0-g'+pointer.generation+'.completed.json'),admission:read('native-admission-'+requestId+'-0.json'),control:read('controls/'+requestId+'.json'),archiveObservation})
  if(!reviewed.receiptVerified||!nativeRequestBindingMatches(request,pointer)||request.nativeEffectAdmissionPolicy?.version!==1||request.nativeEffectAdmissionPolicy?.handlerSha256!==policy.sha256||request.nativeEffectAdmissionPolicy?.settingsHash!==policy.settingsHash)refuse()
  if(retainObservation)writeFileSync(join(BROKER_DIR,'.native-service-'+requestId+'.archive-observed.json'),JSON.stringify(archiveObservation),{flag:'wx',mode:0o600})
  const native={id:requestId,source:'native-peer-service-result',results:[{op:request.ops[0].op,...reviewed.result,nativeToolUseId:reviewed.nativeToolUseId}]},file=join(BROKER_DIR,'results',requestId+'.native.json')
  let published=false
  try{if(JSON.stringify(ordered(json(file)))!==JSON.stringify(ordered(native)))refuse()}catch(error){if(error.code!=='ENOENT')throw error;writeJsonAtomic(file,native);published=true}
  if(JSON.stringify(ordered(json(file)))!==JSON.stringify(ordered(native)))refuse()
  return {serviceId,requestId,receiptVerified:true,state:reviewed.result.ok?'completed':'failed',source:native.source,nativeToolUseId:reviewed.nativeToolUseId,published,...archiveObservation?{archiveVerified:true,targetSession:archiveObservation.sessionId,previousPidObservedAbsent:true}:{},controlHistoryPreserved:true,releaseAuthorized:false}
 },{timeoutMs:5000})
}
