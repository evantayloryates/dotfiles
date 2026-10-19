// One exact native metadata job, not a general desktop relay.
export const NATIVE_CONTRACT_TOOLS=['driver_guide','broker_service_status','driver_submit','driver_wait']
const ordered=x=>Array.isArray(x)?x.map(ordered):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordered(x[k])])):x
const same=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b))
export function permittedNativeContractCall(contract,jobs,name,args={}){
 if(!args||typeof args!=='object'||Array.isArray(args))return false
 if(contract.reviewOnly===true)return name==='driver_guide'?same(args,{}):name==='driver_wait'&&same(args,{job_id:contract.reviewJobId,timeout_sec:20,include_result:true})
 if(name==='driver_guide')return same(args,{})
 if(name==='broker_service_status')return same(args,{session:contract.session,service_id:contract.serviceId})
 if(name==='driver_submit')return same(args,contract.submission)
 if(name==='driver_wait')return Object.keys(args).every(k=>['job_id','timeout_sec','include_result'].includes(k))&&jobs.has(args.job_id)&&typeof args.timeout_sec==='number'&&args.timeout_sec>0&&args.timeout_sec<=30&&args.include_result===true
 return false
}
const requiredOperationalChecks=['processSucceeded','noExternalToolCalls','freshSchema','exactTwoSubmissions','sameJob','verifiedNativeReceipt','derivedRequestId','noRefusedCalls','noModelTurn','sourceUnchanged','globalConfigUnchanged']
export function classifyNativeContractChecks(checks,{routeCurrent=false,metadataConfig=false,metadataModel=false,nativeSend=false,nativeSteer=false}={}){
 const required=nativeSend?[...requiredOperationalChecks,'selectedServiceMatches','noMaintenanceChildren','nativeSendAccepted','targetUserReceiptVerified','recipientReplyVerified','targetConfigUnchanged',...nativeSteer?['steerPhasesVerified']:[]]:metadataConfig?[...requiredOperationalChecks,'selectedServiceMatches','noMaintenanceChildren','metadataChildrenVerified','stateVerified','fixtureStateChanged','targetNoModelTurn',...metadataModel?['modelChanged']:[]]:routeCurrent?[...requiredOperationalChecks,'selectedServiceMatches','noMaintenanceChildren']:requiredOperationalChecks
 const nativeContractVerified=!!checks&&required.every(k=>checks[k]===true),ok=nativeContractVerified&&checks.finalMarker===true
 return {ok,nativeContractVerified,failureCategory:ok?null:nativeContractVerified?'harness_output_format':'native_contract_failed'}
}
export function nativeContractReplyEvidence(out,{routeCurrent=false,metadataConfig=false,metadataModel=false,nativeSend=false,nativeSteer=false}={}){
 if(nativeSteer){const r=out?.result,c=r?.phaseContexts,stop=r?.stopRequestId,send=r?.sendRequestId,verified=!!(r?.route==='independent-native-interrupt'&&r.verified===true&&r.receiptVerified===true&&r.nativeAccepted===true&&r.applied===false&&['stopped','already_idle'].includes(r.stopReceipt)&&/^j[a-f0-9]{32}$/.test(c?.stop||'')&&/^j[a-f0-9]{32}$/.test(c?.send||'')&&c.stop!==c.send&&stop==='rpeer'+c.stop.slice(1)&&send==='rpeer'+c.send.slice(1)&&r.requestId===send&&['delivered','queued'].includes(r.delivery)&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(r.messageId||''));return {receiptVerified:verified,nativeSendAccepted:verified,derivedRequestIds:verified,requestId:send,stopRequestId:stop,serviceId:r?.serviceId,messageId:r?.messageId,noMaintenanceChildren:!r?.childJobs&&!r?.maintenanceJobId&&!r?.coldRecoveryJobId}}
 if(nativeSend){const r=out?.result,accepted=!!(r?.route==='independent-native-send'&&r.receiptVerified===true&&r.nativeAccepted===true&&r.applied===false&&['delivered','queued'].includes(r.delivery)&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(r.messageId||''));return {receiptVerified:accepted,nativeSendAccepted:accepted,requestId:r?.requestId,serviceId:r?.serviceId,messageId:r?.messageId,noMaintenanceChildren:!r?.childJobs&&!r?.maintenanceJobId&&!r?.coldRecoveryJobId}}
 if(metadataConfig){
  const r=out?.result,children=r?.childJobs,fields=metadataModel?['effort','model','pinned','title']:['effort','pinned','title'],exact=children&&Object.keys(children).sort().join(',')===fields.join(',')&&r?.results&&Object.keys(r.results).sort().join(',')===fields.join(','),ids=exact?fields.map(k=>children[k]):[]
  const verified=!!(exact&&new Set(ids).size===fields.length&&ids.every(id=>/^j[a-f0-9]{32}$/.test(id))&&fields.every(k=>{const v=r.results[k];return v?.receiptVerified===true&&v.metadataVerified===true&&v.state==='completed'&&v.serviceId===r.serviceId&&v.targetSession===r.sessionId&&v.requestId==='rpeer'+children[k].slice(1)}))
  return {receiptVerified:r?.verified===true&&r.route==='independent-metadata'&&verified,metadataChildrenVerified:verified,derivedRequestIds:verified,serviceId:r?.serviceId,noMaintenanceChildren:!!exact&&!r?.maintenanceJobId&&!r?.coldRecoveryJobId}
 }
 const result=routeCurrent?out?.result?.result:out?.result,children=routeCurrent?out?.result?.childJobs:null
 return {requestId:result?.requestId,receiptVerified:result?.receiptVerified,serviceId:result?.serviceId,readJobId:routeCurrent?children?.read:out?.jobId,noMaintenanceChildren:!routeCurrent||!!children&&Object.keys(children).sort().join(',')==='read'}
}

// Title/agent metadata may append transcript bytes without invoking a model.
export function nativeTargetNoModelTurn(o){return !!(o&&o.hasMore===false&&Number.isSafeInteger(o.bytesRead)&&o.bytesRead>=0&&typeof o.cursor==='string'&&Array.isArray(o.events)&&o.events.every(e=>e?.type==='metadata'))}

export function nativeSteerContractRequirements(){
 return 'Require completed, result.verified:true, result.nativeAccepted:true, result.receiptVerified:true, result.route independent-native-interrupt, result.applied:false, and result.stopReceipt stopped or already_idle. Require distinct phaseContexts.stop and phaseContexts.send. result.stopRequestId must equal rpeer plus phaseContexts.stop without initial j; result.sendRequestId and result.requestId must equal rpeer plus phaseContexts.send without initial j. Native acceptance is not recipient application.'
}
