import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {writeFileSync} from 'node:fs'
import {STATE_DIR,ensureDir,writeJsonAtomic} from './state.mjs'
import {getRecord,callerHostSession,readPins} from './sessions.mjs'
import {ordinarySessionBinding,ordinarySessionArguments,ordinarySessionStateMatches,ordinarySessionField,ORDINARY_METADATA_OPERATIONS} from './ordinary-session-control.mjs'
import {maintainNativeController} from './native-controller-maintenance.mjs'
import {readIndependentService,independentServiceRequestId} from './independent-service-result.mjs'
import {sessionManagementController} from './session-management-controller.mjs'
import {DriverError} from './paths.mjs'
export function ordinaryConfigOperations(target,args){
 if(args.permission_mode!==undefined||args.via_broker!==undefined)throw new DriverError('ordinary metadata supports title, pin, model and effort only; no permission change or fallback attempted',{category:'bad_args',detail:{dispatched:false,retrySafe:true}})
 const ops=[];for(const [field,operation]of [['title','set_session_title'],['pinned','set_pinned'],['model','set_session_model'],['effort','set_session_effort']])if(args[field]!==undefined){ordinarySessionArguments(operation,{sessionId:target},args[field]);ops.push({operation,value:args[field]})}
 if(!ops.length)throw new DriverError('pass title, pinned, model and/or effort',{category:'bad_args'})
 return ops
}
// A configuration batch is sequential, not rollback-atomic. Every field has an
// immutable native request identity; uncertainty prevents the remaining fields.
export async function runOrdinaryOperations(ops,d){
 await d.preflight(ops.length);const results={}
 for(const op of ops){await d.guard();await d.record('before-'+op.operation,results);const result=await d.apply(op);results[op.operation]=result;await d.record('after-'+op.operation,results);if(result?.sessionManagementVerified!==true||result.receiptVerified!==true||result.state!=='completed')throw Error('ordinary child unverified')}
 await d.guard();await d.verify(ops);return results
}
export async function routeOrdinaryOperations(target,ops,{jobId,signal,progress}={}){
 const controller=sessionManagementController(target)
 if(!controller||!/^j[a-f0-9]{32}$/.test(jobId||'')||[controller,target].includes(callerHostSession())||!Array.isArray(ops)||!ops.length||ops.length>4||ops.some(o=>o.operation==='send_message')||new Set(ops.map(o=>o.operation)).size!==ops.length)throw new DriverError('ordinary route requires a durable job, distinct enrolled controller and bounded unique operations',{category:'bad_args',detail:{dispatched:false,retrySafe:true}})
 const binding=ordinarySessionBinding(getRecord(target),controller);for(const op of ops)ordinarySessionArguments(op.operation,binding,op.value)
 const contexts=Object.fromEntries(ops.map(op=>[op.operation,ops.length===1?jobId:'j'+createHash('sha256').update('ordinary-field:'+jobId+':'+op.operation).digest('hex').slice(0,32)])),requestIds=Object.fromEntries(Object.entries(contexts).map(([op,id])=>[op,independentServiceRequestId(id)])),file=join(ensureDir(join(STATE_DIR,'ordinary-session-routes')),jobId+'.json'),ledger={schemaVersion:1,jobId,controller,target,binding,operations:ops.map(o=>o.operation),requestIds,phase:'prepared',steps:[],at:Date.now(),retrySafe:false}
 writeFileSync(file,JSON.stringify(ledger),{flag:'wx',mode:0o600});const record=phase=>{ledger.phase=phase;ledger.steps.push({phase,at:Date.now()});writeJsonAtomic(file,ledger)}
 const guard=async()=>{if(signal?.aborted||JSON.stringify(ordinarySessionBinding(getRecord(target),controller))!==JSON.stringify(binding))throw Error('ordinary target identity changed or cancelled')}
 try{
  const results=await runOrdinaryOperations(ops,{
   preflight:async count=>{record('before-maintenance');const maintained=await maintainNativeController(controller,target,{jobId,signal,count,capabilities:['sessionManagementControl',...ops.some(o=>o.operation==='archive_session')?['sessionArchiveControl']:[],...ops.some(o=>ORDINARY_METADATA_OPERATIONS.includes(o.operation))?['sessionMetadataControl']:[]],ordinaryBinding:binding});ledger.serviceId=maintained.status.serviceId;ledger.maintenanceJobId=maintained.maintenanceJobId;ledger.coldRecoveryJobId=maintained.coldRecoveryJobId;record('after-maintenance');await guard();if(getRecord(target).isArchived&&ops.some(o=>o.operation!=='unarchive_session'))throw Error('unarchive ordinary target before configuration')},
   guard,record:async(phase,results)=>{ledger.results=results;record(phase)},
   apply:op=>readIndependentService(controller,ledger.serviceId,target,{jobId:contexts[op.operation],signal,progress,timeoutMs:20000,ordinaryControl:{binding,operation:op.operation,value:op.value??null}}),
   verify:async expected=>{const r=getRecord(target),pinned=readPins().has(target);for(const op of expected)if(!ordinarySessionStateMatches(binding,r,pinned,op.operation,ordinarySessionArguments(op.operation,binding,op.value),controller))throw Error('final ordinary persisted state mismatch')}
  });ledger.results=results;record('completed');const r=getRecord(target),fields={};for(const op of ops){const field=ordinarySessionField(op.operation);if(field)fields[field]=field==='pinned'?readPins().has(target):r[field];if(field==='title')fields.titleSource=r.titleSource;if(op.operation==='unarchive_session')fields.unarchived=true;if(op.operation==='archive_session')fields.archived=true}
  return {sessionId:target,verified:true,...fields,route:'independent-session-management',controllerSession:controller,serviceId:ledger.serviceId,...ops.length===1?{requestId:requestIds[ops[0].operation]}:{requestIds},routeFile:file,...ledger.maintenanceJobId?{maintenanceJobId:ledger.maintenanceJobId}:{},...ledger.coldRecoveryJobId?{coldRecoveryJobId:ledger.coldRecoveryJobId}:{},receiptVerified:true,retrySafe:false}
 }catch(error){ledger.failure={category:error.category??'ordinary_session_route_failed',at:Date.now()};record('unresolved');throw new DriverError('ordinary session operation stopped; inspect original field requests before retrying',{category:'ordinary_session_route_unresolved',detail:{jobId,requestIds,serviceId:ledger.serviceId??null,routeFile:file,retrySafe:false}})}
}
export const routeOrdinarySession=(target,operation,value,ctx)=>routeOrdinaryOperations(target,[{operation,value}],ctx)
export const routeOrdinaryConfig=(target,args,ctx)=>routeOrdinaryOperations(target,ordinaryConfigOperations(target,args),ctx)
