import {test,after} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:net'
import {execFileSync} from 'node:child_process'
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
let frames=0,receive=true,abortOnFrame
const server=createServer({allowHalfOpen:true},s=>{let buf='';s.on('error',()=>{});s.on('data',d=>{buf+=d;const lines=buf.split('\n');for(const line of lines.slice(0,-1)){let f;try{f=JSON.parse(line)}catch{continue}if(f.type==='user'){frames++;if(receive)appendFileSync(journal,JSON.stringify({type:'user',uuid:'receipt-'+frames,sessionId:cli,origin:{kind:'peer',msg_id:f.msg_id},timestamp:new Date().toISOString(),message:{content:'PRIVATE_PROMPT'}})+'\n');abortOnFrame?.();s.end()}}buf=lines.at(-1)})})
await new Promise(r=>server.listen(socket,r));after(async()=>{await new Promise(r=>server.close(r));rmSync(root,{recursive:true,force:true})})
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
  await assert.rejects(sendDirectRecipient({operationId:'lock-expired',session:sid,message:'fixture',timeoutMs:100}),e=>['lock_timeout','cli_timeout'].includes(e.category))
  assert.equal(await inspectPeerSend('lock-expired'),null);assert.equal(frames,before)
  const controller=new AbortController();controller.abort()
  await assert.rejects(sendDirectRecipient({operationId:'cancelled',session:sid,message:'fixture',timeoutMs:100},{signal:controller.signal}),e=>e.category==='outcome_unknown'&&e.detail.retrySafe===false)
  assert.equal(frames,before)
 }finally{release();await held}
})
