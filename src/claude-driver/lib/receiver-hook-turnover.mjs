import {createHash} from 'node:crypto'
import {loadReceiverSelection,readReceiverFile} from './receiver-runtime-selection.mjs'
import {join} from 'node:path'
// Historical inspection must independently verify retired source, STOP and all
// terminal attempts. A selector or a ledger alone never grants replacement.
export function qualifyReceiverTurnover({selected,artifact,session,epoch,nextServiceId,history}){
 const s=selected?.selector,h=history
 if(!s||s.sessionId!==session||s.pid!==epoch?.pid||s.procStart!==epoch?.procStart||s.serviceId===nextServiceId||s.anchorSha256!==artifact?.anchorSha256||s.settingsSha256!==artifact?.settingsSha256||selected.policy?.receiverHook?.anchorSha256!==artifact.anchorSha256||selected.policy.receiverHook.anchorPath!==artifact.anchorPath)throw Error('receiver predecessor identity refused')
 if(h?.serviceId!==s.serviceId||h.sessionId!==session||h.build!==s.build||h.generation!==s.generation||h.nativeEpoch?.pid!==s.pid||h.nativeEpoch.procStart!==s.procStart||h.verified!==true||h.verificationMode!=='historical-retired'||h.sourceDisposition!=='files-retired'||h.admissionStopped!==true||h.stopMarkerMatchesGeneration!==true||h.terminalAttemptReviewComplete!==true||!Array.isArray(h.unresolvedRequestIds)||h.unresolvedRequestIds.length)throw Error('receiver predecessor retirement refused')
 return {serviceId:s.serviceId,stateDir:selected.stateDir,selectorPath:join(s.receiverCwd,'.claude-driver-services','receiver-runtime.json'),retainedSelectorPath:join(selected.stateDir,'retired-receiver-selector.json')}
}
export async function reviewReceiverTurnover({receiverCwd,artifact,session,epoch,nextServiceId,inspect}){
 const selected=loadReceiverSelection(receiverCwd),history=await inspect(selected.selector.serviceId)
 const review=qualifyReceiverTurnover({selected,artifact,session,epoch,nextServiceId,history})
 const bytes=readReceiverFile(review.selectorPath,4096)
 if(JSON.stringify(JSON.parse(bytes))!==JSON.stringify(selected.selector))throw Error('receiver selector changed during review')
 return {...review,selectorSha256:createHash('sha256').update(bytes).digest('hex')}
}
