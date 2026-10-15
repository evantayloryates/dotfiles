// Bounded incremental main.log reader. Raw lines never leave this module.
import {constants,openSync,closeSync,fstatSync,readSync} from 'node:fs'
import {createHash} from 'node:crypto'
const localId=/^local_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export function nativeLifecycleLine(line,sessionId){
 if(!localId.test(sessionId||''))return null
 const timestamp=line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) /)?.[1]
 if(!timestamp)return null
 const escaped=sessionId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
 const exit=line.match(new RegExp('\\bSession '+escaped+' query error: Claude Code process exited with code (\\d+)\\b'))
 let event
 if(exit&&Number(exit[1])<=255)event={kind:'owned-query-exit',exitCode:Number(exit[1]),cause:'unknown'}
 // "would evict" is an intention observation, never proof of termination.
 if(!event&&line.includes('[CliGovernor]')&&new RegExp('\\bwould evict '+escaped+'(?:\\s|$)').test(line))event={kind:'owned-governor-eviction-intent',cause:'unproven'}
 if(!event)return null
 return {timestamp,timestampBasis:'app-local-wall-clock',sessionId,...event}
}
export function collectNativeLifecycle({file,sessionId,cursor,budget=256*1024}){
 let fd
 try{
  fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
  const stat=fstatSync(fd)
  if(!stat.isFile()||stat.uid!==process.getuid())throw Error()
  const identity=stat.dev+':'+stat.ino,continuous=cursor?.identity===identity&&cursor.offset<=stat.size&&cursor.sessionId===sessionId
  let offset=continuous?cursor.offset:Math.max(0,stat.size-budget),gap=continuous?null:cursor?'rotation-truncation-or-identity-change':'initial-tail-only'
  if(stat.size-offset>budget){offset=stat.size-budget;gap='read-budget-gap'}
  const partial=offset>0&&(!continuous||gap!==null),buf=Buffer.alloc(Math.min(budget,stat.size-offset))
  const read=readSync(fd,buf,0,buf.length,offset),last=buf.subarray(0,read).lastIndexOf(10)
  if(last<0)return {available:true,gap,events:[],cursor:{identity,offset,sessionId},bytesRead:read}
  const complete=buf.subarray(0,last+1).toString('utf8'),lines=complete.split('\n');if(partial)lines.shift()
  const events=lines.flatMap(line=>{const e=nativeLifecycleLine(line,sessionId);return e?[{...e,evidenceId:createHash('sha256').update(line).digest('hex')}]:[]})
  return {available:true,gap,events,cursor:{identity,offset:offset+last+1,sessionId},bytesRead:read}
 }catch{return {available:false,gap:'log-unavailable',events:[],cursor:cursor||null,bytesRead:0}}finally{if(fd!==undefined)closeSync(fd)}
}
