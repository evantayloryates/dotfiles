// Read-only, bounded historical effect audit. Canonical matching is deliberately
// NOT a request receipt: identical operations can belong to different requests.
import {constants,openSync,closeSync,fstatSync,readSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {DriverError} from './paths.mjs'
const ordered=x=>Array.isArray(x)?x.map(ordered):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordered(x[k])])):x
const canonical=x=>JSON.stringify(ordered(x))
const refuse=()=>{throw new DriverError('historical native evidence is incomplete or changed; preserve uncertainty',{category:'native_evidence_incomplete'})}
export function auditNativeEffects(file,requests,tools,{maxBytes=16*1024*1024,maxLineBytes=2*1024*1024}={}){
 let fd
 try{
  if(!Array.isArray(requests)||!requests.length||requests.length>100||!Number.isSafeInteger(maxBytes)||maxBytes<=0||!Number.isSafeInteger(maxLineBytes)||maxLineBytes<=0)refuse()
  fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
  const st=fstatSync(fd),epoch=requests[0].nativeObservation,end=st.size
  if(!st.isFile()||st.uid!==process.getuid()||!epoch||requests.some(r=>!r.nativeObservation||r.nativeObservation.dev!==st.dev||r.nativeObservation.ino!==st.ino||r.nativeObservation.brokerSessionId!==epoch.brokerSessionId||r.nativeObservation.cliSessionId!==epoch.cliSessionId||!Number.isSafeInteger(r.nativeObservation.offset)||r.nativeObservation.offset<0||r.nativeObservation.offset>end||!Array.isArray(r.ops)||!r.ops.length||r.ops.some(o=>typeof tools[o.op]!=='string')))refuse()
  const start=Math.min(...requests.map(r=>r.nativeObservation.offset));if(end-start>maxBytes)refuse()
  const matches=requests.map(r=>({requestId:r.id,slots:r.ops.map((o,index)=>({index,op:o.op,signature:canonical([tools[o.op],o.args]),calls:new Map()}))})),calls=new Map(),results=new Map(),hash=createHash('sha256')
  let position=start,lineStart=start,carry=Buffer.alloc(0),records=0
  while(position<end){
   const chunk=Buffer.alloc(Math.min(256*1024,end-position)),n=readSync(fd,chunk,0,chunk.length,position);if(n!==chunk.length)refuse();hash.update(chunk);position+=n
   carry=Buffer.concat([carry,chunk]);let consumed=0,nl
   while((nl=carry.indexOf(10,consumed))>=0){
    const line=carry.subarray(consumed,nl);if(line.length>maxLineBytes)refuse()
    let row;try{row=JSON.parse(line.toString('utf8'))}catch{refuse()};records++
    if(!row.isSidechain&&['assistant','user'].includes(row.type)&&Array.isArray(row.message?.content))for(const b of row.message.content){
     if(b?.type==='tool_use'&&typeof b.id==='string'){
      const signature=canonical([b.name,b.input]);if(calls.has(b.id)&&calls.get(b.id)!==signature)refuse();calls.set(b.id,signature)
      for(let i=0;i<requests.length;i++)if(lineStart>=requests[i].nativeObservation.offset)for(const slot of matches[i].slots)if(signature===slot.signature)slot.calls.set(b.id,{nativeToolUseId:b.id,at:row.timestamp,uuid:row.uuid})
     }else if(b?.type==='tool_result'&&typeof b.tool_use_id==='string')results.set(b.tool_use_id,{ok:!b.is_error,at:row.timestamp,uuid:row.uuid})
    }
    lineStart+=nl-consumed+1;consumed=nl+1
   }
   carry=carry.subarray(consumed);if(carry.length>maxLineBytes)refuse()
  }
  if(carry.length)refuse() // a partial final record cannot prove absence
  const after=fstatSync(fd);if(after.dev!==st.dev||after.ino!==st.ino||after.size<end)refuse()
  return {source:'complete fixed range of owned native journal',cursor:{dev:st.dev,ino:st.ino,start,end},bytes:end-start,records,sha256:hash.digest('hex'),requests:matches.map(r=>({requestId:r.requestId,causalOutcome:'unknown',retrySafe:false,slots:r.slots.map(s=>({index:s.index,op:s.op,matchingNativeCalls:[...s.calls.values()].map(c=>({...c,result:results.get(c.nativeToolUseId)??null})),pendingMatchingCalls:[...s.calls.keys()].filter(id=>!results.has(id)).length}))})),limitation:'Matching arguments do not identify the originating request. Absence covers only this fixed journal range, not queued or future effects. No request state or receipt was changed.'}
 }catch(e){if(e instanceof DriverError)throw e;refuse()}finally{if(fd!==undefined)closeSync(fd)}
}
