import {getRecord,openPrs,callerHostSession} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {inspectIndependentService,readIndependentService} from './independent-service-result.mjs'
import {metadataTargetRegistered} from './native-metadata-control.mjs'
import {nativeSendArguments,nativeSendTargetMatches} from './native-send-control.mjs'
import {STATE_DIR} from './state.mjs'
import {DriverError} from './paths.mjs'
export async function routeNativeSend(target,controller,args,{jobId,signal,progress}={}){
 const refuse=()=>{throw new DriverError('native send controller is unqualified; no fallback or dispatch',{category:'native_send_unqualified',detail:{dispatched:false,retrySafe:true}})}
 if(!/^j[a-f0-9]{32}$/.test(jobId||'')||!/^(local_)[a-f0-9-]{36}$/.test(controller||'')||controller===target||[controller,target].includes(callerHostSession())||args.via_broker!==undefined)refuse()
 nativeSendArguments({sessionId:target},args.message)
 const r=getRecord(controller),selected=loadReceiverSelection(r.cwd),serviceId=selected.selector.serviceId,s=await inspectIndependentService(controller,serviceId,{signal}),t=s.metadataTarget,recipient=getRecord(target)
 if(selected.selector.sessionId!==controller||!s.verified||!s.readinessObserved||!s.nativePolicyObserved||s.admissionStopped||s.expired||s.unreservedSlots<1||s.deadline-Date.now()<25000||s.unresolvedRequestIds?.length||s.metadataSendControl!==true||selected.policy.metadataSendControl!==true||t?.sessionId!==target||!nativeSendTargetMatches({target:t,record:recipient,peer:peerRecord(target),registered:t&&metadataTargetRegistered(t,{controlStateDir:STATE_DIR}),openPrCount:recipient?openPrs(recipient).length:null}))refuse()
 const result=await readIndependentService(controller,serviceId,target,{sendControl:{message:args.message},timeoutMs:20000,jobId,signal,progress})
 if(result.nativeAccepted!==true||!['delivered','queued'].includes(result.delivery))throw new DriverError('native send acceptance unresolved; inspect original request without replay',{category:'outcome_unknown',detail:{requestId:result.requestId,retrySafe:false}})
 return {sessionId:target,controllerSession:controller,route:'independent-native-send',...result,verified:true,applied:false,verification:'Exact admitted native API acceptance only; observe recipient events separately.'}
}
