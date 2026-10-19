// Real caller/owner/helper/worker processes and kernel locks; no native CUA.
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs'
import {join,dirname} from 'node:path'
import {spawn,spawnSync} from 'node:child_process'
import {once} from 'node:events'
import {ownedGroupMembers} from '../src/lib/ui-lease-owner.mjs'
import {syntheticInputRoster} from './private-input-fixture.mjs'
const url=name=>new URL('../src/lib/'+name,import.meta.url).href
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function until(fn){const end=Date.now()+15000;while(!await fn()){if(Date.now()>end)throw Error('owned lifetime condition timed out');await sleep(25)}}
for(const mode of ['normal','unknown-residue','caller-loss-running','caller-loss-before-worker','owner-loss-running','watcher-loss-running','watcher-refusal','caller-and-watcher-lost','owner-and-watcher-lost','cancel-running','startup-failure','both-owners-lost'])test(`UI lifetime: ${mode}`,{timeout:25000},async()=>{
 const root=mkdtempSync('/private/tmp/claude-owner-life-'),state=join(root,'state'),dir=join(root,'lease'),backend=join(root,'backend'),helper=join(root,'helper'),ready=join(root,'backend-ready'),helperReady=join(root,'helper-ready'),resultFile=join(root,'caller-result.json'),ownerScript=join(root,'owner.mjs'),callerScript=join(root,'caller.mjs'),watchScript=join(root,'watch.mjs')
 for(const p of [state,dir])mkdirSync(p)
 writeFileSync(join(state,'ui-quarantine.json'),JSON.stringify({blocked:false,scope:'synthetic lifetime test'}))
 writeFileSync(helper,`#!${process.execPath}\n${mode==='startup-failure'?'process.exit(2)':"import{createServer}from'node:net';const s=createServer(c=>c.on('end',()=>s.close(()=>process.exit(0))));s.listen(process.env.SKY_CUA_SERVICE_NATIVE_PIPE_PATH);"}`,{mode:0o700})
 writeFileSync(backend,`#!${process.execPath}
import{createInterface}from'node:readline';import{connect}from'node:net';import{writeFileSync}from'node:fs';
import{spawn}from'node:child_process';
if(process.argv.includes('--version')){console.log('codex-cli 0.160.0-synthetic');process.exit(0)}
const emit=x=>console.log(JSON.stringify(x));let client;
createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;
if(r.method==='thread/start'){client=connect(r.params.config.mcp_servers.cua_repl.env.SKY_CUA_SERVICE_NATIVE_PIPE_PATH);client.on('connect',()=>emit({id:r.id,result:{thread:{id:'owned-thread'},model:'synthetic'}}));return}
emit({id:r.id,result:r.method==='mcpServerStatus/list'?${JSON.stringify(syntheticInputRoster())}:r.method==='turn/start'?{turn:{id:'owned-turn'}}:{}});
if(r.method==='turn/start'){writeFileSync(${JSON.stringify(ready)},'ready');if(${JSON.stringify(mode)}==='unknown-residue'&&!process.env.FIXTURE_SUCCESSOR)spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});if(process.env.FIXTURE_SUCCESSOR||['normal','unknown-residue'].includes(${JSON.stringify(mode)})){emit({method:'item/completed',params:{threadId:'owned-thread',item:{type:'agentMessage',text:'OWNED_OK'}}});emit({method:'turn/completed',params:{threadId:'owned-thread',turn:{id:'owned-turn',status:'completed'}}})}}
});
`,{mode:0o700})
 const runtime={resourceRoot:root,helperApp:root,codexHome:root,hashes:{scope:'synthetic'},files:{helper,node:process.execPath,launcher:join(root,'unused-cua.mjs'),cli:backend}}
 writeFileSync(watchScript,`import{serveUiLeaseWatch}from${JSON.stringify(url('ui-lease-watch.mjs'))};import{writeFileSync}from'node:fs';if(${JSON.stringify(mode)}==='watcher-refusal'){const spec=JSON.parse(process.env.CLAUDE_DRIVER_UI_WATCH);spec.group=process.pid;process.env.CLAUDE_DRIVER_UI_WATCH=JSON.stringify(spec)}await serveUiLeaseWatch({audit:async options=>writeFileSync(options.evidence,JSON.stringify({scope:'synthetic orphan audit only',filters:[]}))});`)
 writeFileSync(ownerScript,`import{serveUiLeaseOwner}from${JSON.stringify(url('ui-lease-owner.mjs'))};import{openPrivateInputService}from${JSON.stringify(url('private-input-service.mjs'))};import{writeFileSync}from'node:fs';
await serveUiLeaseOwner({watcherScript:${JSON.stringify(watchScript)},openService:async options=>{const service=await openPrivateInputService(options,{inspect:async()=>(${JSON.stringify(runtime)})});writeFileSync(${JSON.stringify(helperReady)},JSON.stringify({helperPid:service.pid}));if(${JSON.stringify(mode)}==='caller-loss-before-worker'&&!options.signal.aborted&&!process.env.FIXTURE_SUCCESSOR)await new Promise(resolve=>options.signal.addEventListener('abort',resolve,{once:true}));return service},audit:async options=>writeFileSync(options.evidence,JSON.stringify({scope:'synthetic audit only',filters:[]}))});
`)
 writeFileSync(callerScript,`import{withLock}from${JSON.stringify(url('state.mjs'))};import{runOwnedUiLease}from${JSON.stringify(url('ui-lease-owner.mjs'))};import{writeFileSync,existsSync}from'node:fs';
const controller=new AbortController();if(${JSON.stringify(mode)}==='cancel-running'){const timer=setInterval(()=>{if(existsSync(${JSON.stringify(ready)})){clearInterval(timer);controller.abort()}},25)}
await withLock('ui-automation',async lockFd=>{try{const result=await runOwnedUiLease({payload:{task:'synthetic lifetime fixture',timeoutSec:120},dir:process.env.FIXTURE_DIR||${JSON.stringify(dir)},lockFd,signal:controller.signal},{ownerScript:${JSON.stringify(ownerScript)}});writeFileSync(process.env.FIXTURE_RESULT||${JSON.stringify(resultFile)},JSON.stringify({ok:true,result}))}catch(e){writeFileSync(process.env.FIXTURE_RESULT||${JSON.stringify(resultFile)},JSON.stringify({ok:false,category:e.category,message:e.message}))}},{passKernelLock:true});
`)
 const env={...process.env,CODEX_HOME:root,CLAUDE_DRIVER_STATE_DIR:state,CODEX_BRIDGE_CODEX_PATH:backend}
 const caller=spawn(process.execPath,[callerScript],{env,detached:true,stdio:['ignore','ignore','pipe']})
 let stderr='',ownerPid,passed=false;caller.stderr.on('data',b=>stderr=(stderr+b).slice(-6000))
 const sentinel=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'})
 const callerDone=once(caller,'exit')
 const stateFile=join(dir,'ui-owner.json')
 const contend=()=>spawnSync(process.execPath,['--input-type=module','-e',`import{withLock}from${JSON.stringify(url('state.mjs'))};await withLock('ui-automation',()=>console.log('ACQUIRED'),{timeoutMs:300}).catch(e=>console.log(e.category));`],{env,encoding:'utf8',timeout:2000})
 try{
  if(!['normal','unknown-residue','startup-failure','cancel-running','watcher-refusal'].includes(mode)){
   await until(()=>{if(caller.exitCode!==null)throw Error('caller ended before fixture '+stderr);return existsSync(mode==='caller-loss-before-worker'?helperReady:ready)})
   ownerPid=JSON.parse(readFileSync(stateFile)).ownerPid
   if(mode.startsWith('caller-loss')){caller.kill('SIGKILL');await callerDone}
   if(mode==='owner-loss-running')process.kill(ownerPid,'SIGKILL')
   if(mode==='watcher-loss-running')process.kill(JSON.parse(readFileSync(stateFile)).watcherPid,'SIGKILL')
   if(mode==='caller-and-watcher-lost'){process.kill(JSON.parse(readFileSync(stateFile)).watcherPid,'SIGKILL');caller.kill('SIGKILL');await callerDone}
   if(mode==='owner-and-watcher-lost'){caller.kill('SIGSTOP');process.kill(JSON.parse(readFileSync(stateFile)).watcherPid,'SIGKILL');process.kill(ownerPid,'SIGKILL');caller.kill('SIGCONT')}
   if(mode==='both-owners-lost'){
    caller.kill('SIGSTOP');process.kill(ownerPid,'SIGKILL');caller.kill('SIGKILL');await callerDone
    await until(()=>existsSync(join(dir,'ui-owner-orphan.json'))&&JSON.parse(readFileSync(join(dir,'ui-owner-orphan.json'))).phase==='retired')
   }
  }
  if(!mode.startsWith('caller-loss')&&!['both-owners-lost','caller-and-watcher-lost'].includes(mode))await callerDone
  if(!ownerPid&&existsSync(stateFile))ownerPid=JSON.parse(readFileSync(stateFile)).ownerPid
  if(ownerPid)await until(async()=>(await ownedGroupMembers(ownerPid)).length===0)
  assert.equal(contend().stdout.trim(),'ACQUIRED','resources must release kernel ownership after cleanup')
  assert.equal(sentinel.exitCode,null);assert.equal(sentinel.signalCode,null)
  if(mode==='normal'){
   const r=JSON.parse(readFileSync(resultFile));assert.equal(r.ok,true,JSON.stringify(r))
   assert.equal(r.result.worker.result.finalText,'OWNED_OK');assert.equal(r.result.nativeInputService.helperExit.code,0)
   assert.equal(r.result.worker.execution.ownerLock.ino,r.result.owner.lock.ino)
  }else if(!mode.startsWith('caller-loss')&&!['both-owners-lost','caller-and-watcher-lost'].includes(mode))assert.equal(JSON.parse(readFileSync(resultFile)).ok,false)
  if(mode==='watcher-refusal')assert.equal(JSON.parse(readFileSync(stateFile)).helperPid,undefined,'refused watchdog must prevent helper startup')
  if(mode.startsWith('caller-loss')){const r=JSON.parse(readFileSync(stateFile));assert.equal(r.cancelled,true);assert.equal(r.closed,true)}
  if(mode==='both-owners-lost'){
   const orphan=JSON.parse(readFileSync(join(dir,'ui-owner-orphan.json')));assert.equal(orphan.originalWorkCompleted,false);assert.equal(orphan.inputAuditPassed,true)
   const successor=join(root,'successor'),successorResult=join(root,'successor-result.json');mkdirSync(successor)
   const r=spawnSync(process.execPath,[callerScript],{env:{...env,FIXTURE_SUCCESSOR:'1',FIXTURE_DIR:successor,FIXTURE_RESULT:successorResult},encoding:'utf8',timeout:10000})
   assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(readFileSync(successorResult)).ok,true,'a distinct successor lease must run after audited orphan retirement')
  }
  console.log(JSON.stringify({mode,ownerPid,closed:true,result:existsSync(resultFile)?JSON.parse(readFileSync(resultFile)).ok:null,sentinelPreserved:true}))
  passed=true
 }finally{
  if(caller.exitCode===null&&caller.signalCode===null){caller.kill('SIGKILL');await callerDone}
  if(!ownerPid&&existsSync(stateFile))ownerPid=JSON.parse(readFileSync(stateFile)).ownerPid
  if(ownerPid){try{process.kill(-ownerPid,'SIGKILL')}catch{};await until(async()=>(await ownedGroupMembers(ownerPid)).length===0)}
  sentinel.kill('SIGTERM');if(sentinel.exitCode===null&&sentinel.signalCode===null)await once(sentinel,'exit')
  const serviceFile=join(dir,'private-input-service.json')
  if(existsSync(serviceFile)){const row=JSON.parse(readFileSync(serviceFile));if(existsSync(dirname(row.socketPath)))rmSync(dirname(row.socketPath),{recursive:true,force:true})}
  if(passed)rmSync(root,{recursive:true,force:true});else console.log('retained fixture '+root+' '+stderr)
 }
})
