import {test,after} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:net'
import {mkdtempSync,mkdirSync,writeFileSync,existsSync,rmSync} from 'node:fs'
import {join} from 'node:path'
// Short private path is required by macOS Unix sockets; no app socket/key.
const root=mkdtempSync('/tmp/claude-peer-budget-'),socket=join(root,'peer.sock')
const sid='local_00000000-0000-4000-8000-000000000072',fallback=join(root,'fallback')
Object.assign(process.env,{CLAUDE_DRIVER_PEER_SESSIONS_DIR:join(root,'peers'),CLAUDE_DRIVER_STATE_DIR:join(root,'state'),CLAUDE_DRIVER_CLI:join(root,'fake-cli.mjs'),DOTFILES_DIR:root})
delete process.env.CLAUDE_DRIVER_PEER
mkdirSync(join(root,'peers'));mkdirSync(join(root,'state','broker'),{recursive:true})
writeFileSync(join(root,'.env'),'KICKOFF_CLAUDE_CODE_LONG_LIVED_SUBSCRIPTION_OAUTH_TOKEN=synthetic-fixture\n')
writeFileSync(join(root,'peers',process.pid+'.json'),JSON.stringify({pid:process.pid,hostSessionId:sid,sessionId:sid.slice(6),cwd:root,peerProtocol:1,version:'2.1.286',messagingSocketPath:socket}))
writeFileSync(process.env.CLAUDE_DRIVER_CLI,`#!${process.execPath}
import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(fallback)},'called');console.log('SENT');
`,{mode:0o700})
const {deliver}=await import('../lib/peer.mjs')
const target={sessionId:sid,permissionMode:'bypassPermissions',title:'synthetic'}
let server;const sockets=new Set()
async function start(onData){
 server=createServer({allowHalfOpen:true},s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));s.on('error',()=>{});s.on('data',d=>onData(s,d))})
 await new Promise((ok,fail)=>{server.once('error',fail);server.listen(socket,ok)})
}
async function close(){for(const s of sockets)s.destroy();if(server)await new Promise(r=>server.close(r));server=null}
after(async()=>{await close();rmSync(root,{recursive:true,force:true})})
test('partial direct wake timeout closes its socket without a second LLM send',async()=>{
 let frames=0;await start(()=>frames++)
 try{
  await assert.rejects(deliver(target,'synthetic wake',{timeoutMs:80}),e=>e.category==='cli_timeout'&&e.detail.dispatched===true&&e.detail.retrySafe===false)
  assert.ok(frames>0,'fixture received a frame before timeout')
  assert.equal(existsSync(fallback),false,'uncertain frame must not fall back to another send')
 }finally{await close()}
})
test('abort after a direct frame does not fall back or detach the sender socket',async()=>{
 const c=new AbortController();await start(()=>c.abort())
 try{
  await assert.rejects(deliver(target,'synthetic wake',{signal:c.signal,timeoutMs:2000}),e=>e.category==='cancelled'&&e.detail.dispatched===true)
  assert.equal(existsSync(fallback),false)
 }finally{await close()}
})
test('pre-aborted direct delivery starts no connection or fallback',async()=>{
 let connects=0;await start(()=>connects++)
 try{
  const c=new AbortController();c.abort()
  await assert.rejects(deliver(target,'synthetic wake',{signal:c.signal}),e=>e.category==='cancelled')
  assert.equal(connects,0);assert.equal(existsSync(fallback),false)
 }finally{await close()}
})
