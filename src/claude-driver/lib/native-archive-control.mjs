import {dirname,resolve} from 'node:path'
import {createHash} from 'node:crypto'
const sid=x=>typeof x==='string'&&/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x)
export function archiveTargetValid(target,binding){
 return !!(binding&&target&&Object.keys(target).sort().join(',')==='cwd,pid,procStart,sessionId'&&sid(target.sessionId)&&target.sessionId!==binding.sessionId&&typeof target.cwd==='string'&&resolve(target.cwd)===target.cwd&&target.cwd!==binding.receiverCwd&&dirname(target.cwd)===dirname(binding.receiverCwd)&&Number.isSafeInteger(target.pid)&&target.pid>1&&typeof target.procStart==='string'&&target.procStart.trim())
}
export const archiveControlArguments=target=>({session_id:target.sessionId,reason:'claude-driver scoped recovery test'})
function retiredTargetMatches({target:t,record:r,peer:p,history:h,selection:s,targetServiceId,familyRequestId,pinned,openPrCount}={}){
 return !!(t&&r&&h&&s?.selector&&s?.pointer&&t.sessionId===r.sessionId&&r.isArchived===false&&r.permissionMode==='bypassPermissions'&&r.cwd===t.cwd&&!r.worktreePath&&pinned===false&&openPrCount===0&&h.serviceId===targetServiceId&&h.sessionId===t.sessionId&&h.verified===true&&h.verificationMode==='historical-retired'&&h.sourceDisposition==='files-retired'&&h.admissionStopped===true&&h.stopMarkerMatchesGeneration===true&&h.terminalAttemptReviewComplete===true&&Array.isArray(h.unresolvedRequestIds)&&h.unresolvedRequestIds.length===0&&h.nativeEpoch?.pid===t.pid&&h.nativeEpoch.procStart===t.procStart&&Array.isArray(h.settledRequestIds)&&h.settledRequestIds.includes(familyRequestId)&&s.selector.serviceId===targetServiceId&&s.selector.sessionId===t.sessionId&&s.selector.pid===t.pid&&s.selector.procStart===t.procStart&&s.selector.build===h.build&&s.selector.generation===h.generation&&s.pointer.build===h.build&&s.pointer.generation===h.generation)
}
export function archiveObservationMatches(observation,{config,requestId,receipt,now}){
 const t=config.archiveTarget,o=observation,text=Array.isArray(receipt.content)?receipt.content.map(b=>b?.text).join('\n'):null
 return !!(typeof text==='string'&&t&&o&&Object.keys(o).sort().join(',')==='archived,cwd,nativeTextSha256,observedAt,pid,pidAbsent,procStart,requestId,schemaVersion,serviceId,sessionId'&&o.schemaVersion===1&&o.serviceId===config.id&&o.requestId===requestId&&o.sessionId===t.sessionId&&o.cwd===t.cwd&&o.pid===t.pid&&o.procStart===t.procStart&&o.archived===true&&o.pidAbsent===true&&Number.isSafeInteger(o.observedAt)&&o.observedAt>=Date.parse(receipt.receivedAt)&&o.observedAt<=now&&o.nativeTextSha256===createHash('sha256').update(text).digest('hex'))
}

export function archiveTargetPreflightMatches(args={}){
 const {target:t,peer:p}=args
 return !!(retiredTargetMatches(args)&&p&&p.pid===t.pid&&p.procStart===t.procStart&&p.status==='idle'&&p.hostSessionId===t.sessionId&&p.cwd===t.cwd)
}
export const WAKE_TARGET_MESSAGE='Reply exactly COLD_RECEIVER_READY. Do not invoke tools or change files, settings or permissions.'
export const wakeControlArguments=target=>({session_id:target.sessionId,message:WAKE_TARGET_MESSAGE})
export function wakeTargetPreflightMatches(args={}){
 return !!(retiredTargetMatches(args)&&args.oldPidAbsent===true&&args.currentPeerAbsent===true)
}
