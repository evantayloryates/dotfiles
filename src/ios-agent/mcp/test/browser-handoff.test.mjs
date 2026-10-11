import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {Backend} from '../backend.mjs';
for(const mode of ['system-default-https','phone-local-chrome-shortcut'])for(const ready of [true,false])test(`app browser handoff ${mode} ${ready?'reuses native foreground':'bootstraps foreground once'} and releases owner without paired dispatch`,async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-browser-app-'));const events=[];
 fs.writeFileSync(path.join(state,'dev-runtime.json'),JSON.stringify({webURL:'https://dev.tail.ts.net:10446'}));
 const b=new Backend({state,run:async(kind,args,input)=>{
  if(kind==='web')return {ok:true,value:{token:'S'.repeat(43)}};
  throw Error('Unexpected paired or CLI dispatch');
 }});
 b.status=async()=>({});b.waitReady=async()=>({readyToAcquire:ready});
 b.deviceLaunch=async a=>{events.push('launch');assert.equal(a.target,'kickoff-dev');return {foregroundVerified:true}};
 b.begin=async a=>{assert(a.nativeOnly);events.push('begin');return {sessionId:'owned'}};
 b.action=async a=>{events.push('handoff');assert.equal(a.sessionId,'owned');assert.equal(a.action,'browser-handoff');assert.equal(a.args.browser,'ios-chrome');assert.equal(a.args.url,'https://dev.tail.ts.net:10520/dev/ios-agent#ios-agent='+'S'.repeat(43));return {ok:true,data:{mode}}};
 b.end=async id=>{assert.equal(id,'owned');events.push('end')};
 try{const r=await b.webEnroll({browser:'ios-chrome',profile:'call-rig',transport:'app'});assert(r.ok);assert.equal(r.launch.foregroundVerified,false);assert.equal(r.launch.browserRoute,mode);assert.equal(r.launch.requiresDefaultBrowser,mode==='system-default-https'?'ios-chrome':undefined);assert(!JSON.stringify(r).includes('S'.repeat(43)));assert.deepEqual(events,ready?['begin','handoff','end']:['launch','begin','handoff','end']);}
 finally{await b.close();fs.rmSync(state,{recursive:true,force:true});}
});
test('unknown native handoff is released and never retried',async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-browser-unknown-'));let sends=0,ends=0;
 fs.writeFileSync(path.join(state,'dev-runtime.json'),JSON.stringify({webURL:'https://dev.tail.ts.net:10446'}));
 const b=new Backend({state,run:async()=>({ok:true,value:{token:'T'.repeat(43)}})});
 b.status=async()=>({});b.waitReady=async()=>({readyToAcquire:true});b.begin=async()=>({sessionId:'owned'});b.action=async()=>{sends++;return {ok:false,actionSent:'unknown'}};b.end=async()=>{ends++};
 try{const r=await b.webEnroll({browser:'ios-safari',transport:'app'});assert.equal(r.ok,false);assert.equal(r.launch.inputSent,'unknown');assert.equal(r.launch.replay,false);assert.equal(sends,1);assert.equal(ends,1)}finally{await b.close();fs.rmSync(state,{recursive:true,force:true});}
});
for(const failure of [false,true])test(`native Home fallback ${failure?'preserves unknown':'uses one fenced suspension'} without paired dispatch`,async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-app-home-')),events=[];
 const b=new Backend({state,run:async()=>{throw Error('no provider dispatch')}});
 b.waitReady=async()=>({readyToAcquire:false});b.deviceLaunch=async()=>{events.push('launch');return {foregroundVerified:true}};
 b.begin=async a=>{assert(a.nativeOnly);events.push('begin');return {sessionId:'owned'}};
 b.action=async a=>{assert.equal(a.action,'home');events.push('home');return {ok:!failure,actionSent:'unknown'}};
 b.end=async()=>{events.push('end')};
 try{const r=await b.deviceHome({transport:'app'});assert.equal(r.ok,!failure);assert.equal(r.homeVerified,false);assert.equal(r.inputSent,failure?'unknown':true);assert.deepEqual(events,['launch','begin','home','end'])}finally{await b.close();fs.rmSync(state,{recursive:true,force:true})}
});
test('auto Chrome refuses an unqualified default-browser fallback before any phone input',async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-chrome-auto-'));
 fs.writeFileSync(path.join(state,'dev-runtime.json'),JSON.stringify({webURL:'https://dev.tail.ts.net:10446'}));
 const b=new Backend({state,run:async(kind)=>{assert.equal(kind,'web');return {ok:true,value:{token:'A'.repeat(43)}}}});
 b.status=async()=>({});b.appTransportPreferred=async()=>true;
 b.deviceLaunch=async()=>{throw Error('phone input forbidden')};b.begin=async()=>{throw Error('ownership forbidden')};
 try{const r=await b.webEnroll({browser:'ios-chrome'});assert.equal(r.ok,false);assert.equal(r.inputSent,false);assert.equal(r.reason,'chrome_installed_adapter_unqualified');}finally{await b.close();fs.rmSync(state,{recursive:true,force:true});}
});

for(const changed of [false,true])test(`auto Chrome ${changed?'refuses changed owned adapter':'uses qualified Shortcut'} and always releases`,async()=>{
 const {qualifiedChromeAdapter}=await import('../chrome-handoff.mjs');
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-chrome-auto-qualified-')),job='a'.repeat(32),delivery='b'.repeat(32),events=[];
 fs.mkdirSync(path.join(state,'build-jobs',job),{recursive:true,mode:0o700});
 fs.writeFileSync(path.join(state,'build-jobs',job,'result.json'),JSON.stringify({jobId:job,deliveryId:delivery,state:'completed',ok:true,signatureVerified:true,agentBinaryVerified:true,sourceChangedDuringBuild:false,sourceHashes:{'/fixture/native/BrowserHandoff.inc':qualifiedChromeAdapter}}),{mode:0o600});
 fs.writeFileSync(path.join(state,'dev-runtime.json'),JSON.stringify({webURL:'https://dev.tail.ts.net:10446'}));
 const b=new Backend({state,run:async()=>({ok:true,value:{token:'S'.repeat(43)}})});
 b.status=async()=>({device:{deliveryId:delivery}});b.appTransportPreferred=async()=>true;b.waitReady=async()=>({readyToAcquire:true});
 b.begin=async()=>{events.push('begin');return {sessionId:'owned',verification:{data:{deliveryId:changed?'c'.repeat(32):delivery}}}};
 b.action=async()=>{events.push('handoff');return {ok:true,data:{mode:'phone-local-chrome-shortcut'}}};
 b.end=async()=>events.push('end');
 try{const r=await b.webEnroll({browser:'ios-chrome'});assert.equal(r.ok,!changed);assert.deepEqual(events,changed?['begin','end']:['begin','handoff','end']);if(changed)assert.equal(r.inputSent,false);else assert.equal(r.launch.browserRoute,'phone-local-chrome-shortcut');}finally{await b.close();fs.rmSync(state,{recursive:true,force:true});}
});
