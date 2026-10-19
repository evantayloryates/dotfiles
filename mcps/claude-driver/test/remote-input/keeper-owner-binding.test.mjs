// Existing production caller/owner/watchdog/worker with a linked synthetic
// resident adapter. Real processes/IPC/kernel locks; no native runtime/input.
import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {connectKeeperResident} from '../../src/candidates/input-keeper/resident.mjs'
import {readProcessSnapshot} from '../../src/candidates/input-keeper/process-observation.mjs'
import {syntheticInputRoster} from '../private-input-fixture.mjs'
const fixture=fileURLToPath(new URL('./keeper-resident-fixture.mjs',import.meta.url)),epoch='c'.repeat(64),sleep=ms=>new Promise(r=>setTimeout(r,ms)),url=name=>new URL('../../'+name,import.meta.url).href
async function until(fn){const end=Date.now()+15000;while(!await fn()){if(Date.now()>end)throw Error('owner/resident condition deadline');await sleep(20)}}
const alive=c=>c.exitCode===null&&c.signalCode===null
for(const mode of ['normal','cancel','double-owner-loss'])test(`resident binds actual UI owner: ${mode}`,{timeout:40000},async()=>{
 const root=mkdtempSync('/private/tmp/keeper-resident-test-'),state=join(root,'state');mkdirSync(state,{mode:0o700});writeFileSync(join(state,'ui-quarantine.json'),JSON.stringify({blocked:false,scope:'synthetic owner/resident binding'}),{mode:0o600})
 const spec={dir:root,epoch},backend=join(root,'backend'),ownerEntry=join(root,'owner.mjs'),watchEntry=join(root,'watch.mjs'),callerEntry=join(root,'caller.mjs')
 writeFileSync(backend,`#!${process.execPath}
import{createInterface}from'node:readline';import{connect}from'node:net';import{writeFileSync}from'node:fs';
if(process.argv.includes('--version')){console.log('codex-cli 0.160.0-synthetic');process.exit(0)}
const emit=x=>console.log(JSON.stringify(x));let client;const rl=createInterface({input:process.stdin});
rl.on('close',()=>{if(client&&!client.destroyed){client.end();client.once('close',()=>process.exit(0))}else process.exit(0)});
rl.on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;
if(r.method==='thread/start'){client=connect(r.params.config.mcp_servers.cua_repl.env.SKY_CUA_SERVICE_NATIVE_PIPE_PATH);client.on('connect',()=>emit({id:r.id,result:{thread:{id:'synthetic-owned-thread'},model:'synthetic'}}));return}
emit({id:r.id,result:r.method==='mcpServerStatus/list'?${JSON.stringify(syntheticInputRoster())}:r.method==='turn/start'?{turn:{id:'synthetic-owned-turn'}}:{}});
if(r.method==='turn/start'){writeFileSync(process.env.CODEX_BRIDGE_STATE_DIR+'/running','owned synthetic worker');if(process.env.KEEPER_BIND_MODE==='normal'){emit({method:'item/completed',params:{threadId:'synthetic-owned-thread',item:{type:'agentMessage',text:'RESIDENT_WORKER_OK'}}});emit({method:'turn/completed',params:{threadId:'synthetic-owned-thread',turn:{id:'synthetic-owned-turn',status:'completed'}}})}}
});`,{mode:0o700})
 writeFileSync(watchEntry,`import{serveUiLeaseWatch}from${JSON.stringify(url('lib/ui-lease-watch.mjs'))};import{finishResidentUiLease}from${JSON.stringify(url('candidates/input-keeper/owner-binding.mjs'))};import{writeFileSync}from'node:fs';await serveUiLeaseWatch({audit:async options=>{await finishResidentUiLease({evidenceDir:process.env.CODEX_BRIDGE_STATE_DIR,lockFd:3,outcome:'owner-lost'},${JSON.stringify(spec)});writeFileSync(options.evidence,JSON.stringify({scope:'synthetic-no-native-filter-or-receiving-proof'}))}});`,{mode:0o600})
 writeFileSync(ownerEntry,`import{serveUiLeaseOwner}from${JSON.stringify(url('lib/ui-lease-owner.mjs'))};import{openResidentUiLease}from${JSON.stringify(url('candidates/input-keeper/owner-binding.mjs'))};import{writeFileSync}from'node:fs';await serveUiLeaseOwner({watcherScript:${JSON.stringify(watchEntry)},openService:options=>openResidentUiLease(options,${JSON.stringify(spec)}),audit:async options=>writeFileSync(options.evidence,JSON.stringify({scope:'synthetic-no-native-filter-or-receiving-proof'}))});`,{mode:0o600})
 writeFileSync(callerEntry,`import{withLock}from${JSON.stringify(url('lib/state.mjs'))};import{runOwnedUiLease}from${JSON.stringify(url('lib/ui-lease-owner.mjs'))};import{writeFileSync}from'node:fs';const controller=new AbortController();process.once('SIGUSR1',()=>controller.abort());await withLock('ui-automation',async lockFd=>{try{const value=await runOwnedUiLease({payload:{task:'Synthetic worker binding only',timeoutSec:60},dir:process.env.BIND_LEASE_DIR,lockFd,signal:controller.signal},{ownerScript:${JSON.stringify(ownerEntry)}});writeFileSync(process.env.BIND_LEASE_DIR+'/caller-result.json',JSON.stringify({ok:true,value}))}catch(error){writeFileSync(process.env.BIND_LEASE_DIR+'/caller-result.json',JSON.stringify({ok:false,category:error.category,message:error.message}))}},{passKernelLock:true});`,{mode:0o600})
 const env={...process.env,CLAUDE_DRIVER_STATE_DIR:state,CODEX_HOME:root,CODEX_BRIDGE_CODEX_PATH:backend}
 const resident=spawn(process.execPath,[fixture,root,'--owner-binding'],{env,detached:true,stdio:['ignore','ignore','pipe','ipc']});let stderr='';resident.stderr.on('data',b=>stderr+=b);const residentDone=once(resident,'exit')
 const callers=[],groups=new Set(),sentinel=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});let ok=false
 const client=()=>connectKeeperResident(spec)
 const run=async(name,kind)=>{
  const dir=join(root,name==='successor'?randomUUID():'lease-'+name);mkdirSync(dir,{mode:0o700})
  const child=spawn(process.execPath,[callerEntry],{env:{...env,BIND_LEASE_DIR:dir,KEEPER_BIND_MODE:kind},detached:true,stdio:['ignore','ignore','pipe']});let errors='';child.stderr.on('data',b=>errors+=b);const done=once(child,'exit');callers.push({child,done,dir})
  await until(()=>{if(!alive(child))throw Error('caller ended before worker readiness '+errors);return existsSync(join(dir,'running'))})
  const row=JSON.parse(readFileSync(join(dir,'ui-owner.json')));groups.add(row.group)
  assert(readProcessSnapshot().rows.some(p=>p.pid===row.ownerPid&&p.group===row.group))
  if(kind==='cancel')child.kill('SIGUSR1')
  if(kind==='double-owner-loss'){
   child.kill('SIGSTOP');process.kill(row.ownerPid,'SIGKILL');child.kill('SIGKILL');await done
   await until(()=>{try{return JSON.parse(readFileSync(join(dir,'ui-owner-orphan.json'))).phase==='retired'}catch{return false}})
  }else await done
  await until(()=>!readProcessSnapshot().rows.some(p=>p.group===row.group))
  return {dir,row,result:existsSync(join(dir,'caller-result.json'))?JSON.parse(readFileSync(join(dir,'caller-result.json'))):null}
 }
 try{
  await until(()=>{if(!alive(resident))throw Error('resident startup failed '+stderr);return existsSync(join(root,'resident.json'))&&JSON.parse(readFileSync(join(root,'resident.json'))).phase==='ready'})
  const initial=(await client().request('status')).result
  const first=await run('first',mode)
  if(mode==='normal'){
   assert.equal(first.result.ok,true,JSON.stringify(first.result));assert.equal(first.result.value.nativeInputService.helperRetained,true);assert.equal(first.result.value.nativeInputService.nativeHelperExited,false)
   assert.equal(first.result.value.worker.execution.inputServiceSocket,initial.resource.socketPath)
  }else if(mode==='cancel')assert.equal(first.result.category,'cancelled',JSON.stringify(first.result))
  else{assert.equal(first.result,null);assert.equal(JSON.parse(readFileSync(join(first.dir,'resident-lease.json'))).releaseResult.outcome,'owner-lost')}
  const after=(await client().request('status')).result;assert.equal(after.phase,'idle');assert.deepEqual(after.resource,initial.resource)
  const successor=await run('successor','normal');assert.equal(successor.result.ok,true,JSON.stringify(successor.result));assert.equal(successor.result.value.nativeInputService.helperRetained,true)
  assert.equal((await client().request('status')).result.resource.pid,initial.resource.pid)
  await client().request('shutdown');const [exit]=await residentDone;assert.equal(exit,0);assert.equal(alive(sentinel),true);ok=true
 }finally{
  for(const c of callers)if(alive(c.child)){c.child.kill('SIGKILL');await c.done}
  for(const group of groups)for(const p of readProcessSnapshot().rows.filter(p=>p.group===group))try{process.kill(p.pid,'SIGKILL')}catch{}
  if(alive(resident)){try{await client().request('shutdown')}catch{};if(alive(resident))try{process.kill(-resident.pid,'SIGKILL')}catch{};await residentDone}
  await until(()=>!readProcessSnapshot().rows.some(p=>groups.has(p.group)||p.group===resident.pid))
  sentinel.kill('SIGTERM');await once(sentinel,'exit')
  if(ok)rmSync(root,{recursive:true,force:true});else console.log('retained failed actual-owner resident fixture '+root+' '+stderr.slice(-2000))
 }
})
