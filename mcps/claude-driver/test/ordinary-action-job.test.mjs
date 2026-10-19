import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const root=mkdtempSync(join(tmpdir(),'claude-ordinary-action-job-'))
for(const [key,name] of Object.entries({CLAUDE_DRIVER_STATE_DIR:'state',CLAUDE_DRIVER_APP_SUPPORT:'app',CLAUDE_DRIVER_PROJECTS_DIR:'projects',CLAUDE_DRIVER_PEER_SESSIONS_DIR:'peers'})){process.env[key]=join(root,name);mkdirSync(process.env[key],{recursive:true})}
const {submitJob,waitJob,jobFile,inspectJob}=await import('../src/lib/jobs.mjs')
const {withSessionControl}=await import('../src/lib/controls.mjs')
const {writeJsonAtomic}=await import('../src/lib/state.mjs')
const {ordinaryOperationIntentSha256}=await import('../src/lib/ordinary-action-intent.mjs')
const {RUNTIME_BUILD}=await import('../src/lib/build.mjs')
const target='local_22222222-2222-4222-8222-222222222222',controller='local_11111111-1111-4111-8111-111111111111',dir=join(root,'app','claude-code-sessions','a','o')
mkdirSync(dir,{recursive:true})
const file=join(dir,target+'.json'),record={sessionId:target,cliSessionId:target.slice(6),title:'original recipient alias',cwd:join(root,'ordinary'),isArchived:false,permissionMode:'acceptEdits'}
writeJsonAtomic(file,record)
writeJsonAtomic(join(root,'state','session-management-controller.json'),{schemaVersion:1,controllerSession:controller,receiverCwd:join(root,'controller'),enrolledAt:1})
test.after(()=>rmSync(root,{recursive:true,force:true}))
test('durable submission freezes recipient before a delayed worker and reattach never re-resolves or recaptures',async()=>{
 const request={operation:'steer_session',arguments:{session:record.title,message:'private original message',mode:'queue'},idempotency_key:'ordinary-snapshot',timeout_sec:20};let submitted
 await withSessionControl(target,async()=>{
  submitted=await submitJob(request)
  const privateJob=JSON.parse(readFileSync(jobFile(submitted.jobId))),snapshot=privateJob.ordinaryActionIntent
  assert.equal(snapshot.binding.sessionId,target);assert.deepEqual(snapshot.recipient,{kind:'no-peer'});assert.equal(snapshot.operation,'steer_session')
  const inspected=await inspectJob(submitted.jobId);assert.equal(inspected.args.message,'<24 chars>');assert.equal(JSON.stringify(inspected).includes(request.arguments.message),false)
  assert.equal(inspected.operationIntentSha256,ordinaryOperationIntentSha256('steer_session',privateJob.args));assert.deepEqual(inspected.ordinaryActionIntent,snapshot)
  writeJsonAtomic(file,{...record,title:'changed alias',cwd:join(root,'new-recipient-context')})
  const reattached=await submitJob(request);assert.equal(reattached.jobId,submitted.jobId);assert.equal(reattached.reused,true);assert.deepEqual(reattached.ordinaryActionIntent,snapshot)
 })
 const terminal=await waitJob(submitted.jobId,{timeoutSec:25})
 assert.equal(terminal.state,'failed');assert.equal(terminal.error.category,'ordinary_recipient_changed');assert.equal(terminal.error.detail.targetDispatched,false)
 assert.equal(terminal.operationIntentSha256,terminal.ordinaryActionIntent.intentSha256)
})
test('a worker cannot recapture routing when its submission snapshot was lost',()=>{
 const id='j'+'f'.repeat(32)
 writeJsonAtomic(jobFile(id),{id,operation:'send_message',args:{session:target,message:'test'},runtimeBuild:RUNTIME_BUILD,harness:'synthetic',state:'queued',createdAt:Date.now(),expiresAt:Date.now()+15000})
 const r=spawnSync(process.execPath,[fileURLToPath(new URL('../src/scripts/job-worker.mjs',import.meta.url)),id],{env:process.env,encoding:'utf8',timeout:5000});assert.equal(r.status,0,r.stderr)
 const j=JSON.parse(readFileSync(jobFile(id)));assert.equal(j.state,'failed');assert.equal(j.error.category,'ordinary_action_snapshot_missing');assert.equal(j.error.detail.targetDispatched,false)
})
