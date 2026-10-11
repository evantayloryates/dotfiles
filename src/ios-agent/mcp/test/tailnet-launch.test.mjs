import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {Backend} from '../backend.mjs';
for(const failure of [false,true])test(`tailnet fixed launch ${failure?'unknown is not replayed':'acceptance is not foreground proof'}; no CoreDevice fallback`,async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-tailnet-launch-'));let held=false,dispatches=0;
 fs.writeFileSync(path.join(state,'web-device.json'),JSON.stringify({coreDeviceId:'EFF7037C-94D3-5222-AB4A-770D3AB5BBC9',hardwareUDID:'00008110-001451690A21801E'}),{mode:0o600});
 fs.writeFileSync(path.join(state,'developer-tailnet.json'),'{}',{mode:0o600});
 const b=new Backend({state,deviceRun:async()=>{throw Error('CoreDevice must not be called')},run:async(kind,args,input)=>{
  if(kind==='cli'&&args[0]==='acquire'){held=true;fs.writeFileSync(args[args.indexOf('--lease-file')+1],JSON.stringify({lease:'fixture'}));return {ok:true};}
  if(kind==='cli'&&args[0]==='release'){held=false;fs.unlinkSync(args[args.indexOf('--lease-file')+1]);return {ok:true,value:{released:true}};}
  if(kind==='provider'){dispatches++;assert(held);assert.equal(input.kind,'fixed-launch');assert.equal(input.target,'safari');assert(input.ownerFile&&input.leaseFile);
   if(failure)return {ok:false,value:{ok:false,reason:'device_observation_deadline',inputSent:'unknown'}};
   fs.writeFileSync(input.output,JSON.stringify({result:{transport:'tailnet-paired-userspace',target:'safari',inputSent:true,foregroundVerified:false,outcome:'developer-request-accepted',offLANQualified:false}}));return {ok:true,value:{ok:true}};
  }throw Error('unexpected '+kind);
 }});
 try{const r=await b.deviceLaunch({target:'safari'});assert.equal(dispatches,1);assert(!held);assert.equal(r.replay,false);
  if(failure){assert.equal(r.inputSent,'unknown');assert.equal(r.ok,false);}else{assert.equal(r.foregroundVerified,false);assert.equal(r.offLANQualified,false);assert.equal(r.transport,'tailnet-paired-userspace');}
 }finally{await b.close();fs.rmSync(state,{recursive:true,force:true});}
});
for(const failure of [false,true])test(`tailnet enrollment ${failure?'unknown':'accepted'} owns one dispatch, never uses CoreDevice or exposes fragment`,async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-tailnet-enroll-'));let held=false,count=0;
 fs.writeFileSync(path.join(state,'dev-runtime.json'),JSON.stringify({webURL:'https://dev.tail.ts.net:10446'}),{mode:0o600});
 fs.writeFileSync(path.join(state,'web-device.json'),JSON.stringify({coreDeviceId:'EFF7037C-94D3-5222-AB4A-770D3AB5BBC9',hardwareUDID:'00008110-001451690A21801E'}),{mode:0o600});
 fs.writeFileSync(path.join(state,'developer-tailnet.json'),'{}',{mode:0o600});
 const b=new Backend({state,deviceRun:async()=>{throw Error('no CoreDevice fallback')},run:async(kind,args,input)=>{
  if(kind==='cli'&&args[0]==='status')return {ok:true,value:{}};
  if(kind==='web')return {ok:true,value:{token:'A'.repeat(43)}};
  if(kind==='cli'&&args[0]==='acquire'){held=true;fs.writeFileSync(args[args.indexOf('--lease-file')+1],JSON.stringify({lease:'fixture'}));return {ok:true};}
  if(kind==='cli'&&args[0]==='release'){held=false;fs.unlinkSync(args[args.indexOf('--lease-file')+1]);return {ok:true,value:{released:true}};}
  if(kind==='provider'){count++;assert(held);assert.equal(input.kind,'browser-launch');assert.equal(input.browser,'safari');assert.equal(input.profile,'call-rig');assert.equal(input.url,'https://dev.tail.ts.net:10520/dev/ios-agent#ios-agent='+'A'.repeat(43));
   if(failure)return {ok:false,value:{reason:'device_observation_deadline',inputSent:'unknown'}};
   fs.writeFileSync(input.output,JSON.stringify({result:{inputSent:true,foregroundVerified:false,outcome:'developer-request-accepted',transport:'tailnet-paired-userspace'}}));return {ok:true,value:{ok:true}};
  }throw Error('unexpected '+kind);
 }});
 try{const r=await b.webEnroll({browser:'ios-safari',profile:'call-rig'});assert.equal(count,1);assert(!held);assert.equal(r.launch.replay,false);assert(!JSON.stringify(r).includes('A'.repeat(43)));assert.equal(r.launch.inputSent,failure?'unknown':true);assert.equal(r.launch.ok,!failure);
  assert.equal(JSON.parse(fs.readFileSync(r.launchFile)).url.includes('A'.repeat(43)),true);
 }finally{await b.close();fs.rmSync(state,{recursive:true,force:true});}
});
