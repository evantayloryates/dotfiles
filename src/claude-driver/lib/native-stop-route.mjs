import {maintainNativeController} from './native-controller-maintenance.mjs'
import {getRecord,openPrs,callerHostSession} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {inspectIndependentService,readIndependentService} from './independent-service-result.mjs'
import {metadataTargetRegistered} from './native-metadata-control.mjs'
import {nativeSendArguments,nativeSendTargetMatches} from './native-send-control.mjs'
import {STATE_DIR} from './state.mjs'
import {DriverError,sleep} from './paths.mjs'
export async function routeNativeStop(target,controller,args,{jobId,signal,progress}={}){
 const refuse=()=>{throw new DriverError('native stop controller is unqualified; no fallback or dispatch',{category:'native_stop_unqualified',detail:{dispatched:false,retrySafe:true}})}
 if(!/^j[a-f0-9]{32}$/.test(jobId||'')||!/^(local_)[a-f0-9-]{36}$/.test(controller||'')||controller===target||[controller,target].includes(callerHostSession())||args.via_broker!==undefined)refuse()
 const {selected,status:s,maintenanceJobId,coldRecoveryJobId,standbyRebindRequired,standbyRebindContextId}=await maintainNativeController(controller,target,{jobId,signal,capabilities:['metadataStopControl']}),serviceId=selected.selector.serviceId,t=s.metadataTarget,recipient=getRecord(target)
 try{
 if(selected.selector.sessionId!==controller||!s.verified||!s.readinessObserved||!s.nativePolicyObserved||s.admissionStopped||s.expired||s.unreservedSlots<1||s.deadline-Date.now()<25000||s.unresolvedRequestIds?.length||s.metadataStopControl!==true||selected.policy.metadataStopControl!==true||t?.sessionId!==target||!nativeSendTargetMatches({target:t,record:recipient,peer:peerRecord(target),registered:t&&metadataTargetRegistered(t,{controlStateDir:STATE_DIR}),openPrCount:recipient?openPrs(recipient).length:null}))refuse()
 const result=await readIndependentService(controller,serviceId,target,{stopControl:true,timeoutMs:20000,jobId,signal,progress})
 if(result.nativeAccepted!==true||!['stopped','already_idle'].includes(result.stopState))throw new DriverError('native stop is pending or unresolved; replacement must not be sent',{category:'outcome_unknown',detail:{requestId:result.requestId,retrySafe:false}})
 const end=Date.now()+8000
 while(Date.now()<end){
  const peer=peerRecord(target),record=getRecord(target)
  if(!nativeSendTargetMatches({target:t,record,peer,registered:metadataTargetRegistered(t,{controlStateDir:STATE_DIR}),openPrCount:record?openPrs(record).length:null}))throw new DriverError('recipient epoch or ownership changed after stop; no replacement',{category:'outcome_unknown',detail:{requestId:result.requestId,retrySafe:false}})
  if(peer.status==='idle')return {sessionId:target,controllerSession:controller,...maintenanceJobId?{maintenanceJobId}:{},...coldRecoveryJobId?{coldRecoveryJobId,standbyRebindRequired,standbyRebindContextId}:{},route:'independent-native-stop',...result,stopped:result.stopState==='stopped',stopReceipt:result.stopState,verified:true,status:'idle',nativeProcess:{pid:peer.pid,procStart:peer.procStart},queueDisposition:'existing queued messages are preserved by native stop',applied:false}
  if(signal?.aborted)throw new DriverError('stop accepted but idle observation cancelled',{category:'outcome_unknown',detail:{requestId:result.requestId,retrySafe:false}})
  await sleep(100)
 }
 throw new DriverError('stop accepted but idle not observed on exact epoch; no replacement',{category:'outcome_unknown',detail:{requestId:result.requestId,retrySafe:false}})
 }catch(error){if(coldRecoveryJobId)throw new DriverError('controller recovered; reconcile original control before retry',{category:'native_controller_recovery_unresolved',detail:{coldRecoveryJobId,standbyRebindRequired,standbyRebindContextId,controlCategory:error.category??'control-unresolved',recoveryMayHaveRun:true,retrySafe:false}});throw error}
}
