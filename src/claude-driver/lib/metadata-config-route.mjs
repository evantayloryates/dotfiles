import {join} from 'node:path'
import {writeFileSync} from 'node:fs'
import {STATE_DIR,ensureDir,writeJsonAtomic} from './state.mjs'
import {getRecord,callerHostSession,readPins,openPrs} from './sessions.mjs'
import {loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {inspectIndependentService} from './independent-service-result.mjs'
import {metadataControlArguments,metadataTargetPreflightMatches,metadataTargetRegistered,metadataStateMatches} from './native-metadata-control.mjs'
import {peerRecord} from './peer-direct.mjs'
import {DriverError} from './paths.mjs'
const uuid=/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
export function metadataConfigOperations(target,args){
 if(args.model!==undefined||args.permission_mode!==undefined||args.via_broker!==undefined)throw new DriverError('metadata controller supports only title, pin and effort; no fallback attempted',{category:'bad_args'})
 const ops=[]
 for(const[field,operation]of [['title','set_session_title'],['pinned','set_pinned'],['effort','set_session_effort']])if(args[field]!==undefined){metadataControlArguments({sessionId:target},operation,args[field]);ops.push({field,operation,value:args[field]})}
 if(!ops.length)throw new DriverError('pass title, pinned and/or effort',{category:'bad_args'})
 return ops
}
// A batch is sequential and partially applicable, never a transactional rollback.
// Every child is a durable native request; uncertainty stops later fields.
export async function runMetadataConfigBatch(ops,d){
 await d.preflight(ops.length)
 const results={}
 for(const op of ops){await d.guard();await d.record('before-'+op.field,results);const r=await d.apply(op);results[op.field]=r;await d.record('after-'+op.field,results);if(r?.metadataVerified!==true||r.receiptVerified!==true||r.state!=='completed')throw Error('metadata child unverified')}
 await d.guard();await d.verify(ops);return results
}
export async function routeMetadataConfig(target,args,{jobId,signal,progress}={}){
 const controller=args.metadata_controller,ops=metadataConfigOperations(target,args)
 if(!/^j[a-f0-9]{32}$/.test(jobId||'')||!uuid.test(target||'')||!uuid.test(controller||'')||controller===target||[controller,target].includes(callerHostSession()))throw new DriverError('metadata route requires a durable job, distinct exact controller and target',{category:'bad_args',detail:{dispatched:false,retrySafe:true}})
 const file=join(ensureDir(join(STATE_DIR,'metadata-config-routes')),jobId+'.json'),ledger={schemaVersion:1,kind:'metadata-config-route',jobId,controller,target,fields:ops.map(o=>o.field),phase:'created',children:{},steps:[],at:Date.now(),retrySafe:false};writeFileSync(file,JSON.stringify(ledger),{flag:'wx',mode:0o600});const save=()=>{ledger.updatedAt=Date.now();writeJsonAtomic(file,ledger)}
 let serviceId,epoch
 const guard=async()=>{if(signal?.aborted)throw Error('metadata route cancelled; inspect child');const record=getRecord(controller),selected=loadReceiverSelection(record.cwd);if(selected.selector.sessionId!==controller||selected.selector.serviceId!==serviceId||selected.selector.pid!==epoch.pid||selected.selector.procStart!==epoch.procStart)throw Error('metadata controller selection changed');const t=ledger.targetEpoch;if(t){const r=getRecord(target);if(!metadataTargetPreflightMatches({target:t,record:r,peer:peerRecord(target),registered:metadataTargetRegistered(t,{controlStateDir:STATE_DIR}),openPrCount:r?openPrs(r).length:null}))throw Error('metadata target changed')}}
 try{
  const results=await runMetadataConfigBatch(ops,{
   preflight:async count=>{const r=getRecord(controller),selected=loadReceiverSelection(r.cwd);if(selected.pointer.nativeMetadataTargetVersion!==1||selected.policy.nativeMetadataTargetVersion!==1)throw Error('metadata controller requires native target capability');serviceId=selected.selector.serviceId;epoch={pid:selected.selector.pid,procStart:selected.selector.procStart};ledger.serviceId=serviceId;ledger.controllerEpoch=epoch;save();await guard();const status=await inspectIndependentService(controller,serviceId,{signal}),t=status.metadataTarget,record=getRecord(target);if(!status.verified||!status.readinessObserved||!status.nativePolicyObserved||status.admissionStopped||status.expired||status.unresolvedRequestIds?.length||status.unreservedSlots<count||status.deadline-Date.now()<count*25000||!metadataTargetPreflightMatches({target:t,record,peer:peerRecord(target),registered:t&&metadataTargetRegistered(t,{controlStateDir:STATE_DIR}),openPrCount:record?openPrs(record).length:null})||t.sessionId!==target||!['sessionId','cwd','pid','procStart'].every(k=>selected.policy.metadataTarget?.[k]===t[k]))throw Error('metadata controller not qualified for whole batch');ledger.targetEpoch=t;save()},
   guard,record:async(phase,results)=>{ledger.phase=phase;ledger.steps.push({phase,at:Date.now()});ledger.results=results;save()},
   apply:async op=>{if(ledger.children[op.field])throw Error('metadata child already attempted');const submission={operation:'broker_service_control',arguments:{session:controller,service_id:serviceId,session_id:target,operation:op.operation,value:op.value,experimental:true,timeout_sec:20},idempotency_key:'metadata-config:'+jobId+':'+op.field,timeout_sec:40};ledger.children[op.field]={submission,state:'before-submit'};save();const {runOp}=await import('./driver.mjs'),job=await runOp('driver_submit',submission);ledger.children[op.field].jobId=job.jobId;save();progress?.('Metadata '+op.field+' child '+job.jobId);const end=Date.now()+45000;for(;;){if(signal?.aborted)throw Error('parent cancelled; child may continue');const observed=await runOp('driver_wait',{job_id:job.jobId,timeout_sec:10,include_result:true},{signal});ledger.children[op.field].observation=observed;save();if(observed.state==='completed')return observed.result;if(!['queued','running'].includes(observed.state)||Date.now()>end)throw Error('metadata child failed, unknown or observation deadline')}},
   verify:async expected=>{const record=getRecord(target),pinned=readPins().has(target);for(const op of expected)if(!metadataStateMatches(record,pinned,op.operation,metadataControlArguments({sessionId:target},op.operation,op.value)))throw Error('final metadata batch readback mismatch')}
  });ledger.phase='completed';save();const r=getRecord(target);return {sessionId:target,title:r.title,titleSource:r.titleSource,...args.pinned!==undefined?{pinned:readPins().has(target)}:{},model:r.model,effort:r.effort,permissionMode:r.permissionMode,verified:true,route:'independent-metadata',controllerSession:controller,serviceId,routeFile:file,childJobs:Object.fromEntries(Object.entries(ledger.children).map(([k,v])=>[k,v.jobId])),results,retrySafe:false}
 }catch(error){ledger.failure={at:Date.now(),category:error.category??'metadata_route_failed'};save();throw new DriverError('metadata configuration stopped; inspect retained fields and child jobs before any further change',{category:'metadata_config_unresolved',detail:{jobId,phase:ledger.phase,routeFile:file,childJobs:Object.fromEntries(Object.entries(ledger.children).map(([k,v])=>[k,v.jobId??null])),retrySafe:false}})}
}
