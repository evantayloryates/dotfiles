import {writeFileSync,linkSync,unlinkSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {readProbeBytes,probePathPresence} from './native-mod-probe-evidence.mjs'
// Host reservation persists across workers and native module reloads. A slot is
// never released after failure: an uncertain delivery must not regain capacity.
export function reserveNativeServiceBudget(dir,serviceId,requestId,maxRequests){
 if(typeof dir!=='string'||!dir.startsWith('/')||! /^[a-f0-9]{32}$/.test(serviceId)||!/^rpeer[a-f0-9]{32}$/.test(requestId)||!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>128)throw Error('invalid service budget identity')
 function validate(file,slot){
  const prior=JSON.parse(readProbeBytes(file,4096).bytes.toString('utf8'))
  if(!prior||Object.keys(prior).sort().join(',')!=='maxRequests,requestId,schemaVersion,serviceId,slot'||prior.schemaVersion!==1||prior.serviceId!==serviceId||prior.slot!==slot||prior.maxRequests!==maxRequests||!/^rpeer[a-f0-9]{32}$/.test(prior.requestId))throw Error('service budget evidence refused')
  if(prior.requestId===requestId)throw Error('service budget request already reserved')
 }
 for(let slot=0;slot<maxRequests;slot++){
  const file=dir+'/native-service-budget-'+serviceId+'-'+slot+'.json',presence=probePathPresence(file)
  if(presence===null)throw Error('service budget unavailable')
  if(presence===true){
   validate(file,slot)
   continue
  }
  const temp=dir+'/.native-service-budget-'+randomUUID()+'.tmp'
  writeFileSync(temp,JSON.stringify({schemaVersion:1,serviceId,requestId,slot,maxRequests})+'\n',{flag:'wx',mode:0o600})
  try{linkSync(temp,file);return {slot,maxRequests}}catch(error){if(error.code!=='EEXIST')throw error;validate(file,slot)}finally{unlinkSync(temp)}
 }
 throw Error('service budget exhausted')
}
