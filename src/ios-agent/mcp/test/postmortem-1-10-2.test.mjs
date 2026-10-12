import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {openManagedWeb} from '../web-open.mjs';
import {Backend} from '../backend.mjs';
import {SystemDriver} from '../system-driver.mjs';
import {RelayChannel} from '../relay-channel.mjs';
import {withSignalContext} from '../signal-log.mjs';
import {readSignals} from '../signal-log.mjs';
import {createServer} from '../server.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';

test('actual MCP exposes explicit browser lanes, fixed Wi-Fi recovery and pending startup signals',async()=>{
 let observed,recoveries=0;
 const {server}=createServer({webOpen:async args=>{observed=args;return {ok:false,inputSent:false};},deviceWiFiOn:async()=>{recoveries++;return {ok:true,inputSent:true,wifiVerified:false};},systemBegin:async()=>({ok:true,ready:false,reason:'system_start_unconfirmed_inspect_phone'})});
 const client=new Client({name:'postmortem-schema',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);
 try{
  await client.callTool({name:'ios_web_open',arguments:{browser:'ios-chrome',transport:'paired'}});assert.equal(observed.transport,'paired');
  const r=await client.callTool({name:'ios_device_wifi_on',arguments:{}});assert.equal(r.structuredContent.wifiVerified,false);assert.equal(recoveries,1);
  const start=await client.callTool({name:'ios_system_begin',arguments:{}});assert.match(readSignals({traceId:start.structuredContent.signalRequestId}).text,/outcome=pending/);
 }finally{await client.close();await server.close();}
});

for(const transport of ['auto','paired'])test(`${transport} opens directly through pairing without native bootstrap`,async()=>{
 const calls=[],s={};let reads=0;
 const b={appTransportPreferred:async()=>false,waitReady:async()=>({readyToAcquire:false}),
  webPages:async()=>({ok:true,pages:reads++?[{id:'new',browser:'ios-chrome',visible:true,ready:true,ageMs:0}]:[]}),
  webEnroll:async a=>{calls.push(a);return {ok:true,launch:{ok:true,inputSent:true}};},
  begin:async a=>{calls.push(a);assert.equal(a.surface,'web');return {sessionId:'owned'};},session:()=>s,
  deviceLaunch:()=>{throw Error('must not bootstrap native');},end:()=>{throw Error('must retain successful owner');}};
 const result=await openManagedWeb(b,{browser:'ios-chrome',transport,threadId:'exact-thread'});
 assert.equal(result.transport,'paired-direct-browser-handoff');assert.equal(result.offLANQualified,false);
 assert.equal(calls[0].transport,'paired');assert.equal(calls[1].threadId,'exact-thread');assert(s.pairedManagedHome);assert(!s.appManagedHome);
});

test('direct launch refusal sends no alternate input or unnecessary readiness wait',async()=>{
 let calls=0;
 const result=await openManagedWeb({webPages:async()=>({ok:true,pages:[]}),webEnroll:async()=>{calls++;return {ok:true,launch:{ok:false,inputSent:false,reason:'physical_unlock_required'}};}},{browser:'ios-chrome',transport:'paired'});
 assert.equal(result.reason,'physical_unlock_required');assert.equal(result.inputSent,false);assert.equal(calls,1);
});

test('paired final cleanup releases glow before one paired Home request',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ios-paired-end-')),events=[];
 const b=new Backend({state:dir,run:async(_k,args)=>{if(args[0]==='acquire')fs.writeFileSync(args.at(-1),'{}');else events.push('release');return {ok:true,value:{released:true}};}});
 try{
  const {sessionId}=await b.begin({surface:'launch'}),s=b.session(sessionId);s.pairedManagedHome=true;s.page='page';s.webRuntime={boot:'boot',browser:'ios-chrome',version:'sdk'};
  b.webPages=async()=>{events.push('glow-off');return {ok:true,pages:[{id:'page',...s.webRuntime,indicator:false,ageMs:0}]};};
  b.deviceHome=async({transport})=>{assert.equal(transport,'paired');assert.equal(b.sessions.size,0);events.push('home');return {ok:true};};
  const result=await b.webEnd(sessionId);assert.equal(result.indicatorOff,true);assert.equal(result.appCleanup.homeRequested,true);assert.deepEqual(events,['release','glow-off','home']);
 }finally{await b.close();fs.rmSync(dir,{recursive:true,force:true});}
});

for(const response of ['timeout','invalid'])test(`unknown ${response} XCTest session creation is never sent twice`,async()=>{
 const d=new SystemDriver({state:'/unused',session:{},check:()=>{}});d.child={exitCode:null};d.startupDeadline=Date.now()+300000;let creates=0;
 d.http=async(_method,route)=>{if(route==='/status')return {value:{ready:true}};creates++;if(response==='timeout')throw Error('system_endpoint_deadline');return {sessionId:'invalid'};};
 const first=await d.continueStart(0),second=await d.continueStart(0);
 assert.equal(first.ok,false);assert.equal(second.reason,'system_session_creation_unconfirmed');assert.equal(creates,1);assert.equal(d.sid,undefined);
 assert.equal((await d.action({action:'home'})).actionSent,false);
});

test('relay startup inherits context and each retained request gets its own trace',async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-relay-context-'));
 const executable=path.join(state,'providers/pymobiledevice3-11.15.5/bin/python');fs.mkdirSync(path.dirname(executable),{recursive:true});
 // Real child/stdio boundary; no Python provider, phone or capability involved.
 fs.writeFileSync(executable,`#!${process.execPath}
const r=require('node:readline').createInterface({input:process.stdin});
(async()=>{
 let first=true;
 for await(const line of r){
  const q=JSON.parse(line);
  if(first){first=false;console.log(JSON.stringify({ok:true,event:'ready',rsdIdentityVerified:true}));}
  else{
   console.log(JSON.stringify({ok:true,id:q.id,trace:q.signalContext?.traceId,startup:JSON.parse(process.env.IOS_AGENT_SIGNAL_CONTEXT).traceId,closed:q.op==='close'}));
   if(q.op==='close')break;
  }
 }
 r.close();
})();
`,{mode:0o700});
 let channel;
 try{
  channel=withSignalContext({traceId:'a'.repeat(16)},()=>new RelayChannel(state,{}));await channel.ready;
  for(const traceId of ['b'.repeat(16),'c'.repeat(16)]){
   const r=await withSignalContext({traceId},()=>channel.request('observe',{request:{kind:'browser-debug'}}));assert.equal(r.trace,traceId);assert.equal(r.startup,'a'.repeat(16));
  }
 }finally{if(channel)await channel.close();fs.rmSync(state,{recursive:true,force:true});}
});
