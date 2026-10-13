import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openManagedWeb,openAppWeb,pageIdleConfirmed} from '../web-open.mjs';
import {Backend} from '../backend.mjs';

for(const lifecycle of [{threadId:'exact-thread'},{claudeOwner:{sessionId:'550e8400-e29b-41d4-a716-446655440000',promptId:'550e8400-e29b-41d4-a716-446655440001',agentId:''}}])test(`cellular managed open forwards exact ${lifecycle.claudeOwner?'Claude prompt':'Codex turn'} lifecycle`,async()=>{
 const calls=[],s={};let reads=0;
 const b={appTransportPreferred:async()=>true,
  webPages:async()=>({ok:true,pages:reads++?[{id:'old',browser:'ios-chrome',visible:true,ready:true,ageMs:0},{id:'new',browser:'ios-chrome',visible:true,ready:true,ageMs:0}]:[{id:'old'}]}),
  webEnroll:async a=>{calls.push(a);return {ok:true,launch:{browserRoute:'phone-local-chrome-shortcut'}}},
  begin:async a=>{calls.push(a);return {sessionId:'owned',ready:true}},session:()=>s,end:async()=>{throw Error('must retain successful owner')}};
 const r=await openManagedWeb(b,{browser:'ios-chrome',profile:'call-rig',...lifecycle});
 assert(r.ok);assert.equal(r.transport,'app-owned-browser-handoff');assert(s.appManagedHome);
 assert.deepEqual(calls,[{browser:'ios-chrome',profile:'call-rig',path:'/dev/ios-agent',transport:'auto'},{surface:'web',page:'new',threadId:undefined,rollout:undefined,claudeOwner:undefined,...lifecycle}]);
});
test('unknown launch is never replayed or sent through another provider',async()=>{
 let sends=0;
 const r=await openAppWeb({webPages:async()=>({ok:true,pages:[]}),webEnroll:async()=>{sends++;return {ok:false,launch:{inputSent:'unknown'}}},begin:()=>{throw Error('not ready')}},{browser:'ios-chrome'});
 assert.equal(r.ok,false);assert.equal(r.replay,false);assert.equal(sends,1);
});
test('ambiguous new documents do not acquire either page',async()=>{
 let reads=0;
 const r=await openAppWeb({webPages:async()=>({ok:true,pages:reads++?['a','b'].map(id=>({id,browser:'ios-safari',visible:true,ready:true,ageMs:0})):[]}),webEnroll:async()=>({ok:true}),begin:()=>{throw Error('ambiguous owner forbidden')}},{browser:'ios-safari'});
 assert.equal(r.reason,'browser_page_ambiguous');
});
test('failed prior inventory sends no launch',async()=>{
 const r=await openAppWeb({webPages:async()=>({ok:false}),webEnroll:()=>{throw Error('no launch')}},{browser:'ios-chrome'});
 assert.equal(r.inputSent,false);
});
for(const active of [true,false])test(`managed app end ${active?'releases glow then requests Home exactly once':'sends no Home after ownership loss'}`,async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-managed-app-')),events=[];
 const b=new Backend({state,run:async(kind,args)=>{
  assert.equal(kind,'cli');
  if(args[0]==='acquire'){fs.writeFileSync(args[args.indexOf('--lease-file')+1],JSON.stringify({lease:'private'}));return {ok:true}}
  events.push('release');return {ok:true,value:{released:true}};
 }});
 try{
  const {sessionId}=await b.begin({surface:'launch'}),s=b.session(sessionId);
  s.page='page';s.appManagedHome=true;s.active=active;s.webRuntime={boot:'current',browser:'ios-chrome',version:'sdk'};
  b.webPages=async()=>{events.push('indicator-off');return {ok:true,pages:[{id:'page',indicator:false,ageMs:0,...s.webRuntime}]}};
  b.deviceHome=async()=>{assert.equal(b.sessions.size,0);events.push('home');return {ok:true}};
  const [a,c]=await Promise.all([b.webEnd(sessionId),b.webEnd(sessionId)]);
  assert(a.indicatorOff);assert.deepEqual(c,a);assert.match(a.next,/gate=host-idle/);assert(!a.next.includes('gate=idle '));
  assert.deepEqual(events,active?['release','indicator-off','home']:['release','indicator-off']);
 }finally{await b.close();fs.rmSync(state,{recursive:true,force:true})}
});
test('glow cleanup rejects stale, missing or replaced document feedback',()=>{
 const runtime={boot:'current',browser:'ios-chrome',version:'sdk'},p={...runtime,indicator:false,ageMs:100};
 assert(pageIdleConfirmed(p,runtime,200));
 assert(!pageIdleConfirmed(p,runtime,50));
 for(const changed of [{ageMs:4000},{ageMs:-1},{ageMs:undefined},{boot:'previous'},{browser:'ios-safari'},{version:'previous'},{indicator:true}])assert(!pageIdleConfirmed({...p,...changed},runtime,5000));
 assert(!pageIdleConfirmed(p,undefined,5000));
});
test('nearby Home visibility report during cleanup is valid before owner release',async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-managed-feedback-'));
 const b=new Backend({state,run:async(kind,args)=>{
  if(args[0]==='acquire')fs.writeFileSync(args[args.indexOf('--lease-file')+1],JSON.stringify({lease:'private'}));
  return {ok:true,value:{released:true}};
 }});
 try{
  const {sessionId}=await b.begin({surface:'launch'}),s=b.session(sessionId);s.page='page';s.webRuntime={boot:'current',browser:'ios-chrome',version:'sdk'};
  s.relayChannel={request:async()=>{await new Promise(r=>setTimeout(r,30));return {ok:true}},close:async()=>({closed:true})};
  let reads=0;b.webPages=async()=>{reads++;return {ok:true,pages:[{id:'page',indicator:false,ageMs:10,...s.webRuntime}]}};
  const result=await b.webEnd(sessionId);assert(result.indicatorOff);assert(result.relayCleanup.homeRequested);assert.equal(reads,1);
 }finally{await b.close();fs.rmSync(state,{recursive:true,force:true})}
});
