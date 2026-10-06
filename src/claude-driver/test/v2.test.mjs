import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, rmSync, statSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
const root = mkdtempSync(join(tmpdir(), 'claude-driver-v2-'))
process.env.CLAUDE_DRIVER_STATE_DIR = join(root, 'state')
process.env.CLAUDE_DRIVER_APP_SUPPORT = join(root, 'app')
process.env.CLAUDE_DRIVER_PROJECTS_DIR = join(root, 'projects')
process.env.CLAUDE_DRIVER_PEER_SESSIONS_DIR = join(root, 'peers')
mkdirSync(process.env.CLAUDE_DRIVER_PEER_SESSIONS_DIR,{recursive:true})
const state = await import('../lib/state.mjs')
const req = await import('../lib/requests.mjs')
const jobs = await import('../lib/jobs.mjs')
const events = await import('../lib/events.mjs')
const { runOp, validateOp } = await import('../lib/driver.mjs')
const mem = await import('../lib/memory.mjs')
const { withSessionControl } = await import('../lib/controls.mjs')
let next = 1
function request(expiresAt = Date.now() + 60_000) {
  const r = { id: `test-${next++}`, createdAt: new Date().toISOString(), expiresAt, ops: [{ op: 'get_session', args: {} }] }
  req.enqueue(r); return r
}
const sid = 'local_00000000-0000-4000-8000-000000000001'
const cli = sid.replace('local_', '')
const cwd = join(root, 'fixture')
mkdirSync(join(root, 'app', 'claude-code-sessions', 'a', 'o'), {recursive: true})
writeFileSync(join(root, 'app', 'claude-code-sessions', 'a', 'o', `${sid}.json`), JSON.stringify({sessionId:sid,cliSessionId:cli,cwd,title:'synthetic v2 fixture'}))
const transcript = join(root, 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'), `${cli}.jsonl`)
mkdirSync(join(transcript, '..'), {recursive:true}); writeFileSync(transcript, '')
after(()=>rmSync(root,{recursive:true,force:true}))

test('UI quarantine blocks before loading the input bridge and rereads incident state', async()=> {
 const policy=await import('../lib/ui-policy.mjs')
 const {computerUse}=await import('../lib/tierc.mjs')
 assert.equal(policy.uiPolicy().blocked,false)
 state.writeJsonAtomic(policy.UI_QUARANTINE,{blocked:true,reason:'physical keyboard incident'})
 await assert.rejects(computerUse('MUST NOT DRIVE UI'),e=>e.category==='ui_quarantined')
 writeFileSync(policy.UI_QUARANTINE,'malformed')
 assert.equal(policy.uiPolicy().blocked,true)
 state.writeJsonAtomic(policy.UI_QUARANTINE,{blocked:false})
 assert.equal(policy.uiPolicy().blocked,false)
 rmSync(policy.UI_QUARANTINE)
})

test('expired requests cannot be picked up', async()=> {
  const r=request(Date.now()-1); assert.equal(await req.pickupPending(), null)
  assert.equal(req.validatedResult(r).state,'expired'); assert.equal(req.control(r.id).dispatched.length,0)
})
test('cancellation before pickup guarantees no dispatch', async()=> {
  const r=request(); const c=await req.cancelRequest(r.id)
  assert.equal(c.dispatched,false); assert.equal(await req.pickupPending(),null)
  assert.equal((await req.authorizeDispatch(r.id,0)).dispatch,false)
})
test('parallel pickups claim once and dispatch checkpoint cannot be repeated', async()=> {
  const r=request(); const picks=await Promise.all(Array.from({length:12},()=>req.pickupPending()))
  assert.equal(picks.filter(Boolean).length,1)
  assert.equal((await req.authorizeDispatch(r.id,0)).dispatch,true)
  assert.equal((await req.authorizeDispatch(r.id,0)).dispatch,false)
  assert.equal((await req.cancelRequest(r.id)).state,'outcome_unknown')
})
test('cancelling after pickup but before dispatch still prevents effect', async()=> {
  const r=request(); assert.equal((await req.pickupPending()).id,r.id)
  await req.cancelRequest(r.id); assert.equal((await req.authorizeDispatch(r.id,0)).dispatch,false)
})
test('expiry is checked again at dispatch, after pickup', async()=> {
  const r=request(Date.now()+50); await req.pickupPending(); await new Promise(r=>setTimeout(r,60))
  assert.equal((await req.authorizeDispatch(r.id,0)).reason,'expired')
})
test('result id, cardinality, op and ok type are checked', ()=> {
  const r=request()
  for (const result of [{id:'wrong',results:[]},{id:r.id,results:[]},{id:r.id,results:[null]},{id:r.id,results:[{op:'other',ok:true}]},{id:r.id,results:[{op:'get_session',ok:'yes'}]}]) {
    state.writeJsonAtomic(req.resultFile(r.id),result); assert.throws(()=>req.validatedResult(r),e=>e.category==='broker_bad_result')
  }
  state.writeJsonAtomic(req.resultFile(r.id),{id:r.id,results:[{op:'get_session',ok:true,result:{}}]})
  assert.equal(req.validatedResult(r).results[0].ok,true)
})
test('malformed results cannot make a dispatched cancellation look completed', async()=> {
  const r=request(); await req.pickupPending(); await req.authorizeDispatch(r.id,0)
  state.writeJsonAtomic(req.resultFile(r.id),{id:r.id,results:[null]})
  assert.equal((await req.cancelRequest(r.id)).state,'outcome_unknown')
})
test('protocol 5 refuses an invented success without its dispatch checkpoint', async()=> {
  const r={id:`test-${next++}`,protocol:5,expiresAt:Date.now()+60000,ops:[{op:'get_session',args:{}}]};req.enqueue(r)
  state.writeJsonAtomic(req.resultFile(r.id),{id:r.id,results:[{op:'get_session',ok:true}]})
  assert.throws(()=>req.validatedResult(r),e=>e.category==='broker_bad_result')
  assert.equal((await req.cancelRequest(r.id)).state,'cancelled')
})
test('recipient controls serialize stop and replacement, including nested controls', async()=> {
  const seen=[]
  await Promise.all(Array.from({length:8},(_,i)=>withSessionControl(sid,async()=> {
    seen.push(`stop-${i}`)
    await new Promise(r=>setTimeout(r,5))
    await withSessionControl(sid,()=>seen.push(`send-${i}`))
  })))
  for(let i=0;i<seen.length;i+=2)assert.equal(seen[i+1].replace('send','stop'),seen[i])
})
test('completed result wins over late cancellation', async()=> {
  const r=request(); state.writeJsonAtomic(req.resultFile(r.id),{id:r.id,results:[{op:'get_session',ok:true}]})
  assert.equal((await req.cancelRequest(r.id)).resultAvailable,true)
})
test('cancelled lock waiter cannot enter its callback', async()=> {
  let release; const held=state.withLock('cancel-test',()=>new Promise(r=>release=r));
  while(!release) await new Promise(r=>setTimeout(r,5))
  const controller=new AbortController(); let entered=false
  const queued=state.withLock('cancel-test',()=>entered=true,{signal:controller.signal})
  controller.abort(); release(); await held
  await assert.rejects(queued,e=>e.category==='cancelled'); assert.equal(entered,false)
})
test('a live lock holder cannot be stolen because of age', async()=> {
  const dir=join(state.LOCK_DIR,'live-old.lock'); mkdirSync(dir)
  writeFileSync(join(dir,'owner'),JSON.stringify({pid:process.pid,token:'live'})); utimesSync(dir,new Date(0),new Date(0))
  await assert.rejects(state.withLock('live-old',()=>assert.fail('stolen'),{timeoutMs:20}),e=>e.category==='lock_timeout')
  rmSync(dir,{recursive:true})
})
test('a dead lock holder is recovered', async()=> {
  const dir=join(state.LOCK_DIR,'dead.lock'); mkdirSync(dir);writeFileSync(join(dir,'owner'),JSON.stringify({pid:2147483647,token:'dead'}))
  assert.equal(await state.withLock('dead',()=>42),42)
})
test('independent processes retain every concurrent registry update', async()=> {
  const code="import {updateRegistry} from './src/claude-driver/lib/state.mjs'; await updateRegistry(r=>r.sessions[process.argv[1]]={owned:true})"
  await Promise.all(Array.from({length:12},(_,i)=>new Promise((resolve,reject)=> {
    const p=spawn(process.execPath,['--input-type=module','-e',code,`parallel-${i}`],{env:process.env,stdio:'ignore'})
    p.once('error',reject);p.once('exit',c=>c===0?resolve():reject(new Error(`child exit ${c}`)))
  })))
  assert.equal(Object.keys(state.loadRegistry().sessions).filter(k=>k.startsWith('parallel-')).length,12)
})
test('schema validation rejects unknown, missing, wrong typed, enum and unbounded arguments', ()=> {
  for (const [op,args] of [['send_message',{session:sid}],['driver_wait',{job_id:'x',timeout_sec:61}],['driver_wait',{job_id:'x',timeout_sec:-1}],['driver_wait',{job_id:'x',timeout_sec:NaN}],['get_session',{session:3}],['get_session',{session:sid,extra:true}],['set_session_config',{session:sid,effort:'bad'}]]) assert.throws(()=>validateOp(op,args),e=>e.category==='bad_args')
})
test('ids cannot traverse state directories', async()=> {
  assert.throws(()=>req.requestFile('../escape'));assert.throws(()=>jobs.jobFile('../escape'))
  await assert.rejects(state.withLock('../escape',()=>{}))
})
test('first_message and nested prompts are redacted', ()=> {
  const out=state.redactArgs({first_message:'SECRET',arguments:{message:'SECRET'}})
  assert.equal(JSON.stringify(out).includes('SECRET'),false)
})
test('shared memory stores metadata; harness lessons remain candidates', ()=> {
  mem.operationMemory({op:'send_message',outcome:'error',errorCategory:'outcome_unknown',args:{message:'SECRET'},error:'SECRET',ms:10})
  mem.recordMemory({topic:'synthetic',lesson:'candidate',evidence:'fixture'})
  assert.equal(readFileSync(mem.MEMORY_FILE,'utf8').includes('SECRET'),false)
  assert.equal(mem.queryMemory({topic:'synthetic'})[0].status,'candidate')
  assert.equal(statSync(mem.MEMORY_FILE).mode & 0o777,0o600)
})
test('legacy learning entry points use the canonical shared memory without duplicate candidate files',async()=> {
  assert.equal(await runOp('driver_record_learning',{learning:'compatibility lesson',evidence:'synthetic alias fixture'}),'recorded as pending')
  const row=mem.queryMemory({topic:'legacy-learning'})[0]
  assert.equal(row.status,'candidate');assert.equal(row.lesson,'compatibility lesson')
  const old=await runOp('driver_learnings',{pending_only:true})
  assert.equal(old.pending.filter(x=>x.learning==='compatibility lesson').length,1)
  assert.equal(state.readJsonl(state.PENDING_LEARNINGS).length,0)
})
test('shared memory queries span reverse-read boundaries without loading oversized records',()=> {
  const file=join(root,'reverse.jsonl')
  const rows=Array.from({length:600},(_,i)=>({i,text:'世界'.repeat(80)}))
  writeFileSync(file,rows.map(x=>JSON.stringify(x)).join('\n'))
  assert.deepEqual([...state.reverseJsonl(file)],rows.slice().reverse())
  assert.deepEqual(state.readJsonl(file,{tail:3}),rows.slice(-3))
  appendFileSync(file,'\n'+JSON.stringify({oversized:'x'.repeat(1100000)})+'\n'+JSON.stringify({i:'latest'})+'\n')
  const got=[...state.reverseJsonl(file)]
  assert.equal(got.length,601);assert.equal(got[0].i,'latest');assert.equal(got[1].i,599)
  for(let i=0;i<300;i++)mem.recordMemory({topic:i%2?'odd':'even',lesson:`row-${i}`,evidence:'synthetic scale fixture'})
  assert.deepEqual(mem.queryMemory({topic:'odd',limit:3}).map(x=>x.lesson),['row-299','row-297','row-295'])
})
test('idempotent submission across 12 concurrent callers starts one worker', async()=> {
  const out=await Promise.all(Array.from({length:12},()=>jobs.submitJob({operation:'get_session',idempotency_key:'same',arguments:{session:sid}})))
  assert.equal(new Set(out.map(x=>x.jobId)).size,1)
  const j=await jobs.waitJob(out[0].jobId,{timeoutSec:5});assert.equal(j.state,'completed')
  await assert.rejects(jobs.submitJob({operation:'get_session',idempotency_key:'same',arguments:{session:'different'}}),e=>e.category==='idempotency_conflict')
  assert.equal(statSync(jobs.jobFile(j.jobId)).mode & 0o777,0o600)
})
test('another CLI process can reattach to the durable job and read its result', async()=> {
  const j=await jobs.submitJob({operation:'get_session',arguments:{session:sid}})
  await jobs.waitJob(j.jobId,{timeoutSec:5})
  const r=spawnSync(process.execPath,['src/claude-driver/cli.mjs','driver_job','--job-id',j.jobId,'--include-result','true'],{encoding:'utf8',env:process.env})
  assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).state,'completed')
})
test('job submission binds mutable session titles and reattaches after rename', async()=> {
  const title='synthetic v2 fixture'
  const input={operation:'get_session',arguments:{session:title},idempotency_key:'title-binding'}
  const j=await jobs.submitJob(input)
  assert.equal(state.readJson(jobs.jobFile(j.jobId),{}).args.session,sid)
  const file=join(root,'app','claude-code-sessions','a','o',`${sid}.json`)
  const rec=JSON.parse(readFileSync(file));writeFileSync(file,JSON.stringify({...rec,title:'renamed fixture'}))
  assert.equal((await jobs.submitJob(input)).jobId,j.jobId)
  assert.equal((await jobs.waitJob(j.jobId,{timeoutSec:5})).state,'completed')
})
test('a detached worker retains the desktop caller self-protection gate', async()=> {
  process.env.CLAUDE_DRIVER_CALLER_SESSION=sid
  try {
    const j=await jobs.submitJob({operation:'stop_session',arguments:{session:'self'}})
    const done=await jobs.waitJob(j.jobId,{timeoutSec:5})
    assert.equal(done.state,'failed');assert.equal(done.error.category,'gate')
  } finally { delete process.env.CLAUDE_DRIVER_CALLER_SESSION }
})
test('timed-out waits leave the job running, cancellation ends the wait operation', async()=> {
  const cursor=events.sessionEvents({session:sid}).cursor
  const j=await jobs.submitJob({operation:'session_wait',arguments:{session:sid,cursor,timeout_sec:30}})
  let snapshot; do { snapshot=await jobs.inspectJob(j.jobId); await new Promise(r=>setTimeout(r,10)) } while(snapshot.state==='queued')
  assert.equal((await jobs.waitJob(j.jobId,{timeoutSec:0})).state,'running')
  await jobs.cancelJob(j.jobId);assert.equal((await jobs.waitJob(j.jobId,{timeoutSec:5})).state,'cancelled')
})
test('a killed worker becomes outcome_unknown and idempotent retry never replays', async()=> {
  const j=await jobs.submitJob({operation:'session_wait',arguments:{session:sid,timeout_sec:30},idempotency_key:'kill'})
  let raw; do { raw=state.readJson(jobs.jobFile(j.jobId),{});await new Promise(r=>setTimeout(r,10)) } while(!raw.startedAt)
  process.kill(raw.workerPid,'SIGKILL');await new Promise(r=>setTimeout(r,100))
  assert.equal((await jobs.inspectJob(j.jobId)).state,'outcome_unknown')
  const retry=await jobs.submitJob({operation:'session_wait',arguments:{session:sid,timeout_sec:30},idempotency_key:'kill'})
  assert.equal(retry.reused,true);assert.equal(retry.state,'outcome_unknown')
})
test('initial observation excludes history; subsequent cursor gives bounded unicode text without thinking/tools data', ()=> {
  const first=events.sessionEvents({session:sid,include_text:true});assert.equal(first.events.length,0)
  appendFileSync(transcript,JSON.stringify({type:'assistant',uuid:'a',message:{stop_reason:'end_turn',content:[{type:'thinking',thinking:'SECRET'},{type:'tool_use',name:'Bash',input:{command:'SECRET'}},{type:'text',text:'hello 世界'}]}})+'\n')
  const next=events.sessionEvents({session:sid,cursor:first.cursor,include_text:true})
  assert.equal(next.events[0].text,'hello 世界');assert.equal(JSON.stringify(next).includes('SECRET'),false)
  assert.equal(events.sessionEvents({session:sid,cursor:next.cursor}).events.length,0)
  assert.throws(()=>events.sessionEvents({session:sid,cursor:Buffer.from(JSON.stringify({session:'another',identity:'x',offset:0})).toString('base64url')}),e=>e.category==='cursor_reset')
})
test('partial transcript lines are retried without advancing cursor', ()=> {
  const first=events.sessionEvents({session:sid});const line=JSON.stringify({type:'assistant',message:{content:'partial'}})
  appendFileSync(transcript,line.slice(0,10));const partial=events.sessionEvents({session:sid,cursor:first.cursor})
  assert.equal(partial.cursor,first.cursor)
  appendFileSync(transcript,line.slice(10)+'\n');assert.equal(events.sessionEvents({session:sid,cursor:partial.cursor}).events.length,1)
})
test('transcript truncation is explicitly reported', ()=> {
  const c=events.sessionEvents({session:sid}).cursor;writeFileSync(transcript,'')
  assert.throws(()=>events.sessionEvents({session:sid,cursor:c}),e=>e.category==='cursor_reset')
})
test('status changes wake an observation wait without inventing a task-success reply',async()=> {
  const file=join(process.env.CLAUDE_DRIVER_PEER_SESSIONS_DIR,`${process.pid}.json`)
  writeFileSync(file,JSON.stringify({pid:process.pid,hostSessionId:sid,status:'busy'}))
  const c=events.sessionEvents({session:sid}).cursor
  writeFileSync(file,JSON.stringify({pid:process.pid,hostSessionId:sid,status:'idle'}))
  const at=Date.now(),r=await events.waitSession({session:sid,cursor:c,timeout_sec:5})
  assert.equal(r.previousStatus,'busy');assert.equal(r.status,'idle');assert.equal(r.statusChanged,true)
  assert.deepEqual(r.events,[]);assert.ok(Date.now()-at<1000)
})
test('malformed transcript entries do not prevent subsequent valid observation',()=> {
  const first=events.sessionEvents({session:sid})
  appendFileSync(transcript,'null\n'+JSON.stringify({type:'assistant',message:{content:[null,{type:'text',text:{bad:true}},{type:'text',text:'valid reply'}]}})+'\n')
  assert.equal(events.sessionEvents({session:sid,cursor:first.cursor,include_text:true}).events[0].text,'valid reply')
})
