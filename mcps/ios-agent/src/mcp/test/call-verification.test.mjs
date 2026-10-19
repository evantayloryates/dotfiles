import test from 'node:test';
import assert from 'node:assert/strict';
import {callObservation} from '../call-verification.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../server.mjs';
const runtime={browser:'ios-chrome',boot:'document',version:'sdk'};
const fixture=()=>({...runtime,visible:true,secureContext:true,indicator:true,domains:{
 meet:{supported:true,ready:true,connected:false,connecting:false,roomState:'disconnected',meetingNotFound:false,meetingLoadFailed:false,loading:false,participants:0,permissions:{microphone:'prompt',camera:'granted'},mediaErrors:{microphone:null,camera:null},tracks:{audio:{present:false},video:{present:false},screenShare:{present:false}}},
 media:{requests:{pending:0},hooks:{microphone:true,peer:true},tracks:[],connections:[]}
}});
const passed=r=>Object.values(r.observation).every(v=>v===true);
test('foreground SDK readiness alone cannot pass a call gate or unknown media state',()=>{
 const v=fixture();assert(passed(callObservation(v,runtime,'lobby')));
 v.domains.media.requests.pending=2;let r=callObservation(v,runtime,'lobby');assert(!passed(r));assert.equal(r.reason,'media_requests_pending');assert.equal(r.diagnostics.pendingMediaRequests,2);
 delete v.domains.media.requests.pending;r=callObservation(v,runtime,'lobby');assert.equal(r.reason,'media_observation_incomplete');assert.equal(r.diagnostics.pendingMediaRequests,null);
 v.domains.meet=undefined;assert.equal(callObservation(v,runtime,'lobby').reason,'call_domain_unavailable');
});
test('paired means joined with a remote participant; stale identity and call failures fail closed',()=>{
 const v=fixture();Object.assign(v.domains.meet,{connected:true,roomState:'connected'});
 assert(passed(callObservation(v,runtime,'connected')));assert.equal(callObservation(v,runtime,'paired').reason,'remote_participant_absent');
 v.domains.meet.participants=1;assert(passed(callObservation(v,runtime,'paired')));
 v.boot='replacement';assert.equal(callObservation(v,runtime,'paired').reason,'call_runtime_changed');v.boot=runtime.boot;
 v.domains.meet.meetingLoadFailed=true;assert(!passed(callObservation(v,runtime,'paired')));
});
test('release needs known hooks, no live tracks or peers, and a disconnected call',()=>{
 for(const mutate of [v=>v.domains.media.tracks.push({readyState:'live'}),v=>v.domains.media.connections.push({}),v=>delete v.domains.media.hooks.peer,v=>v.domains.meet.tracks.audio={present:true,state:'live'},v=>v.domains.meet.connected=true]){
  const v=fixture();assert(passed(callObservation(v,runtime,'released')));mutate(v);assert(!passed(callObservation(v,runtime,'released')));
 }
});
test('fixed diagnostics never copy unexpected provider strings or identities',()=>{
 const v=fixture();v.domains.meet.permissions.microphone='secret';v.domains.meet.mediaErrors.camera='secret';v.domains.meet.token='secret';
 const r=callObservation(v,runtime,'lobby');assert.equal(r.diagnostics.microphonePermission,'unknown');assert.equal(r.diagnostics.cameraError,'unknown');assert(!JSON.stringify(r).includes('secret'));
});
test('call phase and incompatible arguments are checked before dispatch',async()=>{
 let calls=0;const {server}=createServer({close:async()=>{},webVerify:async()=>{calls++;return {ok:true};}});
 const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);const client=new Client({name:'call-schema',version:'1'});await client.connect(ct);
 try{
  for(const args of [{gate:'web-call'},{gate:'web-call',callPhase:'paired',selector:'#join'},{gate:'web-ready',callPhase:'paired'}]){
   const r=await client.callTool({name:'ios_web_verify',arguments:{sessionId:'a'.repeat(32),...args}});assert(r.structuredContent.ok===false);
  }
  assert.equal(calls,0);const r=await client.callTool({name:'ios_web_verify',arguments:{sessionId:'a'.repeat(32),gate:'web-call',callPhase:'lobby',timeoutSeconds:2}});assert(r.structuredContent.ok);assert.equal(calls,1);
 }finally{await client.close();await server.close();}
});
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Backend} from '../backend.mjs';
test('call wait observes pending permission becoming ready without dispatching input',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ios-call-')),actions=[];let reads=0;
 const backend=new Backend({state:dir,run:async(kind,args,input)=>{
  if(kind==='learning')return {ok:true,value:{evidenceId:'e'.repeat(32)}};
  if(kind==='cli'){if(args[0]==='acquire')fs.writeFileSync(args.at(-1),JSON.stringify({lease:'private'}));return {ok:true};}
  if(kind==='web'){actions.push(input.action);const value=fixture();if(++reads<3)value.domains.media.requests.pending=1;return {ok:true,value:{status:'completed',result:{ok:true,value}}};}
  throw Error('unexpected_operation');
 }});
 try{
  const {sessionId}=await backend.begin({surface:'web',page:'a'.repeat(32)});
  const result=await backend.webVerify({sessionId,gate:'web-call',callPhase:'lobby',timeoutSeconds:2});
  assert(result.ok);assert.equal(result.checks,2);assert.deepEqual(actions,['state','state','state']);assert.equal(result.diagnostics.pendingMediaRequests,0);
  backend.webAction=async()=>({ok:false,value:fixture()});
  const failed=await backend.webVerify({sessionId,gate:'web-call',callPhase:'lobby',timeoutSeconds:2});assert.equal(failed.ok,false);assert.equal(failed.checks,1);assert.equal(failed.reason,'condition_observation_failed');
 }finally{await backend.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('same-session call route departure releases known observed media, never a fresh empty page',()=>{
 const v=fixture();delete v.domains.meet;v.domains.media.tracks=[{kind:'audio',readyState:'ended'}];
 assert(!passed(callObservation(v,runtime,'released')));
 assert(passed(callObservation(v,runtime,'released',{priorConnected:true})));
 v.domains.media.tracks[0].readyState='live';assert(!passed(callObservation(v,runtime,'released',{priorConnected:true})));
 v.domains.media.tracks[0].readyState='ended';v.boot='different';assert(!passed(callObservation(v,runtime,'released',{priorConnected:true})));
});


test('live preview diagnostics remain distinct from permission and released proof',()=>{
 const v=fixture();v.domains.meet.tracks.audio={present:true,state:'live',enabled:false};
 v.domains.media.tracks=[{readyState:'live'}];
 const r=callObservation(v,runtime,'released');
 assert(!passed(r));assert.equal(r.diagnostics.releaseState,'disconnected_with_live_tracks');
 assert.equal(r.diagnostics.microphonePermission,'prompt');assert.equal(r.diagnostics.microphoneTrackState,'live');
 assert.equal(r.diagnostics.microphoneTrackEnabled,false);
 delete v.domains.media.tracks;v.domains.meet.tracks.audio={present:false};assert.equal(callObservation(v,runtime,'released').diagnostics.releaseState,'unconfirmed');
});
