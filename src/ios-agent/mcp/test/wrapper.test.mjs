import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {Backend, runtimeKey} from '../backend.mjs';
import {createServer} from '../server.mjs';

function fixture() {
  const state = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ios-mcp-test-')));
  const calls = []; let held = false, failReady = false, unknown = false;
  const run = async (kind, args, input) => {
    calls.push({kind, args, input});
    if (kind === 'learning') return {ok: true, value: input.op === 'observe' ? {evidenceId: 'e'.repeat(32)} : {lessons: []}};
    if (args[0] === 'status') return {ok: true, value: {sourceHash: 'a'.repeat(64), device: {boot: 'fixture', bundle: 'com.dev.kudos.fit'}, lease: held ? {id: 'never-expose'} : null}};
    if (args[0] === 'acquire') {
      const file = args[args.indexOf('--lease-file') + 1];
      fs.writeFileSync(file, JSON.stringify({lease: 'never-expose'}), {mode: 0o600}); held = true;
      return {ok: true, value: {acquired: true}};
    }
    if (args[0] === 'release') { fs.unlinkSync(args[args.indexOf('--lease-file') + 1]); held = false; return {ok: true, value: {released: true}}; }
    const file = args[args.indexOf('--output') + 1];
    if (kind === 'verify') {
      const failed = failReady && args[0] === 'ready';
      fs.writeFileSync(file, JSON.stringify({gate: args[0], status: failed ? 'failed' : 'passed', observation: {runtimeReady: !failed}}), {mode: 0o600});
      return {ok: !failed};
    }
    const action = args[1];
    const value = action === 'image' ? {pngBase64: 'aW1hZ2U=', scope: 'app-owned-main-window'} : {snapshot: 'fresh', nodes: [{label: 'Synthetic', token: 'never-expose'}]};
    fs.writeFileSync(file, JSON.stringify({id: 'accepted-once', status: unknown ? 'unknown' : 'completed', result: value}), {mode: 0o600});
    return {ok: !unknown, error: unknown ? 'action_not_confirmed' : undefined};
  };
  const backend = new Backend({state, run});
  return {backend, calls, state, held: () => held, setFail: () => { failReady = true; }, setUnknown: () => { unknown = true; }};
}
async function clientFor(f) {
  const {server} = createServer(f.backend);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  const client = new Client({name: 'independent-fixture-harness', version: '1'});
  await client.connect(ct);
  return {client, server};
}
test('SDK discovers tools/resources, intuitive lifecycle, image content and private capability redaction', async () => {
  const f = fixture(); const {client, server} = await clientFor(f);
  try {
    const names = (await client.listTools()).tools.map(t => t.name);
    assert.equal(names.length, 22); assert.ok(names.includes('ios_begin'));
    assert.equal((await client.listResources()).resources.length, 5);
    const begin = (await client.callTool({name: 'ios_begin', arguments: {}})).structuredContent;
    assert.equal(begin.ready, true); assert.equal(f.held(), true);
    const action = (await client.callTool({name: 'ios_native', arguments: {sessionId: begin.sessionId, action: 'tree'}})).structuredContent;
    assert.equal(action.data.snapshot, 'fresh'); assert.ok(!JSON.stringify(action).includes('never-expose'));
    const image = (await client.callTool({name: 'ios_native', arguments: {sessionId: begin.sessionId, action: 'image'}})).structuredContent;
    const read = await client.callTool({name: 'ios_read', arguments: {artifactId: image.artifactId}});
    assert.equal(read.content[0].type, 'image');
    const secretPointer = await client.callTool({name: 'ios_read', arguments: {artifactId: action.artifactId, pointer: '/result/nodes/0/token'}});
    assert.equal(secretPointer.isError, true);
    await client.callTool({name: 'ios_end', arguments: {sessionId: begin.sessionId}});
    assert.equal(f.held(), false);
    const idle = await client.callTool({name: 'ios_verify', arguments: {gate: 'idle'}});
    assert.equal(idle.structuredContent.receipt.status, 'passed');
    assert.equal((await client.callTool({name: 'ios_native', arguments: {sessionId: begin.sessionId, action: 'tap'}})).isError, true);
  } finally { await f.backend.close(); await client.close(); await server.close(); fs.rmSync(f.state, {recursive: true}); }
});
test('failed begin readiness releases; accepted unknown action is not replayed', async () => {
  const f = fixture(); f.setFail();
  try { await assert.rejects(f.backend.begin(), /app_not_ready/); assert.equal(f.held(), false); }
  finally { await f.backend.close(); fs.rmSync(f.state, {recursive: true}); }
  const second = fixture();
  try {
    const begin = await second.backend.begin(); second.setUnknown();
    const result = await second.backend.action({sessionId: begin.sessionId, action: 'tap'});
    assert.equal(result.status, 'unknown'); assert.equal(result.replay, false);
    assert.equal(second.calls.filter(c => c.args?.[0] === 'action').length, 1);
    assert.equal(second.backend.read({artifactId: result.artifactId}).data.id, 'accepted-once');
  } finally { await second.backend.close(); fs.rmSync(second.state, {recursive: true}); }
});
test('connection close marks owner inactive and releases exactly once', async () => {
  const f = fixture();
  try {
    const begin = await f.backend.begin();
    const owner = f.backend.sessions.get(begin.sessionId).owner;
    await Promise.all([f.backend.close(), f.backend.close()]);
    assert.equal(JSON.parse(fs.readFileSync(owner)).active, false);
    assert.equal(f.calls.filter(c => c.args?.[0] === 'release').length, 1);
    assert.equal(f.held(), false);
  } finally { fs.rmSync(f.state, {recursive: true}); }
});
test('concurrent MCP calls are rejected before CLI admission; validation rejects arbitrary actions', async () => {
  const f = fixture(); const original = f.backend.guide.bind(f.backend);
  let entered; const started = new Promise(r => { entered = r; }); let done;
  f.backend.guide = async () => { entered(); await new Promise(r => { done = r; }); return original(); };
  const {client, server} = await clientFor(f);
  try {
    const pending = client.callTool({name: 'ios_guide', arguments: {}}); await started;
    const blocked = await client.callTool({name: 'ios_begin', arguments: {}});
    assert.equal(blocked.isError, true); assert.equal(f.calls.filter(c => c.args?.[0] === 'acquire').length, 0);
    done(); await pending;
    const invalid = await client.callTool({name: 'ios_native', arguments: {sessionId: 'a'.repeat(32), action: 'eval'}});
    assert.equal(invalid.isError, true);
  } finally { await f.backend.close(); await client.close(); await server.close(); fs.rmSync(f.state, {recursive: true}); }
});
test('SDK cancellation retires control without replay and connection can start a fresh session', async () => {
  const f = fixture(); const {client, server} = await clientFor(f);
  try {
    const begin = await f.backend.begin();
    const original = f.backend.action.bind(f.backend); let started; const entered = new Promise(r => { started = r; });
    f.backend.action = async args => { started(); await new Promise(r => setTimeout(r, 150)); return original(args); };
    const controller = new AbortController();
    const pending = client.callTool({name: 'ios_native', arguments: {sessionId: begin.sessionId, action: 'tree'}}, undefined, {signal: controller.signal});
    await entered; controller.abort(); await assert.rejects(pending);
    await new Promise(r => setTimeout(r, 250));
    assert.equal(f.held(), false);
    assert.equal(f.calls.filter(c => c.args?.[0] === 'action').length, 0);
    assert.equal((await f.backend.begin()).ready, true);
  } finally { await f.backend.close(); await client.close(); await server.close(); fs.rmSync(f.state, {recursive: true}); }
});
test('native boot and source changes alter conservative lesson applicability', () => {
  const a = {sourceHash: 'a'.repeat(64), device: {bundle: 'com.dev.kudos.fit', boot: 'one'}};
  assert.notEqual(runtimeKey(a), runtimeKey({...a, device: {...a.device, boot: 'two'}}));
  assert.notEqual(runtimeKey(a), runtimeKey({...a, sourceHash: 'b'.repeat(64)}));
});
test('disconnect during pending acquisition waits for admission and releases its resulting capability', async () => {
  const f = fixture(); const original = f.backend.runOverride;
  let started; const entered = new Promise(r => { started = r; }); let admit;
  f.backend.runOverride = async (kind, args, input) => {
    if (args?.[0] === 'acquire') { started(); await new Promise(r => { admit = r; }); }
    return original(kind, args, input);
  };
  try {
    const beginning = f.backend.begin({rollout: '/actual-active-rollout'});
    await entered;
    const closing = f.backend.close();
    admit();
    await assert.rejects(beginning); await closing;
    assert.equal(f.held(), false);
    assert.equal(f.calls.filter(c => c.args?.[0] === 'release').length, 1);
    assert.ok(f.calls.find(c => c.args?.[0] === 'acquire').args.includes('--connection-owner'));
  } finally { fs.rmSync(f.state, {recursive: true}); }
});
test('real launcher stdio handshake works in a minimal GUI PATH without device control', async () => {
  const client = new Client({name: 'stdio-canary', version: '1'});
  const transport = new StdioClientTransport({command: path.join(os.homedir(), 'dotfiles/bin/ios-agent-mcp'), env: {HOME: os.homedir(), PATH: '/usr/bin:/bin'}, stderr: 'pipe'});
  let stderr = ''; transport.stderr?.on('data', x => { stderr += x; });
  try { await client.connect(transport); assert.equal((await client.listTools()).tools.length, 22); }
  finally { await client.close(); }
  assert.equal(stderr, '');
});
test('host tools preserve failed checks, refuse stack work with an owner, and never acquire the phone', async () => {
  const f = fixture(); const original = f.backend.runOverride;
  let healthy = true, starts = 0;
  f.backend.runOverride = async (kind, args, input) => {
    if (kind === 'doctor') return {ok: healthy, value: {hostPrerequisitesReady: healthy,
      checks: {localGraphQLReady: healthy}, applicationReadiness: 'requires_owned_lease', repairsPerformed: false}};
    if (kind === 'stack') { starts++; return {ok: true, value: {backendReady: true, started: [], dataReset: false, workersStopped: false}}; }
    return original(kind, args, input);
  };
  const {client, server} = await clientFor(f);
  try {
    assert.equal((await client.callTool({name:'ios_doctor',arguments:{}})).structuredContent.ok,true);
    healthy=false;
    const failed=await client.callTool({name:'ios_doctor',arguments:{}});
    assert.equal(failed.isError,true); assert.deepEqual(failed.structuredContent.failedChecks,['localGraphQLReady']);
    assert.equal(f.calls.filter(c=>c.args?.[0]==='acquire').length,0);
    const begin=await f.backend.begin();
    assert.equal((await client.callTool({name:'ios_stack_ensure',arguments:{}})).isError,true);assert.equal(starts,0);
    await f.backend.end(begin.sessionId);
    const reused=await client.callTool({name:'ios_stack_ensure',arguments:{timeout:5}});
    assert.equal(reused.structuredContent.ok,true);assert.equal(starts,1);assert.equal(reused.structuredContent.replay,false);
    assert.equal((await client.callTool({name:'ios_stack_ensure',arguments:{timeout:999}})).isError,true);assert.equal(starts,1);
  } finally {await f.backend.close();await client.close();await server.close();fs.rmSync(f.state,{recursive:true});}
});
test('paired baseline and exact readbacks retain null, fail on collision, and reject cross-client baseline IDs', async () => {
  const f=fixture(); const original=f.backend.runOverride;
  let current={coachId:1,coachUserId:2,clientId:3,clientUserId:4,databaseFingerprint:'b'.repeat(64),targetDailyCalories:null};
  f.backend.runOverride=async(kind,args,input)=>kind==='paired'?{ok:true,value:{ok:true,snapshot:{...current}}}:original(kind,args,input);
  const {client,server}=await clientFor(f); const other=fixture();const remote=await clientFor(other);
  try {
    const plan=(await client.callTool({name:'ios_workflow',arguments:{action:'plan'}})).structuredContent;
    assert.equal(plan.recipe.steps.length,8);assert.ok(plan.recipe.limitations.some(v=>v.includes('No automatic')));
    assert.ok((await client.readResource({uri:'ios-agent://paired-workflow'})).contents[0].text.includes('read'));
    const capture=(await client.callTool({name:'ios_workflow',arguments:{action:'capture',clientId:'3'}})).structuredContent;
    assert.equal(capture.receipt.scope,'guarded-local-persistence-only');
    assert.equal(f.backend.read({artifactId:capture.baselineId}).data.targetDailyCalories,null);
    assert.equal((await client.callTool({name:'ios_workflow',arguments:{action:'restore-check',baselineId:capture.baselineId,clientId:'5'}})).structuredContent.reason,'paired_baseline_client_mismatch');
    assert.equal((await remote.client.callTool({name:'ios_workflow',arguments:{action:'restore-check',baselineId:capture.baselineId}})).isError,true);
    current.targetDailyCalories=2456;
    assert.equal((await client.callTool({name:'ios_workflow',arguments:{action:'assert',stage:'coach-write',baselineId:capture.baselineId,expected:2456}})).structuredContent.ok,true);
    assert.equal((await client.callTool({name:'ios_workflow',arguments:{action:'restore-check',baselineId:capture.baselineId}})).isError,true);
    current.targetDailyCalories=null;
    assert.equal((await client.callTool({name:'ios_workflow',arguments:{action:'restore-check',baselineId:capture.baselineId}})).structuredContent.ok,true);
    current.databaseFingerprint='c'.repeat(64);
    const changed=await client.callTool({name:'ios_workflow',arguments:{action:'restore-check',baselineId:capture.baselineId}});
    assert.equal(changed.isError,true);assert.equal(changed.structuredContent.receipt.observation.sameDatabaseAndPair,false);
    assert.equal((await client.callTool({name:'ios_workflow',arguments:{action:'assert',baselineId:capture.baselineId}})).isError,true);
    assert.equal((await client.callTool({name:'ios_workflow',arguments:{action:'capture',clientId:'sql'}})).isError,true);
    assert.equal(f.calls.filter(c=>c.args?.[0]==='acquire').length,0);
  }finally{await f.backend.close();await other.backend.close();await client.close();await server.close();await remote.client.close();await remote.server.close();fs.rmSync(f.state,{recursive:true});fs.rmSync(other.state,{recursive:true});}
});

