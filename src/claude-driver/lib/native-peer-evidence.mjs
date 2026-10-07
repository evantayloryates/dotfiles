const exact=(x,keys,optional=[])=>x&&typeof x==='object'&&!Array.isArray(x)&&keys.every(k=>Object.hasOwn(x,k))&&Object.keys(x).every(k=>keys.includes(k)||optional.includes(k))
const iso=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(Date.parse(x)).toISOString()===x
const base=['schemaVersion','scope','probeId','brokerSession','targetSession','startedAt','gateQualified','releaseAuthorized','modelCallsRequested']
export function screenNativePeerEvidence({config,ready,intent,report,now=Date.now()}){
 const refused={consistent:false,nativeGateQualified:false,releaseAuthorized:false}
 if(!config||!Number.isFinite(now))return refused
 const bound=x=>x.schemaVersion===1&&x.probeId===config.id&&x.brokerSession===config.brokerSession&&x.gateQualified===false&&x.releaseAuthorized===false&&x.modelCallsRequested===0
 if(!exact(ready,['schemaVersion','scope','probeId','brokerSession','brokerCwd','registeredAt','nativeCallsRequested','modelCallsRequested','gateQualified','releaseAuthorized'])||!bound(ready)||ready.scope!=='owned-native-peer-read-ready'||ready.brokerCwd!==config.brokerCwd||ready.nativeCallsRequested!==0||!iso(ready.registeredAt)||Date.parse(ready.registeredAt)<config.notBefore||Date.parse(ready.registeredAt)>config.deadline||Date.parse(ready.registeredAt)>now)return refused
 if(!exact(intent,[...base,'complete'])||!bound(intent)||intent.scope!=='owned-native-peer-read'||intent.targetSession!==config.targetSession||intent.complete!==false||!iso(intent.startedAt)||Date.parse(intent.startedAt)<Date.parse(ready.registeredAt)||Date.parse(intent.startedAt)>config.deadline||Date.parse(intent.startedAt)>now)return refused
 if(!exact(report,[...base,'complete','nativeCallReturned','resultWasError','failureCategory'],['completedAt'])||!bound(report)||report.scope!==intent.scope||report.targetSession!==config.targetSession||report.startedAt!==intent.startedAt||report.complete!==true||typeof report.nativeCallReturned!=='boolean'||!(report.resultWasError===null||typeof report.resultWasError==='boolean'))return refused
 const failures=['dispatch-window-refused','session-unbound','mcp-api-unavailable','mcp-tool-unavailable','tool-hidden-or-unavailable','tool-pipeline-no-result','broker-dispatch-gate-refusal','tool-permission-refusal','unidentified-exception']
 if(report.nativeCallReturned?report.failureCategory!==null:report.resultWasError!==null||!failures.includes(report.failureCategory))return refused
 if(Object.hasOwn(report,'completedAt')&&(!iso(report.completedAt)||Date.parse(report.completedAt)<Date.parse(report.startedAt)||Date.parse(report.completedAt)>now))return refused
 return {consistent:true,eligibleForIndependentNativeReview:true,nativeCallReturned:report.nativeCallReturned,failureCategory:report.failureCategory,nativeGateQualified:false,releaseAuthorized:false}
}
export function screenNativePeerState({evidence,config,epoch,broker,baseline,currentBaseline,hashes,installedHashes,versions,expectedVersions,stopped,armed,diagnostic}){
 const checks={
  reportConsistent:evidence?.consistent===true,
  sameEpoch:broker?.sessionId===config?.brokerSession&&broker?.live?.pid===epoch?.pid&&broker?.live?.procStart===epoch?.procStart&&broker?.live?.entrypoint==='claude-desktop',
  sealedRuntime:broker?.runtime?.pinned===true&&broker.runtime.integrity===true&&broker.runtime.build===epoch?.build,
  sameVersions:typeof expectedVersions?.app==='string'&&typeof expectedVersions?.cli==='string'&&versions?.app===expectedVersions.app&&versions?.cli===expectedVersions.cli,
  sameBaseline:exact(baseline,['.claude/settings.json','stop-rescue-policy.json'])&&Object.entries(baseline).every(([p,h])=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h)&&currentBaseline?.[p]===h),
  sameCopiedBytes:exact(hashes,['.claude-plugin/plugin.json','hooks/hooks.json','hooks/register.js'])&&Object.entries(hashes).every(([p,h])=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h)&&installedHashes?.[p]===h),
  controlsAbsent:stopped===false&&armed===false&&diagnostic===false
 }
 return {checks,eligibleForIndependentNativeReview:Object.values(checks).every(Boolean),nativeGateQualified:false,releaseAuthorized:false}
}
// Narrow historical admission correlation. Never repairs lifecycle results or
// promotes one read into broad permission, serving or release qualification.
export function screenNativePeerAdmission({config,epoch,pointer,request,entry,admission,control,report}){
 const requestId='rpeer'+config?.id?.replaceAll('-','')
 const start=Date.parse(report?.startedAt),end=Date.parse(report?.completedAt),created=Date.parse(request?.createdAt)
 const checks={
  activePointer:pointer?.build===epoch?.build&&pointer.pid===epoch?.pid&&pointer.procStart===epoch?.procStart&&pointer.sessionId===config?.brokerSession&&pointer.generation===entry?.generation&&pointer.bootstrapHash===entry?.bootstrapHash&&Number.isFinite(Date.parse(pointer.activatedAt))&&Date.parse(pointer.activatedAt)<=start,
  returnedRead:report?.probeId===config?.id&&report.nativeCallReturned===true&&report.resultWasError===false&&report.failureCategory===null&&Number.isFinite(start)&&Number.isFinite(end)&&end>=start,
  exactRequest:request?.id===requestId&&request.protocol===7&&Array.isArray(request.ops)&&request.ops.length===1&&request.ops[0].op==='get_session'&&exact(request.ops[0].args,['session_id'])&&request.ops[0].args.session_id===config?.targetSession&&Number.isFinite(created)&&created<=start&&request.expiresAt===config?.deadline,
  completedHelper:entry?.phase==='completed'&&entry.requestId===requestId&&(entry.index===0||!Object.hasOwn(entry,'index')&&request?.ops?.length===1)&&entry.build===epoch?.build&&entry.nativeBinding?.ancestorVerified===true&&entry.nativeBinding.brokerPid===epoch?.pid&&entry.nativeBinding.brokerProcStart===epoch?.procStart&&entry.nativeBinding.brokerSessionId===config?.brokerSession&&Number.isFinite(entry.at)&&entry.at>=start&&entry.at<=end,
  consumedNativeAdmission:admission?.requestId===requestId&&admission.index===0&&admission.pid===epoch?.pid&&admission.procStart===epoch?.procStart&&admission.build===epoch?.build&&admission.generation===entry?.generation&&typeof admission.toolUseId==='string'&&/^toolu_plugin_[a-f0-9]{30,40}$/.test(admission.toolUseId)&&Number.isFinite(admission.at)&&admission.at>=entry?.at&&admission.at<=end&&admission.at<request?.expiresAt,
  dispatchedSlot:control?.id===requestId&&Array.isArray(control.dispatched)&&control.dispatched.length===1&&control.dispatched[0]===0
 }
 return {checks,singleReadAdmissionObserved:Object.values(checks).every(Boolean),standardLifecycleSettled:false,nativeGateQualified:false,releaseAuthorized:false}
}
