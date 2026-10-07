// Native command inventory evidence is narrower than hook/environment unload.
export function screenNativeServiceMarker({config,marker,now=Date.now()}={}){
 const keys=['schemaVersion','scope','serviceId','brokerSession','brokerCwd','build','observedAt','ownMarkerPresent','previousServiceId','previousMarkerPresent','modelCallsRequested']
 if(config?.marker!==true||!marker||typeof marker!=='object'||Array.isArray(marker)||Object.keys(marker).sort().join(',')!==keys.sort().join(',')||!Number.isSafeInteger(now))return false
 const at=Date.parse(marker.observedAt)
 return marker.schemaVersion===1&&marker.scope==='owned-native-service-marker'&&marker.serviceId===config.id&&marker.brokerSession===config.brokerSession&&marker.brokerCwd===config.brokerCwd&&marker.build===config.build&&typeof marker.observedAt==='string'&&Number.isFinite(at)&&new Date(at).toISOString()===marker.observedAt&&at>=config.notBefore&&at<=config.deadline&&at<=now&&marker.ownMarkerPresent===true&&marker.previousServiceId===config.observeRetiredServiceId&&(config.observeRetiredServiceId===null?marker.previousMarkerPresent===null:typeof marker.previousMarkerPresent==='boolean')&&marker.modelCallsRequested===0
}
