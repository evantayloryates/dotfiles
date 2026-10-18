import {createHash} from 'node:crypto'
import {dirname,isAbsolute,normalize} from 'node:path'
const sid=/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys
export const ORDINARY_METADATA_OPERATIONS=Object.freeze(['set_session_title','set_session_model','set_session_effort'])
export const ORDINARY_SESSION_OPERATIONS=Object.freeze(['unarchive_session','set_pinned',...ORDINARY_METADATA_OPERATIONS,'send_message'])
export const ordinarySessionField=op=>({set_pinned:'pinned',set_session_title:'title',set_session_model:'model',set_session_effort:'effort',send_message:'message'})[op]
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
 if(operation==='set_session_title'&&typeof value==='string'&&value.trim().length>0&&value.length<=200&&!value.includes('\0'))return {session_id:binding.sessionId,title:value}
 if(operation==='set_session_model'&&typeof value==='string'&&/^claude-(haiku|sonnet|opus)-[a-z0-9][a-z0-9._-]{0,79}$/.test(value))return {session_id:binding.sessionId,model:value}
 if(operation==='set_session_effort'&&['low','medium','high','xhigh','max'].includes(value))return {session_id:binding.sessionId,effort:value}
 if(operation==='send_message'&&typeof value==='string'&&value.length>0&&value.length<=16000&&value===value.trim()&&!value.includes('\0'))return {session_id:binding.sessionId,message:value}
 throw Error('ordinary session operation or arguments unqualified')
}
export function ordinarySessionTargetObservation({request,policy,pointer,record,now=Date.now()}={}){
 try{
  const binding=request?.nativeSessionTargetBinding,operation=request?.ops?.[0]
  if(Object.hasOwn(request??{},'nativeMetadataTargetBinding')||policy?.sessionManagementControl!==true||pointer?.sessionManagementControl!==true||!ordinarySessionBindingValid(binding,pointer.sessionId)||!Number.isSafeInteger(now)||!Number.isSafeInteger(request.expiresAt)||now>=request.expiresAt||!Number.isFinite(Date.parse(request.createdAt))||now<Date.parse(request.createdAt)||request.ops.length!==1||!ORDINARY_SESSION_OPERATIONS.includes(operation?.op)||operation?.op==='send_message'&&(policy.sessionSendControl!==true||pointer.sessionSendControl!==true)||ORDINARY_METADATA_OPERATIONS.includes(operation?.op)&&(policy.sessionMetadataControl!==true||pointer.sessionMetadataControl!==true))return null
  const expected=ordinarySessionArguments(operation.op,binding,operation.args?.[ordinarySessionField(operation.op)]),current=ordinarySessionBinding(record,pointer.sessionId)
  if(JSON.stringify(Object.entries(expected).sort())!==JSON.stringify(Object.entries(operation.args??{}).sort())||!['version','sessionId','cwd','cliSessionId','storeHash'].every(k=>current[k]===binding[k])||typeof record.isArchived!=='boolean'||(operation.op==='unarchive_session'?!record.isArchived:record.isArchived))return null
  return {...binding,observedAt:now}
 }catch{return null}
}
export function ordinarySessionEvidenceMatches(request,admission){
 const b=request?.nativeSessionTargetBinding,o=admission?.sessionTarget
 return !!(b&&exact(o,'cliSessionId,cwd,observedAt,sessionId,storeHash,version')&&['version','sessionId','cwd','cliSessionId','storeHash'].every(k=>o[k]===b[k])&&Number.isSafeInteger(o.observedAt)&&o.observedAt>=Date.parse(request.createdAt)&&o.observedAt<=admission.at&&admission.at<request.expiresAt)
}
export function ordinarySessionPostcondition(operation,args){
 if(operation==='send_message')throw Error('delivery acceptance is not a saved metadata postcondition')
 if(operation==='unarchive_session')return {archived:false}
 const field=ordinarySessionField(operation);if(!field)throw Error('ordinary postcondition operation')
 return {archived:false,[field]:args[field],...field==='title'?{titleSource:'tool'}:{}}
}
export function ordinarySessionStateMatches(binding,record,pinned,operation,args,controller){
 if(operation==='send_message')return false
 try{const current=ordinarySessionBinding(record,controller),expected=ordinarySessionArguments(operation,binding,args?.[ordinarySessionField(operation)]);if(JSON.stringify(Object.entries(expected).sort())!==JSON.stringify(Object.entries(args??{}).sort())||!['version','sessionId','cwd','cliSessionId','storeHash'].every(k=>current[k]===binding[k])||record.isArchived!==false)return false;return operation==='unarchive_session'||operation==='set_pinned'?operation==='unarchive_session'||pinned===args.pinned:record[ordinarySessionField(operation)]===args[ordinarySessionField(operation)]&&(operation!=='set_session_title'||record.titleSource==='tool')}catch{return false}
}
// Retained postcondition is tied to the exact native receipt, not a later read.
export function ordinarySessionObservationMatches(o,{config,request,receipt,now}){
 const b=request?.nativeSessionTargetBinding,op=request?.ops?.[0]
 if(!exact(o,'binding,nativeTextSha256,observedAt,operation,postcondition,requestId,schemaVersion,serviceId')||o.schemaVersion!==1||o.serviceId!==config.id||o.requestId!==request.id||!ordinarySessionBindingValid(b,config.brokerSession)||!exact(o.binding,'cliSessionId,cwd,sessionId,storeHash,version')||!Object.keys(b).every(k=>o.binding[k]===b[k])||o.operation!==op?.op||!Number.isSafeInteger(o.observedAt)||o.observedAt<Date.parse(receipt.receivedAt)||o.observedAt>now||!Array.isArray(receipt.content)||receipt.content.some(x=>x.type!=='text'||typeof x.text!=='string'))return false
 if(o.nativeTextSha256!==createHash('sha256').update(receipt.content.map(x=>x.text).join('\n')).digest('hex'))return false
 try{return JSON.stringify(o.postcondition)===JSON.stringify(ordinarySessionPostcondition(op.op,ordinarySessionArguments(op.op,b,op.args?.[ordinarySessionField(op.op)])))}catch{return false}
}
