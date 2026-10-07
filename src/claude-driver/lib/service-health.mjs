// Health is observational. Process liveness never authorizes a sidecar action.
export function serviceHealth(info,{inference='unknown',now=Date.now()}={}){
 if(!['unknown','quota-exhausted','available'].includes(inference)||!Number.isSafeInteger(now))throw Error('invalid health observation')
 const alive=Number.isInteger(info?.live?.pid)&&info.live.pid>0
 const integrity=info?.runtime?.pinned===true&&info.runtime.integrity===true
 const serving=alive&&integrity&&info?.resident?.resident===true
 return {schemaVersion:1,scope:'claude-driver-service-health',observedAt:new Date(now).toISOString(),configured:info?.configured===true,processAlive:alive,pid:alive?info.live.pid:null,runtimeIntegrity:integrity,runtimeBuild:integrity?info.runtime.build:null,servingChannel:serving?'observed':'unverified',inference,sidecarActionAuthorized:false,releaseAuthorized:false,modelCallsRequested:0}
}
