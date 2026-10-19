import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {Backend} from '../backend.mjs';
import {mediaFailureReason} from '../media-verification.mjs';
import {createServer} from '../server.mjs';
import {withSignalContext,readSignals} from '../signal-log.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';

test('actual MCP catalog preflight has no phone effects and detects dropped home=false',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ios-schema-'));
 const backend=new Backend({state:dir,run:()=>{throw Error('no CLI or phone operation permitted');}});
 const {server}=createServer(backend),[a,b]=InMemoryTransport.createLinkedPair(),client=new Client({name:'schema-test',version:'1'});
 await server.connect(b);await client.connect(a);
 try{
  const id='0'.repeat(32),probe=await client.callTool({name:'ios_web_end',arguments:{sessionId:id,home:false}});
  assert.deepEqual(probe.structuredContent.cleanupIntent,{home:false});
  assert.equal(probe.structuredContent.inputSent,false);assert.equal(probe.structuredContent.alreadyEnded,true);
  // Simulate the stale client discarding the option: omission must be visible.
  const dropped=await client.callTool({name:'ios_web_end',arguments:{sessionId:id}});
  assert.equal(dropped.structuredContent.cleanupIntent.home,true);
  const invalid=await client.callTool({name:'ios_web_end',arguments:{sessionId:id,home:'false'}});
  assert.equal(invalid.isError,true); // Do not coerce an ambiguous string.
  const logs=await client.callTool({name:'ios_signals',arguments:{view:'summary',maxBytes:1000}});
  assert(logs.structuredContent.summary);assert.equal(backend.sessions.size,0);
 }finally{await client.close();await server.close();await backend.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('media failure codes identify the predicate without relaxing any gate',()=>{
 const good={readsCompleted:true,sameDocument:true,foregroundOwned:true,connectedPeer:true,sentPacketsAdvance:true,receivedPacketsAdvance:true};
 assert.equal(mediaFailureReason(good),undefined);
 for(const [field,reason] of [['readsCompleted','condition_observation_failed'],['sameDocument','media_document_changed'],['foregroundOwned','media_foreground_unconfirmed'],['connectedPeer','media_peer_not_connected'],['sentPacketsAdvance','media_sent_not_advancing'],['receivedPacketsAdvance','media_received_not_advancing']])assert.equal(mediaFailureReason({...good,[field]:false}),reason);
 assert.equal(mediaFailureReason({...good,sentPacketsAdvance:false,receivedPacketsAdvance:false}),'media_both_directions_not_advancing');
});

test('alert absence explicitly directs one fresh tree read without claiming no permission UI',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ios-alert-'));
 const b=new Backend({state:dir,run:async()=>({ok:true})});
 b.session=()=>({id:'owned',dir,systemDriver:{inspect:async()=>({ok:true,alert:null,nodes:[]})}});
 try{
  const r=await b.systemInspect({sessionId:'owned',kind:'alert'});
  assert.equal(r.coverage,'native-alert-only');assert.match(r.next,/kind=tree once/);assert.match(r.next,/does not prove/);
 }finally{await b.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('real Node to Python to UNIX socket preserves native handoff trace; no phone attached',async()=>{
 // Keep the UNIX pathname below macOS's 104-byte limit.
 const dir=fs.mkdtempSync('/tmp/ios-trace-'),lease=path.join(dir,'lease.json'),messages=[];
 fs.writeFileSync(lease,JSON.stringify({lease:'a'.repeat(32)}),{mode:0o600});
 const listener=net.createServer(socket=>{let data='';socket.on('data',part=>{data+=part;if(data.includes('\n')){messages.push(JSON.parse(data.split('\n')[0]));socket.end(JSON.stringify({error:'lease_required'})+'\n');}});});
 await new Promise(resolve=>listener.listen(path.join(dir,'control.sock'),resolve));
 const b=new Backend({state:dir});
 try{
  await withSignalContext({traceId:'b'.repeat(16),requestId:'b'.repeat(16),sessionId:'c'.repeat(32),version:'fixture'},()=>b.run('cli',['action','browser-handoff','--args',JSON.stringify({browser:'ios-chrome',url:'https://synthetic.invalid/#ios-agent=private-fixture'}),'--lease-file',lease]));
  assert.equal(messages.length,1);assert.equal(messages[0].action,'browser-handoff');
  assert.equal(messages[0].signalContext.traceId,'b'.repeat(16));assert.equal(messages[0].signalContext.sessionId,'c'.repeat(32));
  const trail=readSignals({traceId:'b'.repeat(16)});assert(!trail.text.includes('private-fixture'));
 }finally{await b.close();await new Promise(resolve=>listener.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
});
