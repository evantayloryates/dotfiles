import {readFileSync} from 'node:fs'
import {runOp} from '../lib/driver.mjs'
import {nativeSendReplyObserved} from '../lib/native-send-control.mjs'
export async function observeNativeSendContract(trace,session,cursor,marker,sender){
 const rows=readFileSync(trace,'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)),done=rows.find(r=>r.event==='reply'&&r.name==='driver_wait'&&r.state==='completed'&&r.nativeSendAccepted),events=[];let bytesRead=0,last={hasMore:false,cursor},end=Date.now()+20000
 if(!done)return {...last,events,bytesRead}
 for(;;){
  last=await runOp('session_events',{session,cursor,include_causality:true,include_text:true,limit:100});events.push(...last.events);bytesRead+=last.bytesRead;cursor=last.cursor
  if(events.length>100||bytesRead>262144)return {...last,events,bytesRead,hasMore:true}
  if(!last.hasMore&&nativeSendReplyObserved(events,marker,{sender,message:'Reply exactly '+marker+'. Do not use tools or change files, settings or permissions.'})||Date.now()>end)return {...last,events,bytesRead}
  await new Promise(r=>setTimeout(r,100))
 }
}