test('recovery uncertainty and another owner fail without replay or device acquisition', async () => {
  const f=fixture();const {client,server}=await clientFor(f);let starts=0;
  f.backend.runOverride=async(kind)=>{
    assert.equal(kind,'stack');starts++;
    return starts===1?{ok:false,value:null,error:'cli_deadline_outcome_unknown_do_not_replay'}:
      {ok:false,value:{backendReady:false,failure:'idle_host_required_for_stack_recovery',dataReset:false,workersStopped:false}};
  };
  try {
    const unknown=await client.callTool({name:'ios_stack_ensure',arguments:{}});
    assert.equal(unknown.isError,true);assert.equal(unknown.structuredContent.replay,false);
    assert.equal(unknown.structuredContent.reason,'cli_deadline_outcome_unknown_do_not_replay');assert.equal(starts,1);
    const owned=await client.callTool({name:'ios_stack_ensure',arguments:{}});
    assert.equal(owned.isError,true);assert.equal(owned.structuredContent.workersStopped,false);
    assert.equal(owned.structuredContent.failure,'idle_host_required_for_stack_recovery');assert.equal(starts,2);
    assert.equal(f.calls.length,0);
  }finally{await f.backend.close();await client.close();await server.close();fs.rmSync(f.state,{recursive:true});}
});
test('failed pair read creates no usable baseline and never exposes provider errors', async () => {
  const f=fixture();const {client,server}=await clientFor(f);
  f.backend.runOverride=async(kind)=>{assert.equal(kind,'paired');return {ok:false,error:'private-provider-secret',value:{ok:false,reason:'private-provider-secret'}};};
  try {
    const refused=await client.callTool({name:'ios_workflow',arguments:{action:'capture',clientId:'3'}});
    assert.equal(refused.isError,true);assert.equal(refused.structuredContent.reason,'paired_local_read_refused');
    assert.equal(refused.structuredContent.dataChanged,false);assert.equal(refused.structuredContent.credentialsCreated,false);
    assert.equal(f.backend.artifacts.size,0);assert.ok(!JSON.stringify(refused).includes('private-provider-secret'));
    assert.equal(f.calls.length,0);
  }finally{await f.backend.close();await client.close();await server.close();fs.rmSync(f.state,{recursive:true});}
});

