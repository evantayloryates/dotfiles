import {test,after} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,readdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const root=mkdtempSync(join(tmpdir(),'claude-wake-contract-'))
Object.assign(process.env,{CLAUDE_DRIVER_STATE_DIR:join(root,'state'),CLAUDE_DRIVER_APP_SUPPORT:join(root,'app'),
 CLAUDE_DRIVER_PEER_SESSIONS_DIR:join(root,'peers'),CLAUDE_DRIVER_PROJECTS_DIR:join(root,'projects'),
 CLAUDE_DRIVER_PEER:'llm',DOTFILES_DIR:root})
writeFileSync(join(root,'.env'),'KICKOFF_CLAUDE_CODE_LONG_LIVED_SUBSCRIPTION_OAUTH_TOKEN=synthetic-fixture\n')
const dir=join(root,'state','broker'),sid='local_00000000-0000-4000-8000-000000000099'
for(const path of [dir,join(root,'peers'),join(root,'app','claude-code-sessions','a','o')])mkdirSync(path,{recursive:true})
writeFileSync(join(root,'app','claude-code-sessions','a','o',sid+'.json'),JSON.stringify({sessionId:sid,cliSessionId:sid.slice(6),cwd:dir,title:'claude-driver-broker',permissionMode:'bypassPermissions',isArchived:false}))
writeFileSync(join(root,'peers',process.pid+'.json'),JSON.stringify({pid:process.pid,hostSessionId:sid,status:'idle',entrypoint:'synthetic'}))
const count=join(root,'count'),threshold=join(root,'threshold'),fake=join(root,'fake-cli.mjs')
process.env.CLAUDE_DRIVER_CLI=fake
writeFileSync(fake,`#!${process.execPath}
import {readFileSync,writeFileSync} from 'node:fs';
if(process.argv.includes('--version')){console.log('synthetic');process.exit(0)}
const prompt=process.argv[process.argv.indexOf('-p')+1]||'';
if(!/\\nclaude-driver request r[A-Za-z0-9_-]+ v7\\n/.test(prompt)){console.log('FAILED: unsupported wake');process.exit(1)}
const count=${JSON.stringify(count)},threshold=${JSON.stringify(threshold)};
let n=0;try{n=Number(readFileSync(count))}catch{};writeFileSync(count,String(++n));
if(n>=Number(readFileSync(threshold))){
 process.env.CLAUDE_DRIVER_STATE_DIR=${JSON.stringify(join(root,'state'))};
 const r=await import(${JSON.stringify(new URL('../lib/requests.mjs',import.meta.url).href)});
 const s=await import(${JSON.stringify(new URL('../lib/state.mjs',import.meta.url).href)});
 const request=await r.pickupPending();if(!request)throw Error('no queued request');
 const check=await r.authorizeDispatch(request.id,0);if(!check.dispatch)throw Error('dispatch refused');
 s.writeJsonAtomic(r.resultFile(request.id),{id:request.id,results:[{op:'get_session',ok:true,result:{synthetic:true}}]});
}
console.log('SENT');
`,{mode:0o700})
const {brokerRequest,prepareBrokerDir,saveBrokerInfo}=await import('../lib/broker.mjs')
saveBrokerInfo({sessionId:sid});prepareBrokerDir()
after(()=>rmSync(root,{recursive:true,force:true}))
test('request-specific current-protocol pulse enters the loop without downgrading the queued protocol',async()=>{
 writeFileSync(count,'0');writeFileSync(threshold,'1')
 const r=await brokerRequest([{op:'get_session',args:{session_id:sid}}],{timeoutMs:5000})
 assert.equal(r.results[0].result.synthetic,true);assert.equal(Number(readFileSync(count)),1)
 const request=JSON.parse(readFileSync(join(dir,'requests',r.id+'.json')))
 assert.equal(request.protocol,7)
})
test('an idle re-wake preserves one queued request and one checkpointed effect',async()=>{
 writeFileSync(count,'0');writeFileSync(threshold,'2')
 const before=readdirSync(join(dir,'requests')).length
 const r=await brokerRequest([{op:'get_session',args:{session_id:sid}}],{timeoutMs:6000})
 assert.equal(r.results[0].ok,true);assert.equal(Number(readFileSync(count)),2)
 assert.equal(readdirSync(join(dir,'requests')).length,before+1)
 const c=JSON.parse(readFileSync(join(dir,'controls',r.id+'.json')))
 assert.deepEqual(c.dispatched,[0]);assert.equal(c.state,'dispatched')
})
