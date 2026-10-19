import {test,after} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:net'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,mkdirSync,writeFileSync,appendFileSync,rmSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
// Pool-claimed and imported desktop chats keep a CLI session id that differs
// from their desktop id. Direct delivery must bind the saved cliSessionId.
const root=mkdtempSync('/tmp/peer-pool-identity-'),peers=join(root,'peers'),app=join(root,'app'),socket=join(root,'p.sock')
const host='00000000-0000-4000-8000-0000000000aa',cli='00000000-0000-4000-8000-0000000000bb',sid='local_'+host
Object.assign(process.env,{CLAUDE_DRIVER_STATE_DIR:join(root,'state'),CLAUDE_DRIVER_PROJECTS_DIR:join(root,'projects'),CLAUDE_DRIVER_APP_SUPPORT:app,CLAUDE_DRIVER_PEER_SESSIONS_DIR:peers,CLAUDE_DRIVER_CALLER_SESSION:'',CLAUDE_CODE_ENTRYPOINT:''})
const {sendDirectRecipient}=await import('../lib/direct-recipient.mjs'),{deliver,transcriptPath}=await import('../lib/peer-direct.mjs')
const start=execFileSync('/bin/ps',['-o','lstart=','-p',String(process.pid)],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',LC_ALL:'C',TZ:'UTC'}}).trim()
const peer={pid:process.pid,procStart:start,hostSessionId:sid,sessionId:cli,cwd:root,entrypoint:'claude-desktop',peerProtocol:1,version:'2.1.299',messagingSocketPath:socket,status:'idle'}
mkdirSync(peers);const folder=join(app,'claude-code-sessions','a','o');mkdirSync(folder,{recursive:true})
writeFileSync(join(folder,sid+'.json'),JSON.stringify({sessionId:sid,cliSessionId:cli,cwd:root,title:'synthetic pool recipient',permissionMode:'bypassPermissions'}))
writeFileSync(join(peers,process.pid+'.json'),JSON.stringify(peer));writeFileSync(join(peers,process.pid+'.'+createHash('sha256').update(socket).digest('hex')+'.key'),JSON.stringify({peerToken:'a'.repeat(32),procStart:start}),{mode:0o600})
const journal=transcriptPath(peer);mkdirSync(join(journal,'..'),{recursive:true});writeFileSync(journal,'')
let frames=0
const server=createServer({allowHalfOpen:true},s=>{let buf='';s.on('error',()=>{});s.on('data',d=>{buf+=d;const lines=buf.split('\n');for(const line of lines.slice(0,-1)){let f;try{f=JSON.parse(line)}catch{continue}if(f.type==='user'){frames++;assert.equal(f.session_id,cli);appendFileSync(journal,JSON.stringify({type:'user',uuid:'receipt-'+frames,sessionId:cli,origin:{kind:'peer',msg_id:f.msg_id},timestamp:new Date().toISOString(),message:{content:'x'}})+'\n');s.end()}}buf=lines.at(-1)})})
await new Promise(r=>server.listen(socket,r));after(async()=>{await new Promise(r=>server.close(r));rmSync(root,{recursive:true,force:true})})
test('deliver without the saved CLI id refuses before any frame',async()=>{
 await assert.rejects(deliver({sessionId:sid,permissionMode:'bypassPermissions',live:{pid:peer.pid,procStart:start}},'x',{timeoutMs:2000}),e=>e.category==='peer_refused'&&e.detail?.dispatched===false)
 assert.equal(frames,0)
})
test('direct recipient send to a chat whose CLI id differs from its desktop id is received once',async()=>{
 const r=await sendDirectRecipient({operationId:'pool-identity',session:sid,message:'PRIVATE_PROMPT',timeoutMs:3000})
 assert.equal(r.delivery,'received');assert.equal(r.applied,false);assert.equal(frames,1)
})
