import {test,after} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,existsSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,dirname} from 'node:path'
import {connect} from 'node:net'
import {once} from 'node:events'
import {spawn} from 'node:child_process'
import {syntheticInputBinding,syntheticInputRoster} from './private-input-fixture.mjs'
const root=mkdtempSync(join(tmpdir(),'claude-private-input-'))
process.env.CLAUDE_DRIVER_STATE_DIR=join(root,'policy')
const {openPrivateInputService,privateInputThreadParams,inspectPrivateInputRuntime,admitPrivateInputRoster}=await import('../lib/private-input-service.mjs')
const {writeJsonAtomic,readJson}=await import('../lib/state.mjs')
const policy=join(root,'policy/ui-quarantine.json')
writeJsonAtomic(policy,{blocked:false})
after(()=>rmSync(root,{recursive:true,force:true}))
function runtimeFor(name,code){
 const dir=join(root,name);mkdirSync(dir)
 const helper=join(dir,'helper')
 writeFileSync(helper,`#!${process.execPath}\n${code}`,{mode:0o700})
 return {dir,runtime:{resourceRoot:dir,helperApp:dir,codexHome:dir,hashes:{scope:'synthetic'},files:{helper,node:process.execPath,launcher:join(dir,'unused-cua.mjs'),cli:process.execPath}}}
}
const socketHelper=`import{createServer}from'node:net';const server=createServer(c=>c.on('end',()=>server.close(()=>process.exit(0))));server.listen(process.env.SKY_CUA_SERVICE_NATIVE_PIPE_PATH);`
async function releaseSocket(path){const c=connect(path);await once(c,'connect');c.end()}

