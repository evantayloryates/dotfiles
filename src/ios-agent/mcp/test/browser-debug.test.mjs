import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../server.mjs';import {Backend} from '../backend.mjs';
import {CaptureStore} from '../capture-store.mjs';

test('debugger schema rejects incomplete evaluation and cross-operation arguments before dispatch',async()=>{
 const seen=[];const {server}=createServer({deviceInspect:async x=>{seen.push(x);return {ok:true};},cancel:async()=>{},close:async()=>{}});
 const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);const c=new Client({name:'debug-schema',version:'1'});await c.connect(ct);
 try{
  for(const args of [{op:'source'},{op:'styles'},{op:'evaluate',expression:'42'},{op:'overview',expression:'42',documentRef:'a'.repeat(32),sessionId:'b'.repeat(32)},{op:'console',selector:'body'},{op:'trace',scriptId:'1'},{op:'trace',sampleMs:3001},{op:'shell'},{browser:'firefox'},{profile:'arbitrary'}]){
   assert((await c.callTool({name:'ios_browser_debug',arguments:{browser:'safari',...args}})).isError,JSON.stringify(args));
  }
  assert.equal(seen.length,0);
  assert(!(await c.callTool({name:'ios_browser_debug',arguments:{browser:'safari',op:'styles',selector:'body'}})).isError);
  assert.equal(seen[0].kind,'browser-debug');assert.equal(seen[0].debug.selector,'body');assert(!('sessionId' in seen[0].debug));assert.equal(seen[0].debug.profile,'app');
  await c.callTool({name:'ios_browser_debug',arguments:{browser:'chrome',profile:'call-rig'}});assert.equal(seen[1].debug.profile,'call-rig');
  assert(!(await c.callTool({name:'ios_browser_debug',arguments:{browser:'safari',op:'network',sampleMs:100}})).isError);assert.equal(seen[2].debug.op,'network');
  assert((await c.callTool({name:'ios_browser_debug',arguments:{browser:'safari',op:'network',expression:'42'}})).isError);assert.equal(seen.length,3);
  assert(!(await c.callTool({name:'ios_browser_debug',arguments:{browser:'chrome',op:'profile',sampleMs:100}})).isError);assert.equal(seen[3].debug.op,'profile');
  assert((await c.callTool({name:'ios_browser_debug',arguments:{browser:'chrome',op:'profile',expression:'42'}})).isError);assert.equal(seen.length,4);
  assert(!(await c.callTool({name:'ios_browser_debug',arguments:{browser:'chrome',op:'dom',selector:'summary'}})).isError);assert.equal(seen[4].debug.op,'dom');
  assert((await c.callTool({name:'ios_browser_debug',arguments:{browser:'chrome',op:'dom',expression:'document.body.click()',sessionId:'b'.repeat(32),documentRef:'a'.repeat(32)}})).isError);assert.equal(seen.length,5);
 }finally{await c.close();await server.close();}
});

