import {ordinaryStopEpochValid} from './ordinary-stop-control.mjs'
import {ordinarySessionArguments,ordinarySessionBindingValid} from './ordinary-session-control.mjs'
import {nativeSendArguments} from './native-send-control.mjs'
import {metadataControlArguments} from './native-metadata-control.mjs'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {getRecord} from './sessions.mjs'
import {DriverError} from './paths.mjs'
import {randomUUID} from 'node:crypto'
import {existsSync,writeFileSync} from 'node:fs'
import {STATE_DIR,ensureDir,writeJsonAtomic} from './state.mjs'
import {withIndependentArchiveTarget} from './independent-archive-admission.mjs'
const exec=promisify(execFile)
import {independentServiceState} from './independent-service-location.mjs'
import {readIndependentGenerationLocator} from './independent-service-index.mjs'
export {independentServiceState}
export function independentServiceRequestId(jobId){
 if(jobId!==undefined&&!/^j[a-f0-9]{32}$/.test(jobId))throw new DriverError('invalid durable job identity',{category:'bad_args'})
 return 'rpeer'+(jobId?jobId.slice(1):randomUUID().replaceAll('-',''))
}
export async function readIndependentService(session,serviceId,targetSession,{timeoutMs=20000,signal,jobId,progress,family=false,archiveControl,wakeControl,metadataControl,sendControl,stopControl,ordinaryControl}={}){
 if(signal?.aborted)throw new DriverError('independent read cancelled before preparation',{category:'cancelled',detail:{retrySafe:true,dispatched:false}})
 const state=independentServiceState(session,serviceId,getRecord(session))
 if(!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(targetSession||'')||typeof family!=='boolean'||(family?targetSession!==session:targetSession===session)||!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000||jobId!==undefined&&!/^j[a-f0-9]{32}$/.test(jobId))throw new DriverError('invalid independent read arguments',{category:'bad_args'})
 if(archiveControl!==undefined&&(!archiveControl||family||Object.keys(archiveControl).sort().join(',')!=='familyRequestId,serviceId'||!/^rpeer[a-f0-9]{32}$/.test(archiveControl.familyRequestId)||!/^[a-f0-9]{32}$/.test(archiveControl.serviceId)))throw new DriverError('invalid archive control',{category:'bad_args'})
 if(wakeControl!==undefined&&(archiveControl!==undefined||!wakeControl||family||Object.keys(wakeControl).sort().join(',')!=='familyRequestId,serviceId'||!/^rpeer[a-f0-9]{32}$/.test(wakeControl.familyRequestId)||!/^[a-f0-9]{32}$/.test(wakeControl.serviceId)))throw new DriverError('invalid wake control',{category:'bad_args'})
 if(metadataControl!==undefined){try{if(archiveControl!==undefined||wakeControl!==undefined||family||!metadataControl||Object.keys(metadataControl).sort().join(',')!=='operation,value')throw Error('scope');metadataControlArguments({sessionId:targetSession},metadataControl.operation,metadataControl.value)}catch{throw new DriverError('invalid metadata control',{category:'bad_args'})}}
 if(sendControl!==undefined){try{if(archiveControl||wakeControl||metadataControl||family||!sendControl||Object.keys(sendControl).join(',')!=='message')throw Error('scope');nativeSendArguments({sessionId:targetSession},sendControl.message)}catch{throw new DriverError('invalid native send control',{category:'bad_args'})}}
 if(stopControl!==undefined&&(stopControl!==true||archiveControl||wakeControl||metadataControl||sendControl||family))throw new DriverError('invalid native stop control',{category:'bad_args'})
 if(ordinaryControl!==undefined){try{if(family||archiveControl||wakeControl||metadataControl||sendControl||stopControl||!ordinaryControl||ordinaryControl.operation==='stop_session'&&!ordinaryStopEpochValid(ordinaryControl.value)||Object.keys(ordinaryControl).sort().join(',')!==(Object.hasOwn(ordinaryControl,'expectedEpoch')?'binding,expectedEpoch,operation,value':'binding,operation,value')||Object.hasOwn(ordinaryControl,'expectedEpoch')&&(ordinaryControl.operation!=='send_message'||!ordinaryStopEpochValid(ordinaryControl.expectedEpoch))||!ordinarySessionBindingValid(ordinaryControl.binding,session)||ordinaryControl.binding.sessionId!==targetSession)throw Error('scope');ordinarySessionArguments(ordinaryControl.operation,ordinaryControl.binding,ordinaryControl.operation==='stop_session'?undefined:ordinaryControl.value??undefined)}catch{throw new DriverError('invalid ordinary session control',{category:'bad_args'})}}
 const execute=async()=>{
 const requestId=independentServiceRequestId(jobId),file=join(ensureDir(join(STATE_DIR,'independent-service-jobs')),requestId+'.json')
 const record={requestId,session,serviceId,targetSession,...ordinaryControl?{operation:ordinaryControl.operation,ordinaryControl}:stopControl?{operation:'stop_session',stopControl:true}:sendControl?{operation:'send_message',sendControl}:family?{operation:'list_sessions'}:archiveControl?{operation:'archive_session',archiveControl}:wakeControl?{operation:'send_message',wakeControl}:metadataControl?{operation:metadataControl.operation,metadataControl}:{},jobId:jobId??null,at:Date.now(),state:'prepared'}
 if(existsSync(file))throw new DriverError('independent request identity already exists; reconcile without replay',{category:'outcome_unknown',detail:{requestId,retrySafe:false}})
 writeFileSync(file,JSON.stringify(record),{flag:'wx',mode:0o600});progress?.('Independent native request '+requestId)
 let reply
 try{const {stdout}=await exec(process.execPath,[fileURLToPath(new URL('../scripts/independent-service-read.mjs',import.meta.url)),session,serviceId,targetSession,requestId,String(timeoutMs),...ordinaryControl?['--ordinary',JSON.stringify(ordinaryControl)]:stopControl?['--stop']:sendControl?['--send',JSON.stringify(sendControl)]:family?['--family']:archiveControl?['--archive',archiveControl.serviceId,archiveControl.familyRequestId]:wakeControl?['--wake',wakeControl.serviceId,wakeControl.familyRequestId]:metadataControl?['--metadata',JSON.stringify(metadataControl)]:[]],{env:{...process.env,CLAUDE_DRIVER_STATE_DIR:state,CLAUDE_DRIVER_CONTROL_STATE_DIR:STATE_DIR},signal,timeout:timeoutMs+15000,maxBuffer:65536});reply=JSON.parse(stdout)}
 catch{writeJsonAtomic(file,{...record,state:'outcome_unknown'});throw new DriverError('independent read worker lost; reconcile original request without replay',{category:'outcome_unknown',detail:{requestId,retrySafe:false}})}
 writeJsonAtomic(file,{...record,state:reply.ok?'completed':'unresolved',result:reply.ok?reply.result:undefined,error:reply.ok?undefined:reply.error})
 if(!reply.ok)throw new DriverError('independent native read refused or unresolved; inspect original request',{category:reply.error?.requestId?'outcome_unknown':'independent_service_read_refused',detail:{requestId:reply.error?.requestId??requestId,retrySafe:reply.error?.retrySafe===true}})
 return reply.result
 }
 return ordinaryControl||archiveControl||wakeControl||metadataControl||sendControl||stopControl?withIndependentArchiveTarget(targetSession,execute,{signal}):execute()
}
// Child starts with its own state namespace before any lifecycle module loads.
// This operation only reconciles existing evidence; it cannot send or dispatch.
export async function reconcileIndependentServiceResult(session,serviceId,requestId,{signal}={}){
 const state=independentServiceState(session,serviceId,getRecord(session))
 if(!/^rpeer[a-f0-9]{32}$/.test(requestId||''))throw new DriverError('invalid native request id',{category:'bad_args'})
 try{
  const {stdout}=await exec(process.execPath,[fileURLToPath(new URL('../scripts/independent-service-result.mjs',import.meta.url)),session,serviceId,requestId],{env:{...process.env,CLAUDE_DRIVER_STATE_DIR:state,CLAUDE_DRIVER_CONTROL_STATE_DIR:STATE_DIR},signal,timeout:20000,maxBuffer:65536})
  return JSON.parse(stdout)
 }catch{throw new DriverError('independent native result reconciliation refused; inspect the original request, never replay',{category:'independent_service_result_refused'})}
}
export async function inspectIndependentService(session,serviceId,{signal,historical=false,offline=false}={}){
 if(typeof historical!=='boolean'||typeof offline!=='boolean'||historical&&offline)throw new DriverError('inspection modes are exclusive',{category:'bad_args'})
 const located=historical||offline?readIndependentGenerationLocator(session,serviceId):null,record=located?.record??getRecord(session),state=independentServiceState(session,serviceId,record)
 try{const {stdout}=await exec(process.execPath,[fileURLToPath(new URL('../scripts/independent-service-status.mjs',import.meta.url)),session,serviceId,...historical||offline?[offline?'--offline':'--historical',...(located?[located.record.cwd]:[])]:[]],{env:{...process.env,CLAUDE_DRIVER_STATE_DIR:state,CLAUDE_DRIVER_CONTROL_STATE_DIR:STATE_DIR},signal,timeout:15000,maxBuffer:65536});return JSON.parse(stdout)}
 catch{throw new DriverError('independent service status unavailable; no recovery attempted',{category:'independent_service_status_unavailable'})}
}
