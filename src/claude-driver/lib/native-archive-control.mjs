import {dirname,resolve} from 'node:path'
import {createHash} from 'node:crypto'
const sid=x=>typeof x==='string'&&/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x)
export function archiveTargetValid(target,binding){
 return !!(binding&&target&&Object.keys(target).sort().join(',')==='cwd,pid,procStart,sessionId'&&sid(target.sessionId)&&target.sessionId!==binding.sessionId&&typeof target.cwd==='string'&&resolve(target.cwd)===target.cwd&&target.cwd!==binding.receiverCwd&&dirname(target.cwd)===dirname(binding.receiverCwd)&&Number.isSafeInteger(target.pid)&&target.pid>1&&typeof target.procStart==='string'&&target.procStart.trim())
}
export const archiveControlArguments=target=>({session_id:target.sessionId,reason:'claude-driver scoped recovery test'})
export function archiveObservationMatches(observation,{config,requestId,receipt,now}){
 const t=config.archiveTarget,o=observation,text=Array.isArray(receipt.content)?receipt.content.map(b=>b?.text).join('\n'):null
 return !!(typeof text==='string'&&t&&o&&Object.keys(o).sort().join(',')==='archived,cwd,nativeTextSha256,observedAt,pid,pidAbsent,procStart,requestId,schemaVersion,serviceId,sessionId'&&o.schemaVersion===1&&o.serviceId===config.id&&o.requestId===requestId&&o.sessionId===t.sessionId&&o.cwd===t.cwd&&o.pid===t.pid&&o.procStart===t.procStart&&o.archived===true&&o.pidAbsent===true&&Number.isSafeInteger(o.observedAt)&&o.observedAt>=Date.parse(receipt.receivedAt)&&o.observedAt<=now&&o.nativeTextSha256===createHash('sha256').update(text).digest('hex'))
}
