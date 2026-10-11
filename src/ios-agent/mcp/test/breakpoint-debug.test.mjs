import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';import {createServer} from '../server.mjs';import {Backend} from '../backend.mjs';
test('breakpoint schema requires an owned document and exact source location before dispatch',async()=>{
 const seen=[];const {server}=createServer({deviceInspect:async x=>{seen.push(x);return {ok:true};},cancel:async()=>{},close:async()=>{}});const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);const c=new Client({name:'breakpoint-schema',version:'1'});await c.connect(ct);
 const good={browser:'safari',op:'breakpoint',sessionId:'b'.repeat(32),documentRef:'a'.repeat(32),scriptId:'1',sourceHash:'c'.repeat(64),lineNumber:0};
 try{
  for(const key of ['sessionId','documentRef','scriptId','sourceHash','lineNumber']){const q={...good};delete q[key];assert((await c.callTool({name:'ios_browser_debug',arguments:q})).isError);}
  for(const q of [{...good,lineNumber:-1},{...good,sourceHash:'x'},{...good,expression:'42'},{browser:'safari',op:'sources',lineNumber:0},{browser:'safari',op:'overview',sourceHash:good.sourceHash}])assert((await c.callTool({name:'ios_browser_debug',arguments:q})).isError);
  assert.equal(seen.length,0);assert(!(await c.callTool({name:'ios_browser_debug',arguments:good})).isError);assert.equal(seen[0].debug.lineNumber,0);assert.equal(seen[0].debug.columnNumber,0);
 }finally{await c.close();await server.close();}
});
function fixture(run){const state=fs.mkdtempSync(path.join(os.tmpdir(),'breakpoint-mcp-'));const python=path.join(state,'providers/pymobiledevice3-11.15.5/bin/python');fs.mkdirSync(path.dirname(python),{recursive:true});fs.writeFileSync(python,'');fs.writeFileSync(path.join(state,'web-device.json'),JSON.stringify({coreDeviceId:'EFF7037C-94D3-5222-AB4A-770D3AB5BBC9',hardwareUDID:'00008110-001451690A21801E'}),{mode:0o600});const b=new Backend({state,run});b.session=()=>({id:'owned',surface:'system',lease:'private',owner:'private',dir:state});return {state,b};}
test('breakpoint backend refuses temporary ownership and distinguishes pre-effect refusal from uncertainty',async()=>{
 let sent=false,dispatches=0;const {state,b}=fixture(async(_,__,q)=>{dispatches++;assert.equal(q.debug.ownedDebugSession,true);return {ok:false,value:{reason:'debug_script_source_changed',diagnostic:sent?{breakpointRequested:true,breakpointCleanup:{resumeConfirmed:true,domainsDisabled:true}}:{}}};});
 try{const denied=await b.deviceInspect({kind:'browser-debug',debug:{op:'breakpoint'}});assert.equal(denied.runtimeMutationSent,false);assert.equal(dispatches,0);
  for(const expected of [false,'unknown']){sent=expected;const r=await b.deviceInspect({sessionId:'owned',kind:'browser-debug',debug:{op:'breakpoint'}});assert.equal(r.runtimeMutationSent,expected);assert.equal(r.inputSent,false);assert.equal(r.replay,false);}
 }finally{b.session=Backend.prototype.session;await b.close();fs.rmSync(state,{recursive:true,force:true});}
});
test('breakpoint stack and locals stay private while compact hit and cleanup summaries remain visible',async()=>{
 const {state,b}=fixture(async(_,__,q)=>{fs.writeFileSync(q.output,JSON.stringify({result:{transport:'paired',pages:[{debug:{operation:'breakpoint',breakpointHit:true,pauseObserved:true,resumeConfirmed:true,breakpointRemoved:true,domainsDisabled:true,windowMs:500,callFrames:[{functionName:'privateFixture'}],locals:[{value:7}]}}]}}),{mode:0o600});return {ok:true,value:{ok:true}};});
 try{const r=await b.deviceInspect({sessionId:'owned',kind:'browser-debug',debug:{op:'breakpoint'}});assert(r.ok);assert.equal(r.runtimeMutationSent,true);assert.equal(r.inputSent,false);assert.equal(r.metadata.resumeConfirmed,true);assert.equal(r.metadata.breakpointRemoved,true);assert(!JSON.stringify(r).includes('privateFixture'));assert.equal(b.read({artifactId:r.artifactId,pointer:'/result/pages/0/debug/locals/0/value'}).data,7);}
 finally{b.session=Backend.prototype.session;await b.close();fs.rmSync(state,{recursive:true,force:true});}
});
