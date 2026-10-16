import {test,after} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:net'
import {execFileSync,spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {mkdtempSync,mkdirSync,writeFileSync,appendFileSync,rmSync,readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
const root=mkdtempSync('/tmp/direct-recipient-'),peers=join(root,'peers'),app=join(root,'app'),socket=join(root,'p.sock'),cli='00000000-0000-4000-8000-000000000001',sid='local_'+cli
Object.assign(process.env,{CLAUDE_DRIVER_STATE_DIR:join(root,'state'),CLAUDE_DRIVER_PROJECTS_DIR:join(root,'projects'),CLAUDE_DRIVER_APP_SUPPORT:app,CLAUDE_DRIVER_PEER_SESSIONS_DIR:peers,CLAUDE_DRIVER_CALLER_SESSION:'',CLAUDE_CODE_ENTRYPOINT:''})
const {sendDirectRecipient}=await import('../lib/direct-recipient.mjs'),{transcriptPath}=await import('../lib/peer-direct.mjs'),{inspectPeerSend}=await import('../lib/peer-send-ledger.mjs')
const start=execFileSync('/bin/ps',['-o','lstart=','-p',String(process.pid)],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',LC_ALL:'C',TZ:'UTC'}}).trim()
const peer={pid:process.pid,procStart:start,hostSessionId:sid,sessionId:cli,cwd:root,entrypoint:'claude-desktop',peerProtocol:1,version:'2.1.299',messagingSocketPath:socket,status:'idle'}
mkdirSync(peers);const folder=join(app,'claude-code-sessions','a','o');mkdirSync(folder,{recursive:true});const recordFile=join(folder,sid+'.json'),record={sessionId:sid,cliSessionId:cli,cwd:root,title:'synthetic direct recipient',permissionMode:'acceptEdits'}
writeFileSync(recordFile,JSON.stringify(record));const peerFile=join(peers,process.pid+'.json');writeFileSync(peerFile,JSON.stringify(peer));writeFileSync(join(peers,process.pid+'.'+createHash('sha256').update(socket).digest('hex')+'.key'),JSON.stringify({peerToken:'a'.repeat(32),procStart:start}),{mode:0o600})
const journal=transcriptPath(peer);mkdirSync(join(journal,'..'),{recursive:true});writeFileSync(journal,'')
let frames=0,receive=true,abortOnFrame,lastMessageId,receiptDelayMs=0;const receiptTimers=new Set()
const server=createServer({allowHalfOpen:true},s=>{let buf='';s.on('error',()=>{});s.on('data',d=>{buf+=d;const lines=buf.split('\n');for(const line of lines.slice(0,-1)){let f;try{f=JSON.parse(line)}catch{continue}if(f.type==='user'){frames++;lastMessageId=f.msg_id;if(receive){const receiptId=frames,write=()=>appendFileSync(journal,JSON.stringify({type:'user',uuid:'receipt-'+receiptId,sessionId:cli,origin:{kind:'peer',msg_id:f.msg_id},timestamp:new Date().toISOString(),message:{content:'PRIVATE_PROMPT'}})+'\n');if(receiptDelayMs){const timer=setTimeout(()=>{receiptTimers.delete(timer);write()},receiptDelayMs);receiptTimers.add(timer)}else write();}abortOnFrame?.();s.end()}}buf=lines.at(-1)})})
await new Promise(r=>server.listen(socket,r));after(async()=>{for(const timer of receiptTimers)clearTimeout(timer);await new Promise(r=>server.close(r));rmSync(root,{recursive:true,force:true})})
test('real synthetic socket and native journal produce one receipt; reattach and conflicting payload never resend',async()=>{
 const args={operationId:'received',session:sid,message:'PRIVATE_PROMPT',timeoutMs:3000}
 const result=await sendDirectRecipient(args);assert.equal(result.delivery,'received');assert.equal(result.applied,false);assert.equal(frames,1)
 assert.equal((await sendDirectRecipient(args)).reused,true);assert.equal(frames,1)
 await assert.rejects(sendDirectRecipient({...args,message:'DIFFERENT'}),e=>e.category==='outcome_unknown');assert.equal(frames,1)
 const ledger=await inspectPeerSend('received');assert.match(ledger.runtimeBuild,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(ledger).includes('PRIVATE_PROMPT'),false)
})
test('cancellation after publication leaves durable unknown and reattachment does not resend',async()=>{
 receive=false;const c=new AbortController();abortOnFrame=()=>c.abort();const before=frames,args={operationId:'cancelled',session:sid,message:'fixture',timeoutMs:3000}
 try{await assert.rejects(sendDirectRecipient(args,{signal:c.signal}),e=>e.category==='outcome_unknown'&&e.detail.retrySafe===false)}finally{abortOnFrame=null}
 assert.equal(frames,before+1);assert.equal((await inspectPeerSend('cancelled')).phase,'outcome_unknown')
 await assert.rejects(sendDirectRecipient({...args,timeoutMs:300}),e=>e.category==='outcome_unknown');assert.equal(frames,before+1);receive=true
})
test('archived and unqualified recipients refuse before arming or socket publication',async()=>{
 const before=frames,args={operationId:'refused',session:sid,message:'fixture',timeoutMs:3000}
 writeFileSync(recordFile,JSON.stringify({...record,isArchived:true}))
 await assert.rejects(sendDirectRecipient(args),e=>e.category==='bad_state');writeFileSync(recordFile,JSON.stringify(record))
 writeFileSync(peerFile,JSON.stringify({...peer,version:'9.9.999'}))
 try{await assert.rejects(sendDirectRecipient(args),e=>e.category==='peer_unqualified');assert.equal(await inspectPeerSend('refused'),null);assert.equal(frames,before)}finally{writeFileSync(peerFile,JSON.stringify(peer))}
})

test('deadline and cancellation while waiting for recipient admission cannot publish or erase prior uncertainty',async()=>{
 const {withSessionControl}=await import('../lib/controls.mjs');let release
 const held=withSessionControl(sid,()=>new Promise(r=>release=r));while(!release)await new Promise(r=>setTimeout(r,5))
 const before=frames
 try{
  await assert.rejects(sendDirectRecipient({operationId:'lock-expired',session:sid,message:'fixture',timeoutMs:100}),e=>['lock_timeout','cli_timeout','outcome_unknown'].includes(e.category))
  assert.equal(await inspectPeerSend('lock-expired'),null);assert.equal(frames,before)
  const controller=new AbortController();controller.abort()
  await assert.rejects(sendDirectRecipient({operationId:'cancelled',session:sid,message:'fixture',timeoutMs:100},{signal:controller.signal}),e=>e.category==='outcome_unknown'&&e.detail.retrySafe===false)
  assert.equal(frames,before)
 }finally{release();await held}
})

function mcp(name){
 const child=spawn('src/claude-driver/bin/claude-driver-mcp',[],{env:{...process.env},stdio:['pipe','pipe','pipe']}),pending=new Map(),rl=createInterface({input:child.stdout});let id=0,stderr=''
 child.stderr.on('data',b=>stderr+=b)
 rl.on('line',line=>{const r=JSON.parse(line),p=pending.get(r.id);if(p){pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result)}})
 child.on('exit',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('fixture MCP exit '+stderr.slice(-100)))}pending.clear()})
 const request=(method,params)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('fixture MCP timeout'))},15000);pending.set(n,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,method,params})+'\n')})
 return {ready:request('initialize',{protocolVersion:'2025-06-18',clientInfo:{name,version:'fixture'}}),request,call:(name,args={})=>request('tools/call',{name,arguments:args}),close:async()=>{if(child.exitCode!==null)return;child.stdin.end();await new Promise(r=>child.once('exit',r));rl.close()}}
}
async function until(fn){const deadline=Date.now()+10000;while(Date.now()<deadline){if(await fn())return;await new Promise(r=>setTimeout(r,20))}throw Error('fixture evidence timeout')}
test('actual MCP clients reattach one detached send job and reconcile a cancelled publication without another frame',async()=>{
 const a=mcp('direct-origin'),b=mcp('direct-replacement');await Promise.all([a.ready,b.ready]);const before=frames
 const args={session:sid,message:'MCP_SYNTHETIC',transport:'peer-direct',operation_id:'mcp-received',receipt_timeout_sec:5}
 try{
  const schema=(await a.request('tools/list',{})).tools;assert.equal(schema.find(t=>t.name==='peer_send_status').annotations.readOnlyHint,true)
  const invalid=await a.call('send_message',{...args,operation_id:undefined});assert.equal(invalid.isError,true);assert.equal(frames,before)
  const input={operation:'send_message',arguments:args,idempotency_key:'direct-disconnect'}
  const first=(await a.call('driver_submit',input)).structuredContent;await a.close()
  const second=(await b.call('driver_submit',input)).structuredContent;assert.equal(second.jobId,first.jobId);assert.equal(second.reused,true)
  const done=(await b.call('driver_wait',{job_id:first.jobId,timeout_sec:10})).structuredContent
  assert.equal(done.state,'completed');assert.equal(done.result.delivery,'received');assert.equal(done.result.applied,false);assert.equal(frames,before+1)
  assert.equal((await b.call('peer_send_status',{operation_id:'mcp-received'})).structuredContent.receiptVerified,true)
  receive=false;const uncertainArgs={...args,operation_id:'mcp-unknown',receipt_timeout_sec:5}
  const j=(await b.call('driver_submit',{operation:'send_message',arguments:uncertainArgs,idempotency_key:'direct-cancel'})).structuredContent
  await until(()=>frames===before+2);const msgId=lastMessageId
  await b.call('driver_cancel',{job_id:j.jobId})
  const stopped=(await b.call('driver_wait',{job_id:j.jobId,timeout_sec:10})).structuredContent;assert.equal(stopped.state,'outcome_unknown')
  let status=(await b.call('peer_send_status',{operation_id:'mcp-unknown'})).structuredContent;assert.equal(status.state,'outcome_unknown');assert.equal(status.retrySafe,false)
  appendFileSync(journal,JSON.stringify({type:'user',uuid:'late-receipt',sessionId:cli,origin:{kind:'peer',msg_id:msgId},timestamp:new Date().toISOString(),message:{content:'PRIVATE_LATE'}})+'\n')
  status=(await b.call('peer_send_status',{operation_id:'mcp-unknown'})).structuredContent;assert.equal(status.receiptVerified,true);assert.equal(status.receipt.applied,false)
  assert.equal((await b.call('send_message',uncertainArgs)).structuredContent.reused,true);assert.equal(frames,before+2)
 }finally{receive=true;await a.close();await b.close()}
})

