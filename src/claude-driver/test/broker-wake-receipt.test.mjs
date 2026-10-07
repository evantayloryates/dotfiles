import {test,after} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,appendFileSync,readFileSync,rmSync,readdirSync,lstatSync,chmodSync} from 'node:fs'
import {createServer} from 'node:net'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
const root=mkdtempSync('/tmp/cd-wake-proof-'),dir=join(root,'state','broker'),sid='local_00000000-0000-4000-8000-000000000088',cli=sid.slice(6),socket=join(root,'p.sock')
Object.assign(process.env,{CLAUDE_DRIVER_STATE_DIR:join(root,'state'),CLAUDE_DRIVER_APP_SUPPORT:join(root,'app'),CLAUDE_DRIVER_PEER_SESSIONS_DIR:join(root,'peers'),CLAUDE_DRIVER_PROJECTS_DIR:join(root,'projects'),CLAUDE_DRIVER_PEER:'auto'})
const store=join(root,'app','claude-code-sessions','a','o'),project=join(root,'projects',dir.replace(/[^A-Za-z0-9]/g,'-')),file=join(project,cli+'.jsonl')
for(const folder of [dir,store,project,join(root,'peers')])mkdirSync(folder,{recursive:true})
writeFileSync(join(store,sid+'.json'),JSON.stringify({sessionId:sid,cliSessionId:cli,cwd:dir,title:'claude-driver-broker',permissionMode:'bypassPermissions',isArchived:false}))
writeFileSync(file,'')
const procStart=execFileSync('/bin/ps',['-p',String(process.pid),'-o','lstart='],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',LC_ALL:'C',TZ:'UTC'}}).trim()
writeFileSync(join(root,'peers',process.pid+'.json'),JSON.stringify({pid:process.pid,procStart,hostSessionId:sid,sessionId:cli,cwd:dir,entrypoint:'claude-desktop',status:'idle',peerProtocol:1,version:'2.1.289',messagingSocketPath:socket}))
writeFileSync(join(root,'peers',process.pid+'.'+createHash('sha256').update(socket).digest('hex')+'.key'),JSON.stringify({peerToken:'a'.repeat(32),procStart}),{mode:0o600})
const {brokerRequest,saveBrokerInfo,prepareBrokerDir}=await import('../lib/broker.mjs')
const {inspectRequest,pickupPending,authorizeDispatch}=await import('../lib/requests.mjs')
const {withLock}=await import('../lib/state.mjs')
saveBrokerInfo({sessionId:sid});prepareBrokerDir()
let messages=0,mode='refuse'
const server=createServer(s=>{let buffer='';s.on('data',async data=>{buffer+=data.toString();const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines){const f=JSON.parse(line);if(f.type!=='user')continue;messages++
 const rows=[{type:'user',uuid:'u'+messages,origin:{kind:'peer',msg_id:f.msg_id},message:{content:'synthetic wake'}},{type:'assistant',uuid:'a'+messages,parentUuid:'u'+messages,message:{stop_reason:'end_turn',content:[{type:'text',text:'Broker running.'}]}}]
 if(mode==='serve'){
  const request=await pickupPending(),op=request.ops[0],check=await authorizeDispatch(request.id,0)
  assert.equal(check.dispatch,true)
  rows.splice(1,1,
   {type:'assistant',uuid:'check'+messages,parentUuid:'u'+messages,message:{stop_reason:'tool_use',content:[{type:'tool_use',id:'checkpoint'+messages,name:'Bash',input:{command:`node broker-check.mjs ${request.id} 0 --dir /synthetic`}}]}},
   {type:'user',uuid:'checked'+messages,parentUuid:'check'+messages,message:{content:[{type:'tool_result',tool_use_id:'checkpoint'+messages,content:JSON.stringify(check)}]}},
   {type:'assistant',uuid:'native'+messages,parentUuid:'checked'+messages,message:{stop_reason:'tool_use',content:[{type:'tool_use',id:'native-call'+messages,name:'mcp__ccd_session_mgmt__get_session',input:op.args}]}},
   {type:'user',uuid:'result'+messages,parentUuid:'native'+messages,message:{content:[{type:'tool_result',tool_use_id:'native-call'+messages,content:'synthetic native session'}]}},
   {type:'assistant',uuid:'end'+messages,parentUuid:'result'+messages,message:{stop_reason:'end_turn',content:[{type:'text',text:'Done'}]}}
  )
 }
 appendFileSync(file,rows.map(r=>JSON.stringify(r)+'\n').join(''))
 }s.end()})})
