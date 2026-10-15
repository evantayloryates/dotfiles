// Metadata only. Logging is best-effort and never changes operation outcomes.
import {AsyncLocalStorage} from 'node:async_hooks'
const context=new AsyncLocalStorage()
export const withLifecycleContext=(fields,fn)=>context.run({...context.getStore(),...fields},fn)
export const lifecycleContext=()=>context.getStore()||{}
import {constants,openSync,closeSync,fstatSync,writeSync,mkdirSync,lstatSync} from 'node:fs'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {STATE_DIR} from './state.mjs'
const token=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(x)?x:null
export function lifecycleEvent(event,fields={}, {dir=join(STATE_DIR,'lifecycle'),now=Date.now(),limit=8*1024*1024}={}){
 const {operationId,operation,requestId,category,outcome,ms,info,build,versions,native,wake}={...lifecycleContext(),...fields}
 let fd
 try{
  if(!token(event))return {recorded:false,reason:'invalid-event'}
  mkdirSync(dir,{recursive:true,mode:0o700})
  const d=lstatSync(dir);if(!d.isDirectory()||d.isSymbolicLink()||d.uid!==process.getuid())throw Error()
  const row={schemaVersion:1,eventId:randomUUID(),at:new Date(now).toISOString(),event,writerPid:process.pid,operationId:token(operationId),operation:token(operation),requestId:token(requestId),category:token(category),outcome:token(outcome),ms:Number.isFinite(ms)&&ms>=0?ms:null,build:token(build),versions:{app:token(versions?.app),cli:token(versions?.cli)}}
  if(wake)row.wake={msgId:token(wake.msgId),pid:Number.isSafeInteger(wake.pid)?wake.pid:null,procStart:typeof wake.procStart==='string'?wake.procStart.slice(0,64):null,method:token(wake.method),priority:token(wake.priority),executionVerified:false}
  if(native)row.native={evidenceId:token(native.evidenceId),timestamp:typeof native.timestamp==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(native.timestamp)?native.timestamp:null,timestampBasis:'app-local-wall-clock',kind:token(native.kind),sessionId:token(native.sessionId),exitCode:Number.isInteger(native.exitCode)&&native.exitCode>=0&&native.exitCode<=255?native.exitCode:null,cause:token(native.cause)}
  if(info)row.broker={appRunning:typeof info.appRunning==='boolean'?info.appRunning:null,sessionId:token(info.sessionId),exists:info.exists===true,archived:typeof info.archived==='boolean'?info.archived:null,pid:Number.isSafeInteger(info.live?.pid)?info.live.pid:null,procStart:typeof info.live?.procStart==='string'?info.live.procStart.slice(0,64):null,resident:info.resident?.resident===true,integrity:info.runtime?.integrity===true,build:token(info.runtime?.build),epochReason:token(info.runtime?.dependencyEvidence?.reason),waiterReason:token(info.waiterReadiness?.reason),handoffStopped:info.handoffStopped===true,templateCurrent:info.templateCurrent===true}
  const file=join(dir,row.at.slice(0,10)+'.jsonl')
  fd=openSync(file,constants.O_CREAT|constants.O_APPEND|constants.O_WRONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK,0o600)
  const s=fstatSync(fd),line=JSON.stringify(row)+'\n'
  if(!s.isFile()||s.uid!==process.getuid())throw Error()
  if(s.size+Buffer.byteLength(line)>limit)return {recorded:false,reason:'daily-budget-exhausted'}
  writeSync(fd,line);return {recorded:true,eventId:row.eventId,file}
 }catch{return {recorded:false,reason:'log-unavailable'}}finally{if(fd!==undefined)closeSync(fd)}
}
