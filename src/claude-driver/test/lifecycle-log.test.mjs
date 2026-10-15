import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,symlinkSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {lifecycleEvent} from '../lib/lifecycle-log.mjs'
test('lifecycle evidence correlates calls and excludes payloads and raw errors',()=>{
 const dir=mkdtempSync(join(tmpdir(),'driver-lifecycle-'))
 try{
  const result=lifecycleEvent('operation-error',{operationId:'test-1',operation:'send_message',category:'broker_dead',message:'SECRET',args:{message:'SECRET'},info:{sessionId:'local_fixture',exists:true,live:null,runtime:{dependencyEvidence:{reason:'native-process-epoch-mismatch'}}}},{dir})
  assert.equal(result.recorded,true)
  const body=readFileSync(result.file,'utf8'),row=JSON.parse(body)
  assert.equal(body.includes('SECRET'),false);assert.equal(row.operationId,'test-1');assert.equal(row.broker.pid,null);assert.equal(row.broker.epochReason,'native-process-epoch-mismatch')
  assert.deepEqual(lifecycleEvent('operation-start',{}, {dir,limit:1}),{recorded:false,reason:'daily-budget-exhausted'})
 }finally{rmSync(dir,{recursive:true,force:true})}
})
test('unavailable and symlinked log destinations fail without throwing',()=>{
 const dir=mkdtempSync(join(tmpdir(),'driver-lifecycle-'))
 try{
  symlinkSync('/dev/null',join(dir,'2026-10-15.jsonl'))
  assert.equal(lifecycleEvent('operation-start',{}, {dir,now:Date.parse('2026-10-15T12:00:00Z')}).recorded,false)
  assert.equal(lifecycleEvent('operation-start',{}, {dir:join(dir,'2026-10-15.jsonl','child')}).recorded,false)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
test('interleaved operations keep broker events in their own async correlation context',async()=>{
 const {withLifecycleContext}=await import('../lib/lifecycle-log.mjs')
 const dir=mkdtempSync(join(tmpdir(),'driver-lifecycle-'))
 try{
  const rows=await Promise.all(['operation-a','operation-b'].map(operationId=>withLifecycleContext({operationId,operation:'send_message',build:'fixture'},async()=>{
   await new Promise(resolve=>setTimeout(resolve,operationId.endsWith('a')?5:1))
   const r=lifecycleEvent('request-enqueued',{requestId:operationId},{dir})
   return {operationId,eventId:r.eventId,file:r.file}
  })))
  const logged=readFileSync(rows[0].file,'utf8').trim().split('\n').map(JSON.parse)
  for(const r of rows){const e=logged.find(x=>x.eventId===r.eventId);assert.equal(e.operationId,r.operationId);assert.equal(e.requestId,r.operationId);assert.equal(e.operation,'send_message');assert.equal(e.build,'fixture')}
  const outside=lifecycleEvent('broker-observed',{}, {dir});const e=readFileSync(outside.file,'utf8').trim().split('\n').map(JSON.parse).at(-1);assert.equal(e.operationId,null)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
test('wake evidence retains causal metadata without socket, token or message content',()=>{
 const dir=mkdtempSync(join(tmpdir(),'driver-lifecycle-'))
 try{
  const r=lifecycleEvent('peer-wake-prepared',{requestId:'rfixture',wake:{msgId:'synthetic-id',pid:42,procStart:'owned epoch',priority:'now',method:'direct',socket:'SECRET',token:'SECRET',content:'SECRET'}},{dir})
  const text=readFileSync(r.file,'utf8'),row=JSON.parse(text);assert.equal(text.includes('SECRET'),false);assert.equal(row.wake.msgId,'synthetic-id');assert.equal(row.wake.executionVerified,false);assert.equal(row.requestId,'rfixture')
 }finally{rmSync(dir,{recursive:true,force:true})}
})
