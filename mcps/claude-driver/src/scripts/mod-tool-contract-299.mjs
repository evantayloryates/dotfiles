#!/usr/bin/env node
// Exact installed 2.1.299 adapters; synthetic tool pipeline, no native calls.
import assert from 'node:assert/strict'
import {runInNewContext,Script} from 'node:vm'
import {join} from 'node:path'
import {versions,resolveClaudeBinary} from '../lib/paths.mjs'
import {installedWindowContaining} from '../lib/installed-source.mjs'
import {STATE_DIR,writeJsonAtomic} from '../lib/state.mjs'
import {RUNTIME_BUILD} from '../lib/build.mjs'
import {recordMemory} from '../lib/memory.mjs'
const report=join(STATE_DIR,'pressure','mod-tool-contract-299-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'),rows=[],sources={};let failure
try{
 assert.equal(versions().cli,'2.1.299','unreviewed CLI version')
 const binary=resolveClaudeBinary()
 function extract(name,start,end,after){const s=installedWindowContaining(binary,start,{after});const stop=s.text.indexOf(end);assert.ok(stop>0,'changed '+name+' boundary');let text=s.text.slice(0,stop),encoding='plain';try{new Script(text)}catch{text=JSON.parse('"'+text+'"');new Script(text);encoding='json-string-fragment'}sources[name]={offset:s.offset,sha256:s.sha256,encoding};return text}
 const mcp=extract('mcp','async function Sdn({server:e,tool:n,args:r},s)','var bdn=',2200),tool=extract('tool','async function HG(e,n)','function Wnr(',4000)
 const toolName='mcp__ccd_session_mgmt__get_session'
 function fixture(options={}){
  const calls=[],checks=[],permissions=[],ordinaryPermission=async input=>{permissions.push(input);return options.deny?'deny':'allow'},tools=options.tools??[{name:toolName,isMcp:true}],session={tools:()=>tools,canUseTool:ordinaryPermission}
  const context={Date,AbortController,Array,Object,Set,Error,Ie:Error,t:()=>{},_p:()=>{if(options.unbound)throw Error('synthetic session unbound');return session},kdn:(server,name)=>new Set(['mcp__'+server+'__'+name]),ydn:xs=>xs.join(','),dzs:(name,args)=>({tool:name,...args}),Ipe:e=>Object.fromEntries(Object.entries(e).filter(([k])=>!['tool','consent'].includes(k))),PO:e=>e.hidden===true,pn:(xs,name)=>xs.find(x=>x.name===name),sse:name=>name.startsWith('mcp__'),wee:()=>false,hE:()=>()=>{},Tnn:(_s,abortController,origin)=>{checks.push(origin);return {abortController,messages:[],options:{tools}}},xe:x=>x,hXo:(name,input)=>({name,input,id:'synthetic-call'}),ld:x=>x,bXo:x=>x,yEo:x=>typeof x==='string'?x:JSON.stringify(x),TXo:()=>false,DW:x=>x,Enn:()=>{},_Xo:()=>undefined,knn:(result,text)=>({result,text,isError:true}),GW:async function*(use,_message,permission,ctx){assert.equal(permission,ordinaryPermission);const decision=await permission(use.input);if(options.noResult)return;if(decision!=='deny')calls.push({name:use.name,input:use.input,origin:checks.at(-1)});yield {message:{content:[{type:'tool_result',tool_use_id:use.id,content:decision==='deny'?'<tool_use_error>synthetic hook denied</tool_use_error>':'synthetic metadata',is_error:decision==='deny'||options.toolError===true}]},...(decision==='deny'?{toolDenialKind:'hook'}:{}),toolUseResult:{content:[{type:'text',text:'synthetic metadata'}]}}}}
  const api=runInNewContext(`(()=>{${tool};${mcp};return {mcp:Sdn,tool:HG}})()`,context,{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}})
  return {...api,calls,checks,permissions,ctx:{plugin:'owned-fixture',signal:new AbortController().signal}}
 }
 const check=async(name,fn)=>{await fn();rows.push({name,ok:true})}
 await check('MCP adapter uses ordinary permission callback and exact origin',async()=>{const x=fixture(),r=await x.mcp({server:'ccd_session_mgmt',tool:'get_session',args:{session_id:'synthetic'}},x.ctx);assert.equal(r.isError,false);assert.equal(x.calls.length,1);assert.equal(x.permissions.length,1);assert.deepEqual(JSON.parse(JSON.stringify(x.calls[0].input)),{session_id:'synthetic'});assert.deepEqual(JSON.parse(JSON.stringify(x.checks[0])),{plugin:'owned-fixture',origin:['owned-fixture']})})
 await check('ordinary hook denial prevents synthetic execution and propagates refusal',async()=>{const x=fixture({deny:true});await assert.rejects(()=>x.mcp({server:'ccd_session_mgmt',tool:'get_session',args:{}},x.ctx),/refused.*synthetic hook denied/);assert.equal(x.calls.length,0)})
 await check('unbound session and missing or hidden tools cannot execute',async()=>{for(const options of [{unbound:true},{tools:[]},{tools:[{name:toolName,hidden:true}]}]){const x=fixture(options);await assert.rejects(()=>x.mcp({server:'ccd_session_mgmt',tool:'get_session',args:{}},x.ctx));assert.equal(x.calls.length,0)}})
 await check('missing pipeline result refuses and tool errors retain isError',async()=>{const missing=fixture({noResult:true});await assert.rejects(()=>missing.mcp({server:'ccd_session_mgmt',tool:'get_session',args:{}},missing.ctx),/produced no result/);const x=fixture({toolError:true});assert.equal((await x.mcp({server:'ccd_session_mgmt',tool:'get_session',args:{}},x.ctx)).isError,true)})
 await check('MCP consent injection is refused rather than manufacturing human authority',async()=>{const x=fixture();await assert.rejects(()=>x.tool({tool:toolName,consent:'synthetic human grant'},x.ctx),/does not accept/);assert.equal(x.calls.length,0)})
}catch(e){failure=String(e.message).slice(0,500)}
const evidence={scope:'installed-2.1.299-mod-tool-adapters-isolated',runtimeBuild:RUNTIME_BUILD,versions:versions(),sources,rows,ok:!failure,...failure&&{failure},nativeCalls:0,modulesLoaded:0,limitations:['Ordinary tool pipeline and permission provider are synthetic','Does not prove desktop PreToolUse hook invocation, native module loading, serving or retirement']};writeJsonAtomic(report,evidence);recordMemory({kind:'test_result',topic:'current-mod-tool-contract',source:'installed-adapter-isolated',status:evidence.ok?'passed':'failed',evidence:report,lesson:'Exact2.1.299 MCP/tool adapters with synthetic dependencies; preserve ordinary permission callback, denial/errors, no-result refusal and MCP consent refusal. No native module or native serving qualification.'});console.log(JSON.stringify({report,...evidence}));process.exitCode=evidence.ok?0:1
