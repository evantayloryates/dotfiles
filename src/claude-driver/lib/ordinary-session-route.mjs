import {join} from 'node:path'
import {writeFileSync} from 'node:fs'
import {STATE_DIR,ensureDir,writeJsonAtomic} from './state.mjs'
import {getRecord,callerHostSession,readPins} from './sessions.mjs'
import {ordinarySessionBinding,ordinarySessionArguments,ordinarySessionStateMatches} from './ordinary-session-control.mjs'
import {maintainNativeController} from './native-controller-maintenance.mjs'
import {readIndependentService,independentServiceRequestId} from './independent-service-result.mjs'
import {sessionManagementController} from './session-management-controller.mjs'
import {DriverError} from './paths.mjs'
// One durable public job is one native request. Never submit a replacement on
// uncertainty; reconcile its recorded requestId before another effect.
export async function routeOrdinarySession(target,operation,value,{jobId,signal,progress}={}){
 const controller=sessionManagementController(target)
 if(!controller||!/^j[a-f0-9]{32}$/.test(jobId||'')||[controller,target].includes(callerHostSession()))throw new DriverError('ordinary session route requires a durable driver_submit job and distinct enrolled controller',{category:'bad_args',detail:{dispatched:false,retrySafe:true}})
 const binding=ordinarySessionBinding(getRecord(target),controller),args=ordinarySessionArguments(operation,binding,value),requestId=independentServiceRequestId(jobId),file=join(ensureDir(join(STATE_DIR,'ordinary-session-routes')),jobId+'.json'),ledger={schemaVersion:1,jobId,controller,target,binding,operation,requestId,phase:'prepared',steps:[],at:Date.now(),retrySafe:false}
 writeFileSync(file,JSON.stringify(ledger),{flag:'wx',mode:0o600})
 const record=phase=>{ledger.phase=phase;ledger.steps.push({phase,at:Date.now()});writeJsonAtomic(file,ledger)}
 try{
  record('before-maintenance')
  const maintained=await maintainNativeController(controller,target,{jobId,signal,count:1,capabilities:['sessionManagementControl'],ordinaryBinding:binding})
  ledger.serviceId=maintained.status.serviceId;ledger.maintenanceJobId=maintained.maintenanceJobId;ledger.coldRecoveryJobId=maintained.coldRecoveryJobId;record('after-maintenance')
  if(JSON.stringify(ordinarySessionBinding(getRecord(target),controller))!==JSON.stringify(binding))throw Error('ordinary target identity changed')
  record('before-native-request')
  const result=await readIndependentService(controller,ledger.serviceId,target,{jobId,signal,progress,timeoutMs:20000,ordinaryControl:{binding,operation,value:value??null}})
  ledger.result=result;record('after-native-request')
  if(result.sessionManagementVerified!==true||result.receiptVerified!==true||result.state!=='completed'||!ordinarySessionStateMatches(binding,getRecord(target),readPins().has(target),operation,args,controller))throw Error('ordinary persisted result unverified')
  record('completed')
  return {sessionId:target,verified:true,...operation==='unarchive_session'?{unarchived:true}:{pinned:value},route:'independent-session-management',controllerSession:controller,serviceId:ledger.serviceId,requestId,routeFile:file,...ledger.maintenanceJobId?{maintenanceJobId:ledger.maintenanceJobId}:{},...ledger.coldRecoveryJobId?{coldRecoveryJobId:ledger.coldRecoveryJobId}:{},receiptVerified:true,retrySafe:false}
 }catch(error){ledger.failure={category:error.category??'ordinary_session_route_failed',at:Date.now()};record('unresolved');throw new DriverError('ordinary session operation stopped; inspect original request before retrying',{category:'ordinary_session_route_unresolved',detail:{jobId,requestId,serviceId:ledger.serviceId??null,routeFile:file,retrySafe:false}})}
}
