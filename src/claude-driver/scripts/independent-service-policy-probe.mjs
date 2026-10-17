#!/usr/bin/env node
import {join} from 'node:path'
import {lstatSync,readdirSync,writeFileSync} from 'node:fs'
import {BROKER_DIR,STATE_DIR,withLock,writeJsonAtomic} from '../lib/state.mjs'
import {loadIndependentServiceContext} from '../lib/independent-service-context.mjs'
import {runNativePolicyProbe} from '../lib/native-service-policy-probe.mjs'
import {reserveNativeServiceBudget} from '../lib/native-service-budget.mjs'
import {summarizeIndependentBudget} from '../lib/independent-service-status.mjs'
import {reviewIndependentAttempts} from '../lib/independent-service-attempts.mjs'
import {screenNativeServiceReady} from '../lib/native-peer-service-evidence.mjs'
import {deliver} from '../lib/peer-direct.mjs'
import {sleep} from '../lib/paths.mjs'
const controller=new AbortController()
process.on('SIGTERM',()=>controller.abort());process.on('SIGINT',()=>controller.abort())
let requestId
try{
 const [session,serviceId,id,timeout]=process.argv.slice(2);requestId=id
 const result=await withLock('broker',async()=>{
  let c
  const file=join(BROKER_DIR,'native-service-probe-'+id+'.json')
  const preflight=async()=>{
   c=await loadIndependentServiceContext(session,serviceId,{requireIdle:true})
   if(!screenNativeServiceReady({config:c.config,ready:c.read('.native-service-'+serviceId+'.ready.json'),now:Date.now()})||c.config.deadline<Date.now()+Number(timeout)+1000)throw Error('readiness')
   for(const n of ['STOP','stop-rescue-arm.json','mechanical-probe.json'])try{lstatSync(join(BROKER_DIR,n));throw Error('control present')}catch(e){if(e.code!=='ENOENT')throw e}
  }
  const review=()=>{
   const slots=Array.from({length:c.config.maxRequests},(_,slot)=>{try{return c.read('../native-service-budget-'+serviceId+'-'+slot+'.json')}catch(e){if(e.code!=='ENOENT')throw e;return null}}),budget=summarizeIndependentBudget(c.config,slots)
   return reviewIndependentAttempts({context:c,reservedRequestIds:budget.reservedRequestIds,names:readdirSync(BROKER_DIR)})
  }
  let created=false
  return runNativePolicyProbe({requestId:id,timeoutMs:Number(timeout),signal:controller.signal},{
   preflight,
   record:async phase=>{const body={schemaVersion:1,scope:'owned-missing-request-policy-probe',serviceId,requestId:id,phase,at:Date.now(),retrySafe:false};if(!created){writeFileSync(file,JSON.stringify(body),{flag:'wx',mode:0o600});created=true}else writeJsonAtomic(file,body)},
   reserve:()=>{if(!review().terminalAttemptReviewComplete)throw Error('unresolved predecessor attempt');reserveNativeServiceBudget(STATE_DIR,serviceId,id,c.config.maxRequests)},
   send:()=>deliver({sessionId:session,permissionMode:'bypassPermissions',live:{pid:c.peer.pid,procStart:c.peer.procStart,status:c.peer.status}},c.config.token+' '+id,{signal:controller.signal,timeoutMs:Math.min(5000,Number(timeout)),onPrepared:meta=>writeFileSync(join(BROKER_DIR,'native-service-send-'+id+'.json'),JSON.stringify({serviceId,requestId:id,...meta,at:Date.now(),retrySafe:false}),{flag:'wx',mode:0o600})}),
   review:()=>{const r=review();return r.terminalRefusalRequestIds.includes(id)&&r.terminalAttemptReviewComplete?{serviceId,requestId:id,terminalRefusalVerified:true,policyInvocationObserved:true,scopedNoNativeMcpQualified:true,servingQualified:false,releaseAuthorized:false}:null},
   now:Date.now,wait:()=>sleep(100)
  })
 },{timeoutMs:5000,signal:controller.signal})
 console.log(JSON.stringify({ok:true,result}))
}catch(error){console.log(JSON.stringify({ok:false,error:{requestId:requestId??null,phase:error.phase??'preflight',retrySafe:false}}))}