test('quarantine and prior cancellation prevent even runtime inspection',async()=>{
 let inspected=0
 try{
  writeJsonAtomic(policy,{blocked:true,reason:'synthetic incident'})
  await assert.rejects(openPrivateInputService({evidenceDir:root},{inspect:async()=>{inspected++}}),e=>e.category==='ui_quarantined')
 }finally{writeJsonAtomic(policy,{blocked:false})}
 const controller=new AbortController();controller.abort()
 await assert.rejects(openPrivateInputService({evidenceDir:root,signal:controller.signal},{inspect:async()=>{inspected++}}),/cancelled/)
 assert.equal(inspected,0)
})
test('thread binding replaces only this lease CUA server and disables duplicate plugins',()=>{
 const original={cwd:root,config:{model:'keep',mcp_servers:{other:{enabled:false}},plugins:{other:{enabled:false}}}}
 const input=syntheticInputBinding(root),before=JSON.stringify(original)
 process.env.SYNTHETIC_CREDENTIAL_MUST_NOT_INHERIT='synthetic-private-value'
 try{
  const p=privateInputThreadParams(original,input),s=p.config.mcp_servers.cua_repl
  assert.equal(JSON.stringify(original),before);assert.equal(p.config.model,'keep');assert.deepEqual(p.config.mcp_servers.other,{enabled:false})
  assert.equal(p.config.plugins['unified-computer-use@openai-bundled'].enabled,false)
  assert.equal(p.config.plugins['computer-use@openai-bundled'].enabled,false)
  assert.equal(s.command,input.node);assert.deepEqual(s.args,[input.launcher])
  assert.equal(s.env.SKY_CUA_SERVICE_NATIVE_PIPE_PATH,input.socketPath)
  assert.equal(s.env.SKY_CUA_SERVICE_PATH,input.startupDisabledApp)
  assert.equal(s.env.CUA_REPL_ENABLED_SURFACES,'computer')
  assert.equal(s.env.SYNTHETIC_CREDENTIAL_MUST_NOT_INHERIT,undefined)
  assert.deepEqual(s.enabled_tools,['js','js_reset','turn_ended'])
  assert.equal(s.default_tools_approval_mode,'approve')
  assert.throws(()=>privateInputThreadParams(original,null),/binding missing/)
  assert.throws(()=>privateInputThreadParams(original,{...input,startupDisabledApp:'/different/startup.app'}),/sentinel/)
  mkdirSync(input.startupDisabledApp);assert.throws(()=>privateInputThreadParams(original,input),/unexpectedly exists/)
 }finally{delete process.env.SYNTHETIC_CREDENTIAL_MUST_NOT_INHERIT}
})
test('changed runtime refuses before signature verification or native launch',async()=>{
 const dir=join(root,'changed-runtime');mkdirSync(join(dir,'bin'),{recursive:true});writeFileSync(join(dir,'bin/node'),'synthetic changed runtime')
 await assert.rejects(inspectPrivateInputRuntime({resourceRoot:dir,helperApp:dir,cli:join(dir,'cli')}),/component changed.*node/)
})
test('MCP admission verifies the exclusive connected server across roster pages',async()=>{
 const requests=[]
 const result=await admitPrivateInputRoster('owned-thread',async p=>{
  requests.push(p)
  return p.cursor?syntheticInputRoster():{data:[{name:'disabled',runtimeStatus:'disabled',tools:{}}],nextCursor:'page2'}
 })
 assert.equal(result.serverName,'cua_repl');assert.equal(result.disabledServers,1)
 assert.deepEqual(result.tools,['js','js_reset','turn_ended'])
 assert.deepEqual(requests,[{threadId:'owned-thread',limit:100},{threadId:'owned-thread',limit:100,cursor:'page2'}])
})
test('MCP admission refuses other clients, plugin fallback and expanded tool access',async()=>{
 const own=syntheticInputRoster().data[0]
 for(const rows of [
  [{...own,pluginId:'shared-plugin'}],
  [{...own,runtimeStatus:'starting'}],
  [{...own,tools:{...own.tools,shell:{}}}],
  [{...own,toolsError:'unavailable'}],
  [own,{name:'other',runtimeStatus:'connected',tools:{read:{}}}],
  [own,own],[]
 ])await assert.rejects(admitPrivateInputRoster('owned-thread',async()=>({data:rows}),{timeoutMs:0}),/exclusive owned server/)
 await assert.rejects(admitPrivateInputRoster('owned-thread',async()=>({}),{timeoutMs:0}),/roster unavailable/)
 await assert.rejects(admitPrivateInputRoster('owned-thread',async()=>({data:[],nextCursor:'loop'}),{timeoutMs:0}),/verification bound/)
})
test('owns a real socket and waits for exact child exit before a cleanup receipt',async()=>{
 const {dir,runtime}=runtimeFor('normal',socketHelper)
 const service=await openPrivateInputService({evidenceDir:dir},{inspect:async()=>runtime})
 assert.equal(readJson(service.evidence).ready,true)
 await releaseSocket(service.binding.socketPath)
 const [a,b]=await Promise.all([service.close(),service.close()])
 assert.equal(a.helperPid,service.pid);assert.equal(a.helperExit.code,0);assert.equal(a.nativeHelperExited,true);assert.equal(a.forcedTermination,false)
 assert.deepEqual(a,b);assert.equal(existsSync(dirname(service.binding.socketPath)),false)
 assert.equal(readJson(service.evidence).closed,true)
})
test('wrong socket owner fails startup even when the owned child then exits cleanly',async()=>{
 const {dir,runtime}=runtimeFor('wrong-owner',socketHelper)
 await assert.rejects(openPrivateInputService({evidenceDir:dir},{inspect:async()=>runtime,verifySocketOwner:async(_pid,path)=>{await releaseSocket(path);return false}}),/exact owned helper/)
 const row=readJson(join(dir,'private-input-service.json'))
 assert.equal(row.ready,false);assert.equal(row.closed,true);assert.match(row.failure,/not bound/)
 assert.equal(existsSync(dirname(row.socketPath)),false)
})
test('spawn failure preserves a refusal and removes only its own scratch directory',async()=>{
 const {dir,runtime}=runtimeFor('spawn-error','')
 await assert.rejects(openPrivateInputService({evidenceDir:dir},{inspect:async()=>runtime,spawnChild:()=>{throw Error('synthetic spawn failure')}}),/spawn failed/)
 const row=readJson(join(dir,'private-input-service.json'))
 assert.equal(row.closed,true);assert.equal(row.failure,'helper_spawn_failed');assert.equal(existsSync(dirname(row.socketPath)),false)
})
test('forced cleanup is a failed lease and never signals an unrelated process',{timeout:12000},async()=>{
 const {dir,runtime}=runtimeFor('retained-client',socketHelper)
 const other=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'})
 try{
  const service=await openPrivateInputService({evidenceDir:dir},{inspect:async()=>runtime})
  await assert.rejects(service.close(),/did not close normally/)
  assert.equal(readJson(service.evidence).forcedTermination,true)
  assert.equal(other.exitCode,null);assert.equal(other.signalCode,null)
  assert.equal(existsSync(dirname(service.binding.socketPath)),false)
 }finally{other.kill('SIGTERM');if(other.exitCode===null&&other.signalCode===null)await once(other,'exit')}
})
