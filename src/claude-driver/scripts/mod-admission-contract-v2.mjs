#!/usr/bin/env node
// Execute exact installed admission adapters with synthetic dependencies only.
// No native session, plugin load, model call, permission change or tool effect.
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {resolveClaudeBinary,versions} from '../lib/paths.mjs'
import {installedWindowContaining,installedModuleContaining,cutInstalledFunction as cut} from '../lib/installed-source.mjs'
import {STATE_DIR,writeJsonAtomic} from '../lib/state.mjs'
import {RUNTIME_BUILD} from '../lib/build.mjs'
import {recordMemory} from '../lib/memory.mjs'
const report=join(STATE_DIR,'pressure','mod-admission-contract-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'),rows=[],sources={}
let stage='extract',failure
const findings=[]
try{
 const binary=resolveClaudeBinary()
 sources.hooks=installedWindowContaining(binary,'async function*kVn(e,n,r,s,g,h,b,w)',{after:5500})
 sources.decision=installedWindowContaining(binary,'async function AVn(e,n,r,s,g,h,b)',{after:4000})
 sources.aggregation=installedWindowContaining(binary,'async function Uat(e,n,r)',{before:1400,after:2200})
 sources.peer=installedModuleContaining(binary,'function en(e){e.setEncoding("utf8")')
 sources.loader=installedModuleContaining(binary,'dev mods: the catch-up failed: ${l(o)}')
 const hook=cut(sources.hooks.text,'async function*kVn(e,n,r,s,g,h,b,w)','var iMr='),decision=cut(sources.decision.text,'async function AVn(e,n,r,s,g,h,b)','async function*kVn(')
 const check=async(name,fn)=>{stage=name;await fn();rows.push({name,ok:true})}
 const tool={name:'mcp__ccd_session_mgmt__get_session',isMcp:true,inputSchema:{safeParse:()=>({success:true})}}
 async function hooks(input=[],{throwDispatch=false,abort=false,remote=false}={}){
  const controller=new AbortController;if(abort)controller.abort()
  const api=runInNewContext(`(()=>{${hook};return kVn})()`,{Date,Nx:()=>true,zTe:async function*(){for(const row of input)yield row;if(throwDispatch)throw Error('synthetic hook dispatcher failed')},de:()=>({mode:'bypassPermissions'}),ere:()=>false,tre:()=>({behavior:'deny'}),Ncn:String,wZ:(_name,value)=>value,ln:x=>x,t:()=>{},c:()=>{},i:()=>{},Dn:x=>x,_e:x=>x,d:x=>x,_:x=>x,nt:()=>false,ot:x=>x,Y:String,cR:String,_Ot:'synthetic hook failure',myo:'synthetic timeout'}, {timeout:1000,contextCodeGeneration:{strings:false,wasm:false}})
  const events=[];for await(const row of api({options:{},abortController:controller,...remote&&{remoteCall:{}}},tool,{session_id:'synthetic'},'synthetic-tool-use','synthetic-message'))events.push(row)
  return events
 }
 function permissions(){
  const calls=[],ctx={toolDecisions:new Map},input={session_id:'synthetic'},message={message:{id:'synthetic-message'}}
  const canUseTool=async(...args)=>{calls.push(args);return {behavior:'allow',updatedInput:args[1]}}
  const api=runInNewContext(`(()=>{${decision};return AVn})()`,{t:()=>{},jbe:()=>false,fR:()=>undefined,$De:()=>null,$P:async()=>undefined,rae:(_tool,value)=>value,BHr:async x=>x.evaluate(),RM:()=> 'bypassPermissions',de:()=>({mode:'bypassPermissions'}),k:()=>false},{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}})
  return {calls,run:(hookDecision,extra={})=>api(hookDecision,tool,input,{...ctx,...extra},canUseTool,message,'synthetic-tool-use')}
 }
 await check('installed explicit hook denial survives ordinary bypass permission mode',async()=>{
  const events=await hooks([{permissionBehavior:'deny',hookPermissionDecisionReason:'synthetic checkpoint absent'}]),c=permissions(),r=await c.run(events.find(x=>x.type==='hookPermissionResult').hookPermissionResult)
  assert.equal(r.decision.behavior,'deny');assert.equal(c.calls.length,0)
 })
 await check('installed blocking hook error becomes deny without ordinary permission fallback',async()=>{
  const events=await hooks([{blockingError:'synthetic gate refused'}]),c=permissions(),r=await c.run(events.find(x=>x.type==='hookPermissionResult').hookPermissionResult)
  assert.equal(r.decision.behavior,'deny');assert.equal(c.calls.length,0)
 })
 await check('hook dispatcher exception stops instead of generating an allow result',async()=>{
  const events=await hooks([],{throwDispatch:true});assert.ok(events.some(x=>x.type==='stop'));assert.ok(!events.some(x=>x.type==='hookPermissionResult'&&x.hookPermissionResult.behavior==='allow'))
 })
 await check('hook dispatcher exception after deny retains that denial',async()=>{
  const events=await hooks([{permissionBehavior:'deny'}],{throwDispatch:true});assert.ok(events.filter(x=>x.type==='hookPermissionResult').every(x=>x.hookPermissionResult.behavior==='deny'))
 })
 await check('aborted hook event produces a stop',async()=>{assert.ok((await hooks([{}],{abort:true})).some(x=>x.type==='stop'))})
 await check('hook approval with required ordinary permission calls original callback',async()=>{
  const c=permissions(),r=await c.run({behavior:'allow'},{requireCanUseTool:true});assert.equal(r.decision.behavior,'allow');assert.equal(c.calls.length,1)
 })
 await check('local hook stream ordering exposes later allow; served calls retain deny',async()=>{
  const input=[{permissionBehavior:'deny'},{permissionBehavior:'allow'}],local=await hooks(input),served=await hooks(input,{remote:true})
  assert.equal(local.filter(x=>x.type==='hookPermissionResult').at(-1).hookPermissionResult.behavior,'allow')
  assert.equal(served.filter(x=>x.type==='hookPermissionResult').at(-1).hookPermissionResult.behavior,'deny')
  findings.push({kind:'unqualified-hook-order-boundary',localLastDecision:'allow',servedLastDecision:'deny',scope:'synthetic upstream hook event stream into exact installed adapter; upstream real hook aggregation and live outcome NOT established',required:'Verify actual native effective hook ordering and permission fallback before relying on denial dominance with additional hooks.'})
 })
 await check('installed function-hook reducer retains deny across all allow/ask permutations',async()=>{
  const reducer=cut(sources.aggregation.text,'async function Uat(e,n,r)','async function Rq('),priority=sources.aggregation.text.match(/var bZ=\{deny:3,ask:2,allow:1,none:0\};/)?.[0];assert.ok(priority)
  const reduce=runInNewContext(`(()=>{${priority}${reducer};return Uat})()`,{wZ:(_name,x)=>x.blockingError},{timeout:1000})
  for(const order of [['deny','allow','ask'],['deny','ask','allow'],['allow','deny','ask'],['allow','ask','deny'],['ask','deny','allow'],['ask','allow','deny']]){
   const result=await reduce((async function*(){for(const permissionBehavior of order)yield {permissionBehavior,hookPermissionDecisionReason:'synthetic refusal'}})(),'synthetic',()=>{})
   assert.equal(result.deny,'synthetic refusal');assert.equal(result.allow,undefined);assert.equal(result.ask,undefined)
  }
  const result=await reduce((async function*(){yield {blockingError:{blockingError:'synthetic core failure'}};yield {permissionBehavior:'allow'}})(),'synthetic',()=>{})
  assert.equal(result.deny,'synthetic core failure');assert.equal(result.allow,undefined)
  findings.push({kind:'installed-function-hook-aggregation',denyDominates:true,scope:'exact installed reducer with synthetic events; six orders and blocking-error-then-allow',required:'Verify the native mod invocation actually traverses this reducer; standalone downstream adapter ordering is not evidence of a native bypass.'})
 })
 await check('peer transport does not accept SDK reload or custom command controls',async()=>{
  const receive=cut(sources.peer.text,'async function be(e,n,i,r,d){','function Qe('),logs=[],invoke=runInNewContext(`(()=>{${receive};return be})()`,{le:x=>typeof x.type==='string',Ie:()=>true,t:x=>logs.push(x),Rm:String},{timeout:1000})
  for(const action of ['reload_plugins','run_command']){await invoke({type:'control_request',request:{subtype:action}});await invoke({type:'control',action})}
  assert.equal(logs.filter(x=>x.includes('unhandled message type')).length,2);assert.equal(logs.filter(x=>x.includes('Unhandled control action')).length,2)
 })
 await check('warm mod consent requires a bound session and never invents an answer',async()=>{
  const ask=cut(sources.loader.text,'async function go(o,e){','function W(){'),effects=[]
  const go=runInNewContext(`(()=>{${ask};return go})()`,{px:()=>undefined,p:(...x)=>effects.push(x),AbortController,J:()=>{throw Error('unexpected dialog invocation')}},{timeout:1000})
  assert.equal(await go('/synthetic/mods'),'no_one_to_ask');assert.equal(effects.length,1)
 })
 await check('installed warm loader explicitly asks a person, not a model permission answer',async()=>{
  const ask=cut(sources.loader.text,'async function J(o,e){','async function go('),calls=[]
  const J=runInNewContext(`(()=>{${ask};return J})()`,{adn:{isRunning:()=>false},de:()=> 'synthetic question',fe:()=> 'synthetic explanation',ao:x=>x,WKe:async x=>{calls.push(x);return 'decline'},ae:'synthetic source',ne:'synthetic header',te:['synthetic choices']},{timeout:1000})
  const binding={canUseTool:()=>{},toolContext:()=>({})};assert.equal(await J({binding,folder:'/synthetic/mods',abortController:new AbortController},0),'decline');assert.equal(calls.length,1);assert.equal(calls[0].personOnly,true);assert.equal(calls[0].canUseTool,binding.canUseTool)
 })
 // The staged package itself is tested for ownership and redaction, not loaded.
 const path=new URL('../candidates/native-mod-probe/hooks/register.js',import.meta.url),code=readFileSync(path,'utf8'),registered=[]
 sources.candidate={sha256:createHash('sha256').update(code).digest('hex'),bytes:Buffer.byteLength(code)}
 const register=runInNewContext(`(()=>{${code.replace('export function register','function register')};return register})()`,{JSON},{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}});register((...args)=>registered.push(args))
 const start=registered.find(x=>x[0]==='session.start').at(-1),command=registered.find(x=>x[0]==='command.run').at(-1)
 function candidate({id='local_35b3ba48-f02e-48de-bfbb-925192d90de1',cwd='/Users/taylor/.local/state/claude-driver/broker',error=false}={}){const calls=[],commands=[];return {calls,commands,$:{session:{id:async()=>id,cwd:async()=>cwd},command:{register:async x=>commands.push(x)},mcp:{call:async x=>{calls.push(x);if(error)throw Error('synthetic private error');return {isError:false,content:[{type:'text',text:'synthetic private metadata'}]}}}}}}
 await check('staged probe rejects foreign session or directory before registration and read',async()=>{
  for(const options of [{id:'other'},{cwd:'/synthetic/other'}]){const c=candidate(options);await start(c.$,{},async x=>x);await command(c.$);assert.equal(c.commands.length,0);assert.equal(c.calls.length,0)}
 })
 await check('staged owned registration performs no read or automatic effect',async()=>{const c=candidate();await start(c.$,{},async x=>x);assert.equal(c.commands.length,1);assert.equal(c.calls.length,0)})
 await check('staged explicit read returns fixed metadata without raw result or error',async()=>{
  for(const error of [false,true]){const c=candidate({error}),r=await command(c.$);assert.equal(c.calls.length,1);assert.equal(c.calls[0].tool,'get_session');assert.equal(c.calls[0].args.session_id,'local_fc1e5eab-9d24-4e4c-a09c-9a386a6ffe14');assert.ok(!JSON.stringify(r).includes('private'));const data=JSON.parse(r.text);assert.equal(data.gateQualified,false);assert.equal(data.releaseAuthorized,false);assert.equal(data.nativeCallReturned,!error)}
 })
}catch(e){failure={stage,message:String(e.message).slice(0,500)}}
const evidence={scope:'installed admission adapters and staged package; synthetic upstream hooks/session/tools only',runtimeBuild:RUNTIME_BUILD,versions:versions(),sources:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,{sha256:v.sha256,bytes:v.bytes,...v.offset!==undefined&&{offset:v.offset}}])),rows,findings,ok:!failure,...failure&&{failure},nativeGateExecuted:false,nativePluginLoaded:false,inferenceTurns:0,releaseAuthorized:false}
writeJsonAtomic(report,evidence);recordMemory({kind:'test_result',topic:'mechanical-mod-admission',source:'installed-admission-contract',status:evidence.ok?'passed':'failed',evidence:report,lesson:'Installed denial/error/cancellation adapter and staged scope/privacy checks. Local synthetic deny-then-allow stream ends allow; actual upstream ordering/native outcome unqualified. Peer cannot activate mods by SDK/custom controls. No live effects.'});console.log(JSON.stringify({report,...evidence}));process.exitCode=evidence.ok?0:1
