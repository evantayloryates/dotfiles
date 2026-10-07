// Readiness only. Does not prove serving, admission, tool success or quiescence.
export function screenNativeServiceReady({config,ready,now}={}){
 const keys=['schemaVersion','scope','serviceId','brokerSession','brokerCwd','build','registeredAt','deadline','maxRequests','nativeCallsRequested','modelCallsRequested']
 if(!config||!ready||typeof ready!=='object'||Array.isArray(ready)||Object.keys(ready).sort().join(',')!==keys.sort().join(',')||!Number.isSafeInteger(now))return false
 const at=Date.parse(ready.registeredAt)
 return ready.schemaVersion===1&&ready.scope==='owned-native-service-ready'&&ready.serviceId===config.id&&ready.brokerSession===config.brokerSession&&ready.brokerCwd===config.brokerCwd&&ready.build===config.build&&ready.deadline===config.deadline&&ready.maxRequests===config.maxRequests&&ready.nativeCallsRequested===0&&ready.modelCallsRequested===0&&typeof ready.registeredAt==='string'&&Number.isFinite(at)&&new Date(at).toISOString()===ready.registeredAt&&Number.isSafeInteger(config.notBefore)&&Number.isSafeInteger(config.deadline)&&at>=config.notBefore&&at<=now&&now<=config.deadline
}