await new Promise(r=>server.listen(socket,r))
after(async()=>{await new Promise(r=>server.close(r));function unseal(path){const s=lstatSync(path);if(s.isDirectory()){chmodSync(path,0o700);for(const n of readdirSync(path))unseal(join(path,n))}else if(!s.isSymbolicLink())chmodSync(path,0o600)}unseal(root);rmSync(root,{recursive:true,force:true})})
test('a correlated native idle end-turn cancels unclaimed work promptly with exactly one wake',async()=>{
 const started=Date.now(),progress=[];let id
 await assert.rejects(brokerRequest([{op:'get_session',args:{session_id:sid}}],{timeoutMs:5000,progress:message=>progress.push(message)}),e=>{
  id=e.detail.requestId;return e.category==='broker_not_serving'&&e.detail.dispatched===false&&e.detail.retrySafe===true
 })
 assert.ok(progress.some(s=>s.includes('awaiting native serving evidence')));assert.ok(progress.every(s=>!s.includes('enters its resident loop')))
 assert.equal(messages,1);assert.ok(Date.now()-started<2500,'must not wait for deadline or repeat a failed wake')
 const result=inspectRequest(id);assert.equal(result.controlState,'cancelled');assert.equal(result.dispatched,false)
 assert.equal(JSON.parse(readFileSync(join(dir,'requests',id+'.json'))).protocol,7)
 assert.equal(readdirSync(join(dir,'requests')).length,1)
})

test('a checkpointed native tool result wins; a subsequent end-turn does not become refusal',async()=>{
 mode='serve';const before=messages
 const result=await brokerRequest([{op:'get_session',args:{session_id:sid}}],{timeoutMs:5000})
 assert.equal(result.receiptSource,'native-tool-result');assert.equal(result.results[0].result,'synthetic native session');assert.equal(messages,before+1)
 assert.equal(inspectRequest(result.id).receiptVerified,true)
})

test('a recent working heartbeat cannot enqueue new work into a finishing native turn',async()=>{
 const peerFile=join(root,'peers',process.pid+'.json'),peer=JSON.parse(readFileSync(peerFile)),before=readdirSync(join(dir,'requests')).length,beforeMessages=messages
 writeFileSync(peerFile,JSON.stringify({...peer,status:'busy'}))
 writeFileSync(join(dir,'heartbeat.json'),JSON.stringify({pid:process.pid,ppid:process.ppid,state:'working',at:Date.now()}))
 const pending=brokerRequest([{op:'get_session',args:{session_id:sid}}],{timeoutMs:5000})
 await new Promise(r=>setTimeout(r,300))
 assert.equal(readdirSync(join(dir,'requests')).length,before,'must apply backpressure before creating a durable request')
 assert.equal(messages,beforeMessages,'must not send into the finishing turn')
 writeFileSync(peerFile,JSON.stringify(peer))
 const result=await pending;assert.equal(result.receiptSource,'native-tool-result');assert.equal(messages,beforeMessages+1)
})
test('ambiguous identical native slots refuse before request publication or wake',async()=>{
 const before=readdirSync(join(dir,'requests')).length,beforeMessages=messages,op={op:'get_session',args:{session_id:sid}}
 await assert.rejects(brokerRequest([op,structuredClone(op)],{timeoutMs:5000}),e=>e.category==='broker_ambiguous_batch'&&e.detail.dispatched===false&&e.detail.retrySafe===true)
 assert.equal(readdirSync(join(dir,'requests')).length,before);assert.equal(messages,beforeMessages)
})
test('real broker lock contention deadline and queued cancellation report safe pre-enqueue refusal',async()=>{
 let entered,release
 const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r),holder=withLock('broker',async()=>{entered();await gate})
 await ready
 const before=readdirSync(join(dir,'requests')).length,beforeMessages=messages,ops=[{op:'get_session',args:{session_id:sid}}]
 try{
  await assert.rejects(brokerRequest(ops,{timeoutMs:50}),e=>e.category==='lock_timeout'&&e.detail.dispatched===false&&e.detail.retrySafe===true&&!e.detail.requestId)
  const abort=new AbortController(),pending=brokerRequest(ops,{timeoutMs:5000,signal:abort.signal});setTimeout(()=>abort.abort(),50)
  await assert.rejects(pending,e=>e.category==='cancelled'&&e.detail.dispatched===false&&e.detail.retrySafe===true&&!e.detail.requestId)
  assert.equal(readdirSync(join(dir,'requests')).length,before);assert.equal(messages,beforeMessages)
 }finally{release();await holder}
})
test('progress failure after publication preserves request identity and cancels reads; native mutations remain unknown',async()=>{
 const beforeMessages=messages,progress=message=>{if(message.startsWith('broker request '))throw new Error('synthetic progress failure')}
 let readId
 await assert.rejects(brokerRequest([{op:'get_session',args:{session_id:sid}}],{timeoutMs:5000,progress}),e=>{readId=e.detail.requestId;return !!readId&&e.category==='broker_client_failure'&&e.detail.retrySafe===true&&e.detail.state==='cancelled'})
 assert.equal(inspectRequest(readId).controlState,'cancelled');assert.equal(messages,beforeMessages)
 const {installStopRescue}=await import('../lib/stop-rescue.mjs')
 await installStopRescue({sessionId:sid,pid:process.pid,procStart})
 let effectId
 await assert.rejects(brokerRequest([{op:'set_session_title',args:{session_id:sid,title:'synthetic'}}],{timeoutMs:5000,progress}),e=>{effectId=e.detail.requestId;return !!effectId&&e.category==='outcome_unknown'&&e.detail.retrySafe===false&&e.detail.dispatched===false})
 assert.equal(inspectRequest(effectId).state,'outcome_unknown');assert.equal(messages,beforeMessages)
})
