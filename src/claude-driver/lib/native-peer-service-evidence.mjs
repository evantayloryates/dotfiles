import {nativeSendArguments,nativeSendAcceptance} from './native-send-control.mjs'
import {nativeMetadataTargetEvidenceMatches} from './native-metadata-admission.mjs'
import {isMetadataOperation,metadataControlArguments,metadataObservationMatches} from './native-metadata-control.mjs'
import {screenNativePeerAdmission} from './native-peer-evidence.mjs'
import {screenNativePeerResult} from './native-peer-result.mjs'
import {NATIVE_FAMILY_QUERY} from './native-family-preflight.mjs'
import {archiveControlArguments,archiveObservationMatches,wakeControlArguments} from './native-archive-control.mjs'
// Readiness only. Does not prove serving, admission, tool success or quiescence.
export function screenNativeServiceReady({config,ready,now}={}){
 const keys=['schemaVersion','scope','serviceId','brokerSession','brokerCwd','build','registeredAt','deadline','maxRequests','nativeCallsRequested','modelCallsRequested']
 if(!config||!ready||typeof ready!=='object'||Array.isArray(ready)||Object.keys(ready).sort().join(',')!==keys.sort().join(',')||!Number.isSafeInteger(now))return false
 const at=Date.parse(ready.registeredAt)
 return ready.schemaVersion===1&&ready.scope==='owned-native-service-ready'&&ready.serviceId===config.id&&ready.brokerSession===config.brokerSession&&ready.brokerCwd===config.brokerCwd&&ready.build===config.build&&ready.deadline===config.deadline&&ready.maxRequests===config.maxRequests&&ready.nativeCallsRequested===0&&ready.modelCallsRequested===0&&typeof ready.registeredAt==='string'&&Number.isFinite(at)&&new Date(at).toISOString()===ready.registeredAt&&Number.isSafeInteger(config.notBefore)&&Number.isSafeInteger(config.deadline)&&at>=config.notBefore&&at<=now&&now<=config.deadline
}
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys.sort().join(',')
// Pure historical review. Reuses admission and metadata contracts; never writes
// a diagnostic report, repairs controls, publishes a receipt or executes a read.
export function screenNativeServiceResult({config,ready,intent,receipt,request,epoch,pointer,entry,admission,control,archiveObservation,metadataObservation,now=Date.now()}={}){
 const refused={receiptVerified:false,releaseAuthorized:false}
 if(!config||!/^rpeer[a-f0-9]{32}$/.test(request?.id)||!Number.isSafeInteger(now)||!exact(intent,['schemaVersion','scope','serviceId','requestId','brokerSession','startedAt'])||!exact(receipt,['schemaVersion','scope','serviceId','requestId','brokerSession','targetSession','startedAt','receivedAt','isError','content']))return refused
 if(intent.schemaVersion!==1||intent.scope!=='owned-native-service-intent'||receipt.schemaVersion!==1||receipt.scope!=='owned-native-service-result'||intent.serviceId!==config.id||receipt.serviceId!==config.id||intent.requestId!==request.id||receipt.requestId!==request.id||intent.brokerSession!==config.brokerSession||receipt.brokerSession!==config.brokerSession||receipt.startedAt!==intent.startedAt||typeof receipt.isError!=='boolean')return refused
 const start=Date.parse(intent.startedAt),end=Date.parse(receipt.receivedAt)
 if(!Number.isFinite(start)||new Date(start).toISOString()!==intent.startedAt||!Number.isFinite(end)||new Date(end).toISOString()!==receipt.receivedAt||end<start||end>now||!Number.isSafeInteger(request.expiresAt)||request.expiresAt>config.deadline||end>request.expiresAt||!screenNativeServiceReady({config,ready,now:end})||start<Date.parse(ready.registeredAt))return refused
 const hex=request.id.slice(5),id=hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20)
 const perRequest={id,brokerSession:config.brokerSession,targetSession:receipt.targetSession,deadline:request.expiresAt}
 // In-memory structural adapters only; original evidence remains unmodified.
 const report={probeId:id,startedAt:intent.startedAt,completedAt:receipt.receivedAt,nativeCallReturned:true,resultWasError:receipt.isError,failureCategory:null}
 const family=request.ops?.[0]?.op==='list_sessions'
 const archive=request.ops?.[0]?.op==='archive_session'
 const metadata=isMetadataOperation(request.ops?.[0]?.op)
 if(metadata&&(pointer?.nativeMetadataTargetVersion===1||Object.hasOwn(request,'nativeMetadataTargetBinding'))&&(!nativeMetadataTargetEvidenceMatches(request,admission)||['sessionId','cwd','pid','procStart'].some(k=>request.nativeMetadataTargetBinding[k]!==config.metadataTarget?.[k])))return refused
 if(metadata&&(!config.serviceStateBinding||!config.metadataTarget||receipt.targetSession!==config.metadataTarget.sessionId||receipt.isError||!metadataObservationMatches(metadataObservation,{config,request,receipt,now})))return refused
 const nativeSend=request.ops?.[0]?.op==='send_message'&&config.metadataSendControl===true&&!!config.metadataTarget
 let sendArguments;if(nativeSend){try{sendArguments=nativeSendArguments(config.metadataTarget,request.ops[0].args.message)}catch{return refused}}
 const sendReceipt=nativeSend?nativeSendAcceptance(receipt,config.metadataTarget.sessionId):null
 if(nativeSend&&(!config.serviceStateBinding||receipt.targetSession!==config.metadataTarget.sessionId||!sendReceipt||!nativeMetadataTargetEvidenceMatches(request,admission)||['sessionId','cwd','pid','procStart'].some(k=>request.nativeMetadataTargetBinding?.[k]!==config.metadataTarget[k])))return refused
 const wake=request.ops?.[0]?.op==='send_message'&&!nativeSend
 if(wake&&(!config.serviceStateBinding||!config.archiveTarget||receipt.targetSession!==config.archiveTarget.sessionId))return refused
 if(family&&(!config.serviceStateBinding||receipt.targetSession!==config.brokerSession))return refused
 if(archive&&(!config.serviceStateBinding||!config.archiveTarget||receipt.targetSession!==config.archiveTarget.sessionId||receipt.isError||!archiveObservationMatches(archiveObservation,{config,requestId:request.id,receipt,now})))return refused
 const correlated=screenNativePeerAdmission({config:perRequest,epoch,pointer,request,entry,admission,control,report,...nativeSend?{expectedOperation:'send_message',expectedArguments:sendArguments}:metadata?{expectedOperation:request.ops[0].op,expectedArguments:metadataControlArguments(config.metadataTarget,request.ops[0].op,request.ops[0].args[request.ops[0].op==='set_session_title'?'title':request.ops[0].op==='set_pinned'?'pinned':request.ops[0].op==='set_session_model'?'model':'effort'])}:family?{expectedOperation:'list_sessions',expectedArguments:NATIVE_FAMILY_QUERY}:wake?{expectedOperation:'send_message',expectedArguments:wakeControlArguments(config.archiveTarget)}:archive?{expectedOperation:'archive_session',expectedArguments:archiveControlArguments(config.archiveTarget)}:{}})
 const result=screenNativePeerResult({config:perRequest,requestId:request.id,report,receipt:{schemaVersion:1,scope:'owned-native-peer-result',probeId:id,requestId:request.id,brokerSession:receipt.brokerSession,targetSession:receipt.targetSession,startedAt:receipt.startedAt,receivedAt:receipt.receivedAt,isError:receipt.isError,content:receipt.content},admission:correlated,family,archive,wake,metadata,nativeSend})
 if(!result)return refused
 return {receiptVerified:true,...nativeSend?{sendReceipt}:{},requestId:request.id,result,nativeToolUseId:admission.toolUseId,standardLifecycleSettlementAssessed:false,releaseAuthorized:false}
}
