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
