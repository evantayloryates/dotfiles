import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {Backend} from '../backend.mjs';
for(const mode of ['accepted','unknown','unconfigured'])test(`fixed Home ${mode}: exclusive owner, one dispatch, no XCTest or nearby fallback`,async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-home-'));let held=false,sends=0;
 fs.writeFileSync(path.join(state,'web-device.json'),JSON.stringify({hardwareUDID:'00008110-001451690A21801E'}),{mode:0o600});
 if(mode!=='unconfigured')fs.writeFileSync(path.join(state,'developer-tailnet.json'),'{}',{mode:0o600});
 const b=new Backend({state,deviceRun:async()=>{throw Error('no nearby fallback')},run:async(kind,args,input)=>{
  if(kind==='cli'&&args[0]==='acquire'){held=true;fs.writeFileSync(args[args.indexOf('--lease-file')+1],JSON.stringify({lease:'fixture'}));return {ok:true};}
  if(kind==='cli'&&args[0]==='release'){held=false;fs.unlinkSync(args[args.indexOf('--lease-file')+1]);return {ok:true,value:{released:true}};}
  if(kind==='provider'){sends++;assert(held);assert.equal(input.kind,'shortcut-home');assert(input.ownerFile&&input.leaseFile);assert.equal(input.url,undefined);
   if(mode==='unknown')return {ok:false,value:{reason:'device_observation_deadline',inputSent:'unknown'}};
   fs.writeFileSync(input.output,JSON.stringify({result:{inputSent:true,homeVerified:false,transport:'tailnet-paired-userspace',offLANQualified:false,replay:false}}));return {ok:true,value:{ok:true}};
  }throw Error('unexpected '+kind);
 }});
 try{const r=await b.deviceHome();assert(!held);assert.equal(sends,mode==='unconfigured'?0:1);
  if(mode==='accepted'){assert(r.ok);assert.equal(r.homeVerified,false);assert.equal(r.offLANQualified,false);assert.equal(r.replay,false);}
  else{assert.equal(r.ok,false);assert.equal(r.inputSent,mode==='unknown'?'unknown':false);}
  assert.equal(b.artifacts.size,0);
 }finally{await b.close();fs.rmSync(state,{recursive:true,force:true});}
});
test('Home cannot bypass a competing owner',async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-home-owner-'));let sends=0;
 const b=new Backend({state,run:async(kind,args)=>{if(kind==='cli'&&args[0]==='acquire')return {ok:false,error:'device_already_leased'};sends++;throw Error('unexpected dispatch');}});
 try{await assert.rejects(b.deviceHome());assert.equal(sends,0);}finally{await b.close();fs.rmSync(state,{recursive:true,force:true});}
});
