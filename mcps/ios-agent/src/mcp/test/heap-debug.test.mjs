import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {Backend} from '../backend.mjs';import {CaptureStore} from '../capture-store.mjs';
test('heap artifacts use an explicit fixed larger quota; ordinary captures keep their limit',()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'heap-store-'));try{
  const store=new CaptureStore(state),data={snapshot:'x'.repeat(2*1024*1024)};
  assert.throws(()=>store.saveDiagnostic(data),/capture_storage_quota/);
  const saved=store.saveDiagnostic(data,{maxBytes:32*1024*1024});assert(saved.bytes>2*1024*1024);assert.equal(fs.statSync(saved.file).mode&0o777,0o600);assert.equal(saved.retentionSecondsRemaining,3600);
  assert.throws(()=>store.saveDiagnostic({}, {maxBytes:1000000000}),/fixed_diagnostic_quota/);
 }finally{fs.rmSync(state,{recursive:true,force:true});}
});
test('heap requires an explicit web/system owner before provider dispatch',async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'heap-owner-'));let dispatched=false;const b=new Backend({state,run:async()=>{dispatched=true;throw Error('unexpected');}});
 try{
  assert.equal((await b.deviceInspect({kind:'browser-debug',debug:{op:'heap'}})).runtimeMutationSent,false);assert(!dispatched);
  const python=path.join(state,'providers/pymobiledevice3-11.15.5/bin/python');fs.mkdirSync(path.dirname(python),{recursive:true});fs.writeFileSync(python,'');
  b.session=()=>({id:'owned',surface:'native',dir:state});assert.equal((await b.deviceInspect({sessionId:'owned',kind:'browser-debug',debug:{op:'heap'}})).reason,'owned_debug_session_required_for_heap');assert(!dispatched);
 }finally{b.session=Backend.prototype.session;await b.close();fs.rmSync(state,{recursive:true,force:true});}
});
test('heap provider guard failure and post-dispatch uncertainty remain distinct',async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'heap-unknown-'));let sent=false;const python=path.join(state,'providers/pymobiledevice3-11.15.5/bin/python');fs.mkdirSync(path.dirname(python),{recursive:true});fs.writeFileSync(python,'');
 fs.writeFileSync(path.join(state,'web-device.json'),JSON.stringify({coreDeviceId:'EFF7037C-94D3-5222-AB4A-770D3AB5BBC9',hardwareUDID:'00008110-001451690A21801E'}),{mode:0o600});
 const b=new Backend({state,run:async(_,__,input)=>{assert.equal(input.debug.ownedDebugSession,true);return {ok:false,value:{reason:'debug_document_changed',diagnostic:sent?{heapSnapshotRequested:true}:{}}};}});b.session=()=>({id:'owned',surface:'system',lease:'private',owner:'private',dir:state});
 try{for(const expected of [false,'unknown']){sent=expected;const r=await b.deviceInspect({sessionId:'owned',kind:'browser-debug',debug:{op:'heap',documentRef:'a'.repeat(32)}});assert.equal(r.runtimeMutationSent,expected);assert.equal(r.inputSent,false);assert.equal(r.replay,false);}}
 finally{b.session=Backend.prototype.session;await b.close();fs.rmSync(state,{recursive:true,force:true});}
});
test('owned heap results preserve large private graphs and expose compact counts',async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'heap-result-'));const python=path.join(state,'providers/pymobiledevice3-11.15.5/bin/python');fs.mkdirSync(path.dirname(python),{recursive:true});fs.writeFileSync(python,'');
 fs.writeFileSync(path.join(state,'web-device.json'),JSON.stringify({coreDeviceId:'EFF7037C-94D3-5222-AB4A-770D3AB5BBC9',hardwareUDID:'00008110-001451690A21801E'}),{mode:0o600});
 const b=new Backend({state,run:async(_,__,input)=>{assert(input.debug.ownedDebugSession);fs.writeFileSync(input.output,JSON.stringify({result:{transport:'paired',pages:[{debug:{operation:'heap',heapSnapshotComplete:true,heapNodeCount:2,heapEdgeCount:1,heapShallowBytes:64,forcedGarbageCollection:true,domainsDisabled:true,heap:{summary:{nodeCount:2},snapshot:{fixture:'x'.repeat(2*1024*1024)}}}}]}}),{mode:0o600});return {ok:true,value:{ok:true}};}});b.session=()=>({id:'owned',surface:'system',lease:'private',owner:'private',dir:state});
 try{const r=await b.deviceInspect({sessionId:'owned',kind:'browser-debug',debug:{op:'heap',documentRef:'a'.repeat(32)}});assert(r.ok);assert.equal(r.metadata.heapNodeCount,2);assert.equal(r.metadata.heapEdgeCount,1);assert.equal(r.runtimeMutationSent,true);assert.equal(r.inputSent,false);assert(r.metadata.artifactBytes>2*1024*1024);assert.equal(b.read({artifactId:r.artifactId,pointer:'/result/pages/0/debug/heap/summary/nodeCount'}).data,2);assert(!JSON.stringify(r).includes('fixture'));}
 finally{b.session=Backend.prototype.session;await b.close();fs.rmSync(state,{recursive:true,force:true});}
});
