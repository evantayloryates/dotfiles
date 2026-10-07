import {test,after} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const root=mkdtempSync(join(tmpdir(),'claude-cancel-window-')),dir=join(root,'state','broker')
const sid='local_00000000-0000-4000-8000-000000000073',fake=join(root,'fake-cli.mjs'),ready=join(root,'ready'),effect=join(root,'effect')
Object.assign(process.env,{CLAUDE_DRIVER_STATE_DIR:join(root,'state'),CLAUDE_DRIVER_APP_SUPPORT:join(root,'app'),CLAUDE_DRIVER_PEER_SESSIONS_DIR:join(root,'peers'),CLAUDE_DRIVER_PROJECTS_DIR:join(root,'projects'),CLAUDE_DRIVER_PEER:'llm',CLAUDE_DRIVER_CLI:fake,DOTFILES_DIR:root})
writeFileSync(join(root,'.env'),'KICKOFF_CLAUDE_CODE_LONG_LIVED_SUBSCRIPTION_OAUTH_TOKEN=synthetic-fixture\n')
for(const p of [dir,join(root,'peers'),join(root,'app','claude-code-sessions','a','o')])mkdirSync(p,{recursive:true})
writeFileSync(join(root,'app','claude-code-sessions','a','o',sid+'.json'),JSON.stringify({sessionId:sid,cliSessionId:sid.slice(6),cwd:dir,title:'claude-driver-broker',permissionMode:'bypassPermissions',isArchived:false}))
writeFileSync(join(root,'peers',process.pid+'.json'),JSON.stringify({pid:process.pid,hostSessionId:sid,status:'idle',entrypoint:'synthetic'}))
writeFileSync(fake,`#!${process.execPath}
import {writeFileSync} from 'node:fs';
if(process.argv.includes('--version')){console.log('synthetic');process.exit(0)}
process.env.CLAUDE_DRIVER_STATE_DIR=${JSON.stringify(join(root,'state'))};
const r=await import(${JSON.stringify(new URL('../lib/requests.mjs',import.meta.url).href)});
process.on('SIGTERM',()=>setTimeout(async()=>{
 const request=await r.pickupPending();
 if(request){const check=await r.authorizeDispatch(request.id,0);if(check.dispatch)writeFileSync(${JSON.stringify(effect)},'synthetic effect');}
 process.exit(0);
},40));
writeFileSync(${JSON.stringify(ready)},'ready');setInterval(()=>{},1000);
`,{mode:0o700})
const {brokerRequest,prepareBrokerDir,saveBrokerInfo}=await import('../lib/broker.mjs')
saveBrokerInfo({sessionId:sid});prepareBrokerDir()
after(()=>rmSync(root,{recursive:true,force:true}))
test('abort intent cancels the queued request before slow wake-helper cleanup can dispatch it',async()=>{
 const controller=new AbortController()
 const pending=brokerRequest([{op:'get_session',args:{session_id:sid}}],{timeoutMs:5000,signal:controller.signal}).then(value=>({value}),error=>({error}))
 const end=Date.now()+3000;while(!existsSync(ready)&&Date.now()<end)await new Promise(r=>setTimeout(r,10))
 assert.ok(existsSync(ready),'fake helper ready for supervised cancellation');controller.abort()
 const {error}=await pending
 console.log(JSON.stringify({boundary:'abort-during-wake-cleanup',category:error?.category,dispatched:error?.detail?.dispatched,syntheticEffect:existsSync(effect)}))
 assert.ok(error,'cancelled before dispatch must remain an error, not a success-shaped relay receipt')
 assert.equal(error.category,'cancelled');assert.equal(error.detail.dispatched,false);assert.equal(error.detail.retrySafe,true)
 assert.equal(existsSync(effect),false,'cancel must reach the durable checkpoint while helper is shutting down')
 const c=JSON.parse(readFileSync(join(dir,'controls',error.detail.requestId+'.json')))
 assert.equal(c.state,'cancelled');assert.deepEqual(c.dispatched,[])
})
