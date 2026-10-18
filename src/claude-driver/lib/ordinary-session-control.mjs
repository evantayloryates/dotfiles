import {ordinaryStopEpochValid,ordinaryStopPeerMatches} from './ordinary-stop-control.mjs'
import {ordinaryRecipientValid,ordinaryRecipientMatches} from './ordinary-recipient-binding.mjs'
import {createHash} from 'node:crypto'
import {dirname,isAbsolute,normalize} from 'node:path'
const sid=/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys
export const ORDINARY_METADATA_OPERATIONS=Object.freeze(['set_session_title','set_session_model','set_session_effort'])
export const ORDINARY_SESSION_OPERATIONS=Object.freeze(['unarchive_session','set_pinned',...ORDINARY_METADATA_OPERATIONS,'send_message','archive_session','stop_session'])
export const ordinarySessionField=op=>({set_pinned:'pinned',set_session_title:'title',set_session_model:'model',set_session_effort:'effort',send_message:'message',archive_session:'reason'})[op]
// Ordinary effects must not fall through into the fixed recovery-role admission.
export function ordinarySessionBindingRequired(request,pointer,index=0){
 return Object.hasOwn(request,'nativeSessionTargetBinding')||Object.hasOwn(request,'nativeSessionSendRecipient')||pointer?.sessionStopControl===true&&request.ops?.[index]?.op==='stop_session'||pointer?.sessionArchiveControl===true&&request.ops?.[index]?.op==='archive_session'||pointer?.sessionManagementControl===true&&['unarchive_session','set_session_title','set_session_model','set_session_effort','send_message'].includes(request.ops?.[index]?.op)&&!Object.hasOwn(request,'nativeMetadataTargetBinding')
}
// New general sends bind an observed recipient; interrupt replacement sends
// keep the older, stricter idle-epoch contract. Never combine the two forms.
export function ordinaryControlShapeValid(c){
 if(!c||!exact(c,Object.hasOwn(c,'expectedEpoch')?'binding,expectedEpoch,operation,value':Object.hasOwn(c,'recipient')?'binding,operation,recipient,value':'binding,operation,value'))return false
 return (!Object.hasOwn(c,'expectedEpoch')||c.operation==='send_message'&&ordinaryStopEpochValid(c.expectedEpoch))&&(!Object.hasOwn(c,'recipient')||c.operation==='send_message'&&ordinaryRecipientValid(c.recipient))&&(c.operation!=='stop_session'||ordinaryStopEpochValid(c.value))
}
export function ordinarySessionBindingValid(b,controller){
 return !!(exact(b,'cliSessionId,cwd,sessionId,storeHash,version')&&b.version===1&&sid.test(b.sessionId)&&sid.test(controller||'')&&b.sessionId!==controller&&typeof b.cwd==='string'&&b.cwd.length<=4096&&!/[\0\r\n]/.test(b.cwd)&&isAbsolute(b.cwd)&&normalize(b.cwd)===b.cwd&&(b.cliSessionId===null||uuid.test(b.cliSessionId))&&/^[a-f0-9]{64}$/.test(b.storeHash))
}
export function ordinarySessionBinding(record,controller){
 if(!record||typeof record._file!=='string'||!isAbsolute(record._file)||normalize(record._file)!==record._file||!record._file.endsWith('/'+record.sessionId+'.json'))throw Error('ordinary session record identity unavailable')
 const binding={version:1,sessionId:record.sessionId,cwd:record.cwd,cliSessionId:record.cliSessionId??null,storeHash:createHash('sha256').update(dirname(record._file)).digest('hex')}
 if(!ordinarySessionBindingValid(binding,controller))throw Error('ordinary session binding unqualified')
 return binding
}
export function ordinarySessionsSameStore(record,controllerRecord,controller){
 try{return controllerRecord?.sessionId===controller&&ordinarySessionBinding(record,controller).storeHash===ordinarySessionBinding(controllerRecord,record.sessionId).storeHash}catch{return false}
}
export function ordinarySessionArguments(operation,binding,value){
 if(!sid.test(binding?.sessionId||''))throw Error('ordinary session target required')
 if(operation==='stop_session'&&value===undefined)return {session_id:binding.sessionId}
 if(operation==='archive_session'&&(value===undefined||typeof value==='string'&&value.trim().length>0&&value.length<=500&&!value.includes('\0')))return {session_id:binding.sessionId,reason:value??'claude-driver ordinary archive_session'}
 if(operation==='unarchive_session'&&value===undefined)return {session_id:binding.sessionId}
 if(operation==='set_pinned'&&typeof value==='boolean')return {session_id:binding.sessionId,pinned:value}
 if(operation==='set_session_title'&&typeof value==='string'&&value.trim().length>0&&value.length<=200&&!value.includes('\0'))return {session_id:binding.sessionId,title:value}
 if(operation==='set_session_model'&&typeof value==='string'&&/^claude-(haiku|sonnet|opus)-[a-z0-9][a-z0-9._-]{0,79}$/.test(value))return {session_id:binding.sessionId,model:value}
 if(operation==='set_session_effort'&&['low','medium','high','xhigh','max'].includes(value))return {session_id:binding.sessionId,effort:value}
 if(operation==='send_message'&&typeof value==='string'&&value.length>0&&value.length<=16000&&value===value.trim()&&!value.includes('\0'))return {session_id:binding.sessionId,message:value}
 throw Error('ordinary session operation or arguments unqualified')
}
export function ordinarySessionTargetObservation({request,policy,pointer,record,controllerRecord,peer,processes,now=Date.now()}={}){
 try{
  const binding=request?.nativeSessionTargetBinding,operation=request?.ops?.[0]
  if(Object.hasOwn(request??{},'nativeSessionSendRecipient')&&(operation?.op!=='send_message'||Object.hasOwn(request,'nativeSessionSendEpoch')||!ordinaryRecipientMatches(binding,request.nativeSessionSendRecipient,peer,processes)))return null
  if(Object.hasOwn(request??{},'nativeMetadataTargetBinding')||Object.hasOwn(request??{},'nativeSessionSendEpoch')&&operation?.op!=='send_message'||policy?.sessionManagementControl!==true||pointer?.sessionManagementControl!==true||!ordinarySessionBindingValid(binding,pointer.sessionId)||!ordinarySessionsSameStore(record,controllerRecord,pointer.sessionId)||Object.hasOwn(request,'nativeSessionControllerStoreHash')&&request.nativeSessionControllerStoreHash!==binding.storeHash||!Number.isSafeInteger(now)||!Number.isSafeInteger(request.expiresAt)||now>=request.expiresAt||!Number.isFinite(Date.parse(request.createdAt))||now<Date.parse(request.createdAt)||request.ops.length!==1||!ORDINARY_SESSION_OPERATIONS.includes(operation?.op)||operation?.op==='stop_session'&&(policy.sessionStopControl!==true||pointer.sessionStopControl!==true||!ordinaryStopPeerMatches(binding,request.nativeSessionStopEpoch,peer))||operation?.op==='archive_session'&&(policy.sessionArchiveControl!==true||pointer.sessionArchiveControl!==true)||operation?.op==='send_message'&&(policy.sessionSendControl!==true||pointer.sessionSendControl!==true||Object.hasOwn(request,'nativeSessionSendEpoch')&&(!ordinaryStopPeerMatches(binding,request.nativeSessionSendEpoch,peer)||peer.status!=='idle'))||ORDINARY_METADATA_OPERATIONS.includes(operation?.op)&&(policy.sessionMetadataControl!==true||pointer.sessionMetadataControl!==true))return null
  const expected=ordinarySessionArguments(operation.op,binding,operation.args?.[ordinarySessionField(operation.op)]),current=ordinarySessionBinding(record,pointer.sessionId)
  if(JSON.stringify(Object.entries(expected).sort())!==JSON.stringify(Object.entries(operation.args??{}).sort())||!['version','sessionId','cwd','cliSessionId','storeHash'].every(k=>current[k]===binding[k])||typeof record.isArchived!=='boolean'||(operation.op==='unarchive_session'?!record.isArchived:record.isArchived))return null
  return {...binding,observedAt:now,...Object.hasOwn(request,'nativeSessionControllerStoreHash')?{controllerStoreHash:binding.storeHash}:{},...operation.op==='stop_session'?{stopEpoch:request.nativeSessionStopEpoch}:{},...operation.op==='send_message'&&Object.hasOwn(request,'nativeSessionSendEpoch')?{sendEpoch:request.nativeSessionSendEpoch}:{},...Object.hasOwn(request,'nativeSessionSendRecipient')?{sendRecipient:request.nativeSessionSendRecipient}:{}}
 }catch{return null}
}
export function ordinarySessionEvidenceMatches(request,admission){
 const b=request?.nativeSessionTargetBinding,o=admission?.sessionTarget,op=request?.ops?.[0]?.op
 if(!b||!o)return false
 const account=Object.hasOwn(request,'nativeSessionControllerStoreHash'),send=op==='send_message'&&Object.hasOwn(request,'nativeSessionSendEpoch'),stop=op==='stop_session'
 const recipient=Object.hasOwn(request,'nativeSessionSendRecipient')
 if(recipient&&(op!=='send_message'||send||!ordinaryRecipientValid(request.nativeSessionSendRecipient)||!ordinaryRecipientValid(o.sendRecipient)||JSON.stringify(request.nativeSessionSendRecipient)!==JSON.stringify(o.sendRecipient)))return false
 const keys=['cliSessionId','cwd','observedAt','sessionId','storeHash','version',...account?['controllerStoreHash']:[],...send?['sendEpoch']:[],...stop?['stopEpoch']:[],...recipient?['sendRecipient']:[]].sort().join(',')
 const epochMatches=(a,c)=>ordinaryStopEpochValid(a)&&ordinaryStopEpochValid(c)&&a.pid===c.pid&&a.procStart===c.procStart
 return exact(o,keys)&&(!account||request.nativeSessionControllerStoreHash===b.storeHash&&o.controllerStoreHash===b.storeHash)&&(!stop||epochMatches(request.nativeSessionStopEpoch,o.stopEpoch))&&(!send||epochMatches(request.nativeSessionSendEpoch,o.sendEpoch))&&(!Object.hasOwn(request,'nativeSessionSendEpoch')||send)&&['version','sessionId','cwd','cliSessionId','storeHash'].every(k=>o[k]===b[k])&&Number.isSafeInteger(o.observedAt)&&o.observedAt>=Date.parse(request.createdAt)&&o.observedAt<=admission.at&&admission.at<request.expiresAt
}
export function ordinarySessionPostcondition(operation,args){
 if(['send_message','stop_session'].includes(operation))throw Error('delivery acceptance is not a saved metadata postcondition')
 if(operation==='archive_session')return {archived:true}
 if(operation==='unarchive_session')return {archived:false}
 const field=ordinarySessionField(operation);if(!field)throw Error('ordinary postcondition operation')
 return {archived:false,[field]:args[field],...field==='title'?{titleSource:'tool'}:{}}
}
export function ordinarySessionStateMatches(binding,record,pinned,operation,args,controller){
 if(['send_message','stop_session'].includes(operation))return false
 try{const current=ordinarySessionBinding(record,controller),expected=ordinarySessionArguments(operation,binding,args?.[ordinarySessionField(operation)]);if(JSON.stringify(Object.entries(expected).sort())!==JSON.stringify(Object.entries(args??{}).sort())||!['version','sessionId','cwd','cliSessionId','storeHash'].every(k=>current[k]===binding[k])||record.isArchived!==(operation==='archive_session'))return false;if(operation==='archive_session')return true;return operation==='unarchive_session'||operation==='set_pinned'?operation==='unarchive_session'||pinned===args.pinned:record[ordinarySessionField(operation)]===args[ordinarySessionField(operation)]&&(operation!=='set_session_title'||record.titleSource==='tool')}catch{return false}
}
// Retained postcondition is tied to the exact native receipt, not a later read.
export function ordinarySessionObservationMatches(o,{config,request,receipt,now}){
 const b=request?.nativeSessionTargetBinding,op=request?.ops?.[0]
 if(!exact(o,'binding,nativeTextSha256,observedAt,operation,postcondition,requestId,schemaVersion,serviceId')||o.schemaVersion!==1||o.serviceId!==config.id||o.requestId!==request.id||!ordinarySessionBindingValid(b,config.brokerSession)||!exact(o.binding,'cliSessionId,cwd,sessionId,storeHash,version')||!Object.keys(b).every(k=>o.binding[k]===b[k])||o.operation!==op?.op||!Number.isSafeInteger(o.observedAt)||o.observedAt<Date.parse(receipt.receivedAt)||o.observedAt>now||!Array.isArray(receipt.content)||receipt.content.some(x=>x.type!=='text'||typeof x.text!=='string'))return false
 if(o.nativeTextSha256!==createHash('sha256').update(receipt.content.map(x=>x.text).join('\n')).digest('hex'))return false
 try{return JSON.stringify(o.postcondition)===JSON.stringify(ordinarySessionPostcondition(op.op,ordinarySessionArguments(op.op,b,op.args?.[ordinarySessionField(op.op)])))}catch{return false}
}
