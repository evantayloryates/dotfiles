import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {getRecord} from './sessions.mjs'
import {DriverError} from './paths.mjs'
import {randomUUID} from 'node:crypto'
import {existsSync,writeFileSync} from 'node:fs'
import {STATE_DIR,ensureDir,writeJsonAtomic} from './state.mjs'
const exec=promisify(execFile)
export function independentServiceState(session,serviceId,record){
 if(!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(session||'')||! /^[a-f0-9]{32}$/.test(serviceId||'')||record?.sessionId!==session||typeof record.cwd!=='string'||record.cwd==='/'||resolve(record.cwd)!==record.cwd)throw new DriverError('independent receiver identity refused',{category:'bad_args'})
 return join(record.cwd,'.claude-driver-services',serviceId)
}
export function independentServiceRequestId(jobId){
 if(jobId!==undefined&&!/^j[a-f0-9]{32}$/.test(jobId))throw new DriverError('invalid durable job identity',{category:'bad_args'})
 return 'rpeer'+(jobId?jobId.slice(1):randomUUID().replaceAll('-',''))
}
export async function readIndependentService(session,serviceId,targetSession,{timeoutMs=20000,signal,jobId,progress}={}){
 if(signal?.aborted)throw new DriverError('independent read cancelled before preparation',{category:'cancelled',detail:{retrySafe:true,dispatched:false}})
 const state=independentServiceState(session,serviceId,getRecord(session))
 if(!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(targetSession||'')||targetSession===session||!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000||jobId!==undefined&&!/^j[a-f0-9]{32}$/.test(jobId))throw new DriverError('invalid independent read arguments',{category:'bad_args'})
 const requestId=independentServiceRequestId(jobId),file=join(ensureDir(join(STATE_DIR,'independent-service-jobs')),requestId+'.json')
 const record={requestId,session,serviceId,targetSession,jobId:jobId??null,at:Date.now(),state:'prepared'}
 if(existsSync(file))throw new DriverError('independent request identity already exists; reconcile without replay',{category:'outcome_unknown',detail:{requestId,retrySafe:false}})
 writeFileSync(file,JSON.stringify(record),{flag:'wx',mode:0o600});progress?.('Independent native request '+requestId)
 let reply
 try{const {stdout}=await exec(process.execPath,[fileURLToPath(new URL('../scripts/independent-service-read.mjs',import.meta.url)),session,serviceId,targetSession,requestId,String(timeoutMs)],{env:{...process.env,CLAUDE_DRIVER_STATE_DIR:state},signal,timeout:timeoutMs+15000,maxBuffer:65536});reply=JSON.parse(stdout)}
 catch{writeJsonAtomic(file,{...record,state:'outcome_unknown'});throw new DriverError('independent read worker lost; reconcile original request without replay',{category:'outcome_unknown',detail:{requestId,retrySafe:false}})}
 writeJsonAtomic(file,{...record,state:reply.ok?'completed':'unresolved',result:reply.ok?reply.result:undefined,error:reply.ok?undefined:reply.error})
 if(!reply.ok)throw new DriverError('independent native read refused or unresolved; inspect original request',{category:reply.error?.requestId?'outcome_unknown':'independent_service_read_refused',detail:{requestId:reply.error?.requestId??requestId,retrySafe:reply.error?.retrySafe===true}})
 return reply.result
}
// Child starts with its own state namespace before any lifecycle module loads.
// This operation only reconciles existing evidence; it cannot send or dispatch.
export async function reconcileIndependentServiceResult(session,serviceId,requestId,{signal}={}){
 const state=independentServiceState(session,serviceId,getRecord(session))
 if(!/^rpeer[a-f0-9]{32}$/.test(requestId||''))throw new DriverError('invalid native request id',{category:'bad_args'})
 try{
  const {stdout}=await exec(process.execPath,[fileURLToPath(new URL('../scripts/independent-service-result.mjs',import.meta.url)),session,serviceId,requestId],{env:{...process.env,CLAUDE_DRIVER_STATE_DIR:state},signal,timeout:20000,maxBuffer:65536})
  return JSON.parse(stdout)
 }catch{throw new DriverError('independent native result reconciliation refused; inspect the original request, never replay',{category:'independent_service_result_refused'})}
}
