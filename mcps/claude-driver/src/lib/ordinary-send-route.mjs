import {RUNTIME_BUILD} from './build.mjs'
import {ordinaryStopPeerMatches} from './ordinary-stop-control.mjs'
import {peerRecord} from './peer-direct.mjs'
import {nativeTrustRecoveryAction} from './native-delivery-failure.mjs'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {writeFileSync} from 'node:fs'
import {STATE_DIR,ensureDir,writeJsonAtomic} from './state.mjs'
import {getRecord,callerHostSession} from './sessions.mjs'
import {loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {ordinarySessionBinding,ordinarySessionArguments} from './ordinary-session-control.mjs'
import {maintainNativeController} from './native-controller-maintenance.mjs'
import {readIndependentService,independentServiceRequestId} from './independent-service-result.mjs'
import {sessionManagementController} from './session-management-controller.mjs'
import {DriverError} from './paths.mjs'
import {assertOrdinaryActionRecipient} from './ordinary-action-intent.mjs'
// Delivery is a native acceptance receipt, never a model turn/reply or action.
// No retry loop: once dispatch begins, every refusal/error returns to the caller
// with the original request identity. Persist intent before calling native code.
export async function runOrdinarySend(d){
 await d.beforeMaintain?.()
 await d.maintain()
 await d.guard()
 await d.record('before-native-request')
 const result=await d.send()
 await d.record('after-native-request',result)
 if(result?.receiptVerified!==true||result.sessionSendReceiptVerified!==true)throw Error('ordinary send receipt unqualified')
 if(result.state!=='completed'||result.nativeAccepted!==true||!['delivered','queued'].includes(result.delivery))throw new DriverError('native send failed; inspect original receipt without replay',{category:result.nativeFailure?.category??'ordinary_native_send_failed',detail:{nativeFailure:result.nativeFailure}})
 await d.record('accepted',result)
 return result
}
export async function routeOrdinarySend(target,args,{jobId,signal,progress,expectedEpoch,ordinaryActionIntent}={}){
 assertOrdinaryActionRecipient(ordinaryActionIntent,{action:'send',message:args.message,target})
 const controller=sessionManagementController(target)
 if(!controller||!/^j[a-f0-9]{32}$/.test(jobId||'')||[target,controller].includes(callerHostSession())||args.via_broker!==undefined||args.controller_session!==undefined)throw new DriverError('ordinary send requires a durable job, exact enrolled controller and no alternate route options',{category:'bad_args',detail:{dispatched:false,retrySafe:true}})
 const record=getRecord(target),binding=ordinarySessionBinding(record,controller);ordinarySessionArguments('send_message',binding,args.message)
 if(expectedEpoch&&!ordinaryStopPeerMatches(binding,expectedEpoch,peerRecord(target)))throw new DriverError('replacement recipient epoch changed before preparation',{category:'outcome_unknown',detail:{dispatched:false,retrySafe:false}})
 if(record.isArchived)throw new DriverError('unarchive ordinary recipient before sending',{category:'session_archived',detail:{dispatched:false,retrySafe:true}})
 const recipient=ordinaryActionIntent?.recipient
 const requestId=independentServiceRequestId(jobId),file=join(ensureDir(join(STATE_DIR,'ordinary-send-routes')),jobId+'.json'),ledger={schemaVersion:1,jobId,controller,target,binding,...expectedEpoch?{expectedEpoch}:{},...recipient?{recipient}:{},requestId,messageSha256:createHash('sha256').update(args.message).digest('hex'),messageChars:args.message.length,phase:'prepared',steps:[],at:Date.now(),retrySafe:false}
 writeFileSync(file,JSON.stringify(ledger),{flag:'wx',mode:0o600});const save=phase=>{ledger.phase=phase;ledger.steps.push({phase,at:Date.now()});writeJsonAtomic(file,ledger)}
 try{
  const result=await runOrdinarySend({
   beforeMaintain:async()=>assertOrdinaryActionRecipient(ordinaryActionIntent,{action:'send',message:args.message,target}),
   maintain:async()=>{save('before-maintenance');const maintained=await maintainNativeController(controller,target,{jobId,signal,count:1,...expectedEpoch?{requiredBuild:RUNTIME_BUILD}:{},capabilities:['sessionManagementControl','sessionSendControl'],ordinaryBinding:binding});ledger.serviceId=maintained.status.serviceId;ledger.maintenanceJobId=maintained.maintenanceJobId;ledger.coldRecoveryJobId=maintained.coldRecoveryJobId;ledger.pairRecoveryJobId=maintained.pairRecoveryJobId;ledger.lateReadinessContinuationJobId=maintained.lateReadinessContinuationJobId;save('after-maintenance')},
   guard:async()=>{assertOrdinaryActionRecipient(ordinaryActionIntent,{action:'send',message:args.message,target});const selected=loadReceiverSelection(getRecord(controller).cwd),r=getRecord(target);if(signal?.aborted||r.isArchived||expectedEpoch&&(!ordinaryStopPeerMatches(binding,expectedEpoch,peerRecord(target))||peerRecord(target)?.status!=='idle')||JSON.stringify(ordinarySessionBinding(r,controller))!==JSON.stringify(binding)||selected.selector.serviceId!==ledger.serviceId||selected.policy.sessionSendControl!==true||selected.pointer.sessionSendControl!==true)throw Error('ordinary send owner or recipient changed')},
   record:async(phase,result)=>{if(result){ledger.result=result;if(result.nativeFailure)ledger.nativeFailure=result.nativeFailure}save(phase)},
   send:()=>readIndependentService(controller,ledger.serviceId,target,{jobId,signal,progress,timeoutMs:20000,ordinaryControl:{binding,operation:'send_message',value:args.message,...expectedEpoch?{expectedEpoch}:recipient?{recipient}:{}}})
  })
  return {sessionId:target,delivery:result.delivery,messageId:result.messageId,nativeAccepted:true,receiptVerified:true,verified:true,applied:false,causalReplyAssessed:false,requestId,serviceId:ledger.serviceId,controllerSession:controller,route:'independent-session-send',routeFile:file,...ledger.maintenanceJobId?{maintenanceJobId:ledger.maintenanceJobId}:{},...ledger.coldRecoveryJobId?{coldRecoveryJobId:ledger.coldRecoveryJobId}:{},...ledger.pairRecoveryJobId?{pairRecoveryJobId:ledger.pairRecoveryJobId,recoveryMode:'both-absent-pair'}:{},...ledger.lateReadinessContinuationJobId?{lateReadinessContinuationJobId:ledger.lateReadinessContinuationJobId}:{},retrySafe:false,verification:'Exact native delivery acceptance only; observe recipient events/reply separately.'}
 }catch(error){const humanAction=nativeTrustRecoveryAction(error.detail?.nativeFailure,record,target);ledger.failure={category:error.category??'ordinary_send_unresolved',at:Date.now(),...humanAction?{humanAction}:{}};save('unresolved');throw new DriverError('ordinary send stopped; inspect its exact request and native receipt before retrying',{category:error.category??'ordinary_send_unresolved',detail:{jobId,requestId,serviceId:ledger.serviceId??null,routeFile:file,nativeFailure:error.detail?.nativeFailure,...humanAction?{humanAction}:{},retrySafe:false}})}
}
