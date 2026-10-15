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
