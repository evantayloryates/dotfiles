import {RUNTIME_BUILD} from './build.mjs'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {writeFileSync} from 'node:fs'
import {STATE_DIR,ensureDir,writeJsonAtomic} from './state.mjs'
import {getRecord,callerHostSession} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {ordinarySessionBinding,ordinarySessionArguments} from './ordinary-session-control.mjs'
import {ordinaryStopPeerMatches} from './ordinary-stop-control.mjs'
import {maintainNativeController} from './native-controller-maintenance.mjs'
import {loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {sessionManagementController} from './session-management-controller.mjs'
import {routeOrdinaryStop} from './ordinary-stop-route.mjs'
import {routeOrdinarySend} from './ordinary-send-route.mjs'
import {runNativeInterrupt,steerPhaseIdentity} from './native-steer-route.mjs'
import {DriverError} from './paths.mjs'
export async function routeOrdinarySteer(target,args,{jobId,signal,progress}={}){
 const controller=sessionManagementController(target)
 if(!controller||!/^j[a-f0-9]{32}$/.test(jobId||'')||args.mode!=='interrupt'||args.via_broker!==undefined||args.controller_session!==undefined||[controller,target].includes(callerHostSession()))throw new DriverError('ordinary interrupt needs a durable exact controller and no alternate route',{category:'bad_args'})
 const binding=ordinarySessionBinding(getRecord(target),controller),peer=peerRecord(target),epoch={pid:peer?.pid,procStart:peer?.procStart};ordinarySessionArguments('send_message',binding,args.message)
 if(!ordinaryStopPeerMatches(binding,epoch,peer))throw new DriverError('ordinary interrupt needs verified original recipient epoch',{category:'verify_mismatch',detail:{dispatched:false,retrySafe:true}})
 const file=join(ensureDir(join(STATE_DIR,'ordinary-steer-routes')),jobId+'.json'),ledger={schemaVersion:1,jobId,controller,target,binding,epoch,phaseContexts:{stop:steerPhaseIdentity(jobId,'stop'),send:steerPhaseIdentity(jobId,'send')},messageSha256:createHash('sha256').update(args.message).digest('hex'),phase:'prepared',steps:[],at:Date.now(),retrySafe:false}
 writeFileSync(file,JSON.stringify(ledger),{flag:'wx',mode:0o600})
 const save=phase=>{ledger.phase=phase;ledger.steps.push({phase,at:Date.now()});writeJsonAtomic(file,ledger)}
 const guard=async idle=>{const r=getRecord(target),p=peerRecord(target),s=loadReceiverSelection(getRecord(controller).cwd);if(signal?.aborted||r.isArchived||JSON.stringify(ordinarySessionBinding(r,controller))!==JSON.stringify(binding)||!ordinaryStopPeerMatches(binding,epoch,p)||idle&&p.status!=='idle'||s.selector.serviceId!==ledger.serviceId)throw Error('ordinary interrupt owner, original epoch or idle changed')}
 try{const result=await runNativeInterrupt({
  preflight:async()=>{const m=await maintainNativeController(controller,target,{jobId,signal,count:2,requiredBuild:RUNTIME_BUILD,capabilities:['sessionManagementControl','sessionStopControl','sessionSendControl'],ordinaryBinding:binding});ledger.serviceId=m.status.serviceId;ledger.maintenanceJobId=m.maintenanceJobId;ledger.coldRecoveryJobId=m.coldRecoveryJobId;ledger.pairRecoveryJobId=m.pairRecoveryJobId;ledger.lateReadinessContinuationJobId=m.lateReadinessContinuationJobId;save('admitted')},guard,
  record:async(phase,results)=>{if(results)ledger.results=results;save(phase)},
  stop:()=>routeOrdinaryStop(target,{}, {jobId:ledger.phaseContexts.stop,signal,progress}),
  send:()=>routeOrdinarySend(target,{message:args.message},{jobId:ledger.phaseContexts.send,signal,progress,expectedEpoch:epoch})
 });save('completed');return {...result.sent,route:'independent-session-interrupt',steeringMode:'interrupt',stopped:result.stopped.stopped,stopReceipt:result.stopped.stopReceipt,stopRequestId:result.stopped.requestId,sendRequestId:result.sent.requestId,phaseContexts:ledger.phaseContexts,routeFile:file,...ledger.pairRecoveryJobId?{pairRecoveryJobId:ledger.pairRecoveryJobId,recoveryMode:'both-absent-pair'}:{},...ledger.lateReadinessContinuationJobId?{lateReadinessContinuationJobId:ledger.lateReadinessContinuationJobId}:{},applied:false,queueDisposition:'existing queued messages are preserved by native stop',verification:'Distinct stop and replacement receipts; same recipient epoch idle preceded send. Observe reply separately.'}
 }catch(error){ledger.failure={category:error.category??'ordinary_steer_unresolved',at:Date.now()};save('unresolved');throw new DriverError('ordinary interrupt stopped; inspect original stop/send contexts without replay',{category:'ordinary_steer_unresolved',detail:{jobId,routeFile:file,phaseContexts:ledger.phaseContexts,stopped:ledger.results?.stopped?.stopped??false,replacementAccepted:ledger.results?.sent?.nativeAccepted??false,humanAction:error.detail?.humanAction,retrySafe:false}})}
}
