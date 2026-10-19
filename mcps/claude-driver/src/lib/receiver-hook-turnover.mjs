import {createHash} from 'node:crypto'
import {loadReceiverSelection,readReceiverFile} from './receiver-runtime-selection.mjs'
import {join} from 'node:path'
import {inspectNativeResourcePid} from './native-resource-process.mjs'
// Historical inspection must independently verify retired source, STOP and all
// terminal attempts. A selector or a ledger alone never grants replacement.
export function qualifyReceiverTurnover({selected,artifact,session,epoch,nextServiceId,history,coldRebind=false,oldPidAbsent=false}){
 const s=selected?.selector,h=history
 const sameEpoch=s?.pid===epoch?.pid&&s?.procStart===epoch?.procStart
 if(typeof coldRebind!=='boolean'||(coldRebind?oldPidAbsent!==true||sameEpoch||!Number.isInteger(epoch?.pid)||epoch.pid<=1||typeof epoch.procStart!=='string'||!epoch.procStart:!sameEpoch))throw Error('receiver predecessor epoch refused')
 if(!s||s.sessionId!==session||s.serviceId===nextServiceId||s.anchorSha256!==artifact?.anchorSha256||s.settingsSha256!==artifact?.settingsSha256||selected.policy?.receiverHook?.anchorSha256!==artifact.anchorSha256||selected.policy.receiverHook.anchorPath!==artifact.anchorPath)throw Error('receiver predecessor identity refused')
 if(h?.serviceId!==s.serviceId||h.sessionId!==session||h.build!==s.build||h.generation!==s.generation||h.nativeEpoch?.pid!==s.pid||h.nativeEpoch.procStart!==s.procStart||h.verified!==true||h.verificationMode!=='historical-retired'||h.sourceDisposition!=='files-retired'||h.admissionStopped!==true||h.stopMarkerMatchesGeneration!==true||h.terminalAttemptReviewComplete!==true||!Array.isArray(h.unresolvedRequestIds)||h.unresolvedRequestIds.length)throw Error('receiver predecessor retirement refused')
 return {serviceId:s.serviceId,stateDir:selected.stateDir,selectorPath:join(s.receiverCwd,'.claude-driver-services','receiver-runtime.json'),retainedSelectorPath:join(selected.stateDir,'retired-receiver-selector.json'),...coldRebind?{coldRebind:true,previousPid:s.pid,previousProcStart:s.procStart,previousPidObservedAbsent:true}:{}}
}
export async function reviewReceiverTurnover({receiverCwd,artifact,session,epoch,nextServiceId,inspect,coldRebind=false,inspectPid=inspectNativeResourcePid}){
 const selected=loadReceiverSelection(receiverCwd),history=await inspect(selected.selector.serviceId)
 const oldPidAbsent=coldRebind?inspectPid(selected.selector.pid)===null:false
 const review=qualifyReceiverTurnover({selected,artifact,session,epoch,nextServiceId,history,coldRebind,oldPidAbsent})
 const bytes=readReceiverFile(review.selectorPath,4096)
 if(JSON.stringify(JSON.parse(bytes))!==JSON.stringify(selected.selector))throw Error('receiver selector changed during review')
 if(coldRebind&&inspectPid(selected.selector.pid)!==null)throw Error('receiver predecessor process reappeared')
 return {...review,selectorSha256:createHash('sha256').update(bytes).digest('hex')}
}
