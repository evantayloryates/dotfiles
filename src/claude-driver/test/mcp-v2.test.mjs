// Actual MCP launcher + detached workers against private synthetic stores.
// The broker executes fixture actions, never a Claude tool or UI action.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const root=mkdtempSync(join(tmpdir(),'claude-mcp-v2-'))
process.env.CLAUDE_DRIVER_STATE_DIR=join(root,'state')
process.env.CLAUDE_DRIVER_APP_SUPPORT=join(root,'app')
process.env.CLAUDE_DRIVER_PROJECTS_DIR=join(root,'projects')
process.env.CLAUDE_DRIVER_PEER_SESSIONS_DIR=join(root,'peers')
process.env.CLAUDE_DRIVER_CALLER_SESSION=''
process.env.CLAUDE_CODE_ENTRYPOINT=''
const state=await import('../lib/state.mjs')
const req=await import('../lib/requests.mjs')
const broker=await import('../lib/broker.mjs')
const {runOp}=await import('../lib/driver.mjs')
const pool=await import('../lib/pool.mjs')
const {withSessionControl}=await import('../lib/controls.mjs')
const sid='local_00000000-0000-4000-8000-000000000002'
const bid='local_00000000-0000-4000-8000-000000000003'
const store=join(root,'app','claude-code-sessions','account','org')
mkdirSync(store,{recursive:true});mkdirSync(process.env.CLAUDE_DRIVER_PEER_SESSIONS_DIR,{recursive:true})
const record={sessionId:sid,title:'mcp fixture',cwd:root,cliSessionId:sid.slice(6),permissionMode:'acceptEdits'}
writeFileSync(join(store,`${sid}.json`),JSON.stringify(record))
writeFileSync(join(store,`${bid}.json`),JSON.stringify({...record,sessionId:bid,title:'fixture broker'}))
const transcript=join(root,'projects',root.replace(/[^A-Za-z0-9]/g,'-'),`${sid.slice(6)}.jsonl`)
mkdirSync(join(transcript,'..'),{recursive:true});writeFileSync(transcript,'')
const recipient=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'})
await new Promise((resolve,reject)=>{recipient.once('spawn',resolve);recipient.once('error',reject)})
const peerFile=join(process.env.CLAUDE_DRIVER_PEER_SESSIONS_DIR,`${recipient.pid}.json`)
const peer=status=>writeFileSync(peerFile,JSON.stringify({pid:recipient.pid,hostSessionId:sid,status}))
peer('busy')
writeFileSync(join(process.env.CLAUDE_DRIVER_PEER_SESSIONS_DIR,`${process.pid}.json`),JSON.stringify({pid:process.pid,hostSessionId:bid,status:'busy'}))
broker.prepareBrokerDir();broker.saveBrokerInfo({sessionId:bid})
let paused=false,busy=false,onStop,failAfterFirst=false
const actions=[]
const beat=setInterval(()=>state.writeJsonAtomic(join(state.BROKER_DIR,'heartbeat.json'),{at:Date.now(),state:'waiting'}),500)
state.writeJsonAtomic(join(state.BROKER_DIR,'heartbeat.json'),{at:Date.now(),state:'waiting'})
const pump=setInterval(async()=>{
 if(paused||busy)return
 busy=true
 try {
  const r=await req.pickupPending();if(!r)return
  const results=[]
  for(let i=0;i<r.ops.length;i++){
   const c=await req.authorizeDispatch(r.id,i)
   if(!c.dispatch){results.push({op:r.ops[i].op,ok:false,error:c.reason});continue}
   if(failAfterFirst&&i>0){results.push({op:c.op,ok:false,error:'synthetic partial batch failure'});continue}
   actions.push({op:c.op,args:c.args})
   const file=join(store,`${sid}.json`),rec=JSON.parse(readFileSync(file))
   if(c.op==='unarchive_session')writeFileSync(file,JSON.stringify({...rec,isArchived:false}))
   if(c.op==='archive_session')writeFileSync(file,JSON.stringify({...rec,isArchived:true}))
   if(c.op==='set_session_title')writeFileSync(file,JSON.stringify({...rec,title:c.args.title,titleSource:'tool'}))
   if(c.op==='stop_session')peer('idle')
   if(c.op==='send_message')peer('busy')
   results.push({op:c.op,ok:true,result:c.op==='send_message'?'delivery: delivered\nmessage_id: 00000000-0000-4000-8000-000000000004':'stopped'})
  }
  state.writeJsonAtomic(req.resultFile(r.id),{id:r.id,results})
  if(results.some(x=>x.op==='stop_session'))onStop?.()
 } finally {busy=false}
},10)
const clients=[]
function client(name,protocol='2025-06-18'){
 const child=spawn('src/claude-driver/bin/claude-driver-mcp',[],{env:process.env,stdio:['pipe','pipe','pipe']})
 const rl=createInterface({input:child.stdout}),pending=new Map();let next=1,stderr=''
 child.stderr.on('data',x=>stderr+=x)
 const send=x=>child.stdin.write(JSON.stringify(x)+'\n')
 rl.on('line',line=>{const x=JSON.parse(line);const p=pending.get(x.id);if(p){pending.delete(x.id);clearTimeout(p.timer);x.error?p.reject(new Error(JSON.stringify(x.error))):p.resolve(x.result)}})
 child.on('exit',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('MCP disconnected: '+stderr.slice(-300)))}pending.clear()})
 const request=(method,params)=>new Promise((resolve,reject)=>{
  const id=next++,timer=setTimeout(()=>{pending.delete(id);reject(new Error('MCP request deadline: '+method))},10000)
  pending.set(id,{resolve,reject,timer});send({jsonrpc:'2.0',id,method,params})
 })
 const c={child,request,send,call:(name,args={})=>request('tools/call',{name,arguments:args}),close:async()=>{
  if(child.exitCode!==null)return
  child.stdin.end();await new Promise(resolve=>child.once('exit',resolve));rl.close()
 }}
 c.ready=request('initialize',{protocolVersion:protocol,clientInfo:{name,version:'fixture-v2'}})
 clients.push(c);return c
}
async function until(fn,ms=5000){const end=Date.now()+ms;while(Date.now()<end){const x=await fn();if(x)return x;await new Promise(r=>setTimeout(r,20))}throw new Error('fixture evidence timeout')}
after(async()=>{clearInterval(pump);clearInterval(beat);for(const c of clients)await c.close();recipient.kill('SIGTERM');await new Promise(resolve=>recipient.once('exit',resolve));rmSync(root,{recursive:true,force:true})})

