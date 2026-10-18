// Health is observational. Process liveness never authorizes a sidecar action.
export function serviceHealth(info,{inference='unknown',now=Date.now()}={}){
 if(!['unknown','quota-exhausted','available'].includes(inference)||!Number.isSafeInteger(now))throw Error('invalid health observation')
 const alive=Number.isInteger(info?.live?.pid)&&info.live.pid>0
 const integrity=info?.runtime?.pinned===true&&info.runtime.integrity===true
 const serving=alive&&integrity&&info?.resident?.resident===true
 return {schemaVersion:1,scope:'claude-driver-service-health',observedAt:new Date(now).toISOString(),configured:info?.configured===true,processAlive:alive,pid:alive?info.live.pid:null,runtimeIntegrity:integrity,runtimeBuild:integrity?info.runtime.build:null,servingChannel:serving?'observed':'unverified',inference,sidecarActionAuthorized:false,releaseAuthorized:false,modelCallsRequested:0}
}

// Exact independent-service snapshots are separate from legacy broker health.
// Admission evidence is observational and never grants an operation authority.
export function independentServiceHealth(info,{session,serviceId,now=Date.now()}={}){
 if(!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(session||'')||!/^[a-f0-9]{32}$/.test(serviceId||'')||!Number.isSafeInteger(now))throw Error('exact independent health identity required')
 const exact=info?.sessionId===session&&info.serviceId===serviceId,live=exact&&info.verified===true&&info.verificationMode==='live-native'&&info.nativeEpochAssessed===true&&Number.isSafeInteger(info.nativeEpoch?.pid)&&info.nativeEpoch.pid>1&&typeof info.nativeEpoch.procStart==='string'&&info.nativeEpoch.procStart.length>0&&info.nativeEpoch.procStart.length<=128&&/^[a-f0-9]{64}$/.test(info.build||''),epoch=info?.nativeEpoch,unknown=exact&&Array.isArray(info.unresolvedRequestIds)?info.unresolvedRequestIds.length:null,budget=exact&&Number.isInteger(info.unreservedSlots)&&info.unreservedSlots>=0?info.unreservedSlots:null,deadline=exact&&Number.isSafeInteger(info.deadline)?info.deadline:null
 const readiness=live&&info.readinessObserved===true,policy=live&&info.nativePolicyObserved===true,admitted=live&&info.sourceDisposition==='installed'&&info.admissionStopped===false&&info.nativeInputRequired===false&&epoch?.status==='idle'&&info.terminalAttemptReviewComplete===true&&unknown===0&&readiness&&policy&&budget>0&&deadline-now>=30000
 return {schemaVersion:1,scope:'claude-driver-independent-service-health',observedAt:new Date(now).toISOString(),sessionId:session,serviceId,nativeEvidenceVerified:live,processAlive:live&&Number.isSafeInteger(epoch?.pid)&&epoch.pid>1,pid:live&&Number.isSafeInteger(epoch?.pid)&&epoch.pid>1?epoch.pid:null,runtimeBuild:exact&&/^[a-f0-9]{64}$/.test(info.build||'')?info.build:null,nativeReadinessObserved:readiness,nativePolicyObserved:policy,nativeReadAdmission:admitted?'observed':'unverified',unresolvedRequests:unknown,unreservedSlots:budget,deadline,expired:deadline===null?null:deadline<=now,admissionStopped:exact&&typeof info.admissionStopped==='boolean'?info.admissionStopped:null,inference:'unknown',sidecarActionAuthorized:false,releaseAuthorized:false,recoveryAttempted:false,nativeEffectsRequested:0,modelCallsRequested:0}
}
