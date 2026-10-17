import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {getRecord} from './sessions.mjs'
import {DriverError} from './paths.mjs'
const exec=promisify(execFile)
export function independentServiceState(session,serviceId,record){
 if(!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(session||'')||! /^[a-f0-9]{32}$/.test(serviceId||'')||record?.sessionId!==session||typeof record.cwd!=='string'||record.cwd==='/'||resolve(record.cwd)!==record.cwd)throw new DriverError('independent receiver identity refused',{category:'bad_args'})
 return join(record.cwd,'.claude-driver-services',serviceId)
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
