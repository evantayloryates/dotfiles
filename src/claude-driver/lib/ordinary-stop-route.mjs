import {join} from 'node:path'
import {writeFileSync} from 'node:fs'
import {STATE_DIR,ensureDir,writeJsonAtomic} from './state.mjs'
import {getRecord,callerHostSession} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {ordinarySessionBinding} from './ordinary-session-control.mjs'
import {ordinaryStopPeerMatches} from './ordinary-stop-control.mjs'
import {maintainNativeController} from './native-controller-maintenance.mjs'
import {readIndependentService,independentServiceRequestId} from './independent-service-result.mjs'
import {sessionManagementController} from './session-management-controller.mjs'
import {DriverError,sleep} from './paths.mjs'
export async function runOrdinaryStop(d){
 await d.guard();await d.maintain();await d.guard();await d.record('before-native-request')
 const result=await d.stop();await d.record('after-native-request',result)
 if(result?.receiptVerified!==true||result.state!=='completed'||result.nativeAccepted!==true||!['stopped','already_idle'].includes(result.stopState))throw new DriverError('native stop pending or unresolved; do not send replacement',{category:'outcome_unknown'})
 await d.observeIdle();await d.record('idle-verified',result);return result
}
export async function routeOrdinaryStop(target,args,{jobId,signal,progress}={}){
 const controller=sessionManagementController(target)
 if(!controller||!/^j[a-f0-9]{32}$/.test(jobId||'')||[target,controller].includes(callerHostSession())||args.via_broker!==undefined||args.controller_session!==undefined)throw new DriverError('ordinary stop requires durable exact enrolled controller',{category:'bad_args',detail:{dispatched:false,retrySafe:true}})
 const record=getRecord(target),binding=ordinarySessionBinding(record,controller),peer=peerRecord(target),epoch={pid:peer?.pid,procStart:peer?.procStart}
 if(record.isArchived||!ordinaryStopPeerMatches(binding,epoch,peer))throw new DriverError('ordinary stop requires a verified native recipient epoch',{category:'verify_mismatch',detail:{dispatched:false,retrySafe:true}})
 const requestId=independentServiceRequestId(jobId),file=join(ensureDir(join(STATE_DIR,'ordinary-stop-routes')),jobId+'.json'),ledger={schemaVersion:1,jobId,controller,target,binding,epoch,requestId,phase:'prepared',steps:[],at:Date.now(),retrySafe:false}
 writeFileSync(file,JSON.stringify(ledger),{flag:'wx',mode:0o600})
 const save=phase=>{ledger.phase=phase;ledger.steps.push({phase,at:Date.now()});writeJsonAtomic(file,ledger)}
 const guard=async()=>{const r=getRecord(target),p=peerRecord(target);if(signal?.aborted||r.isArchived||JSON.stringify(ordinarySessionBinding(r,controller))!==JSON.stringify(binding)||!ordinaryStopPeerMatches(binding,epoch,p))throw Error('ordinary stop recipient changed or cancelled');return p}
 try{
  const result=await runOrdinaryStop({guard,
   maintain:async()=>{save('before-maintenance');const m=await maintainNativeController(controller,target,{jobId,signal,capabilities:['sessionManagementControl','sessionStopControl'],ordinaryBinding:binding});ledger.serviceId=m.status.serviceId;ledger.maintenanceJobId=m.maintenanceJobId;ledger.coldRecoveryJobId=m.coldRecoveryJobId;save('after-maintenance')},
   record:async(phase,result)=>{if(result)ledger.result=result;save(phase)},
   stop:()=>readIndependentService(controller,ledger.serviceId,target,{jobId,signal,progress,timeoutMs:20000,ordinaryControl:{binding,operation:'stop_session',value:epoch}}),
   observeIdle:async()=>{const end=Date.now()+8000;while(Date.now()<end){const p=await guard();if(p.status==='idle')return;await sleep(100)}throw Error('idle not observed on original recipient epoch')}
  })
  return {sessionId:target,controllerSession:controller,requestId,serviceId:ledger.serviceId,route:'independent-session-stop',routeFile:file,...result,stopped:result.stopState==='stopped',stopReceipt:result.stopState,verified:true,status:'idle',nativeProcess:epoch,applied:false,retrySafe:false,queueDisposition:'existing queued messages are preserved by native stop'}
 }catch(error){ledger.failure={category:error.category??'ordinary_stop_unresolved',at:Date.now()};save('unresolved');throw new DriverError('ordinary stop unresolved; inspect original request before replacement or retry',{category:'outcome_unknown',detail:{requestId,routeFile:file,serviceId:ledger.serviceId??null,retrySafe:false}})}
}
