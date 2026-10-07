import {test,after} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,readdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const root=mkdtempSync(join(tmpdir(),'claude-broker-deadline-')),dir=join(root,'state','broker')
const sid='local_00000000-0000-4000-8000-000000000071',fake=join(root,'fake-cli.mjs')
Object.assign(process.env,{CLAUDE_DRIVER_STATE_DIR:join(root,'state'),CLAUDE_DRIVER_APP_SUPPORT:join(root,'app'),CLAUDE_DRIVER_PEER_SESSIONS_DIR:join(root,'peers'),CLAUDE_DRIVER_PROJECTS_DIR:join(root,'projects'),CLAUDE_DRIVER_PEER:'llm',CLAUDE_DRIVER_CLI:fake,DOTFILES_DIR:root})
writeFileSync(join(root,'.env'),'KICKOFF_CLAUDE_CODE_LONG_LIVED_SUBSCRIPTION_OAUTH_TOKEN=synthetic-fixture\n')
for(const p of [dir,join(root,'peers'),join(root,'app','claude-code-sessions','a','o')])mkdirSync(p,{recursive:true})
writeFileSync(join(root,'app','claude-code-sessions','a','o',sid+'.json'),JSON.stringify({sessionId:sid,cliSessionId:sid.slice(6),cwd:dir,title:'claude-driver-broker',permissionMode:'bypassPermissions',isArchived:false}))
writeFileSync(join(root,'peers',process.pid+'.json'),JSON.stringify({pid:process.pid,hostSessionId:sid,status:'idle',entrypoint:'synthetic'}))
writeFileSync(fake,`#!${process.execPath}
if(process.argv.includes('--version')){console.log('synthetic');process.exit(0)}
await new Promise(r=>setTimeout(r,1200));console.log('SENT');
`,{mode:0o700})
const {brokerRequest,prepareBrokerDir,saveBrokerInfo}=await import('../lib/broker.mjs')
saveBrokerInfo({sessionId:sid});prepareBrokerDir()
after(()=>rmSync(root,{recursive:true,force:true}))
test('a slow peer wake is included in the broker deadline and leaves a definitive undispatched outcome',async()=>{
 const start=Date.now();let error
 try{await brokerRequest([{op:'get_session',args:{session_id:sid}}],{timeoutMs:180})}catch(e){error=e}
 assert.ok(error);assert.equal(error.category,'broker_timeout')
 assert.ok(Date.now()-start<1000,'wake helper must not exceed the request budget')
 assert.equal(error.detail.dispatched,false);assert.equal(error.detail.retrySafe,true)
 const files=readdirSync(join(dir,'requests'));assert.equal(files.length,1)
 const c=JSON.parse(readFileSync(join(dir,'controls',error.detail.requestId+'.json')))
 assert.equal(c.state,'expired');assert.deepEqual(c.dispatched,[])
})
