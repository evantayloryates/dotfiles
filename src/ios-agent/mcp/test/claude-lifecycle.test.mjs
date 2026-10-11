import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {claudeTurnOwner,claudeBeginHook} from '../claude-lifecycle.mjs';
import {Backend} from '../backend.mjs';

const sessionId='01a116ef-a3ad-74c3-ad32-6869c9c14e03';
const promptId='550e8400-e29b-41d4-a716-446655440000';
const nextPrompt='550e8400-e29b-41d4-a716-446655440001';
const owner={sessionId,promptId,agentId:''};
function fixture(){
  const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-claude-lifecycle-')),calls=[];
  const backend=new Backend({state,ownerContext:()=>({mode:'codex-turn',rollout:'/should-not-be-selected'}),run:async(kind,args)=>{
    calls.push([kind,args]);
    if(args?.[0]==='acquire')fs.writeFileSync(args[args.indexOf('--lease-file')+1],'{}',{mode:0o600});
    return {ok:true,value:{}};
  }});
  return {backend,state,calls,clean:async()=>{await backend.close();fs.rmSync(state,{recursive:true});}};
}
test('PreToolUse preserves arguments and binds exact prompt/subagent without allowing permissions',()=>{
  const input={hook_event_name:'PreToolUse',tool_name:'mcp__ios-agent__ios_web_begin',session_id:sessionId,prompt_id:promptId,agent_id:'agent-one',tool_input:{page:'a'.repeat(32)}};
  const result=claudeBeginHook(input);
  assert.deepEqual(result,{hookSpecificOutput:{hookEventName:'PreToolUse',updatedInput:{page:'a'.repeat(32),claudeOwner:{sessionId,promptId,agentId:'agent-one'}}}});
  assert.deepEqual(input.tool_input,{page:'a'.repeat(32)});
  for(const patch of [{prompt_id:undefined},{agent_id:'${agent_id}'},{tool_name:'mcp__another__ios_begin'},{hook_event_name:'Stop'},{tool_input:{threadId:sessionId}}])assert.deepEqual(claudeBeginHook({...input,...patch}),{});
  assert.equal(claudeTurnOwner({sessionId:sessionId.toUpperCase(),promptId}).sessionId,sessionId);
  for(const bad of [{sessionId},{...owner,agentId:'../escape'},{...owner,unknown:true}])assert.throws(()=>claudeTurnOwner(bad),/exact_claude_prompt_owner_required/);
});
test('actual hook executable bounds malformed input and emits the unchanged-field adapter',()=>{
  const executable=new URL('../../claude-begin-hook.mjs',import.meta.url);
  const run=input=>spawnSync(process.execPath,[executable.pathname],{input,encoding:'utf8'});
  const input={hook_event_name:'PreToolUse',tool_name:'mcp__ios-agent__ios_begin',session_id:sessionId,prompt_id:promptId,tool_input:{nativeOnly:true}};
  const good=run(JSON.stringify(input));assert.equal(good.status,0);assert.equal(JSON.parse(good.stdout).hookSpecificOutput.updatedInput.nativeOnly,true);
  for(const bad of ['not json','x'.repeat(65537)])assert.deepEqual(JSON.parse(run(bad).stdout),{});
  const mainOnly=input=>spawnSync(process.execPath,[executable.pathname,'--main-agent-only'],{input:JSON.stringify(input),encoding:'utf8'});
  assert.equal(JSON.parse(mainOnly(input).stdout).hookSpecificOutput.updatedInput.nativeOnly,true);
  assert.deepEqual(JSON.parse(mainOnly({...input,agent_id:'child'}).stdout),{});
});
test('Claude ownership overrides inherited Codex context, but explicit mixed owners refuse before admission',async()=>{
  const f=fixture();try{
    for(const args of [{threadId:sessionId},{rollout:'/other'}])await assert.rejects(f.backend.begin({surface:'launch',claudeOwner:owner,...args}),/one_harness_owner_reference_required/);
    assert.equal(f.calls.length,0);assert.equal(f.backend.sessions.size,0);
    const started=await f.backend.begin({surface:'launch',claudeOwner:owner});
    assert.equal(started.lifecycle.mode,'claude-prompt');assert.deepEqual(started.lifecycle.claudeOwner,owner);
    assert(f.calls[0][1].includes('--owner-file'));assert(!f.calls[0][1].includes('--rollout'));
    assert.deepEqual(f.backend.sessions.get(started.sessionId).claudeOwner,owner);
  }finally{await f.clean();}
});
test('old prompt, wrong subagent/session, malformed interpolation and unbound/foreign owners send no cleanup',async()=>{
  const f=fixture(),other=fixture();try{
    const current=await f.backend.begin({surface:'launch',claudeOwner:{...owner,promptId:nextPrompt,agentId:'child'}});
    const original=await other.backend.begin({surface:'launch'});
    const initial=f.calls.length;
    for(const patch of [{},{promptId:nextPrompt},{promptId:nextPrompt,agentId:'other'},{sessionId:nextPrompt,promptId:nextPrompt,agentId:'child'},{agentId:'${agent_id}'},{promptId:''},{event:'SubagentStop',agentId:''}]){
      const result=await f.backend.harnessEnd({event:'Stop',...owner,...patch});assert.equal(result.cleanup.matched,0);
    }
    assert.equal(f.calls.length,initial);assert(f.backend.sessions.has(current.sessionId));assert(other.backend.sessions.has(original.sessionId));
    const done=await f.backend.harnessEnd({event:'SubagentStop',...owner,promptId:nextPrompt,agentId:'child'});
    assert.equal(done.cleanup.released,1);assert.equal(done.cleanup.confirmed,true);assert(!f.backend.sessions.has(current.sessionId));
    assert(other.backend.sessions.has(original.sessionId));
    assert.equal((await f.backend.harnessEnd({event:'SubagentStop',...owner,promptId:nextPrompt,agentId:'child'})).cleanup.matched,0);
  }finally{await f.clean();await other.clean();}
});
test('cleanup selects normal web/system adapters and retains their unconfirmed outcomes',async()=>{
  const f=fixture();try{
    for(const surface of ['web','system','native']){
      f.backend.sessions.set(surface,{id:surface,claudeOwner:owner,surface,...(surface==='system'?{systemDriver:{}}:{})});
    }
    const ended=[];
    f.backend.webEnd=async id=>{ended.push(['web',id]);f.backend.sessions.delete(id);return {released:true,indicatorOff:'unconfirmed',ok:false};};
    f.backend.systemEnd=async args=>{ended.push(['system',args]);f.backend.sessions.delete(args.sessionId);return {released:true,ok:false,systemCleanup:{runnerStopped:false}};};
    f.backend.end=async id=>{ended.push(['native',id]);f.backend.sessions.delete(id);return {released:true,captureCleanup:{complete:false}};};
    const result=await f.backend.harnessEnd({event:'StopFailure',...owner});
    assert.deepEqual(ended,[['web','web'],['system',{sessionId:'system'}],['native','native']]);
    assert.equal(result.cleanup.matched,3);assert.equal(result.cleanup.released,3);assert.equal(result.cleanup.confirmed,false);assert.equal(result.ok,false);
  }finally{await f.clean();}
});
test('real MCP protocol forwards exact owner and hook fields, and rejects mixed identity schemas',async()=>{
  const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');
  const {InMemoryTransport}=await import('@modelcontextprotocol/sdk/inMemory.js');
  const {createServer}=await import('../server.mjs');const seen=[];
  const backend={close:async()=>{},begin:async x=>{seen.push(['begin',x]);return {ok:true};},systemBegin:async x=>{seen.push(['system',x]);return {ok:true};},harnessEnd:async x=>{seen.push(['end',x]);return {ok:true,suppressOutput:true};}};
  const {server}=createServer(backend),c=new Client({name:'claude-hook-contract',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
  await server.connect(a);await c.connect(b);
  try{
    for(const name of ['ios_begin','ios_web_begin','ios_system_begin']){
      const args={claudeOwner:owner,...(name==='ios_web_begin'?{page:'a'.repeat(32)}:{})};
      assert((await c.callTool({name,arguments:args})).structuredContent.ok);
      assert.deepEqual(seen.at(-1)[1].claudeOwner,owner);
    }
    assert((await c.callTool({name:'ios_harness_end',arguments:{event:'Stop',...owner}})).structuredContent.ok);
    assert.deepEqual(seen.at(-1),['end',{event:'Stop',...owner}]);
    const n=seen.length;
    const bad=await c.callTool({name:'ios_begin',arguments:{claudeOwner:{...owner,agentId:'../wrong'}}});
    assert.equal(bad.isError,true);assert.equal(seen.length,n);
  }finally{await c.close();await server.close();}
});
