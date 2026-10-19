import {join,resolve,sep} from 'node:path'
import {readReceiverFile} from './receiver-runtime-selection.mjs'
import {createHash} from 'node:crypto'
import {archiveTargetValid} from './native-archive-control.mjs'
export const METADATA_OPERATIONS=Object.freeze(['set_session_title','set_pinned','set_session_effort','set_session_model'])
export const isMetadataOperation=op=>METADATA_OPERATIONS.includes(op)
export const metadataTargetValid=archiveTargetValid
export function metadataControlArguments(target,operation,value){
 if(!target||!isMetadataOperation(operation))throw Error('metadata operation unqualified')
 const field=operation==='set_session_title'?'title':operation==='set_pinned'?'pinned':operation==='set_session_model'?'model':'effort'
 if(operation==='set_session_title'?(typeof value!=='string'||!value.trim()||value.length>200||value.includes('\0')):operation==='set_pinned'?typeof value!=='boolean':operation==='set_session_model'?(typeof value!=='string'||!/^claude-(haiku|sonnet|opus)-[a-z0-9][a-z0-9._-]{0,79}$/.test(value)):!['low','medium','high','xhigh','max'].includes(value))throw Error('metadata value unqualified')
 return {session_id:target.sessionId,[field]:value}
}
export function metadataStateMatches(record,pinned,operation,args){
 return !!(record&&record.sessionId===args?.session_id&&record.isArchived===false&&(operation==='set_session_title'?record.title===args.title&&record.titleSource==='tool':operation==='set_pinned'?typeof pinned==='boolean'&&pinned===args.pinned:operation==='set_session_effort'?record.effort===args.effort:operation==='set_session_model'?record.model===args.model:false))
}
export function metadataTargetRegistered(target,{controlStateDir=process.env.CLAUDE_DRIVER_CONTROL_STATE_DIR,read=readReceiverFile}={}){
 if(!target||typeof controlStateDir!=='string'||controlStateDir!==resolve(controlStateDir)||!target.cwd.startsWith(join(controlStateDir,'probe')+sep))return false
 const row=JSON.parse(read(join(controlStateDir,'registry.json'),1024*1024)).sessions?.[target.sessionId]
 return row?.kind==='create'&&row.cwd===target.cwd
}
export function metadataTargetPreflightMatches({target:t,record:r,peer:p,registered,openPrCount}={}){
 return !!(t&&r&&p&&registered===true&&openPrCount===0&&!r.worktreePath&&r.sessionId===t.sessionId&&r.cwd===t.cwd&&r.isArchived===false&&r.permissionMode==='bypassPermissions'&&p.hostSessionId===t.sessionId&&p.cwd===t.cwd&&p.pid===t.pid&&p.procStart===t.procStart&&p.status==='idle'&&p.entrypoint==='claude-desktop'&&p.version==='2.1.299')
}
export function metadataPriorAttemptsClear(review,currentRequestId){
 return /^rpeer[a-f0-9]{32}$/.test(currentRequestId||'')&&Array.isArray(review?.unresolvedRequestIds)&&review.unresolvedRequestIds.every(id=>id===currentRequestId)
}
export function metadataObservationMatches(o,{config,request,receipt,now}){
 const t=config.metadataTarget,op=request.ops?.[0],text=Array.isArray(receipt.content)?receipt.content.map(b=>b?.text).join('\n'):null
 if(!t||!op||!isMetadataOperation(op.op)||!o||typeof text!=='string'||Object.keys(o).sort().join(',')!=='cwd,nativeTextSha256,observedAt,operation,pid,postcondition,procStart,requestId,schemaVersion,serviceId,sessionId')return false
 let args;try{args=metadataControlArguments(t,op.op,op.args?.[op.op==='set_session_title'?'title':op.op==='set_pinned'?'pinned':op.op==='set_session_model'?'model':'effort'])}catch{return false}
 if(op.op==='set_session_model'&&config.metadataModelControl!==true)return false
 const post=op.op==='set_session_title'?{title:args.title,titleSource:'tool'}:op.op==='set_pinned'?{pinned:args.pinned}:op.op==='set_session_model'?{model:args.model}:{effort:args.effort}
 return o.schemaVersion===1&&o.serviceId===config.id&&o.requestId===request.id&&o.sessionId===t.sessionId&&o.cwd===t.cwd&&o.pid===t.pid&&o.procStart===t.procStart&&o.operation===op.op&&JSON.stringify(o.postcondition)===JSON.stringify(post)&&Number.isSafeInteger(o.observedAt)&&o.observedAt>=Date.parse(receipt.receivedAt)&&o.observedAt<=now&&o.nativeTextSha256===createHash('sha256').update(text).digest('hex')
}
