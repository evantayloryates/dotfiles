import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Backend} from '../backend.mjs';
import {validProbeSelection,probeExpression} from '../audio-probe.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../server.mjs';
test('unsupported combinations are refused before producing page input',()=>{
 assert(validProbeSelection('opus-ws','disable-opus'));assert(validProbeSelection('opus-ws','drop-10'));
 for(const [s,f] of [['pcm-ws','disable-opus'],['webrtc','drop-10'],['injected','none']]){assert(!validProbeSelection(s,f));assert.throws(()=>probeExpression('select',s,f));}
});
test('unknown run is dispatched once; replacement document and disconnected call admit no input',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'audio-probe-')),calls=[];
 const page={boot:'same',browser:'ios-safari',version:'fixture',visible:true,secureContext:true,indicator:true,domains:{meet:{connected:true},'transport-lab':{running:false,sourceLive:true,sourceEnabled:true}}};
 const b=new Backend({state:dir,run:async(kind,args,input)=>{
  if(kind==='cli'){if(args[0]==='acquire')fs.writeFileSync(args.at(-1),JSON.stringify({lease:'private'}));return{ok:true};}
  if(kind==='web'){calls.push(input.action);return input.action==='state'?{ok:true,value:{status:'completed',result:{ok:true,value:page}}}:{ok:false,value:{status:'unknown'}};}
  return {ok:true,value:{}};
 }});
 try{const id=(await b.begin({surface:'web',page:'a'.repeat(32)})).sessionId;
  const unknown=await b.audioProbe({action:'run',sessionId:id});assert.equal(unknown.outcome,'unknown');assert.equal(calls.filter(x=>x==='evaluate').length,1);
  page.domains.meet.connected=false;assert.equal((await b.audioProbe({action:'run',sessionId:id})).reason,'probe_live_call_required');
  page.domains.meet.connected=true;page.boot='replaced';assert.equal((await b.audioProbe({action:'run',sessionId:id})).reason,'probe_page_not_owned_ready');assert.equal(calls.filter(x=>x==='evaluate').length,1);
 }finally{await b.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('malformed MCP operations do not access the phone and plan needs no session',async()=>{
 let n=0;const {server}=createServer({audioProbe:async()=>{n++;return {ok:true};}}),[ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);const c=new Client({name:'audio-schema',version:'1'});await c.connect(ct);
 try{for(const args of [{action:'run'},{action:'select',sessionId:'a'.repeat(32),strategy:'pcm-ws'},{action:'read',sessionId:'a'.repeat(32),fault:'none'},{action:'plan',sessionId:'a'.repeat(32)}])assert((await c.callTool({name:'ios_audio_probe',arguments:args})).isError);
 assert.equal(n,0);assert(!(await c.callTool({name:'ios_audio_probe',arguments:{action:'plan'}})).isError);assert.equal(n,1);
 }finally{await c.close();await server.close();}
});
