// Private native export metadata becomes a bounded queue observation. Never
// return queued messages, task descriptions, UUIDs or unexpected source fields.
// This is a diagnostic candidate, not release admission or historical settlement.
const bools=['isRunning','hasPendingPermission','hasLiveWorkflows','hasBackgroundWork','hasBackgroundActivity','awaitingTurnResult','cliLastTurnMessageWasResult','cliAtTurnBoundaryHint','interruptResultPendingCycleArmed','cliProvablyIdle','inputStreamHasPending','hasPendingCycle','toolMayBeRunning']
const arrays={pendingEchoCount:'pendingEchoUuids',deferredSendCount:'deferredSendUuids',heldSteerCount:'heldSteersUuids'}
const markers={nextCycleUuidPresent:'nextCycleUuid',pendingCycleUserMessageUuidPresent:'pendingCycleUserMessageUuid',interruptResultPending:'interruptResultPendingSince'}
export function summarizeNativeSnapshot(state,{sessionId,cliSessionId,notBefore,notAfter}){
 const at=Date.parse(state?.capturedAt)
 if(typeof sessionId!=='string'||typeof cliSessionId!=='string'||state?.sessionId!==sessionId||state.cliSessionId!==cliSessionId||typeof state.capturedAt!=='string'||state.capturedAt.length>40||!Number.isFinite(at)||!Number.isFinite(notBefore)||!Number.isFinite(notAfter)||at<notBefore||at>notAfter)throw Error('native export snapshot identity or capture interval refused')
 const out={capturedAt:new Date(at).toISOString(),sessionId,cliSessionId}
 for(const key of bools)out[key]=typeof state[key]==='boolean'?state[key]:null
 for(const [key,source] of Object.entries(arrays))out[key]=Array.isArray(state[source])&&state[source].length<=10000?state[source].length:null
 out.activeBackgroundTasks=Number.isSafeInteger(state.activeBackgroundTasks)&&state.activeBackgroundTasks>=0?state.activeBackgroundTasks:null
 for(const [key,source] of Object.entries(markers))out[key]=!Object.hasOwn(state,source)?null:state[source]===null?false:typeof state[source]==='string'&&state[source].length>0&&state[source].length<=200||source==='interruptResultPendingSince'&&Number.isFinite(state[source])?true:null
 const empty=['hasPendingPermission','hasLiveWorkflows','hasBackgroundWork','hasBackgroundActivity','awaitingTurnResult','inputStreamHasPending','hasPendingCycle','toolMayBeRunning','interruptResultPending','interruptResultPendingCycleArmed','nextCycleUuidPresent','pendingCycleUserMessageUuidPresent']
 const counts=['activeBackgroundTasks','pendingEchoCount','deferredSendCount','heldSteerCount']
 out.queueStateComplete=[...empty,'isRunning','cliLastTurnMessageWasResult','cliAtTurnBoundaryHint','cliProvablyIdle',...counts].every(k=>out[k]!==null)
 out.idleCandidate=out.queueStateComplete&&out.isRunning===false&&out.cliProvablyIdle===true&&out.cliLastTurnMessageWasResult===true&&out.cliAtTurnBoundaryHint===true&&empty.every(k=>out[k]===false)&&counts.every(k=>out[k]===0)
 out.releaseAuthorized=false
 return out
}
