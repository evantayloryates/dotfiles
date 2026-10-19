// Private native export metadata becomes a bounded queue observation. Never
// return queued messages, task descriptions, UUIDs or unexpected source fields.
// This is a diagnostic candidate, not release admission or historical settlement.
import {SNAPSHOT_SOURCE_SHA} from './installed-desktop-source.mjs'
const bools=['isRunning','hasPendingPermission','hasLiveWorkflows','hasBackgroundWork','hasBackgroundActivity','awaitingTurnResult','cliLastTurnMessageWasResult','cliAtTurnBoundaryHint','interruptResultPendingCycleArmed','cliProvablyIdle','inputStreamHasPending','hasPendingCycle','toolMayBeRunning']
const arrays={pendingEchoCount:'pendingEchoUuids',deferredSendCount:'deferredSendUuids',heldSteerCount:'heldSteersUuids'}
const markers={nextCycleUuidPresent:'nextCycleUuid',pendingCycleUserMessageUuidPresent:'pendingCycleUserMessageUuid',interruptResultPending:'interruptResultPendingSince'}
export function summarizeNativeSnapshot(state,{sessionId,cliSessionId,notBefore,notAfter,projectionSourceSha}){
 const at=Date.parse(state?.capturedAt)
 if(typeof sessionId!=='string'||typeof cliSessionId!=='string'||state?.sessionId!==sessionId||state.cliSessionId!==cliSessionId||typeof state.capturedAt!=='string'||state.capturedAt.length>40||!Number.isFinite(at)||!Number.isFinite(notBefore)||!Number.isFinite(notAfter)||at<notBefore||at>notAfter)throw Error('native export snapshot identity or capture interval refused')
 const out={capturedAt:new Date(at).toISOString(),sessionId,cliSessionId}
 if(projectionSourceSha!==undefined&&projectionSourceSha!==SNAPSHOT_SOURCE_SHA)throw Error('native snapshot projection source refused')
 const nativeProjection=projectionSourceSha===SNAPSHOT_SOURCE_SHA
 for(const key of bools)out[key]=typeof state[key]==='boolean'?state[key]:null
 for(const [key,source] of Object.entries(arrays))out[key]=Array.isArray(state[source])&&state[source].length<=10000?state[source].length:null
 const tasks=state.activeBackgroundTasks
 out.activeBackgroundTasks=Number.isSafeInteger(tasks)&&tasks>=0?tasks:tasks&&typeof tasks==='object'&&!Array.isArray(tasks)&&Object.keys(tasks).length<=10000?Object.keys(tasks).length:null
 for(const [key,source] of Object.entries(markers))out[key]=!Object.hasOwn(state,source)?null:state[source]===null?false:typeof state[source]==='string'&&state[source].length>0&&state[source].length<=200||source==='interruptResultPendingSince'&&Number.isFinite(state[source])?true:null
 // The exact reviewed exporter uses null for absent internal queues/maps and
 // false awaitingTurnResult. Missing JSON fields remain unknown. Never apply
 // these semantics to another source build, or infer a missing turn boundary.
 if(nativeProjection){
  out.projectionSourceSha=projectionSourceSha
  if(typeof tasks==='number')out.activeBackgroundTasks=null
  for(const [key,source] of Object.entries(arrays))if(Object.hasOwn(state,source)&&state[source]===null)out[key]=0
  if(Object.hasOwn(state,'activeBackgroundTasks')&&tasks===null)out.activeBackgroundTasks=0
  if(Object.hasOwn(state,'awaitingTurnResult')&&state.awaitingTurnResult===null)out.awaitingTurnResult=false
  if(Object.hasOwn(state,'inputStreamHasPending')&&state.inputStreamHasPending===null)out.inputStreamHasPending=false
  if(Object.hasOwn(state,'interruptResultPendingCycleArmed')&&state.interruptResultPendingCycleArmed===null&&out.interruptResultPending===false)out.interruptResultPendingCycleArmed=false
 }
 const empty=['hasPendingPermission','hasLiveWorkflows','hasBackgroundWork','hasBackgroundActivity','awaitingTurnResult','inputStreamHasPending','hasPendingCycle','toolMayBeRunning','interruptResultPending','interruptResultPendingCycleArmed','nextCycleUuidPresent','pendingCycleUserMessageUuidPresent']
 const counts=['activeBackgroundTasks','pendingEchoCount','deferredSendCount','heldSteerCount']
 out.queueStateComplete=[...empty,'isRunning','cliLastTurnMessageWasResult','cliAtTurnBoundaryHint','cliProvablyIdle',...counts].every(k=>out[k]!==null)
 out.idleCandidate=out.queueStateComplete&&out.isRunning===false&&out.cliProvablyIdle===true&&out.cliLastTurnMessageWasResult===true&&out.cliAtTurnBoundaryHint===true&&empty.every(k=>out[k]===false)&&counts.every(k=>out[k]===0)
 out.releaseAuthorized=false
 return out
}