test('large browser observations retain usable headers and verify the full private DOM', async () => {
  const state=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ios-web-large-')));
  const full={snapshot:'fresh-browser',path:'/meet',content:'x'.repeat(20000)+' far-tail-postcondition',elements:Array.from({length:300},(_,i)=>({id:String(i),tag:'button',label:'Synthetic '+i+' '.repeat(60)}))};
  const backend=new Backend({state,run:async(kind,args,input)=>{
    if(kind==='learning')return {ok:true,value:input.op==='observe'?{evidenceId:'f'.repeat(32)}:{lessons:[]}};
    if(kind==='cli'&&args[0]==='acquire'){fs.writeFileSync(args[args.indexOf('--lease-file')+1],JSON.stringify({lease:'private'}),{mode:0o600});return {ok:true};}
    if(kind==='cli'&&args[0]==='release'){fs.unlinkSync(args[args.indexOf('--lease-file')+1]);return {ok:true,value:{released:true}};}
    if(kind==='web')return {ok:true,value:{status:'completed',result:{ok:true,value:input.action==='state'?{version:'test-sdk',boot:'doc',browser:'ios-safari',visible:true,indicator:true,secureContext:true,domains:{large:'x'.repeat(20000)}}:full}}};
    throw Error('unexpected fixture call');
  }});
  try{const begin=await backend.begin({surface:'web',page:'p'.repeat(32)});assert.equal(begin.verification.value.version,'test-sdk');assert.equal(begin.verification.truncated,true);
    const snap=await backend.webAction({sessionId:begin.sessionId,action:'snapshot'});assert.equal(snap.value.snapshot,'fresh-browser');assert.equal(snap.value.nodeCount,300);assert.equal(snap.value.elements.length,25);assert.equal(snap.truncated,true);
    const verified=await backend.webVerify({sessionId:begin.sessionId,gate:'web-route',expectedPath:'/meet',expectedText:'far-tail-postcondition'});assert.equal(verified.ok,true);assert.equal(verified.receipt.observation.nodeCount,300);
    assert.equal(backend.read({artifactId:snap.artifactId,pointer:'/result/value/elements/299'}).data.id,'299');
  }finally{await backend.close();fs.rmSync(state,{recursive:true,force:true});}
});