test('competing distinct detached jobs share one publication identity and send one frame',async()=>{
 const a=mcp('direct-racer-a'),b=mcp('direct-racer-b');await Promise.all([a.ready,b.ready]);const before=frames
 const args={session:sid,message:'COMPETING_SYNTHETIC',transport:'peer-direct',operation_id:'competing-jobs',receipt_timeout_sec:10}
 try{
  const [x,y]=await Promise.all([a.call('driver_submit',{operation:'send_message',arguments:args,idempotency_key:'racer-a'}),b.call('driver_submit',{operation:'send_message',arguments:args,idempotency_key:'racer-b'})])
  assert.notEqual(x.structuredContent.jobId,y.structuredContent.jobId)
  const results=await Promise.all([a.call('driver_wait',{job_id:x.structuredContent.jobId,timeout_sec:10}),b.call('driver_wait',{job_id:y.structuredContent.jobId,timeout_sec:10})])
  assert.ok(results.every(r=>r.structuredContent.state==='completed'));assert.equal(results.filter(r=>r.structuredContent.result.reused).length,1);assert.equal(frames,before+1)
 }finally{await a.close();await b.close()}
})
test('abrupt loss of this fixture detached worker preserves unknown; late receipt adoption never replays its job',async()=>{
 const c=mcp('direct-worker-loss');await c.ready;const before=frames;let workerPid,jobId
 const args={session:sid,message:'WORKER_LOSS_SYNTHETIC',transport:'peer-direct',operation_id:'worker-loss',receipt_timeout_sec:10}
 const ownsWorker=()=>{try{return workerPid!==process.pid&&workerPid!==process.ppid&&execFileSync('/bin/ps',['-p',String(workerPid),'-o','command='],{encoding:'utf8'}).includes('job-worker.mjs '+jobId)}catch{return false}}
 try{
  receive=false;const input={operation:'send_message',arguments:args,idempotency_key:'worker-loss-fixture'}
  jobId=(await c.call('driver_submit',input)).structuredContent.jobId
  await until(()=>frames===before+1);const msgId=lastMessageId
  const {jobFile}=await import('../lib/jobs.mjs');workerPid=JSON.parse(readFileSync(jobFile(jobId),'utf8')).workerPid
  assert.equal(ownsWorker(),true,'kill only exact worker spawned by this synthetic test')
  process.kill(workerPid,'SIGKILL')
  await until(()=>!ownsWorker())
  const lost=(await c.call('driver_job',{job_id:jobId})).structuredContent;assert.equal(lost.state,'outcome_unknown');assert.equal(lost.error.category,'worker_lost')
  const reattached=(await c.call('driver_submit',input)).structuredContent;assert.equal(reattached.jobId,jobId);assert.equal(reattached.reused,true);assert.equal(frames,before+1)
  appendFileSync(journal,JSON.stringify({type:'user',uuid:'worker-loss-late',sessionId:cli,origin:{kind:'peer',msg_id:msgId},timestamp:new Date().toISOString(),message:{content:'PRIVATE_LATE'}})+'\n')
  const status=(await c.call('peer_send_status',{operation_id:'worker-loss'})).structuredContent;assert.equal(status.receiptVerified,true);assert.equal(status.retrySafe,false)
  assert.equal((await c.call('driver_job',{job_id:jobId})).structuredContent.state,'outcome_unknown')
  assert.equal((await c.call('send_message',args)).structuredContent.reused,true);assert.equal(frames,before+1)
 }finally{receive=true;if(workerPid&&ownsWorker())process.kill(workerPid,'SIGKILL');await c.close()}
})

