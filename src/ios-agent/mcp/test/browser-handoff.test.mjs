import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {Backend} from '../backend.mjs';
for(const ready of [true,false])test(`app browser handoff ${ready?'reuses native foreground':'bootstraps foreground once'} and releases owner without paired dispatch`,async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-browser-app-'));const events=[];
 fs.writeFileSync(path.join(state,'dev-runtime.json'),JSON.stringify({webURL:'https://dev.tail.ts.net:10446'}));
 const b=new Backend({state,run:async(kind,args,input)=>{
  if(kind==='web')return {ok:true,value:{token:'S'.repeat(43)}};
  throw Error('Unexpected paired or CLI dispatch');
 }});
 b.status=async()=>({});b.waitReady=async()=>({readyToAcquire:ready});
 b.deviceLaunch=async a=>{events.push('launch');assert.equal(a.target,'kickoff-dev');return {foregroundVerified:true}};
 b.begin=async a=>{assert(a.nativeOnly);events.push('begin');return {sessionId:'owned'}};
 b.action=async a=>{events.push('handoff');assert.equal(a.sessionId,'owned');assert.equal(a.action,'browser-handoff');assert.equal(a.args.browser,'ios-chrome');assert.equal(a.args.url,'https://dev.tail.ts.net:10520/dev/ios-agent#ios-agent='+'S'.repeat(43));return {ok:true}};
 b.end=async id=>{assert.equal(id,'owned');events.push('end')};
 try{const r=await b.webEnroll({browser:'ios-chrome',profile:'call-rig',transport:'app'});assert(r.ok);assert.equal(r.launch.foregroundVerified,false);assert(!JSON.stringify(r).includes('S'.repeat(43)));assert.deepEqual(events,ready?['begin','handoff','end']:['launch','begin','handoff','end']);}
 finally{await b.close();fs.rmSync(state,{recursive:true,force:true});}
});
test('unknown native handoff is released and never retried',async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-browser-unknown-'));let sends=0,ends=0;
 fs.writeFileSync(path.join(state,'dev-runtime.json'),JSON.stringify({webURL:'https://dev.tail.ts.net:10446'}));
 const b=new Backend({state,run:async()=>({ok:true,value:{token:'T'.repeat(43)}})});
 b.status=async()=>({});b.waitReady=async()=>({readyToAcquire:true});b.begin=async()=>({sessionId:'owned'});b.action=async()=>{sends++;return {ok:false,actionSent:'unknown'}};b.end=async()=>{ends++};
 try{const r=await b.webEnroll({browser:'ios-safari',transport:'app'});assert.equal(r.ok,false);assert.equal(r.launch.inputSent,'unknown');assert.equal(r.launch.replay,false);assert.equal(sends,1);assert.equal(ends,1)}finally{await b.close();fs.rmSync(state,{recursive:true,force:true});}
});
