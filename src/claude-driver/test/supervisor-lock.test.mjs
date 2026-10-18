// Actual kernel/directory lock + private helper factory + actual UI worker,
// using only synthetic Node socket/backend processes. Never starts native CUA.
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs'
import {join,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawn,spawnSync,execFileSync} from 'node:child_process'
import {once} from 'node:events'
import {syntheticInputRoster} from './private-input-fixture.mjs'
const here=dirname(fileURLToPath(import.meta.url)),moduleUrl=name=>new URL('../lib/'+name,import.meta.url).href
const worker=fileURLToPath(new URL('../scripts/tierc-worker.mjs',import.meta.url))
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
function alive(pid){try{return !execFileSync('/bin/ps',['-p',String(pid),'-o','stat='],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().startsWith('Z')}catch{return false}}
async function waitFor(fn){for(let i=0;i<160;i++){if(fn())return;await sleep(25)}throw Error('owned fixture condition timed out')}
for(const phase of ['helper-startup','running-worker'])test(`supervisor loss never releases UI lock over live resources: ${phase}`,{timeout:15000},async()=>{
 const root=mkdtempSync('/private/tmp/claude-ui-owner-'),state=join(root,'state'),ready=join(root,'ready.json'),backendReady=join(root,'backend-ready'),helper=join(root,'helper'),backend=join(root,'backend'),parentFile=join(root,'parent.mjs')
 mkdirSync(state);writeFileSync(join(state,'ui-quarantine.json'),JSON.stringify({blocked:false,scope:'synthetic process ownership test'}))
 writeFileSync(helper,`#!${process.execPath}\nimport{createServer}from'node:net';const s=createServer(c=>c.on('end',()=>s.close(()=>process.exit(0))));s.listen(process.env.SKY_CUA_SERVICE_NATIVE_PIPE_PATH);`,{mode:0o700})
 writeFileSync(backend,`#!${process.execPath}
import{createInterface}from'node:readline';import{connect}from'node:net';import{writeFileSync}from'node:fs';
if(process.argv.includes('--version')){console.log('codex-cli 0.160.0-synthetic');process.exit(0)}
const emit=x=>console.log(JSON.stringify(x));let client;
createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;
if(r.method==='thread/start'){client=connect(r.params.config.mcp_servers.cua_repl.env.SKY_CUA_SERVICE_NATIVE_PIPE_PATH);client.on('connect',()=>emit({id:r.id,result:{thread:{id:'owned-thread'},model:'synthetic'}}));return}
emit({id:r.id,result:r.method==='mcpServerStatus/list'?${JSON.stringify(syntheticInputRoster())}:r.method==='turn/start'?{turn:{id:'owned-turn'}}:{}});
if(r.method==='turn/start')writeFileSync(${JSON.stringify(backendReady)},'owned synthetic provider remains alive');
});
`,{mode:0o700})
 writeFileSync(parentFile,`import{spawn}from'node:child_process';import{writeFileSync,existsSync}from'node:fs';import{withLock}from${JSON.stringify(moduleUrl('state.mjs'))};import{openPrivateInputService}from${JSON.stringify(moduleUrl('private-input-service.mjs'))};
await withLock('ui-automation',async lockFd=>{
 const runtime={resourceRoot:${JSON.stringify(root)},helperApp:${JSON.stringify(root)},codexHome:${JSON.stringify(root)},hashes:{scope:'synthetic-only'},files:{helper:${JSON.stringify(helper)},node:process.execPath,launcher:${JSON.stringify(join(root,'unused-cua.mjs'))},cli:${JSON.stringify(backend)}}};
 const service=await openPrivateInputService({evidenceDir:${JSON.stringify(root)},lockFd},{inspect:async()=>runtime});let child;
 if(${JSON.stringify(phase)}==='running-worker'){
  child=spawn(process.execPath,[${JSON.stringify(worker)}],{env:{...process.env,CODEX_BRIDGE_CODEX_PATH:${JSON.stringify(backend)},CODEX_BRIDGE_STATE_DIR:${JSON.stringify(join(root,'worker-state'))}},detached:true,stdio:['pipe','ignore','ignore',...(Number.isInteger(lockFd)?[lockFd]:[])]});child.stdin.end(JSON.stringify({task:'synthetic pending provider',timeoutSec:120,inputService:service.binding}));
  while(!existsSync(${JSON.stringify(backendReady)}))await new Promise(r=>setTimeout(r,25));
 }
 writeFileSync(${JSON.stringify(ready)},JSON.stringify({parentPid:process.pid,helperPid:service.pid,workerPid:child?.pid,lockFd,serviceEvidence:service.evidence}));await new Promise(()=>{});
},{passKernelLock:true});
`)
 const env={...process.env,CODEX_HOME:root,CLAUDE_DRIVER_STATE_DIR:state}
 const parent=spawn(process.execPath,[parentFile],{env,detached:true,stdio:['ignore','ignore','pipe']})
 let stderr='';parent.stderr.on('data',b=>{stderr=(stderr+b).slice(-4000)})
 const sentinel=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'})
 let identity,report,passed=false
 try{
  await waitFor(()=>{if(parent.exitCode!==null)throw Error('synthetic supervisor failed: '+stderr+' root '+root);return existsSync(ready)});identity=JSON.parse(readFileSync(ready));assert.equal(identity.parentPid,parent.pid)
  parent.kill('SIGKILL');await once(parent,'exit')
  const check=`import{withLock}from${JSON.stringify(moduleUrl('state.mjs'))};await withLock('ui-automation',()=>console.log('ACQUIRED'),{timeoutMs:500}).catch(e=>console.log(e.category));`
  const contender=spawnSync(process.execPath,['--input-type=module','-e',check],{env,encoding:'utf8',timeout:3000})
  assert.equal(contender.error,undefined)
  const resources=[identity.helperPid,identity.workerPid].filter(Boolean),live=resources.filter(alive)
  report={phase,parentExit:{code:parent.exitCode,signal:parent.signalCode},liveOwnedResources:live,contender:contender.stdout.trim(),sentinelAlive:alive(sentinel.pid),root}
  console.log(JSON.stringify(report))
  assert.equal(report.sentinelAlive,true)
  assert.equal(report.contender==='ACQUIRED'&&live.length>0,false,'a fresh lease must not enter over resources orphaned by supervisor loss')
  passed=true
 }finally{
  // All groups were created here; never signal shared/native helpers.
  if(identity?.workerPid)try{process.kill(-identity.workerPid,'SIGKILL')}catch{}
  try{process.kill(-parent.pid,'SIGTERM')}catch{}
  if(parent.exitCode===null&&parent.signalCode===null)await once(parent,'exit')
  if(identity)await waitFor(()=>[identity.helperPid,identity.workerPid].filter(Boolean).every(p=>!alive(p)))
  sentinel.kill('SIGTERM');if(sentinel.exitCode===null&&sentinel.signalCode===null)await once(sentinel,'exit')
  if(passed){
   const final=spawnSync(process.execPath,['--input-type=module','-e',`import{withLock}from${JSON.stringify(moduleUrl('state.mjs'))};await withLock('ui-automation',()=>console.log('ACQUIRED'),{timeoutMs:1000});`],{env,encoding:'utf8',timeout:3000})
   assert.equal(final.status,0);assert.equal(final.stdout.trim(),'ACQUIRED')
   rmSync(root,{recursive:true,force:true})
  }else if(identity){
   const row=JSON.parse(readFileSync(identity.serviceEvidence));if(existsSync(dirname(row.socketPath)))rmSync(dirname(row.socketPath),{recursive:true,force:true})
  }
 }
})
