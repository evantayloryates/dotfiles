import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {Backend} from '../backend.mjs';
function fixture(blocked=false,profile=false){
 const receipts=[];const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-observer-test-')),calls=[];let held=false;
 const python=path.join(state,'providers/pymobiledevice3-11.15.5/bin/python');fs.mkdirSync(path.dirname(python),{recursive:true});fs.writeFileSync(python,'');fs.writeFileSync(path.join(state,'web-device.json'),JSON.stringify({coreDeviceId:'EFF7037C-94D3-5222-AB4A-770D3AB5BBC9'}),{mode:0o600});
 const backend=new Backend({state,deviceRun:async()=>{calls.push('device');return {ok:true,data:{result:{connectionProperties:{localHostnames:['00008110-001451690A21801E.coredevice.local']}}}}},run:async(kind,args,input)=>{
  calls.push(kind+':'+(args?.[0]||''));
  if(kind==='cli'&&args[0]==='acquire'){if(blocked)return {ok:false,error:'device_already_leased'};held=true;fs.writeFileSync(args[args.indexOf('--lease-file')+1],JSON.stringify({lease:'private-owner'}));return {ok:true};}
  if(kind==='cli'&&args[0]==='release'){held=false;fs.unlinkSync(args[args.indexOf('--lease-file')+1]);return {ok:true,value:{released:true}};}
  if(kind==='learning'){receipts.push(input.args);return {ok:true,value:{evidenceId:'fixture-evidence',gate:input.args.receipt.gate,status:input.args.receipt.status}};}
  if(kind==='provider'){assert(held);assert(['configured','usb-recovery'].includes(input.transport));if(profile==='timeout')return {ok:false,value:{reason:'device_observation_deadline',phase:'resource_profile_sample'}};if(profile){fs.writeFileSync(input.output,JSON.stringify({result:{productVersion:'26.7.1',provider:'pymobiledevice3-11.15.5',sampleCount:3,profilerStopped:true,samples:[{processes:[{physicalFootprintBytes:0,cpuUsageRaw:null},{physicalFootprintBytes:null,cpuUsageRaw:0},{physicalFootprintBytes:8}]}]}}));return {ok:true,value:{ok:true}};}fs.writeFileSync(input.output,JSON.stringify({result:{pngBase64:'iVBORw0KGgo=',scope:'whole-device-display',width:1170,height:2532}}));return {ok:true,value:{ok:true}};}
  throw Error('unexpected fixture operation');
 }});return {backend,state,calls,receipts,held:()=>held};
}
test('observer releases its temporary owner and exposes PNG only through owned artifact read',async()=>{
 const f=fixture();try{const r=await f.backend.deviceInspect();assert(r.ok);assert.equal(f.held(),false);assert(!JSON.stringify(r).includes('iVBOR'));assert.equal(r.metadata.scope,'whole-device-display');assert.equal(f.backend.read({artifactId:r.artifactId}).image,'iVBORw0KGgo=');assert.equal(f.calls.filter(x=>x==='provider:').length,1);}
 finally{await f.backend.close();fs.rmSync(f.state,{recursive:true,force:true});}
});
test('another owner or foreign session prevents observer/device admission',async()=>{
 const f=fixture(true);try{await assert.rejects(f.backend.deviceInspect(),/device_already_leased/);assert(!f.calls.includes('device'));assert(!f.calls.includes('provider:'));await assert.rejects(f.backend.deviceInspect({sessionId:'foreign'}),/active_session_required/);}
 finally{await f.backend.close();fs.rmSync(f.state,{recursive:true,force:true});}
});

test('profile learning distinguishes available zero from missing metrics and saves bounded failure evidence',async()=>{
 for(const profile of [true,'timeout']){const f=fixture(false,profile);try{
 const result=await f.backend.deviceInspect({kind:'resource-profile'});assert.equal(f.held(),false);assert.equal(f.receipts.length,1);const {receipt,source}=f.receipts[0];assert.match(source,/^[a-f0-9]{64}$/);assert.equal(receipt.gate,'device-profile');
 if(profile===true){assert.equal(result.ok,true);assert.equal(receipt.status,'passed');assert.equal(receipt.observation.memoryReadings,2);assert.equal(receipt.observation.cpuReadings,1);}
 else {assert.equal(result.ok,false);assert.equal(receipt.status,'failed');assert.equal(receipt.observation.deadlineExceeded,true);assert.equal(receipt.observation.osVersionKnown,false);assert(!('sampleCount' in receipt.observation));}
 assert.equal(result.learningEvidence.evidenceId,'fixture-evidence');
 }finally{await f.backend.close();fs.rmSync(f.state,{recursive:true,force:true});}}
});

test('explicit USB recovery admits screen only and rejects broader work before ownership',async()=>{
 const f=fixture();try{
  for(const args of [{kind:'resource-profile',transport:'usb-recovery'},{kind:'screen',transport:'other'},{kind:'screen',transport:'usb-recovery',debug:{op:'dom'}}]){const r=await f.backend.deviceInspect(args);assert.equal(r.ok,false);assert.equal(r.inputSent,false);}
  assert.equal(f.calls.length,0);
  const r=await f.backend.deviceInspect({kind:'screen',transport:'usb-recovery'});assert(r.ok);assert.equal(f.held(),false);
 }finally{await f.backend.close();fs.rmSync(f.state,{recursive:true,force:true});}
});