test('an expired inherited deadline cannot start a new receipt budget or arm a send',async()=>{
 const before=frames
 await assert.rejects(sendDirectRecipient({operationId:'inherited-expired',session:sid,message:'fixture',timeoutMs:3000},{absoluteDeadline:Date.now()-1}),e=>e.category==='cli_timeout'&&e.detail.dispatched===false||e.category==='outcome_unknown'&&e.detail.retrySafe===false)
 assert.equal(await inspectPeerSend('inherited-expired'),null);assert.equal(frames,before)
})
test('public receipt budget includes outer session admission rather than restarting after the lock',async()=>{
 const c=mcp('direct-shared-budget');await c.ready
 const {withSessionControl}=await import('../lib/controls.mjs');let release
 const held=withSessionControl(sid,()=>new Promise(r=>release=r));while(!release)await new Promise(r=>setTimeout(r,5))
 receiptDelayMs=1000;const timer=setTimeout(()=>release(),1000),before=frames
 try{
  const out=await c.call('send_message',{session:sid,message:'BUDGET_SYNTHETIC',transport:'peer-direct',operation_id:'shared-budget',receipt_timeout_sec:1.5})
  assert.equal(out.isError,true,'a receipt arriving after the original deadline must not complete the initial send')
  assert.ok(['outcome_unknown','cli_timeout','lock_timeout'].includes(out.structuredContent.error.category));assert.ok(frames<=before+1)
  await until(()=>receiptTimers.size===0)
  if(frames===before+1)assert.equal((await c.call('peer_send_status',{operation_id:'shared-budget'})).structuredContent.receiptVerified,true)
 }finally{clearTimeout(timer);release();await held;receiptDelayMs=0;await c.close()}
})

