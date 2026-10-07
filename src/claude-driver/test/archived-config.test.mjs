import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync,readdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const root=mkdtempSync(join(tmpdir(),'claude-archived-gate-'))
Object.assign(process.env,{CLAUDE_DRIVER_STATE_DIR:join(root,'state'),CLAUDE_DRIVER_APP_SUPPORT:join(root,'app'),CLAUDE_DRIVER_PEER_SESSIONS_DIR:join(root,'peers'),CLAUDE_DRIVER_PROJECTS_DIR:join(root,'projects'),CLAUDE_CODE_ENTRYPOINT:'',CLAUDE_DRIVER_CALLER_SESSION:''})
const session='local_00000000-0000-4000-8000-000000000030',folder=join(root,'app','claude-code-sessions','fixture','fixture'),file=join(folder,session+'.json');mkdirSync(folder,{recursive:true});const record={sessionId:session,cliSessionId:session.slice(6),cwd:root,title:'unchanged synthetic title',isArchived:true};writeFileSync(file,JSON.stringify(record))
const {runOp}=await import('../lib/driver.mjs')
test.after(()=>rmSync(root,{recursive:true,force:true}))
test('archived pin/effort batches refuse before a valid title or native request can dispatch',async()=>{
 for(const [op,args] of [['pin_session',{pinned:true}],['pin_session',{pinned:false}],['set_session_config',{title:'must not change',pinned:true,effort:'low'}],['set_session_config',{title:'must not change',pinned:false}],['set_session_config',{title:'must not change',effort:'low'}]]){
  await assert.rejects(runOp(op,{session,...args}),e=>e.category==='session_archived'&&e.detail.dispatched===false&&e.detail.retrySafe===true)
  assert.deepEqual(JSON.parse(readFileSync(file,'utf8')),record)
 }
 const requests=join(root,'state','broker','requests');assert.equal(existsSync(requests)?readdirSync(requests).length:0,0)
})
test('archive-compatible title-only batches still reach the broker admission boundary',async()=>{
 await assert.rejects(runOp('set_session_config',{session,title:'supported native field'}),e=>e.category==='broker_missing')
})
