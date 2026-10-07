// Private collection of genuine CLI hook result attachments. These are not
// assistant tool-use receipts. Caller proves settings/witness/native epoch and
// supplies the exact causal chain. Never log stdout automatically.
const allowed=new Set(['ccd_session_mgmt/get_session','ccd_session_mgmt/export_transcript'])
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(x)
export function nativeHookResult(row,{command,event='Stop',cliSessionId,cwd,chain,notBefore,notAfter}){
 const a=row?.attachment,at=Date.parse(row?.timestamp)
 if(!allowed.has(command)||event!=='Stop'||!id(cliSessionId)||!Number.isFinite(notBefore)||!Number.isFinite(notAfter)||notAfter<notBefore||!(chain instanceof Set)||row?.type!=='attachment'||row.isSidechain||!id(row.uuid)||!chain.has(row.parentUuid)||row.sessionId!==cliSessionId||row.cwd!==cwd||row.version!=='2.1.289'||!Number.isFinite(at)||at<notBefore||at>notAfter||a?.command!==command||a.hookEvent!==event||a.hookName!==event||!['hook_success','hook_non_blocking_error'].includes(a.type)||typeof a.stdout!=='string'||Buffer.byteLength(a.stdout)>65536||typeof a.stderr!=='string'||Buffer.byteLength(a.stderr)>65536||!id(a.toolUseID))return null
 // toolUseID belongs to the Stop event and may be shared by several hooks.
 // The attachment UUID identifies this result; do not use eventId as a slot.
 return {source:'native-hook-result',uuid:row.uuid,parentUuid:row.parentUuid,at:row.timestamp,command,event,hookEventId:a.toolUseID,ok:a.type==='hook_success',stdout:a.stdout,stderr:a.stderr}
}
// Native non-blocking errors may omit command entirely. Preserve their real
// event identity without assigning them to a tool, target or operation slot.
export function nativeHookEventError(row,{event='Stop',cliSessionId,cwd,chain,notBefore,notAfter}){
 const a=row?.attachment,at=Date.parse(row?.timestamp)
 if(event!=='Stop'||!id(cliSessionId)||!Number.isFinite(notBefore)||!Number.isFinite(notAfter)||notAfter<notBefore||!(chain instanceof Set)||row?.type!=='attachment'||row.isSidechain||!id(row.uuid)||!id(row.parentUuid)||!chain.has(row.parentUuid)||row.sessionId!==cliSessionId||row.cwd!==cwd||row.version!=='2.1.289'||!Number.isFinite(at)||at<notBefore||at>notAfter||a?.type!=='hook_non_blocking_error'||Object.hasOwn(a,'command')||a.hookEvent!==event||a.hookName!==event||a.stdout!==''||typeof a.stderr!=='string'||!a.stderr||Buffer.byteLength(a.stderr)>65536||!id(a.toolUseID))return null
 return {source:'native-hook-event-error',uuid:row.uuid,parentUuid:row.parentUuid,at:row.timestamp,event,hookEventId:a.toolUseID,commandBound:false,stderr:a.stderr}
}
