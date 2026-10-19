import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-usage-patch-'));
process.env.IOS_AGENT_SIGNAL_STATE_DIR=state;
const {createServer}=await import('../server.mjs');
const {Backend}=await import('../backend.mjs');
const {openAppWeb}=await import('../web-open.mjs');
const {emitSignal,readSignals,withSignalContext}=await import('../signal-log.mjs');
const {parseSignalOptions}=await import('../signals-cli.mjs');
after(()=>fs.rmSync(state,{recursive:true,force:true}));
async function connect(backend){const {server}=createServer(backend);const client=new Client({name:'usage-fixture',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);return {server,client};}

test('catalog-only and signals-only connections never create diagnostic files',async()=>{
 const before=fs.existsSync(path.join(state,'signals'))?fs.readdirSync(path.join(state,'signals')).length:0;
 for(let i=0;i<20;i++){
  const {server,client}=await connect({});
  try{assert((await client.listTools()).tools.length>0);await client.listResources();await client.callTool({name:'ios_signals',arguments:{view:'summary'}});}
  finally{await client.close();await server.close();}
 }
 assert.equal(fs.existsSync(path.join(state,'signals'))?fs.readdirSync(path.join(state,'signals')).length:0,before);
});
test('actual tool work receives one stable connection ID, distinct across clients and preserved in Python',async()=>{
 const ids=[];
 for(let i=0;i<2;i++){
  const {server,client}=await connect({status:async()=>({leased:false})});
  try{
   for(let j=0;j<2;j++){
    const r=await client.callTool({name:'ios_status',arguments:{}});
    const rows=readSignals({traceId:r.structuredContent.signalRequestId});
    assert.match(rows.text,/connectionId=[a-f0-9]{16}/);
    const match=/connectionId=([a-f0-9]{16})/.exec(rows.text)[1];if(j)assert.equal(match,ids.at(-1));else ids.push(match);
    const filtered=await client.callTool({name:'ios_signals',arguments:{connectionId:match,view:'summary'}});assert.equal(filtered.structuredContent.summary.operations.distinctConnections,1);
   }
  }finally{await client.close();await server.close();}
 }
 assert.notEqual(ids[0],ids[1]);
 const py=new URL('../../signals.py',import.meta.url).pathname;
 const r=spawnSync('python3',['-B','-c',`import importlib.util\ns=importlib.util.spec_from_file_location('signals',${JSON.stringify(py)});m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nassert m.emit_signal('host','fixture.connection')`],{env:{...process.env,IOS_AGENT_SIGNAL_CONTEXT:JSON.stringify({connectionId:ids[0]})},encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);assert.match(readSignals({event:'fixture.connection',connectionId:ids[0]}).text,/connectionId=/);
 assert.equal(parseSignalOptions(['--connection',ids[0]]).options.connectionId,ids[0]);assert.throws(()=>parseSignalOptions(['--connection','bad']));
});
test('summary counts one terminal per request, separates unknown and reports bounded latency groups',()=>{
 for(const [i,durationMs,outcome] of [[1,10,'completed'],[2,30,'failed'],[3,50,'unknown']]){
  const traceId=String(i).repeat(16);emitSignal('mcp','request.admitted',{tool:'ios_fixture',traceId,connectionId:'f'.repeat(16)});
  emitSignal('mcp','request.completed',{tool:'ios_fixture',traceId,connectionId:'f'.repeat(16),durationMs,outcome,reason:outcome==='completed'?undefined:'fixture_failure'});
  emitSignal('host','fixture.failure',{traceId,outcome:'failed'});
 }
 // A duplicate terminal must not become a fourth operation.
 emitSignal('mcp','request.completed',{tool:'ios_fixture',traceId:'2'.repeat(16),connectionId:'f'.repeat(16),durationMs:30,outcome:'failed',reason:'fixture_failure'});
 const r=readSignals({view:'summary',tool:'ios_fixture'}).summary.operations;
 assert.equal(r.terminalRequests,3);assert.equal(r.distinctConnections,1);assert.deepEqual(r.tools[0],{tool:'ios_fixture',calls:3,failed:1,unknown:1,pending:0,p50Ms:30,p95Ms:50,maxMs:50});assert.equal(r.failures[0].count,2);
 assert(Buffer.byteLength(readSignals({view:'summary',maxBytes:256}).text)<=256);
});
test('failed native idle receipt exposes precise predicate without weakening the gate',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ios-idle-predicate-'));
 const backend=new Backend({state:dir,run:async(kind,args)=>{
  assert.equal(kind,'verify');fs.writeFileSync(args[args.indexOf('--output')+1],JSON.stringify({status:'failed',gate:'idle',reason:'deadline_exceeded',failedPredicate:'native_feedback_unavailable',observation:{hostIdle:true,deviceFeedbackKnown:false}}));return {ok:false};
 }});backend.status=async()=>({});
 try{const r=await withSignalContext({traceId:'4'.repeat(16)},()=>backend.verify({gate:'idle'}));assert.equal(r.reason,'native_feedback_unavailable');assert.equal(r.receipt.status,'failed');assert.equal(r.receipt.reason,'deadline_exceeded');assert.match(r.next,/host-idle/);assert.match(readSignals({traceId:'4'.repeat(16)}).text,/native_feedback_unavailable/);}
 finally{await backend.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('doctor emits exact fixed failed checks rather than a generic failure',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ios-doctor-reason-'));
 const backend=new Backend({state:dir,run:async()=>({ok:false,value:{hostPrerequisitesReady:false,checks:{localMetroHTTPReady:false,localWebReady:true}}})});
 try{const r=await withSignalContext({traceId:'5'.repeat(16)},()=>backend.doctor());assert.equal(r.reason,'host_prerequisites_incomplete');assert.deepEqual(r.failedChecks,['localMetroHTTPReady']);assert.match(readSignals({traceId:'5'.repeat(16)}).text,/localMetroHTTPReady/);}
 finally{await backend.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('page readiness failure preserves unknown launch cause, phase and one-dispatch recovery guidance',async()=>{
 let sends=0;const now=Date.now;let clock=0;
 Date.now=()=>clock+=10000;
 try{
  const r=await openAppWeb({webPages:async()=>({ok:true,pages:[]}),webEnroll:async()=>{sends++;return {ok:true,launch:{ok:false,inputSent:'unknown',reason:'device_observation_unavailable',phase:'browser_url_launch'}};},begin:()=>assert.fail('must not acquire')},{browser:'ios-safari',enrollmentTransport:'paired'});
  assert.equal(sends,1);assert.equal(r.outcome,'unknown');assert.equal(r.phase,'page_readiness');assert.equal(r.launchReason,'device_observation_unavailable');assert.equal(r.launchPhase,'browser_url_launch');assert.equal(r.recovery.newDocumentObserved,false);assert.match(r.next,/No accepted\/unknown launch is replayed/);
 }finally{Date.now=now;}
});
test('MCP terminal logging preserves unknown launch outcome and underlying cause',async()=>{
 const {server,client}=await connect({webOpen:async()=>({ok:false,outcome:'unknown',inputSent:'unknown',reason:'fresh_launched_page_unconfirmed',phase:'page_readiness',launchReason:'device_observation_unavailable'})});
 try{const r=await client.callTool({name:'ios_web_open',arguments:{browser:'ios-safari'}});assert(r.isError);const trail=readSignals({traceId:r.structuredContent.signalRequestId}).text;assert.match(trail,/outcome=unknown/);assert.match(trail,/errorCode=device_observation_unavailable/);assert.match(trail,/phase=page_readiness/);}
 finally{await client.close();await server.close();}
});
test('fresh replacement document stops obsolete cleanup waiting without Home or a false pass',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ios-replaced-end-'));let reads=0;
 const backend=new Backend({state:dir,run:async(_kind,args)=>{if(args[0]==='acquire')fs.writeFileSync(args.at(-1),'{}');return {ok:true,value:{released:true}};}});
 try{
  const {sessionId}=await backend.begin({surface:'launch'}),s=backend.session(sessionId);s.surface='web';s.page='same-page';s.webRuntime={browser:'ios-safari',boot:'old',version:'sdk'};s.pairedManagedHome=true;
  backend.webPages=async()=>{reads++;return {ok:true,pages:[{id:'same-page',browser:'ios-safari',boot:'new',version:'sdk',ageMs:0,indicator:false}]};};
  backend.deviceHome=()=>assert.fail('must not send Home after document replacement');
  const r=await backend.webEnd(sessionId);assert.equal(reads,1);assert.equal(r.ok,false);assert.equal(r.indicatorOff,'unconfirmed');assert.equal(r.feedback,'page_runtime_changed');assert.equal(r.released,true);
 }finally{await backend.close();fs.rmSync(dir,{recursive:true,force:true});}
});
