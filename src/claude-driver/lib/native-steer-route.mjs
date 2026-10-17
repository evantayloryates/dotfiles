import {maintainNativeController} from './native-controller-maintenance.mjs'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {writeFileSync} from 'node:fs'
import {STATE_DIR,ensureDir,writeJsonAtomic} from './state.mjs'
import {getRecord,openPrs,callerHostSession} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {inspectIndependentService} from './independent-service-result.mjs'
import {metadataTargetRegistered} from './native-metadata-control.mjs'
import {nativeSendArguments,nativeSendTargetMatches} from './native-send-control.mjs'
import {routeNativeStop} from './native-stop-route.mjs'
import {routeNativeSend} from './native-send-route.mjs'
import {DriverError} from './paths.mjs'
const uuid=/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
// These are native request contexts, not separately scheduled driver jobs.
export function steerPhaseIdentity(jobId,phase){
 if(!/^j[a-f0-9]{32}$/.test(jobId||'')||!['stop','send'].includes(phase))throw Error('invalid steer phase identity')
 return 'j'+createHash('sha256').update('native-steer-v1:'+jobId+':'+phase).digest('hex').slice(0,32)
}
export async function runNativeInterrupt(d){
 await d.preflight()
 await d.guard(false);await d.record('before-stop')
 const stopped=await d.stop();await d.record('after-stop',{stopped})
 if(stopped?.verified!==true||stopped.status!=='idle'||!['stopped','already_idle'].includes(stopped.stopReceipt))throw Error('stop has not established idle')
 await d.guard(true);await d.record('before-send',{stopped})
 const sent=await d.send();await d.record('after-send',{stopped,sent})
 if(sent?.nativeAccepted!==true||sent.receiptVerified!==true||sent.applied!==false)throw Error('replacement acceptance unverified')
 return {stopped,sent}
}
export async function routeNativeSteer(target,controller,args,{jobId,signal,progress}={}){
 if(!/^j[a-f0-9]{32}$/.test(jobId||'')||!uuid.test(target||'')||!uuid.test(controller||'')||controller===target||[controller,target].includes(callerHostSession())||args.mode!=='interrupt'||args.via_broker!==undefined)throw new DriverError('native interrupt requires a durable job and exact independent controller',{category:'bad_args',detail:{dispatched:false,retrySafe:true}})
 nativeSendArguments({sessionId:target},args.message)
 const file=join(ensureDir(join(STATE_DIR,'native-steer-routes')),jobId+'.json'),ledger={schemaVersion:1,kind:'native-interrupt-route',jobId,target,controller,phase:'created',phaseContexts:{stop:steerPhaseIdentity(jobId,'stop'),send:steerPhaseIdentity(jobId,'send')},messageSha256:createHash('sha256').update(args.message).digest('hex'),steps:[],at:Date.now(),retrySafe:false}
 try{writeFileSync(file,JSON.stringify(ledger),{flag:'wx',mode:0o600})}catch(error){throw new DriverError('steer route already exists or cannot be durably armed; inspect original parent without replay',{category:'outcome_unknown',detail:{jobId,routeFile:file,retrySafe:false}})}
 const save=()=>{ledger.updatedAt=Date.now();writeJsonAtomic(file,ledger)}
 let selected,targetEpoch
 const guard=async idle=>{
  if(signal?.aborted)throw Error('steer cancelled; inspect recorded effects')
  const current=loadReceiverSelection(getRecord(controller).cwd),t=targetEpoch,r=getRecord(target),peer=peerRecord(target)
  if(current.selector.serviceId!==selected.selector.serviceId||current.selector.pid!==selected.selector.pid||current.selector.procStart!==selected.selector.procStart||current.selector.sessionId!==controller||!nativeSendTargetMatches({target:t,record:r,peer,registered:metadataTargetRegistered(t,{controlStateDir:STATE_DIR}),openPrCount:r?openPrs(r).length:null})||idle&&peer.status!=='idle')throw Error('steer controller/recipient epoch or idle state changed')
 }
 try{
  const result=await runNativeInterrupt({
   preflight:async()=>{const maintained=await maintainNativeController(controller,target,{jobId,signal,count:2,capabilities:['metadataSendControl','metadataStopControl']});selected=maintained.selected;ledger.maintenanceJobId=maintained.maintenanceJobId;ledger.coldRecoveryJobId=maintained.coldRecoveryJobId;const s=maintained.status;targetEpoch=s.metadataTarget;if(!s.verified||!s.readinessObserved||!s.nativePolicyObserved||s.admissionStopped||s.expired||s.unresolvedRequestIds?.length||s.unreservedSlots<2||s.deadline-Date.now()<60000||s.metadataSendControl!==true||s.metadataStopControl!==true||selected.policy.metadataSendControl!==true||selected.policy.metadataStopControl!==true||targetEpoch?.sessionId!==target)throw Error('whole interrupt route is unqualified');ledger.serviceId=selected.selector.serviceId;ledger.targetEpoch=targetEpoch;ledger.controllerEpoch={pid:selected.selector.pid,procStart:selected.selector.procStart};save()},
   guard,record:async(phase,results)=>{ledger.phase=phase;ledger.steps.push({phase,at:Date.now()});if(results)ledger.results=results;save()},
   stop:()=>routeNativeStop(target,controller,{}, {jobId:ledger.phaseContexts.stop,signal,progress}),
   send:()=>routeNativeSend(target,controller,{message:args.message},{jobId:ledger.phaseContexts.send,signal,progress})
  });ledger.phase='completed';save();return {...result.sent,...ledger.maintenanceJobId?{maintenanceJobId:ledger.maintenanceJobId}:{},...ledger.coldRecoveryJobId?{coldRecoveryJobId:ledger.coldRecoveryJobId,standbyRebindRequired:true}:{},route:'independent-native-interrupt',steeringMode:'interrupt',stopped:result.stopped.stopped,stopReceipt:result.stopped.stopReceipt,stopRequestId:result.stopped.requestId,sendRequestId:result.sent.requestId,phaseContexts:ledger.phaseContexts,routeFile:file,applied:false,queueDisposition:'existing queued messages are preserved by native stop',verification:'Stop receipt and exact-epoch idle preceded replacement native acceptance; observe recipient causal reply separately.'}
 }catch(error){ledger.failure={at:Date.now(),category:error.category??'native_steer_unresolved'};save();throw new DriverError('interrupt route stopped; reconcile original parent and phase requests before further effects',{category:'native_steer_unresolved',detail:{jobId,phase:ledger.phase,routeFile:file,phaseContexts:ledger.phaseContexts,stopRequestId:ledger.results?.stopped?.requestId??null,sendRequestId:ledger.results?.sent?.requestId??null,retrySafe:false}})}
}
