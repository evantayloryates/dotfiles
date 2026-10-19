import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,rmSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const root=mkdtempSync(join(tmpdir(),'claude-missing-record-job-'))
for(const [key,name] of Object.entries({CLAUDE_DRIVER_STATE_DIR:'state',CLAUDE_DRIVER_APP_SUPPORT:'app',CLAUDE_DRIVER_PROJECTS_DIR:'projects',CLAUDE_DRIVER_PEER_SESSIONS_DIR:'peers'})){
 process.env[key]=join(root,name);mkdirSync(process.env[key],{recursive:true})
}
const {submitJob,waitJob,jobFile}=await import('../src/lib/jobs.mjs')
const session='local_00000000-0000-4000-8000-000000000001',sha='a'.repeat(64),service='b'.repeat(32)
test.after(()=>rmSync(root,{recursive:true,force:true}))
test('missing-record recovery and offline retirement reach durable workers without a saved record, retain identity and reattach',async()=>{
 const cases=[
  ['broker_service_restore_missing_record',{role:'primary',expected_enrollment_sha256:sha,expected_plan_sha256:sha}],
  ['broker_service_rebuild_missing_record',{role:'primary',expected_enrollment_sha256:sha,expected_plan_sha256:sha}],
  ['broker_service_quiesce',{service_id:service,offline:true}],
  ['broker_service_retire',{service_id:service,offline:true}],
 ]
 for(const [operation,extra] of cases){
  const args={session,experimental:true,...extra},submission={operation,arguments:args,idempotency_key:operation,timeout_sec:10}
  const job=await submitJob(submission)
  assert.match(job.jobId,/^j[a-f0-9]{32}$/)
  assert.equal(JSON.parse(readFileSync(jobFile(job.jobId))).args.session,session)
  const terminal=await waitJob(job.jobId,{timeoutSec:20,includeResult:true})
  // No retained ownership exists in this isolated store: the operation must
  // refuse in its own worker rather than gaining authority from submission.
  assert.equal(terminal.state,'failed')
  assert.notEqual(terminal.error?.category,'worker_lost')
  const again=await submitJob(submission)
  assert.equal(again.jobId,job.jobId);assert.equal(again.reused,true)
  for(const alias of ['self','scratch','local_bad'])await assert.rejects(submitJob({...submission,idempotency_key:operation+alias,arguments:{...args,session:alias}}),e=>e.category==='bad_args')
 }
})
test('ordinary operations and live retirement still require a saved session record',async()=>{
 for(const [operation,extra] of [['get_session',{}],['broker_service_quiesce',{service_id:service,experimental:true}],['broker_service_retire',{service_id:service,experimental:true,offline:false}]])
  await assert.rejects(submitJob({operation,arguments:{session,...extra},idempotency_key:'ordinary-'+operation}),e=>e.category==='not_found')
})
