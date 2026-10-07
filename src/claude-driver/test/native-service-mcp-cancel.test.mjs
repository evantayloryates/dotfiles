import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// Actual shared stdio transport and production read transaction, private stores.
// Fake dispatch is counted only; no Claude/native effect or configured server.
test('MCP cancellation propagates before publication and after one send, preserving uncertainty',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-mcp-cancel-'))
 const transport=new URL('../../lib/node/mcp-stdio.mjs',import.meta.url).href,transaction=new URL('../lib/native-service-read.mjs',import.meta.url).href
 try{for(const stage of ['prepare','wait']){
  const child=spawn(process.execPath,['--input-type=module','-e',`
import {serveMcp} from ${JSON.stringify(transport)};
import {runNativeServiceReadTransaction,publishNativeServiceReadRequest} from ${JSON.stringify(transaction)};
const mode=${JSON.stringify(stage)},dir=${JSON.stringify(dir)},id='rpeer'+(mode==='prepare'?'a':'b').repeat(32);
const state={sends:0,cancels:0,finished:false,error:null};
const untilAbort=signal=>new Promise(resolve=>signal.aborted?resolve():signal.addEventListener('abort',resolve,{once:true}));
await serveMcp({name:'native-cancel-fixture',version:'1',tools:[{name:'read',handler:async(args,ctx)=>{
 try{return await runNativeServiceReadTransaction({requestId:id,signal:ctx.signal},{
 prepare:async()=>{if(mode==='prepare'){ctx.progress('prepare-held');await untilAbort(ctx.signal)}return {request:{id,expiresAt:Date.now()+10000}}},
 enqueue:request=>publishNativeServiceReadRequest({dir,serviceId:'c'.repeat(32),maxRequests:2,request},()=>{}),
 claim:async()=>({id}),revalidate:async()=>{},send:async()=>{state.sends++;ctx.progress('send-observed')},
 now:Date.now,responsePresent:()=>false,wait:()=>untilAbort(ctx.signal),reconcile:async()=>{throw Error('unexpected')},cancel:async()=>{state.cancels++}
 })}catch(e){state.error={phase:e.phase,retrySafe:e.retrySafe,requestId:e.requestId,cleanupPending:e.cleanupPending};throw e}finally{state.finished=true}
}},{name:'audit',handler:async()=>({content:[],structuredContent:state})}]});
`],{stdio:['pipe','pipe','pipe']})
  const lines=createInterface({input:child.stdout}),messages=[]
  child.stderr.resume();lines.on('line',line=>messages.push(JSON.parse(line)))
  const send=x=>child.stdin.write(JSON.stringify({jsonrpc:'2.0',...x})+'\n')
  const until=async fn=>{const end=Date.now()+5000;while(Date.now()<end){const r=fn();if(r)return r;await new Promise(r=>setTimeout(r,10))}throw Error('MCP cancellation evidence timeout')}
  try{
   send({id:1,method:'initialize',params:{protocolVersion:'2025-06-18',clientInfo:{name:'cancel-test',version:'1'}}});await until(()=>messages.find(x=>x.id===1))
   send({id:2,method:'tools/call',params:{name:'read',arguments:{},_meta:{progressToken:'owned'}}})
   await until(()=>messages.find(x=>x.method==='notifications/progress'))
   send({method:'notifications/cancelled',params:{requestId:2,reason:'owned test'}})
   let audit
   for(let id=3;id<30;id++){send({id,method:'tools/call',params:{name:'audit'}});audit=(await until(()=>messages.find(x=>x.id===id))).result.structuredContent;if(audit.finished)break;await new Promise(r=>setTimeout(r,10))}
   assert.equal(audit.finished,true);assert.equal(audit.sends,stage==='wait'?1:0);assert.equal(audit.cancels,stage==='wait'?1:0)
   assert.equal(audit.error.retrySafe,stage==='prepare');assert.equal(audit.error.requestId,stage==='prepare'?null:'rpeer'+'b'.repeat(32))
   assert.equal(messages.some(x=>x.id===2),false,'cancelled MCP response is suppressed')
   assert.equal(fs.readdirSync(dir).length,stage==='prepare'?0:1)
  }finally{child.stdin.end();await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));lines.close()}
 }}finally{fs.rmSync(dir,{recursive:true,force:true})}
})
