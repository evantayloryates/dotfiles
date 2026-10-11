import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Backend} from '../backend.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';import {createServer} from '../server.mjs';
function fixture(snapshot,element=()=>({interactable:true,disabled:false,readOnly:false})){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ios-condition-')),calls=[];let reads=0;
 const runtime={boot:'condition-document',browser:'ios-safari',version:'fixture',visible:true,secureContext:true,indicator:true};
 const backend=new Backend({state:dir,run:async(kind,args,input)=>{
  if(kind==='learning')return {ok:true,value:{evidenceId:'e'.repeat(32)}};
  if(kind==='cli'){if(args[0]==='acquire')fs.writeFileSync(args.at(-1),JSON.stringify({lease:'private'}));return {ok:true};}
  if(kind==='web'){calls.push(input.action);const value=input.action==='state'?runtime:input.action==='element'?element():snapshot(++reads);return {ok:true,value:{status:'completed',result:{ok:true,value}}};}
  throw Error('unexpected_operation');
 }});
 return {backend,calls,runtime,close:async()=>{await backend.close();fs.rmSync(dir,{recursive:true,force:true});}};
}
const node=(id='1',value='')=>({id,tag:'input',value,label:'Draft',disabled:false,hit:true,inViewport:true});
const tree=elements=>({snapshot:'fresh',elements,content:'Draft',path:'/dev/ios-agent'});
test('wait does not pass ambiguous selection; eventual unique editable value returns the final refs',async()=>{
 const f=fixture(n=>tree(n===1?[node(),node('2')]:[node('3','committed')]));
 try{const id=(await f.backend.begin({surface:'web',page:'a'.repeat(32)})).sessionId;
  const r=await f.backend.webVerify({sessionId:id,gate:'web-element',selector:'#draft',expectedValue:'committed',elementState:'editable',timeoutSeconds:2});
  assert.equal(r.ok,true);assert.equal(r.checks,2);assert.equal(r.target,'3');assert.equal(r.snapshot,'fresh');assert.deepEqual(f.calls,['state','snapshot','snapshot','element']);
 }finally{await f.close();}
});
test('covered/inert/read-only nodes cannot falsely pass editable; timeout zero performs one condition read',async()=>{
 for(const detail of [{interactable:false,disabled:false,readOnly:false},{interactable:true,disabled:false,readOnly:true}]){
  const f=fixture(()=>tree([node()]),()=>detail);
  try{const id=(await f.backend.begin({surface:'web',page:'b'.repeat(32)})).sessionId;
   const r=await f.backend.webVerify({sessionId:id,gate:'web-element',selector:'#draft',elementState:'editable'});
   assert.equal(r.ok,false);assert.equal(r.reason,'condition_not_met');assert.equal(r.checks,1);assert.equal(r.target,undefined);
  }finally{await f.close();}
 }
});
test('read failure stops waiting immediately; cancellation during wait admits no later read',async()=>{
 const f=fixture(()=>tree([]));
 try{const id=(await f.backend.begin({surface:'web',page:'c'.repeat(32)})).sessionId;
  const original=f.backend.webAction.bind(f.backend);let n=0;
  f.backend.webAction=async()=>{n++;return {ok:false,outcome:'lease_ended_do_not_replay',value:tree([node()])};};
  const failed=await f.backend.webVerify({sessionId:id,gate:'web-element',selector:'#draft',elementState:'editable',timeoutSeconds:5});assert.equal(failed.ok,false);assert.equal(n,1);assert.equal(failed.reason,'condition_observation_failed');
  f.backend.webAction=original;const controller=new AbortController();
  const pending=f.backend.webVerify({sessionId:id,gate:'web-dom',timeoutSeconds:5},controller.signal);setTimeout(()=>controller.abort(),20);
  await assert.rejects(pending,/request_cancelled_before_dispatch/);assert.equal(f.calls.filter(x=>x==='snapshot').length,1);
 }finally{await f.close();}
});
test('condition arguments refuse malformed waits before provider or session access',async()=>{
 let dispatched=0;const {server}=createServer({close:async()=>{},webVerify:async()=>{dispatched++;return {ok:true};}});
 const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);const client=new Client({name:'condition-schema',version:'1'});await client.connect(ct);
 try{for(const args of [{gate:'web-element'},{gate:'web-media',timeoutSeconds:3},{gate:'web-dom',expectedValue:'x'},{gate:'web-ready',timeoutSeconds:31}]){
   assert.equal((await client.callTool({name:'ios_web_verify',arguments:{sessionId:'a'.repeat(32),...args}})).isError,true);
  }assert.equal(dispatched,0);
 }finally{await client.close();await server.close();}
});
test('ready cannot pass a replaced or missing document identity',async()=>{
 for(const boot of ['replacement-document',undefined]){
  const f=fixture(()=>tree([]));
  try{const id=(await f.backend.begin({surface:'web',page:'d'.repeat(32)})).sessionId;f.runtime.boot=boot;
   const r=await f.backend.webVerify({sessionId:id,gate:'web-ready'});assert.equal(r.ok,false);assert.equal(r.receipt.observation.sameRuntime,false);
  }finally{await f.close();}
 }
});
