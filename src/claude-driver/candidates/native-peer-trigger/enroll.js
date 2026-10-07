import {registerPeerTrigger} from './receive.js'
import {createDurableReadProbe} from './probe.js'
// Staged enrollment factory. Readiness is an observation, never dispatch consent.
export function enrollPeerReadProbe(on,config){
 const {brokerSession,brokerCwd,ready,id,deadline,notBefore}=config
 if(typeof ready!=='string'||!ready.startsWith('/'))throw Error('invalid readiness path')
 const run=createDurableReadProbe(config)
 registerPeerTrigger(on,{...config,run})
 on('session.start',async($,event,next)=>{
  try{
   const session=await $.session.id(),cwd=await $.session.cwd(),now=await $.clock.now()
   if((session===brokerSession||session===brokerSession.slice(6))&&cwd===brokerCwd&&Number.isFinite(now)&&now>=notBefore&&now<=deadline){
    if(!await $.fs.exists(ready))await $.fs.write(ready,JSON.stringify({schemaVersion:1,scope:'owned-native-peer-read-ready',probeId:id,brokerSession,brokerCwd,registeredAt:new Date(now).toISOString(),nativeCallsRequested:0,modelCallsRequested:0,gateQualified:false,releaseAuthorized:false})+'\n')
   }
  }catch{}
  return next(event)
 })
}