test('public direct queue steering preserves one publication and refuses unsupported interrupt before effects',async()=>{
 const {runOp}=await import('../lib/driver.mjs');const before=frames;
 const args={session:sid,mode:'queue',message:'DIRECT_QUEUE',transport:'peer-direct',operation_id:'public-direct-queue',receipt_timeout_sec:3};
 const r=await runOp('steer_session',args);assert.equal(r.delivery,'received');assert.equal(r.steeringMode,'queue');assert.equal(r.stopped,false);assert.equal(r.applied,false);assert.equal(frames,before+1);
 assert.equal((await runOp('steer_session',args)).reused,true);assert.equal(frames,before+1);
 for(const invalid of [{...args,mode:'interrupt'},{...args,via_broker:true},{...args,transport:'native'}])await assert.rejects(runOp('steer_session',invalid),e=>e.category==='bad_args');
 assert.equal(frames,before+1);
})

test('public direct queue steering deadline includes outer control admission',async()=>{
 const {runOp}=await import('../lib/driver.mjs'),{withSessionControl}=await import('../lib/controls.mjs');let release;
 const held=withSessionControl(sid,()=>new Promise(r=>release=r));while(!release)await new Promise(r=>setTimeout(r,5));const before=frames;
 try{await assert.rejects(runOp('steer_session',{session:sid,mode:'queue',message:'MUST_NOT_SEND',transport:'peer-direct',operation_id:'queue-admission-expired',receipt_timeout_sec:0.1}),e=>['lock_timeout','cli_timeout','outcome_unknown'].includes(e.category));assert.equal(frames,before);assert.equal(await inspectPeerSend('queue-admission-expired'),null)}finally{release();await held}
})
