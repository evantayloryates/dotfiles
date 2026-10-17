import {join} from 'node:path'
import {BROKER_DIR,withLock,writeJsonAtomic} from './state.mjs'
import {loadIndependentServiceContext,independentJson as json,independentOrdered as ordered} from './independent-service-context.mjs'
import {screenNativeServiceResult} from './native-peer-service-evidence.mjs'
import {nativeRequestBindingMatches} from './native-request-binding.mjs'
const refuse=()=>{throw Error('independent receipt refused')}
export async function settleIndependentServiceResult(session,serviceId,requestId){
 if(!/^rpeer[a-f0-9]{32}$/.test(requestId||''))refuse()
 return withLock('request-'+requestId,async()=>{
  const context=await loadIndependentServiceContext(session,serviceId),{config,epoch,pointer,policy}=context
  const {read}=context,request=read('requests/'+requestId+'.json'),receipt=read('.native-service-'+requestId+'.result.json')
  const reviewed=screenNativeServiceResult({config,epoch,pointer,request,receipt,ready:read('.native-service-'+serviceId+'.ready.json'),intent:read('.native-service-'+requestId+'.intent.json'),entry:read('broker-check-'+requestId+'-0-g'+pointer.generation+'.completed.json'),admission:read('native-admission-'+requestId+'-0.json'),control:read('controls/'+requestId+'.json')})
  if(!reviewed.receiptVerified||!nativeRequestBindingMatches(request,pointer)||request.nativeEffectAdmissionPolicy?.version!==1||request.nativeEffectAdmissionPolicy?.handlerSha256!==policy.sha256||request.nativeEffectAdmissionPolicy?.settingsHash!==policy.settingsHash)refuse()
  const native={id:requestId,source:'native-peer-service-result',results:[{op:'get_session',...reviewed.result,nativeToolUseId:reviewed.nativeToolUseId}]},file=join(BROKER_DIR,'results',requestId+'.native.json')
  let published=false
  try{if(JSON.stringify(ordered(json(file)))!==JSON.stringify(ordered(native)))refuse()}catch(error){if(error.code!=='ENOENT')throw error;writeJsonAtomic(file,native);published=true}
  if(JSON.stringify(ordered(json(file)))!==JSON.stringify(ordered(native)))refuse()
  return {serviceId,requestId,receiptVerified:true,state:reviewed.result.ok?'completed':'failed',source:native.source,nativeToolUseId:reviewed.nativeToolUseId,published,controlHistoryPreserved:true,releaseAuthorized:false}
 },{timeoutMs:5000})
}
