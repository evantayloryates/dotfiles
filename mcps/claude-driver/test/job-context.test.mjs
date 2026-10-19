import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const root=mkdtempSync(join(tmpdir(),'claude-job-context-'))
process.env.CLAUDE_DRIVER_STATE_DIR=root
const {OPS,runOp}=await import('../src/lib/driver.mjs')
test.after(()=>rmSync(root,{recursive:true,force:true}))
test('operation dispatcher forwards trusted durable job identity and rejects malformed context',async()=>{
 const op=OPS.find(o=>o.name==='driver_memory_query'),original=op.run,id='j'+'a'.repeat(32)
 op.run=(_args,ctx)=>({jobId:ctx.jobId})
 try{
  assert.equal((await runOp(op.name,{}, {jobId:id})).jobId,id)
  assert.equal((await runOp(op.name,{})).jobId,undefined)
  await assert.rejects(runOp(op.name,{}, {jobId:'arbitrary'}),e=>e.category==='bad_args')
 }finally{op.run=original}
})
