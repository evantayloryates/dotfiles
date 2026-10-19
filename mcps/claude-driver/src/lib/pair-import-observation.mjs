import {pairImportEpochQualified} from './pair-bootstrap-proof.mjs'
// Fixed diagnostics only: no transcript, paths, arbitrary peer strings or
// inferred cause. Presence of a saved chat never proves native startup.
export function pairImportObservation(input) {
 const {old,record,peer,oldPidAbsent,observedAt}=input
 const qualified=pairImportEpochQualified(input)
 return {observedAt,qualified,recordPresent:!!record,
  savedIdentityMatches:!!(record&&record.sessionId===old.sessionId&&record.cwd===old.cwd&&record.cliSessionId===old.sessionId.slice(6)),
  archived:typeof record?.isArchived==='boolean'?record.isArchived:null,
  bypass:record?.permissionMode==='bypassPermissions',oldPidAbsent:oldPidAbsent===true,
  peerPresent:!!peer,peerStatus:['idle','busy','working','running','waiting'].includes(peer?.status)?peer.status:peer?'other':'absent',
  peerEpoch:peer&&Number.isSafeInteger(peer.pid)&&typeof peer.procStart==='string'?{pid:peer.pid,procStart:peer.procStart}:null,
  reason:qualified?'qualified-new-idle-epoch':!peer?'native-peer-unobserved':peer.status==='waiting'?'native-input-required':'native-epoch-unqualified',
  servingQualified:false,importReplayAuthorized:false}
}
export async function waitPairImportEpoch({old,startedAt,signal,timeoutMs=30000},d) {
 const end=d.now()+timeoutMs;let lastKey
 for(;;){
  if(signal?.aborted)throw Error('import observation cancelled')
  const observedAt=d.now(),record=d.record(),peer=d.peer(),observation=pairImportObservation({old,startedAt,observedAt,record,peer,oldPidAbsent:d.oldPidAbsent()})
  const key=JSON.stringify({...observation,observedAt:0})
  if(key!==lastKey||observation.qualified||observedAt>=end){await d.checkpoint(observation);lastKey=key}
  if(observation.qualified)return {epoch:{sessionId:old.sessionId,cwd:old.cwd,pid:peer.pid,procStart:peer.procStart},startedAt,observedAt}
  if(observation.reason==='native-input-required')throw Error('native person input required')
  if(observedAt>=end)throw Error('import completed without qualified native startup')
  await d.wait()
 }
}
