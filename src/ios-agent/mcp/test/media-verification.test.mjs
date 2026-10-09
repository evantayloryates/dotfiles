import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {mediaObservation} from '../media-verification.mjs';import {Backend} from '../backend.mjs';
const runtime={version:'sdk',browser:'android-chrome',boot:'owned-document'};
const state=(sent,received)=>({...runtime,visible:true,secureContext:true,indicator:true,domains:{media:{connections:[{state:'connected'}],audio:[{type:'outbound-rtp',counterRef:1,packetsSent:sent},{type:'inbound-rtp',counterRef:2,packetsReceived:received}]}}});
const passes=(a,b,d='both')=>Object.values(mediaObservation(a,b,d,runtime)).every(v=>v===true);
test('media gate rejects positive stalled counters, resets, missing metadata and wrong document',()=>{
 assert(passes(state(10,10),state(20,20)));
 assert(!passes(state(10,10),state(10,10)));
 assert(!passes(state(10,10),state(20,9)));
 assert(passes(state(10,10),state(10,20),'received'));
 assert(!passes(state(10,10),state(10,20),'both'));
 for(const change of [s=>s.boot='new',s=>s.indicator=false,s=>s.domains.media.connections=[],s=>s.domains.media.connections={},s=>s.domains.media.audio={},s=>delete s.domains.media.audio[1].counterRef,s=>s.domains.media.audio[1].counterRef=3,s=>s.domains.media.audio[1].packetsReceived=NaN]){
  const b=state(20,20);change(b);assert(!passes(state(10,10),b));
 }
 const b=state(20,20);b.domains.media.audio.push({...b.domains.media.audio[1]});assert(!passes(state(10,10),b));
});
test('web media verification uses complete private state, creates structural learning and refuses invalid ranges',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ios-media-'));let count=0,observed;
 const backend=new Backend({state:dir,run:async(kind,args,input)=>{
  if(kind==='learning'){if(input.op==='observe')observed=input.args;return {ok:true,value:{evidenceId:'f'.repeat(32)}};}
  if(kind==='cli'&&args[0]==='acquire'){fs.writeFileSync(args.at(-1),JSON.stringify({lease:'private'}));return {ok:true};}
  if(kind==='cli'&&args[0]==='release')return {ok:true};
  if(kind==='web'){const value=state(++count*10,count*10);value.domains.large='x'.repeat(20000);return {ok:true,value:{status:'completed',result:{ok:true,value}}};}
  throw Error('unexpected');
 }});
 try{
  const begin=await backend.begin({surface:'web',page:'a'.repeat(32)});assert(begin.verification.truncated);
  const id=begin.sessionId,invalid=await backend.webVerify({sessionId:id,gate:'web-media',sampleMs:0});assert.equal(invalid.ok,false);assert.equal(count,1);
  const good=await backend.webVerify({sessionId:id,gate:'web-media',sampleMs:500});assert(good.ok);assert.equal(good.receipt.observation.receivedPacketsAdvance,true);
  assert.equal(observed.receipt.gate,'web-media');assert.equal(observed.source,backend.sessions.get(id).webFingerprint);
  assert(!JSON.stringify(observed).includes('counterRef'));assert.equal(count,3);
 }finally{await backend.close();fs.rmSync(dir,{recursive:true,force:true});}
});
