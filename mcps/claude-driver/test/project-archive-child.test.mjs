import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,rmSync,readFileSync,readdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const root=mkdtempSync(join(tmpdir(),'claude-project-child-'))
for(const [key,name] of Object.entries({CLAUDE_DRIVER_STATE_DIR:'state',CLAUDE_DRIVER_APP_SUPPORT:'app',CLAUDE_DRIVER_PROJECTS_DIR:'projects',CLAUDE_DRIVER_PEER_SESSIONS_DIR:'peers'})){process.env[key]=join(root,name);mkdirSync(process.env[key],{recursive:true})}
const {runProjectArchiveChild,runProjectArchiveBatch,projectArchiveContexts}=await import('../src/lib/project-archive-control.mjs')
const {inspectJob}=await import('../src/lib/jobs.mjs')
const {writeJsonAtomic}=await import('../src/lib/state.mjs')
const ids=['local_11111111-1111-4111-8111-111111111111','local_22222222-2222-4222-8222-222222222222'],parent='j'+'a'.repeat(32),child='j'+'b'.repeat(32),entries=projectArchiveContexts(ids,parent)
const store=join(root,'app','claude-code-sessions','account','org');mkdirSync(store,{recursive:true})
for(const id of ids)writeJsonAtomic(join(store,id+'.json'),{sessionId:id,cliSessionId:id.slice(6),title:'disposable project child',cwd:root,isArchived:false,permissionMode:'acceptEdits'})
writeJsonAtomic(join(root,'state','session-management-controller.json'),{schemaVersion:1,controllerSession:'local_33333333-3333-4333-8333-333333333333',receiverCwd:join(root,'missing-controller'),enrolledAt:1})
test.after(()=>rmSync(root,{recursive:true,force:true}))
function context(){const file=join(root,'ledger-'+Math.random()+'.json'),ledger={jobId:parent,children:{}};return {file,ledger,save:()=>writeJsonAtomic(file,ledger)}}
test('project archives use actual scheduler child jobs and preserve original handles when controller recovery refuses',async()=>{
 const c=context();let completed=0
 await assert.rejects(runProjectArchiveBatch(entries,{preflight:async()=>{},guard:async()=>{},record:async()=>{},archive:e=>runProjectArchiveChild(c,e),verify:async()=>{completed++},final:async()=>{completed++}}))
 const children=Object.values(JSON.parse(readFileSync(c.file)).children);assert.equal(children.length,1);const saved=children[0]
 assert.match(saved.jobId,/^j[a-f0-9]{32}$/);assert.notEqual(saved.jobId,entries[0].contextId)
 const actual=await inspectJob(saved.jobId,{includeResult:true});assert.equal(actual.operation,'archive_session');assert.equal(actual.state,'failed');assert.equal(actual.args.session,ids[0]);assert.equal(actual.args.reason,'claude-driver project archive');assert.equal(actual.error.category,'session_management_controller_record_missing');assert.equal(actual.error.detail.targetDispatched,false)
 assert.equal(completed,0);const count=()=>readdirSync(join(root,'state','jobs')).filter(n=>n.endsWith('.json')).length;assert.equal(count(),1)
 await assert.rejects(runProjectArchiveChild(c,entries[0]));assert.equal(count(),1)
 for(const id of ids)assert.equal(JSON.parse(readFileSync(join(store,id+'.json'))).isArchived,false)
})
test('unknown submission or observation cannot start another target or resubmit the same project child',async()=>{
 for(const mode of ['submit-lost','wait-lost','unknown','wrong-job']){
  const c=context();let submits=0
  const run=async(op,args)=>{if(op==='driver_submit'){submits++;assert.equal(args.operation,'archive_session');assert.equal(args.arguments.session,ids[0]);assert.equal(Object.values(JSON.parse(readFileSync(c.file)).children)[0].phase,'before-submit');if(mode==='submit-lost')throw Error('lost submission observation');return {jobId:child}}if(mode==='wait-lost')throw Error('lost observation');return {jobId:mode==='wrong-job'?parent:child,operation:'archive_session',state:'outcome_unknown'}}
  await assert.rejects(runProjectArchiveChild(c,entries[0],{run}));assert.equal(submits,1)
  const saved=Object.values(c.ledger.children)[0];assert.equal(saved.submission.idempotency_key,'project-archive:'+parent+':'+ids[0]);assert.equal(saved.jobId,mode==='submit-lost'?undefined:child)
  await assert.rejects(runProjectArchiveChild(c,entries[0],{run}));assert.equal(submits,1)
 }
})
