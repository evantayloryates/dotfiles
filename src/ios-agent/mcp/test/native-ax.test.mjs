import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {Backend} from '../backend.mjs';import {createServer} from '../server.mjs';import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
test('native AX candidate is absent by default and backend refuses before ownership',async()=>{
 const prior=process.env.IOS_AGENT_EXPERIMENTAL_AX;delete process.env.IOS_AGENT_EXPERIMENTAL_AX;
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-ax-disabled-'));const b=new Backend({state,run:async()=>{throw Error('must not acquire')}});const {server,catalog}=createServer(b);
 try{assert(!catalog().tools.includes('ios_ax_native_tab'));assert.equal((await b.nativeAXTab({tab:'home'})).inputSent,false);}finally{await b.close();await server.close();fs.rmSync(state,{recursive:true,force:true});if(prior!==undefined)process.env.IOS_AGENT_EXPERIMENTAL_AX=prior;}
});
test('opt-in MCP admits only four named native tabs without arbitrary captions or coordinates',async()=>{
 const prior=process.env.IOS_AGENT_EXPERIMENTAL_AX;process.env.IOS_AGENT_EXPERIMENTAL_AX='1';const seen=[];const {server}=createServer({nativeAXTab:async x=>{seen.push(x);return {ok:true}},cancel:async()=>{},close:async()=>{}});const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);const c=new Client({name:'native-ax-candidate',version:'1'});await c.connect(ct);
 try{assert((await c.listTools()).tools.some(t=>t.name==='ios_ax_native_tab'));assert(!(await c.callTool({name:'ios_ax_native_tab',arguments:{tab:'home'}})).isError);assert((await c.callTool({name:'ios_ax_native_tab',arguments:{tab:'Allow'}})).isError);assert.deepEqual(seen,[{tab:'home'}]);}finally{await c.close();await server.close();if(prior===undefined)delete process.env.IOS_AGENT_EXPERIMENTAL_AX;else process.env.IOS_AGENT_EXPERIMENTAL_AX=prior;}
});
for(const mode of ['accepted','unknown'])test(`native AX ${mode} uses one exclusive temporary owner and never starts XCTest`,async()=>{
 const prior=process.env.IOS_AGENT_EXPERIMENTAL_AX;process.env.IOS_AGENT_EXPERIMENTAL_AX='1';const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-ax-'));let held=false,sends=0;
 fs.writeFileSync(path.join(state,'web-device.json'),JSON.stringify({hardwareUDID:'00008110-001451690A21801E'}),{mode:0o600});fs.writeFileSync(path.join(state,'developer-tailnet.json'),'{}',{mode:0o600});
 const b=new Backend({state,deviceRun:async()=>{throw Error('no nearby fallback')},run:async(kind,args,input)=>{
  if(kind==='cli'&&args[0]==='acquire'){held=true;fs.writeFileSync(args[args.indexOf('--lease-file')+1],JSON.stringify({lease:'fixture'}));return {ok:true};}
  if(kind==='cli'&&args[0]==='release'){held=false;fs.unlinkSync(args[args.indexOf('--lease-file')+1]);return {ok:true,value:{released:true}};}
  if(kind==='provider'){sends++;assert(held);assert.equal(input.kind,'ax-native-tab');assert.equal(input.axTab,'home');assert.equal(input.experimentalAX,true);
   if(mode==='unknown')return {ok:false,value:{reason:'device_observation_deadline',inputSent:'unknown'}};
   fs.writeFileSync(input.output,JSON.stringify({result:{ok:true,axPressSent:true,effectVerified:false,standaloneXCTestFreeQualified:false}}));return {ok:true,value:{ok:true}};
  }throw Error('unexpected '+kind);
 }});
 try{const r=await b.nativeAXTab({tab:'home'});assert.equal(sends,1);assert(!held);assert.equal(r.replay,false);assert.equal(r.ok,mode==='accepted');assert.equal(b.artifacts.size,0);if(mode==='accepted')assert.equal(r.effectVerified,false);}finally{await b.close();fs.rmSync(state,{recursive:true,force:true});if(prior===undefined)delete process.env.IOS_AGENT_EXPERIMENTAL_AX;else process.env.IOS_AGENT_EXPERIMENTAL_AX=prior;}
});