test('private inspector artifact is summarized, readable selectively, and expires after one hour',async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'inspector-mcp-'));let held=false;const calls=[];
 const python=path.join(state,'providers/pymobiledevice3-11.15.5/bin/python');fs.mkdirSync(path.dirname(python),{recursive:true});fs.writeFileSync(python,'');
 fs.writeFileSync(path.join(state,'web-device.json'),JSON.stringify({coreDeviceId:'EFF7037C-94D3-5222-AB4A-770D3AB5BBC9',hardwareUDID:'00008110-001451690A21801E'}),{mode:0o600});
 const b=new Backend({state,run:async(kind,args,input)=>{
  calls.push(kind);if(kind==='cli'&&args[0]==='acquire'){held=true;fs.writeFileSync(args[args.indexOf('--lease-file')+1],'{}');return {ok:true};}
  if(kind==='cli'&&args[0]==='release'){held=false;fs.unlinkSync(args[args.indexOf('--lease-file')+1]);return {ok:true};}
  if(kind==='provider'){assert(held);fs.writeFileSync(input.output,JSON.stringify({result:{transport:'paired',pages:[{debug:{operation:'console',documentRef:'a'.repeat(32),domainsDisabled:true,events:[{text:'large diagnostic details',token:'abcd…wxyz'}]}}]}}),{mode:0o600});return {ok:true,value:{ok:true}};}
  throw Error('unexpected');
 }});
 try{
  const denied=await b.deviceInspect({kind:'browser-debug',debug:{op:'evaluate',expression:'42'}});assert.equal(denied.ok,false);assert(!calls.includes('provider'));assert(!held);
  const r=await b.deviceInspect({kind:'browser-debug',debug:{op:'console',browser:'safari'}});
  assert(r.ok);assert(!held);assert.equal(r.metadata.retentionSeconds,3600);assert(!JSON.stringify(r).includes('diagnostic details'));
  assert.equal(b.read({artifactId:r.artifactId,pointer:'/result/pages/0/debug/events/0/token'}).data,'abcd…wxyz');
  const file=b.artifacts.get(r.artifactId).file;assert.equal(fs.statSync(file).mode&0o777,0o600);
  b.captureStore.prune(Date.now()+3601000);assert(!fs.existsSync(file));assert.throws(()=>b.read({artifactId:r.artifactId}),/artifact_expired/);
  b.captureStore.saveDiagnostic=()=>{throw Error('capture_storage_quota_reached');};
  const refused=await b.deviceInspect({kind:'browser-debug',debug:{op:'console',browser:'safari'}});assert.equal(refused.reason,'capture_storage_quota_reached');assert.equal(refused.inputSent,false);assert.equal(refused.replay,false);assert(!held);
 }finally{await b.close();fs.rmSync(state,{recursive:true,force:true});}
});

test('oversize debugger artifact fails storage admission',()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'inspector-quota-'));try{const store=new CaptureStore(state);assert.throws(()=>store.saveDiagnostic({content:'x'.repeat(2*1024*1024)}),/capture_storage_quota_reached/);assert.equal(store.directories().length,0);}finally{fs.rmSync(state,{recursive:true,force:true});}
});


test('provider distinguishes rejected pre-input document guard from unknown dispatched effect',async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'inspector-dispatch-'));
 const python=path.join(state,'providers/pymobiledevice3-11.15.5/bin/python');fs.mkdirSync(path.dirname(python),{recursive:true});fs.writeFileSync(python,'');
 fs.writeFileSync(path.join(state,'web-device.json'),JSON.stringify({coreDeviceId:'EFF7037C-94D3-5222-AB4A-770D3AB5BBC9',hardwareUDID:'00008110-001451690A21801E'}),{mode:0o600});
 let sent=false;const b=new Backend({state,run:async()=>({ok:false,value:{reason:'debug_document_changed',inputSent:sent,diagnostic:{documentChange:{stage:sent===false?'initial':'after_operation'}}}})});
 b.session=()=>({id:'owned',surface:'web',page:'page',lease:'private',owner:'private',dir:state});
 try{for(const expected of [false,'unknown']){sent=expected;const r=await b.deviceInspect({kind:'browser-debug',sessionId:'owned',debug:{op:'trace',expression:'42'}});assert.equal(r.inputSent,expected);assert.equal(r.replay,false);assert.equal(r.reason,'debug_document_changed');}}
 finally{b.session=Backend.prototype.session;await b.close();fs.rmSync(state,{recursive:true,force:true});}
});

test('read-only debug tells an owned connection to pass its existing session',async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'inspector-owner-'));const python=path.join(state,'providers/pymobiledevice3-11.15.5/bin/python');fs.mkdirSync(path.dirname(python),{recursive:true});fs.writeFileSync(python,'');
 const b=new Backend({state});b.begin=async()=>{throw Error('end_existing_session_first');};
 try{const r=await b.deviceInspect({kind:'browser-debug',debug:{op:'sources'}});assert.equal(r.reason,'end_existing_session_first');assert.equal(r.inputSent,false);}
 finally{await b.close();fs.rmSync(state,{recursive:true,force:true});}
});
