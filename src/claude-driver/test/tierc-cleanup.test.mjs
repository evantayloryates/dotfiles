import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'

// Drive the actual worker against a synthetic JSON-RPC backend. No model,
// desktop, native helper or shared daemon can be started by this fixture.
for(const fail of [false,true])test(`UI worker ${fail?'fails closed on refused':'explicitly archives after'} thread cleanup`,()=>{
 const root=mkdtempSync(join(tmpdir(),'claude-ui-close-'))
 try{
  const bin=join(root,'backend'),trace=join(root,'trace'),state=join(root,'state')
  mkdirSync(state);writeFileSync(join(state,'ui-quarantine.json'),JSON.stringify({blocked:false}))
  writeFileSync(bin,`#!${process.execPath}
import{createInterface}from'node:readline';import{appendFileSync}from'node:fs';
if(process.argv.includes('--version')){console.log('codex-cli 0.160.0-fixture');process.exit(0)}
const emit=x=>console.log(JSON.stringify(x));
createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);appendFileSync(process.env.FIXTURE_TRACE,JSON.stringify(r)+'\\n');if(r.id===undefined)return;
if(r.method==='thread/archive'&&process.env.FIXTURE_FAIL==='true'){emit({id:r.id,error:{code:-1,message:'synthetic cleanup refusal'}});return}
let result=r.method==='thread/start'?{thread:{id:'private-thread'},model:'synthetic'}:r.method==='turn/start'?{turn:{id:'private-turn'}}:{};emit({id:r.id,result});
if(r.method==='turn/start'){emit({method:'item/completed',params:{threadId:'private-thread',item:{type:'agentMessage',text:'PRIVATE_FIXTURE_OK'}}});emit({method:'turn/completed',params:{threadId:'private-thread',turn:{id:'private-turn',status:'completed'}}})}});
`,{mode:0o700})
  const r=spawnSync(process.execPath,['src/claude-driver/scripts/tierc-worker.mjs'],{
   input:JSON.stringify({task:'synthetic fixture',timeoutSec:30}),encoding:'utf8',timeout:10000,
   env:{...process.env,CODEX_HOME:root,CODEX_BRIDGE_CODEX_PATH:bin,CODEX_BRIDGE_STATE_DIR:join(root,'backend-state'),CLAUDE_DRIVER_STATE_DIR:state,FIXTURE_TRACE:trace,FIXTURE_FAIL:String(fail)}})
  assert.equal(r.error,undefined);const out=JSON.parse(r.stdout)
  const calls=readFileSync(trace,'utf8').trim().split('\n').map(JSON.parse)
  assert.equal(calls.filter(x=>x.method==='thread/archive').length,1)
  assert.deepEqual(calls.find(x=>x.method==='thread/archive').params,{threadId:'private-thread'})
  assert.ok(calls.findIndex(x=>x.method==='thread/archive')>calls.findIndex(x=>x.method==='turn/start'))
  assert.equal(calls.some(x=>x.method?.includes('daemon')),false)
  if(fail){assert.equal(r.status,1);assert.equal(out.error.category,'tier_c_cleanup_failed');assert.match(out.error.message,/synthetic cleanup refusal/)}
  else{assert.equal(r.status,0);assert.equal(out.cleanup.threadArchived,true);assert.equal(out.result.finalText,'PRIVATE_FIXTURE_OK');assert.deepEqual(JSON.parse(readFileSync(join(root,'backend-state','state.json'))).sessions,{})}
 }finally{rmSync(root,{recursive:true,force:true})}
})
