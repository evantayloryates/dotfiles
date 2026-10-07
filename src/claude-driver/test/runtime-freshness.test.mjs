import {test,after} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,cpSync,appendFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const root=mkdtempSync(join(tmpdir(),'claude-runtime-'))
const clone=join(root,'driver');cpSync(new URL('..',import.meta.url),clone,{recursive:true})
process.env.CLAUDE_DRIVER_STATE_DIR=join(root,'state')
process.env.CLAUDE_DRIVER_APP_SUPPORT=join(root,'app')
process.env.CLAUDE_DRIVER_PROJECTS_DIR=join(root,'projects')
process.env.CLAUDE_DRIVER_PEER_SESSIONS_DIR=join(root,'peers')
const {runOp}=await import(join(clone,'lib/driver.mjs'))
const {runtimeState}=await import(join(clone,'lib/build.mjs'))
const {jobFile}=await import(join(clone,'lib/jobs.mjs'))
const {writeJsonAtomic}=await import(join(clone,'lib/state.mjs'))
const loaded=runtimeState()
appendFileSync(join(clone,'scripts/broker-wait.mjs'),'\n// synthetic source change\n')
test('running service reports stale code and rejects effects before resolving a recipient',async()=>{
 assert.equal(loaded.restartRequired,false)
 const status=await runOp('driver_status');assert.equal(status.restartRequired,true)
 assert.equal(status.runtimeBuild,loaded.runtimeBuild);assert.notEqual(status.sourceBuild,status.runtimeBuild)
 for(const [name,args] of [['send_message',{session:'missing',message:'synthetic'}],['driver_submit',{operation:'send_message',arguments:{session:'missing',message:'synthetic'}}],['broker_status',{revive:true,warm_only:true}],['window_state',{precise:true}]])
  await assert.rejects(runOp(name,args),e=>e.category==='runtime_stale'&&e.detail.dispatched===false&&e.detail.retrySafe===true)
 const broker=await runOp('broker_status',{});assert.equal(broker.configured,false)
})
test('stale or missing source preserves job inspection/cancellation and fails closed on effects',async()=>{
 const id='j'+'a'.repeat(32);writeJsonAtomic(jobFile(id),{id,operation:'send_message',state:'queued',args:{session:'missing'},createdAt:Date.now(),expiresAt:Date.now()+60000})
 assert.equal((await runOp('driver_job',{job_id:id})).state,'queued')
 assert.equal((await runOp('driver_cancel',{job_id:id})).state,'cancelled')
 rmSync(join(clone,'cli.mjs'));assert.equal(runtimeState().sourceBuild,null)
 await assert.rejects(runOp('open_session',{session:'missing'}),e=>e.category==='runtime_stale')
 assert.equal((await runOp('driver_status')).restartRequired,true)
})
after(()=>rmSync(root,{recursive:true,force:true}))
