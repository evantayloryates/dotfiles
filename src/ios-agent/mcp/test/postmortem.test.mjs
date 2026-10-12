import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-postmortem-'));
process.env.IOS_AGENT_SIGNAL_STATE_DIR=state;
const {Backend}=await import('../backend.mjs');
const {emitSignal,readSignals}=await import('../signal-log.mjs');
const {createServer,releaseComparison}=await import('../server.mjs');
after(()=>{fs.rmSync(state,{recursive:true,force:true});});

for(const lane of ['app','relay'])test(`intermediate ${lane} handoff retires owner and glow without Home or reload`,async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ios-handoff-')),calls=[];
 const b=new Backend({state:dir,run:async(kind,args)=>{
  if(args[0]==='acquire')fs.writeFileSync(args[args.indexOf('--lease-file')+1],JSON.stringify({lease:'private'}));
  else calls.push(args[0]);return {ok:true,value:{released:true}};
 }});
 try{
  const {sessionId}=await b.begin({surface:'launch'}),s=b.session(sessionId);
  s.surface='web';s.page='page';s.webRuntime={boot:'document',browser:'ios-chrome',version:'sdk'};
  if(lane==='app')s.appManagedHome=true;
  else s.relayChannel={request:async()=>{throw Error('must not send Home');},close:async()=>{calls.push('close-relay');return {closed:true};}};
  b.deviceHome=async()=>{throw Error('must not send Home');};
  b.webPages=async()=>({ok:true,pages:[{id:'page',...s.webRuntime,indicator:false,ageMs:0}]});
  const result=await b.webEnd(sessionId,{home:false});
  assert.equal(result.released,true);assert.equal(result.indicatorOff,true);assert.equal(b.sessions.size,0);
  assert.deepEqual(calls,lane==='relay'?['close-relay','release']:['release']);
  if(lane==='relay')assert.equal(result.relayCleanup.reason,'intermediate_handoff');
 }finally{await b.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('summary finds old info-level rejections, bounds output and distinguishes records from operations',()=>{
 emitSignal('browser','browser.command.terminal',{action:'click',outcome:'rejected',reason:'stale_snapshot',level:'info'});
 emitSignal('browser','browser.command.terminal',{action:'click',outcome:'completed',traceId:'a'.repeat(16)});
 emitSignal('kck-web','kck.web.router.registered',{ready:true});
 const page=readSignals({view:'summary',scope:'browser',maxBytes:2000});
 assert.equal(page.summary.browserCommands,2);assert.equal(page.summary.uncorrelatedBrowserCommands,1);
 assert.equal(page.summary.notableRecords,1);assert.match(page.text,/stale_snapshot/);
 assert.match(page.text,/not unique operations/);assert.equal(page.nextCursor,null);
 assert(Buffer.byteLength(readSignals({view:'summary',maxBytes:256}).text)<=256);
 const event=readSignals({scope:'kck-web'});assert.match(event.text,/ kck.web.router.registered /);assert(!event.text.includes('kck-web.kck.web'));
});

test('version mismatch is explicit and asks for owned-idle reconnect without blocking work',()=>{
 assert.equal(releaseComparison('1.10.1','1.10.1').current,true);
 const stale=releaseComparison('1.9.51','1.10.1');assert.equal(stale.current,false);
 assert.match(stale.next,/End owned sessions/);assert.match(stale.next,/Do not terminate another agent/);
 assert.equal(releaseComparison('1.10.1',undefined).installedVersion,null);
});

test('actual MCP forwards handoff flag and failed page reason is trace-readable',async()=>{
 const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');
 const {InMemoryTransport}=await import('@modelcontextprotocol/sdk/inMemory.js');let observed;
 const {server}=createServer({webEnd:async(id,opts)=>{observed=opts;return {released:true};},webAction:async()=>({ok:false,outcome:'completed',error:'stale_snapshot'})});
 const [a,b]=InMemoryTransport.createLinkedPair(),client=new Client({name:'postmortem',version:'1'});
 await server.connect(b);await client.connect(a);
 try{
  await client.callTool({name:'ios_web_end',arguments:{sessionId:'a'.repeat(32),home:false}});assert.deepEqual(observed,{home:false});
  const failed=await client.callTool({name:'ios_web_action',arguments:{sessionId:'a'.repeat(32),action:'click',args:{snapshot:'b'.repeat(32),target:'1'}}});
  assert.equal(failed.isError,true);
  const trail=readSignals({traceId:failed.structuredContent.signalRequestId,level:'warn'});assert.match(trail.text,/reason=stale_snapshot/);
  const summary=await client.callTool({name:'ios_signals',arguments:{view:'summary',scope:'browser'}});assert.equal(summary.structuredContent.summary.browserCommands,2);
 }finally{await client.close();await server.close();}
});

test('fixed XCTest gate codes survive scrubbing while actual credentials remain redacted',()=>{
 emitSignal('host','fixture.auth_gate',{level:'warn',reason:'xctest_authorization_failed',message:'Authorization: Bearer fake-secret'});
 const page=readSignals({event:'fixture.auth_gate'});assert.match(page.text,/reason=xctest_authorization_failed/);
 assert(!page.text.includes('fake-secret'));
});
