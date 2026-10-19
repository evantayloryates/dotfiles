import {join} from 'node:path'
import {writeFileSync} from 'node:fs'
import {STATE_DIR,ensureDir,writeJsonAtomic,withLock} from './state.mjs'
import {getRecord} from './sessions.mjs'
import {loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {inspectIndependentServicePlan} from './independent-service-plan.mjs'
import {DriverError} from './paths.mjs'

export async function admitIndependentReadRoute(lock,work){
 let admitted=false
 try{return await lock(async()=>{admitted=true;return work()})}
 catch(error){
  if(!admitted&&['lock_timeout','cancelled'].includes(error.category))throw new DriverError('read route was not admitted; no child operation started',{category:error.category==='cancelled'?'cancelled':'independent_service_route_queue_timeout',detail:{dispatched:false,retrySafe:true,admitted:false}})
  throw error
 }
}

export async function runIndependentReadRoute(d){
 let serviceId=await d.select(),plan=await d.plan(serviceId)
 await d.record('planned',{serviceId,plan})
 if(plan.action==='renew'){
  await d.record('before-renew',{serviceId});const renewed=await d.renew(serviceId)
  await d.record('after-renew',{serviceId,result:renewed})
  serviceId=renewed.serviceId
  if(await d.select()!==serviceId)throw Error('route selection changed after renewal')
  plan=await d.plan(serviceId)
 }
 if(plan.action==='probe'){
  await d.record('before-probe',{serviceId});const result=await d.probe(serviceId)
  await d.record('after-probe',{serviceId,result})
  if(await d.select()!==serviceId)throw Error('route selection changed after probe')
  plan=await d.plan(serviceId)
 }
 if(plan.action!=='read'){const error=Error('route not admitted');error.action=plan.action;error.reason=plan.reason;throw error}
 if(await d.select()!==serviceId)throw Error('route selection changed before read')
 await d.record('before-read',{serviceId});const result=await d.read(serviceId)
 await d.record('after-read',{serviceId,result})
 if(result?.receiptVerified!==true||result.state!=='completed'||result.serviceId!==serviceId)throw Error('route native read not successfully verified')
 return {serviceId,result}
}
export async function routeIndependentRead(session,targetSession,{jobId,timeoutMs=20000,queueTimeoutMs=60000,signal}={}){
 const uuid=/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
 if(!/^j[a-f0-9]{32}$/.test(jobId||'')||!uuid.test(session||'')||!uuid.test(targetSession||'')||session===targetSession||!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000)throw new DriverError('read route requires durable job and distinct bounded target',{category:'bad_args'})
 if(!getRecord(targetSession))throw new DriverError('read route target is unavailable',{category:'bad_args'})
 if(!Number.isInteger(queueTimeoutMs)||queueTimeoutMs<1000||queueTimeoutMs>120000)throw new DriverError('invalid bounded route queue timeout',{category:'bad_args'})
 return admitIndependentReadRoute(work=>withLock('independent-route-'+session,work,{timeoutMs:queueTimeoutMs,signal}),async()=>{
  const record=getRecord(session),file=join(ensureDir(join(STATE_DIR,'independent-service-routes')),jobId+'.json'),ledger={schemaVersion:1,kind:'independent-service-read-route',jobId,sessionId:session,targetSession,phase:'created',at:Date.now(),children:{},steps:[],retrySafe:false}
  writeFileSync(file,JSON.stringify(ledger),{flag:'wx',mode:0o600})
  const save=()=>{ledger.updatedAt=Date.now();writeJsonAtomic(file,ledger)}
  const select=async()=>{if(signal?.aborted)throw Error('route cancelled');if(getRecord(session).cwd!==record.cwd)throw Error('receiver moved');const s=loadReceiverSelection(record.cwd);if(s.selector.sessionId!==session)throw Error('receiver changed');return s.selector.serviceId}
  const child=async(stage,operation,args,timeoutSec)=>{
   if(signal?.aborted)throw Error('route cancelled before child')
   if(ledger.children[stage])throw Error('route child already attempted')
   const submission={operation,arguments:args,idempotency_key:'stable-route:'+jobId+':'+stage,timeout_sec:timeoutSec}
   ledger.children[stage]={submission,state:'before-submit'};save()
   const {runOp}=await import('./driver.mjs'),job=await runOp('driver_submit',submission)
   ledger.children[stage].jobId=job.jobId;ledger.children[stage].state=job.state;save()
   for(;;){
    if(signal?.aborted)throw Error('route cancelled while child may continue')
    const observed=await runOp('driver_wait',{job_id:job.jobId,timeout_sec:10,include_result:true},{signal})
    ledger.children[stage].state=observed.state;ledger.children[stage].observation=observed;save()
    if(observed.state==='completed')return observed.result
    if(!['queued','running'].includes(observed.state))throw Error('route child failed or uncertain')
   }
  }
  try{
   const result=await runIndependentReadRoute({select,plan:id=>inspectIndependentServicePlan(session,id,{signal,readTimeoutMs:timeoutMs}),record:async(phase,data)=>{ledger.phase=phase;ledger.steps.push({phase,...data,at:Date.now()});save()},
    renew:id=>child('renew','broker_service_renew',{session,service_id:id,experimental:true,lifetime_sec:3600,max_requests:32},300),
    probe:id=>child('probe','broker_service_policy_probe',{session,service_id:id,experimental:true,timeout_sec:20},40),
    read:id=>child('read','broker_service_read',{session,service_id:id,session_id:targetSession,experimental:true,timeout_sec:timeoutMs/1000},Math.ceil(timeoutMs/1000)+15)
   })
   ledger.phase='completed';save();return {...result,routeFile:file,childJobs:Object.fromEntries(Object.entries(ledger.children).map(([k,v])=>[k,v.jobId])),retrySafe:false}
  }catch(error){ledger.failure={action:error.action??null,reason:error.reason??'route_step_failed',at:Date.now()};save();throw new DriverError('read route stopped; inspect parent and retained child jobs without replay',{category:'independent_service_route_unresolved',detail:{jobId,phase:ledger.phase,action:error.action??null,reason:error.reason??null,childJobs:Object.fromEntries(Object.entries(ledger.children).map(([k,v])=>[k,v.jobId??null])),retrySafe:false}})}
 })
}
