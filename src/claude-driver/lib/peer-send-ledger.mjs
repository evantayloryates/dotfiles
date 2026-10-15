// Candidate single-publication ledger. Arming is durable uncertainty, not proof
// that a byte was sent. Reattachment can observe receipts but never republishes.
import {constants,mkdirSync,lstatSync,openSync,closeSync,fstatSync,readSync,writeFileSync,fsyncSync,renameSync} from 'node:fs'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {STATE_DIR,withLock} from './state.mjs'
import {DriverError} from './paths.mjs'
import {capturePeerReceiptCursor,readPeerReceipt} from './peer-receipt.mjs'
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const fail=()=>{throw new DriverError('peer send publication state uncertain; reconcile without replay',{category:'outcome_unknown',detail:{retrySafe:false}})}
function location(id,dir){
 if(typeof id!=='string'||! /^[A-Za-z0-9_-]{1,100}$/.test(id))throw new DriverError('invalid peer send operation ID',{category:'bad_args'})
 mkdirSync(dir,{recursive:true,mode:0o700});const s=lstatSync(dir);if(s.isSymbolicLink()||!s.isDirectory()||s.uid!==process.getuid()||s.mode&0o077)fail()
 return join(dir,id+'.json')
}
function validate(row,id){
 const c=row?.cursor,t=row?.target
 if(!row||Object.keys(row).some(k=>!['schemaVersion','operationId','messageId','target','cursor','phase','createdAt','receipt'].includes(k))||row.schemaVersion!==1||row.operationId!==id||!uuid.test(row.messageId||'')||!['outcome_unknown','received'].includes(row.phase)||!Number.isSafeInteger(row.createdAt)||!t||!c)fail()
 if(Object.keys(t).sort().join(',')!=='cwd,hostSessionId,pid,procStart,sessionId'||!uuid.test(t.sessionId||'')||t.hostSessionId!=='local_'+t.sessionId||typeof t.cwd!=='string'||!t.cwd.startsWith('/')||!Number.isInteger(t.pid)||t.pid<2||typeof t.procStart!=='string'||!t.procStart||t.procStart.length>100)fail()
 if(Object.keys(c).sort().join(',')!=='cliSessionId,cwd,dev,ino,observedAt,offset,pid,procStart,sessionId'||c.cliSessionId!==t.sessionId||c.sessionId!==t.hostSessionId||c.cwd!==t.cwd||c.pid!==t.pid||c.procStart!==t.procStart||['dev','ino','offset','observedAt'].some(k=>!Number.isSafeInteger(c[k])||c[k]<0)||c.observedAt!==row.createdAt)fail()
 if(row.phase==='received'){
  const r=row.receipt
  if(!r||Object.keys(r).sort().join(',')!=='applied,messageId,nativeUserId,receiptSource,receivedAt,sessionId'||r.sessionId!==t.hostSessionId||r.messageId!==row.messageId||r.applied!==false||r.receiptSource!=='native-peer-user-record'||typeof r.nativeUserId!=='string'||! /^[A-Za-z0-9_-]{1,200}$/.test(r.nativeUserId)||!Number.isFinite(Date.parse(r.receivedAt))||Date.parse(r.receivedAt)<row.createdAt)fail()
 }else if(row.receipt!==undefined)fail()
 return row
}
function read(file,id){let fd;try{fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);const s=fstatSync(fd);if(!s.isFile()||s.uid!==process.getuid()||s.mode&0o077||s.size>16384)fail();const bytes=Buffer.alloc(s.size);let offset=0;while(offset<bytes.length){const n=readSync(fd,bytes,offset,bytes.length-offset,offset);if(!n)fail();offset+=n}const after=fstatSync(fd);if(after.size!==s.size||after.mtimeMs!==s.mtimeMs||after.ctimeMs!==s.ctimeMs)fail();return validate(JSON.parse(bytes.toString('utf8')),id)}catch(e){if(e.code==='ENOENT')return null;fail()}finally{if(fd!==undefined)closeSync(fd)}}
function syncDir(dir){const fd=openSync(dir,constants.O_RDONLY);try{fsyncSync(fd)}finally{closeSync(fd)}}
function save(file,row,dir,{initial=false}={}){
 const path=initial?file:file+'.'+randomUUID()+'.tmp';let fd
 try{fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);writeFileSync(fd,JSON.stringify(row)+'\n');fsyncSync(fd)}finally{if(fd!==undefined)closeSync(fd)}
 if(!initial)renameSync(path,file)
 syncDir(dir)
}
const defaultDir=()=>join(STATE_DIR,'peer-sends')
export async function armPeerSend({operationId,rec,messageId},{dir=defaultDir(),signal}={}){
 const file=location(operationId,dir)
 return withLock('peer-send-'+operationId,()=>{
  const existing=read(file,operationId)
  if(existing){if(existing.messageId!==messageId||Object.entries(existing.target).some(([k,v])=>rec?.[k]!==v))fail();return {canPublish:false,record:existing}}
  if(signal?.aborted)throw new DriverError('peer send cancelled before arming',{category:'cancelled',detail:{dispatched:false,retrySafe:true}})
  if(!uuid.test(messageId||''))throw new DriverError('invalid peer message ID',{category:'bad_args'})
  const target={sessionId:rec?.sessionId,hostSessionId:rec?.hostSessionId,cwd:rec?.cwd,pid:rec?.pid,procStart:rec?.procStart}
  const cursor=capturePeerReceiptCursor(target),record=validate({schemaVersion:1,operationId,messageId,target,cursor,phase:'outcome_unknown',createdAt:cursor.observedAt},operationId)
  try{save(file,record,dir,{initial:true})}catch{fail()}
  return {canPublish:true,record}
 },{signal,timeoutMs:5000})
}
export async function reconcilePeerSend(operationId,{dir=defaultDir(),signal,now=Date.now()}={}){
 const file=location(operationId,dir)
 return withLock('peer-send-'+operationId,()=>{
  const record=read(file,operationId);if(!record)throw new DriverError('peer send not found',{category:'not_found'})
  if(record.phase==='received')return {canPublish:false,record}
  const out=readPeerReceipt(record.target,record.cursor,record.messageId,{now})
  if(!out.receipt&&out.cursor.offset===record.cursor.offset)return {canPublish:false,record,hasMore:out.hasMore}
  const next=validate({...record,cursor:out.cursor,...out.receipt?{phase:'received',receipt:out.receipt}:{}},operationId)
  try{save(file,next,dir)}catch{fail()}
  return {canPublish:false,record:next,hasMore:out.hasMore}
 },{signal,timeoutMs:5000})
}