test('MCP protocol versions expose the same v2 contract and structured errors',async()=>{
 for(const protocol of ['2024-11-05','2025-03-26','2025-06-18']){
  const c=client('protocol-contract',protocol);assert.equal((await c.ready).protocolVersion,protocol)
  const list=await c.request('tools/list',{})
  for(const name of ['driver_submit','driver_wait','driver_cancel','session_events','steer_session','driver_memory_query'])assert.ok(list.tools.some(x=>x.name===name))
  const err=await c.call('driver_wait',{job_id:'bad',timeout_sec:61})
  assert.equal(err.isError,true);assert.equal(err.structuredContent.error.category,'bad_args')
  const guide=await c.request('resources/read',{uri:'claude-driver://guide'})
  assert.match(guide.contents[0].text,/V2 control interface/)
  await c.close()
 }
})
test('concurrent MCP clients cannot interleave stop and replacement for one recipient',async()=>{
 const a=client('harness-a'),b=client('harness-b');await Promise.all([a.ready,b.ready]);actions.length=0
 const out=await Promise.all([a.call('steer_session',{session:sid,mode:'interrupt',message:'PLAN_A'}),b.call('steer_session',{session:sid,mode:'interrupt',message:'PLAN_B'})])
 assert.ok(out.every(x=>!x.isError&&x.structuredContent.stopped===true&&x.structuredContent.applied===false))
 assert.deepEqual(actions.map(x=>x.op),['stop_session','send_message','stop_session','send_message'])
 assert.deepEqual(new Set(actions.filter(x=>x.op==='send_message').map(x=>x.args.message)),new Set(['PLAN_A','PLAN_B']))
 await a.close();await b.close()
})
test('MCP cancellation after durable enqueue prevents fixture dispatch',async()=>{
 const c=client('cancel-before-dispatch');await c.ready;paused=true;actions.length=0
 const id=9001;c.send({jsonrpc:'2.0',id,method:'tools/call',params:{name:'send_message',arguments:{session:sid,message:'MUST_NOT_LAND'}}})
 const r=await until(()=>{for(const p of readdirSync(join(state.BROKER_DIR,'requests'))){const x=state.readJson(join(state.BROKER_DIR,'requests',p),{});if(x.ops?.[0]?.args?.message==='MUST_NOT_LAND')return x}})
 c.send({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:id}})
 await until(()=>req.control(r.id).cancelRequested)
 assert.equal(req.control(r.id).state,'cancelled');paused=false
 assert.equal(await req.pickupPending(),null);assert.equal(actions.length,0)
 await c.close()
})
test('a durable job survives MCP disconnect and is controlled by another harness',async()=>{
 const a=client('original-harness');await a.ready
 const cursor=(await a.call('session_events',{session:sid})).structuredContent.cursor
 const input={operation:'session_wait',arguments:{session:sid,cursor,timeout_sec:30},idempotency_key:'disconnect-fixture'}
 const j=(await a.call('driver_submit',input)).structuredContent;assert.ok(j.jobId)
 await a.close()
 const b=client('replacement-harness');await b.ready
 assert.equal((await b.call('driver_submit',input)).structuredContent.jobId,j.jobId)
 await until(async()=>{const r=(await b.call('driver_job',{job_id:j.jobId})).structuredContent;return r.state==='running'})
 assert.equal((await b.call('driver_wait',{job_id:j.jobId,timeout_sec:0})).structuredContent.state,'running')
 await b.call('driver_cancel',{job_id:j.jobId})
 assert.equal((await b.call('driver_wait',{job_id:j.jobId,timeout_sec:5})).structuredContent.state,'cancelled')
 const rows=(await b.call('driver_memory_query',{topic:'driver_submit',limit:20})).content[0].text
 assert.match(rows,/observation/);assert.equal(rows.includes('MUST_NOT_LAND'),false)
 await b.close()
})
test('cancelling between verified stop and replacement reports the known partial effect',async()=>{
 const controller=new AbortController();actions.length=0;onStop=()=>controller.abort()
 try {
  await assert.rejects(runOp('steer_session',{session:sid,mode:'interrupt',message:'DO_NOT_SEND'},{signal:controller.signal}),e=>e.category==='partial_effect'&&e.detail.stopped===true&&e.detail.replacementSent===false)
  assert.deepEqual(actions.map(x=>x.op),['stop_session'])
 } finally {onStop=null}
})
test('a waiting control keeps its original recipient when another chat takes the old title',async()=>{
 const file=join(store,`${sid}.json`),other='local_00000000-0000-4000-8000-000000000005'
 let release
 const held=withSessionControl(sid,()=>new Promise(r=>release=r))
 await until(()=>release)
 const sending=runOp('send_message',{session:'mcp fixture',message:'BOUND_RECIPIENT'})
 writeFileSync(file,JSON.stringify({...record,title:'renamed while waiting'}))
 writeFileSync(join(store,`${other}.json`),JSON.stringify({...record,sessionId:other}))
 actions.length=0;release();await held
 assert.equal((await sending).sessionId,sid)
 assert.equal(actions[0].args.session_id,sid)
 rmSync(join(store,`${other}.json`));writeFileSync(file,JSON.stringify(record))
})
test('a member cannot be claimed while parking; a partial claim is never returned as ready',async()=>{
 const file=join(store,`${sid}.json`)
 peer('idle');writeFileSync(file,JSON.stringify({...record,cliSessionId:null,permissionMode:'bypassPermissions',isArchived:false}))
 paused=true
 const parking=runOp('pool_release',{session:sid})
 await until(()=>pool.poolOf()[sid]?.state==='parking')
 assert.equal(await pool.claim(root,{title:'must wait'}),null)
 paused=false
 assert.equal((await parking).verified,true)
 const picks=await Promise.all(Array.from({length:8},()=>pool.claim(root,{title:'claimed'})))
 assert.equal(picks.filter(Boolean).length,1)
 await pool.setEntry(sid,{state:'parked',claimedAt:undefined})
 failAfterFirst=true
 try {
  await assert.rejects(runOp('create_session',{folder:root,title:'partial claim fixture',permission_mode:'bypassPermissions',first_message:'MUST_NOT_SEND'}),e=>e.category==='tier_b_failed')
  assert.equal(pool.poolOf()[sid].state,'claimed')
  assert.equal(JSON.parse(readFileSync(file)).isArchived,false)
  await pool.setEntry(sid,{claimedAt:0})
  assert.equal(await pool.claim(root,{title:'never replay'}),null)
  assert.equal(pool.poolOf()[sid].state,'claimed')
 } finally {failAfterFirst=false;await pool.setEntry(sid,null)}
})
