// No message bodies enter snapshots. The scheduler captures once; workers and
// recovery/dispatch boundaries compare the same saved account and recipient.
import {createHash} from 'node:crypto'
import {isAbsolute,normalize} from 'node:path'
import {DriverError} from './paths.mjs'
import {getRecord,liveProcesses} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {readSessionManagementEnrollment} from './session-management-controller.mjs'
import {readMetadataControllerEnrollment} from './metadata-controller-index.mjs'
import {ordinarySessionBinding,ordinarySessionBindingValid,ordinarySessionArguments} from './ordinary-session-control.mjs'
import {captureOrdinaryRecipient,ordinaryRecipientValid,ordinaryRecipientMatches} from './ordinary-recipient-binding.mjs'
export const ordinaryOperationIntentSha256=(operation,args)=>createHash('sha256').update(JSON.stringify({operation,arguments:args})).digest('hex')
const hash=s=>createHash('sha256').update(s).digest('hex'),hex=/^[a-f0-9]{64}$/
export const ordinaryActionKind=(op,args)=>op==='send_message'?'send':op==='stop_session'?'stop':op==='steer_session'?(args.mode==='queue'?'send':args.mode==='interrupt'?'interrupt':null):null
export function ordinaryActionIntentValid(i){
 return !!(i&&Object.keys(i).sort().join(',')==='action,binding,controllerCwd,controllerSession,intentSha256,messageSha256,operation,recipient,schemaVersion'&&i.schemaVersion===1&&['send_message','stop_session','steer_session'].includes(i.operation)&&['send','stop','interrupt'].includes(i.action)&&(i.operation==='steer_session'?['send','interrupt'].includes(i.action):i.action===(i.operation==='send_message'?'send':'stop'))&&hex.test(i.intentSha256||'')&&ordinarySessionBindingValid(i.binding,i.controllerSession)&&typeof i.controllerCwd==='string'&&i.controllerCwd.length<=4096&&!/[\0\r\n]/.test(i.controllerCwd)&&isAbsolute(i.controllerCwd)&&normalize(i.controllerCwd)===i.controllerCwd&&ordinaryRecipientValid(i.recipient)&&(i.action==='send'||i.recipient.kind==='epoch')&&(i.action==='stop'?i.messageSha256===null:hex.test(i.messageSha256||'')))
}
export function validateOrdinaryActionIntent(intent,operation,args){
 const action=ordinaryActionKind(operation,args)
 if(!ordinaryActionIntentValid(intent)||!action||intent.action!==action||intent.operation!==operation||intent.intentSha256!==ordinaryOperationIntentSha256(operation,args)||intent.binding.sessionId!==args.session||(action!=='stop'&&(typeof args.message!=='string'||intent.messageSha256!==hash(args.message))))throw Error('ordinary action intent differs')
 return intent
}
export function captureOrdinaryActionIntent(operation,args,d={}){
 if(!ordinaryActionKind(operation,args)||args.transport==='peer-direct'||args.controller_session!==undefined||args.via_broker!==undefined)return null
 const row=(d.enrollment??readSessionManagementEnrollment)();if(!row||row.controllerSession===args.session||(d.metadata??readMetadataControllerEnrollment)(args.session))return null
 if(args.operation_id!==undefined||args.receipt_timeout_sec!==undefined)throw new DriverError('direct recipient options require peer-direct transport',{category:'bad_args'})
 const record=(d.record??getRecord)(args.session),binding=ordinarySessionBinding(record,row.controllerSession),action=ordinaryActionKind(operation,args)
 if(record.isArchived)throw new DriverError('unarchive the ordinary recipient first',{category:'session_archived',detail:{dispatched:false}})
 if(action!=='stop')ordinarySessionArguments('send_message',binding,args.message)
 const recipient=captureOrdinaryRecipient(binding,(d.peer??peerRecord)(args.session),(d.processes??liveProcesses)())
 if(action!=='send'&&recipient.kind!=='epoch')throw new DriverError('stop/interrupt requires an original native recipient epoch',{category:'verify_mismatch',detail:{dispatched:false}})
 return validateOrdinaryActionIntent({schemaVersion:1,operation,action,intentSha256:ordinaryOperationIntentSha256(operation,args),controllerSession:row.controllerSession,controllerCwd:row.receiverCwd,binding,recipient,messageSha256:action==='stop'?null:hash(args.message)},operation,args)
}
export function assertOrdinaryActionRecipient(intent,{action,message,target}={},d={}){
 if(!intent)return
 const row=(d.enrollment??readSessionManagementEnrollment)(),record=(d.record??getRecord)(intent.binding.sessionId),binding=ordinarySessionBinding(record,intent.controllerSession)
 if(!ordinaryActionIntentValid(intent)||(d.metadata??readMetadataControllerEnrollment)(intent.binding.sessionId)||target!==undefined&&target!==intent.binding.sessionId||!row||row.controllerSession!==intent.controllerSession||row.receiverCwd!==intent.controllerCwd||record.isArchived||JSON.stringify(binding)!==JSON.stringify(intent.binding)||action!==undefined&&action!==intent.action&&!(intent.action==='interrupt'&&['send','stop'].includes(action))||message!==undefined&&hash(message)!==intent.messageSha256||!ordinaryRecipientMatches(binding,intent.recipient,(d.peer??peerRecord)(binding.sessionId),(d.processes??liveProcesses)()))throw new DriverError('ordinary recipient or original epoch changed; no new target action admitted',{category:'ordinary_recipient_changed',detail:{sessionId:intent.binding.sessionId,dispatched:false,targetDispatched:false,retrySafe:true}})
}
export function prepareOrdinaryActionIntent(operation,args,submitted,d={}){
 if(!ordinaryActionKind(operation,args))return null
 if(submitted===undefined)return captureOrdinaryActionIntent(operation,args,d)
 if(submitted===null){if(captureOrdinaryActionIntent(operation,args,d)!==null)throw new DriverError('ordinary action routing scope changed since submission',{category:'ordinary_action_scope_changed',detail:{dispatched:false}});return null}
 validateOrdinaryActionIntent(submitted,operation,args)
 if((d.metadata??readMetadataControllerEnrollment)(args.session))throw new DriverError('ordinary action gained a different controller since submission',{category:'ordinary_action_scope_changed',detail:{dispatched:false}})
 assertOrdinaryActionRecipient(submitted,{},d);return submitted
}
