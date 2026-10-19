#!/usr/bin/env node
// Execute installed mods adapters with synthetic session/tool dependencies.
// No mod loading, native IPC, desktop writes, inference or tool effects.
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {join} from 'node:path'
import {resolveClaudeBinary,versions} from '../lib/paths.mjs'
import {installedWindowContaining,cutInstalledFunction} from '../lib/installed-source.mjs'
import {STATE_DIR,writeJsonAtomic} from '../lib/state.mjs'
import {RUNTIME_BUILD} from '../lib/build.mjs'
import {recordMemory} from '../lib/memory.mjs'
const report=join(STATE_DIR,'pressure','mod-tool-contract-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'),sources={},rows=[]
let stage='extract',failure
try{
 const binary=resolveClaudeBinary()
 sources.publicApi=installedWindowContaining(binary,'var gk=(e,t,o)=>Ny({call:',{after:220})
 sources.binding=installedWindowContaining(binary,'function Hu(e,n){let r=px()', {after:700})
 sources.mcp=installedWindowContaining(binary,'async function ZOt({server:e,tool:n,args:r},s)',{before:150,after:2200})
 sources.tool=installedWindowContaining(binary,'async function eU(e,n)',{after:3600})
 sources.pipeline=installedWindowContaining(binary,'async function*W1(e,n,r,s,g,h=cMt)',{after:6000})
 sources.permission=installedWindowContaining(binary,'async function zyo(',{after:18000})
 sources.agent=installedWindowContaining(binary,'async function $Kt(e,n,r,s,g,h,b,w)',{after:5200})
 const mcp=cutInstalledFunction(sources.mcp.text,'async function ZOt({server:e,tool:n,args:r},s)','var qFt='),tool=cutInstalledFunction(sources.tool.text,'async function eU(e,n)','function Yyo(')
 const check=async(name,fn)=>{stage=name;await fn();rows.push({name,ok:true})}
 function make(options={}){
  const calls=[],checks=[],permissions=[],tools=options.tools??[{name:'mcp__ccd_session_mgmt__get_session',isMcp:true}],ordinaryPermission=async input=>{permissions.push(input);return options.deny?'deny':'allow'}
  const session={tools:()=>tools,canUseTool:ordinaryPermission},controller=new AbortController
  const ctx={Date,AbortController,Array,Object,Set,Reflect,Error,
   Hu:()=>{if(options.unbound)throw Error('synthetic unbound session');return session},JOt:(server,name)=>new Set(['mcp__'+server+'__'+name]),QOt:xs=>xs.join(','),Ias:(name,args)=>({tool:name,...args}),t:()=>{},Ie:Error,
   _se:e=>Object.fromEntries(Object.entries(e).filter(([k])=>!['tool','consent'].includes(k))),Mx:x=>x.hidden===true,yn:(xs,name)=>xs.find(x=>x.name===name),Uoe:()=>options.consentUnsupported===true,
   av:()=>()=>{},$At:(_s,abortController,origin)=>{checks.push(origin);return {abortController,options:{tools},messages:[]}},Re:x=>x,hfo:(name,input)=>({name,input,id:'synthetic-call'}),wc:x=>x,
   bfo:x=>x,r5r:x=>typeof x==='string'?x:JSON.stringify(x),Aq:x=>x,_fo:()=>undefined,FAt:(result,text)=>({result,text,isError:true}),BAt:()=>{},
   W1:async function*(use,_message,permission,context){
    assert.equal(permission,ordinaryPermission);const decision=await permission(use.input)
    if(options.noResult)return
    if(decision!=='deny')calls.push({name:use.name,input:use.input,origin:checks.at(-1),signal:context.abortController.signal.aborted})
    yield {message:{content:[{type:'tool_result',tool_use_id:use.id,content:decision==='deny'?'<tool_use_error>synthetic gate denied</tool_use_error>':'synthetic native receipt',is_error:decision==='deny'||options.toolError===true}]},...(decision==='deny'?{toolDenialKind:'hook'}:{}),toolUseResult:options.structured??{content:[{type:'text',text:'synthetic native receipt'}]}}
   }}
  const invoke=runInNewContext(`(()=>{${tool};${mcp};return ZOt})()`,ctx,{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}})
  return {invoke,calls,checks,permissions,context:{plugin:'synthetic-owned-service',signal:controller.signal}}
 }
 await check('public MCP wrapper requires positional arguments and preserves fixture input',async()=>{
  const wrapper=cutInstalledFunction(sources.publicApi.text,'var gk=','var Bp=')
  const api=runInNewContext(`(()=>{${wrapper};return gk})()`,{Ny:x=>x})
  const calls=[],mcp=api('synthetic',x=>calls.push(x),()=>{})
  mcp.call('ccd_session_mgmt','get_session',{session_id:'synthetic'})
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),{server:'ccd_session_mgmt',tool:'get_session',args:{session_id:'synthetic'}})
  mcp.call({server:'ccd_session_mgmt',tool:'get_session',args:{session_id:'synthetic'}})
  assert.equal(typeof calls[1].server,'object');assert.equal(calls[1].tool,undefined)
 })
 await check('installed binding guard reports unavailable session before any tool dispatch',async()=>{
  const guard=cutInstalledFunction(sources.binding.text,'function Hu(e,n){let r=px()','function woo(')
  const invoke=runInNewContext(`(()=>{${guard};return Hu})()`,{px:()=>undefined,Ie:Error})
  assert.throws(()=>invoke('synthetic-owned-service','$.mcp.call'),/no session is bound in this process/)
  const bound={tools:()=>[]};const allow=runInNewContext(`(()=>{${guard};return Hu})()`,{px:()=>bound,Ie:Error});assert.equal(allow('synthetic-owned-service','$.mcp.call'),bound)
 })
 await check('installed MCP adapter reaches ordinary tool pipeline without model selection',async()=>{
  const c=make(),r=await c.invoke({server:'ccd_session_mgmt',tool:'get_session',args:{session_id:'synthetic'}},c.context)
  assert.equal(c.calls.length,1);assert.equal(c.permissions.length,1);assert.equal(c.calls[0].input.session_id,'synthetic');assert.equal(c.checks[0].plugin,'synthetic-owned-service');assert.deepEqual(Array.from(c.checks[0].origin),['synthetic-owned-service']);assert.equal(r.isError,false)
 })
 await check('synthetic permission denial propagates through both installed adapters without invocation',async()=>{
  const c=make({deny:true});await assert.rejects(c.invoke({server:'ccd_session_mgmt',tool:'get_session',args:{}},c.context),/refused/);assert.equal(c.calls.length,0);assert.equal(c.permissions.length,1)
 })
 await check('missing native MCP tool and unbound session refuse before pipeline entry',async()=>{
  for(const options of [{tools:[]},{unbound:true},{tools:[{name:'mcp__other__get_session'}]}]){const c=make(options);await assert.rejects(c.invoke({server:'ccd_session_mgmt',tool:'get_session',args:{}},c.context));assert.equal(c.calls.length,0);assert.equal(c.permissions.length,0)}
 })
 await check('hidden tools cannot be invoked even when the initial MCP lookup finds them',async()=>{
  const c=make({tools:[{name:'mcp__ccd_session_mgmt__get_session',hidden:true}]});await assert.rejects(c.invoke({server:'ccd_session_mgmt',tool:'get_session',args:{}},c.context),/no tool named/);assert.equal(c.calls.length,0)
 })
 await check('ordinary pipeline error stays an error instead of a success receipt',async()=>{
  const c=make({toolError:true}),r=await c.invoke({server:'ccd_session_mgmt',tool:'get_session',args:{}},c.context);assert.equal(r.isError,true);assert.equal(c.calls.length,1)
 })
 await check('missing pipeline result refuses instead of inventing completion',async()=>{
  const c=make({noResult:true});await assert.rejects(c.invoke({server:'ccd_session_mgmt',tool:'get_session',args:{}},c.context),/produced no result/);assert.equal(c.calls.length,0)
 })
 await check('installed pipeline source retains ordinary permission callback through native dispatch',async()=>{
  assert.ok(sources.pipeline.text.includes('jyo(w,e.id,Ze,s,r,n,'));assert.ok(sources.pipeline.text.includes('canUseTool:r'))
  assert.ok(sources.permission.text.includes('PreToolUse'));assert.ok(sources.permission.text.includes('permissionDecision'))
 })
 await check('agent hook source has fresh messages but inherits tools and a 50-turn budget',async()=>{
  assert.ok(sources.agent.text.includes('let ve=[Re({content:ke})]'));assert.ok(sources.agent.text.includes('xzo(h.options.tools)'));assert.ok(sources.agent.text.includes('Pt=50'));assert.ok(sources.agent.text.includes('mode:"dontAsk"'));assert.ok(sources.agent.text.includes('refreshTools:void 0,refreshMcpClients:void 0'))
 })
}catch(e){failure={stage,message:String(e.message).slice(0,500)}}
const evidence={scope:'installed mods MCP and tool adapters, synthetic dependencies only',runtimeBuild:RUNTIME_BUILD,versions:versions(),sources:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,{sha256:v.sha256,bytes:v.bytes,offset:v.offset}])),rows,ok:!failure,...failure&&{failure},nativeGateExecuted:false,nativePluginLoaded:false,inferenceTurns:0,releaseAuthorized:false}
writeJsonAtomic(report,evidence);recordMemory({kind:'test_result',topic:'mechanical-mod-route',source:'installed-adapter-contract',status:evidence.ok?'passed':'failed',evidence:report,lesson:'Installed mods MCP calls enter ordinary tool pipeline with its permission callback and propagate denial/errors. Dependencies are synthetic; native PreToolUse execution, mod activation and general serving remain unqualified. Agent hooks inherit tools and allow50 turns.'})
console.log(JSON.stringify({report,...evidence}));process.exitCode=evidence.ok?0:1
