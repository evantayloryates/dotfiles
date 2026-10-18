import {createHash} from 'node:crypto'
import {dirname,isAbsolute,normalize} from 'node:path'
const sid=/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys
export const ORDINARY_SESSION_OPERATIONS=Object.freeze(['unarchive_session','set_pinned'])
export function ordinarySessionBindingValid(b,controller){
 return !!(exact(b,'cliSessionId,cwd,sessionId,storeHash,version')&&b.version===1&&sid.test(b.sessionId)&&sid.test(controller||'')&&b.sessionId!==controller&&typeof b.cwd==='string'&&b.cwd.length<=4096&&!/[\0\r\n]/.test(b.cwd)&&isAbsolute(b.cwd)&&normalize(b.cwd)===b.cwd&&(b.cliSessionId===null||uuid.test(b.cliSessionId))&&/^[a-f0-9]{64}$/.test(b.storeHash))
}
export function ordinarySessionBinding(record,controller){
 if(!record||typeof record._file!=='string'||!isAbsolute(record._file)||normalize(record._file)!==record._file||!record._file.endsWith('/'+record.sessionId+'.json'))throw Error('ordinary session record identity unavailable')
 const binding={version:1,sessionId:record.sessionId,cwd:record.cwd,cliSessionId:record.cliSessionId??null,storeHash:createHash('sha256').update(dirname(record._file)).digest('hex')}
 if(!ordinarySessionBindingValid(binding,controller))throw Error('ordinary session binding unqualified')
 return binding
}
export function ordinarySessionArguments(operation,binding,value){
 if(!sid.test(binding?.sessionId||''))throw Error('ordinary session target required')
 if(operation==='unarchive_session'&&value===undefined)return {session_id:binding.sessionId}
 if(operation==='set_pinned'&&typeof value==='boolean')return {session_id:binding.sessionId,pinned:value}
 throw Error('ordinary session operation or arguments unqualified')
}
export function ordinarySessionTargetObservation({request,policy,pointer,record,now=Date.now()}={}){
 try{
  const binding=request?.nativeSessionTargetBinding,operation=request?.ops?.[0]
  if(Object.hasOwn(request??{},'nativeMetadataTargetBinding')||policy?.sessionManagementControl!==true||pointer?.sessionManagementControl!==true||!ordinarySessionBindingValid(binding,pointer.sessionId)||!Number.isSafeInteger(now)||!Number.isSafeInteger(request.expiresAt)||now>=request.expiresAt||!Number.isFinite(Date.parse(request.createdAt))||now<Date.parse(request.createdAt)||request.ops.length!==1||!['unarchive_session','set_pinned'].includes(operation?.op))return null
  const expected=ordinarySessionArguments(operation.op,binding,operation.args?.pinned),current=ordinarySessionBinding(record,pointer.sessionId)
  if(JSON.stringify(Object.entries(expected).sort())!==JSON.stringify(Object.entries(operation.args??{}).sort())||!['version','sessionId','cwd','cliSessionId','storeHash'].every(k=>current[k]===binding[k])||typeof record.isArchived!=='boolean'||(operation.op==='set_pinned'?record.isArchived:!record.isArchived))return null
  return {...binding,observedAt:now}
 }catch{return null}
}
export function ordinarySessionEvidenceMatches(request,admission){
 const b=request?.nativeSessionTargetBinding,o=admission?.sessionTarget
 return !!(b&&exact(o,'cliSessionId,cwd,observedAt,sessionId,storeHash,version')&&['version','sessionId','cwd','cliSessionId','storeHash'].every(k=>o[k]===b[k])&&Number.isSafeInteger(o.observedAt)&&o.observedAt>=Date.parse(request.createdAt)&&o.observedAt<=admission.at&&admission.at<request.expiresAt)
}
export function ordinarySessionStateMatches(binding,record,pinned,operation,args,controller){
 try{const current=ordinarySessionBinding(record,controller);return ['version','sessionId','cwd','cliSessionId','storeHash'].every(k=>current[k]===binding[k])&&record.isArchived===false&&(operation==='unarchive_session'?Object.keys(args).join(',')==='session_id'&&args.session_id===binding.sessionId:operation==='set_pinned'&&args.session_id===binding.sessionId&&typeof args.pinned==='boolean'&&pinned===args.pinned)}catch{return false}
}
// Retained postcondition is tied to the exact native receipt, not a later read.
export function ordinarySessionObservationMatches(o,{config,request,receipt,now}){
 const b=request?.nativeSessionTargetBinding,op=request?.ops?.[0]
 if(!exact(o,'binding,nativeTextSha256,observedAt,operation,postcondition,requestId,schemaVersion,serviceId')||o.schemaVersion!==1||o.serviceId!==config.id||o.requestId!==request.id||!ordinarySessionBindingValid(b,config.brokerSession)||!exact(o.binding,'cliSessionId,cwd,sessionId,storeHash,version')||!Object.keys(b).every(k=>o.binding[k]===b[k])||o.operation!==op?.op||!Number.isSafeInteger(o.observedAt)||o.observedAt<Date.parse(receipt.receivedAt)||o.observedAt>now||!Array.isArray(receipt.content)||receipt.content.some(x=>x.type!=='text'||typeof x.text!=='string'))return false
 if(o.nativeTextSha256!==createHash('sha256').update(receipt.content.map(x=>x.text).join('\n')).digest('hex'))return false
 return op.op==='unarchive_session'?exact(o.postcondition,'archived')&&o.postcondition.archived===false:op.op==='set_pinned'&&exact(o.postcondition,'archived,pinned')&&o.postcondition.archived===false&&typeof op.args?.pinned==='boolean'&&o.postcondition.pinned===op.args.pinned
}
