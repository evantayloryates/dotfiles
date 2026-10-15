// Candidate direct-recipient receipt observation. Metadata only; a peer user
// record proves native receipt, never application, model completion or replay safety.
import {constants,openSync,closeSync,fstatSync,readSync} from 'node:fs'
import {transcriptPath} from './peer-direct.mjs'
import {DriverError} from './paths.mjs'
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const fail=()=>{throw new DriverError('native peer receipt journal unavailable or changed; reconcile without replay',{category:'outcome_unknown',detail:{retrySafe:false}})}
function identity(rec){
 if(!uuid.test(rec?.sessionId||'')||rec.hostSessionId!=='local_'+rec.sessionId||typeof rec.cwd!=='string'||!rec.cwd.startsWith('/')||!Number.isInteger(rec.pid)||rec.pid<2||typeof rec.procStart!=='string'||!rec.procStart)fail()
 return {cliSessionId:rec.sessionId,sessionId:rec.hostSessionId,cwd:rec.cwd,pid:rec.pid,procStart:rec.procStart}
}
function journal(rec,fn){
 let fd
 try{fd=openSync(transcriptPath(rec),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);const stat=fstatSync(fd);if(!stat.isFile()||stat.uid!==process.getuid())fail();return fn(fd,stat)}
 catch(e){if(e instanceof DriverError)throw e;fail()}
 finally{if(fd!==undefined)closeSync(fd)}
}
export function capturePeerReceiptCursor(rec,{now=Date.now()}={}){
 const target=identity(rec);if(!Number.isSafeInteger(now)||now<0)fail()
 return journal(rec,(_,stat)=>({...target,dev:stat.dev,ino:stat.ino,offset:stat.size,observedAt:now}))
}
export function readPeerReceipt(rec,cursor,msgId,{now=Date.now()}={}){
 const target=identity(rec)
 if(!uuid.test(msgId||'')||!cursor||Object.entries(target).some(([k,v])=>cursor[k]!==v)||!Number.isSafeInteger(cursor.offset)||cursor.offset<0||!Number.isSafeInteger(cursor.observedAt)||cursor.observedAt<0||!Number.isSafeInteger(now)||now<cursor.observedAt)fail()
 return journal(rec,(fd,stat)=>{
  if(stat.dev!==cursor.dev||stat.ino!==cursor.ino||stat.size<cursor.offset)fail()
  const bytes=Math.min(stat.size-cursor.offset,256*1024),buf=Buffer.alloc(bytes)
  let count=0
  while(count<bytes){const n=readSync(fd,buf,count,bytes-count,cursor.offset+count);if(!n)fail();count+=n}
  const after=fstatSync(fd);if(after.dev!==stat.dev||after.ino!==stat.ino||after.size<stat.size)fail()
  const end=buf.lastIndexOf(10);if(end<0&&bytes===256*1024)fail()
  let receipt=null
  if(end>=0)for(const line of buf.subarray(0,end).toString('utf8').split('\n')){
   let row;try{row=JSON.parse(line)}catch{continue}
   if(row?.type!=='user'||row.isSidechain===true||row.sessionId!==target.cliSessionId||row.origin?.kind!=='peer'||row.origin.msg_id!==msgId||typeof row.uuid!=='string'||! /^[A-Za-z0-9_-]{1,200}$/.test(row.uuid))continue
   const at=Date.parse(row.timestamp);if(!Number.isFinite(at)||at<cursor.observedAt||at>now)continue
   receipt={sessionId:target.sessionId,messageId:msgId,nativeUserId:row.uuid,receivedAt:row.timestamp,receiptSource:'native-peer-user-record',applied:false}
   break
  }
  return {receipt,cursor:{...cursor,offset:cursor.offset+(end<0?0:end+1)},hasMore:stat.size>cursor.offset+(end<0?0:end+1),bytesRead:bytes}
 })
}
