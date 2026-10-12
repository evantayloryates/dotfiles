import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {SystemDriver} from '../system-driver.mjs';
import {Backend} from '../backend.mjs';
import {readSignals,withSignalContext} from '../signal-log.mjs';
import {createServer} from '../server.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';

function driver(){
 const d=new SystemDriver({state:'/unused',session:{id:'b'.repeat(32)},check:()=>{}});
 d.sid='a'.repeat(36);d.context=async()=> 'com.google.chrome.ios';
 return d;
}
test('permission inspection observes an alert without reading the browser tree; authentication stays observation-only',async()=>{
 for(const authentication of [false,true]){
  const d=driver();let reads=0;
  d.readAlert=async()=>{reads++;return {text:authentication?'Enter iPhone Passcode':'Microphone',buttons:['Allow'],authentication};};
  d.http=async()=>{throw Error('tree must not be requested');};
  const r=await d.inspect({kind:'permission'});
  assert.equal(r.inspectionPath,'alert');assert.equal(r.nodes.length,0);assert.equal(reads,1);
  assert.equal(r.alert.authentication,authentication);assert.equal(d.snapshot.id,r.snapshot);
  if(authentication){const a=await d.action({action:'alert-button',snapshot:r.snapshot,label:'Allow'});assert.equal(a.reason,'human_authentication_required');assert.equal(a.actionSent,false);}
 }
});
test('permission inspection falls back once to a fresh native tree only after confirmed absent alert',async()=>{
 const d=driver();let reads=0,trees=0;
 d.readAlert=async()=>{reads++;return null;};
 d.http=async(method,route)=>{assert.equal(method,'GET');assert(route.endsWith('/source'));trees++;return {value:'<AppiumAUT><XCUIElementTypeButton label="Allow" visible="true" enabled="true" /></AppiumAUT>'};};
 const r=await d.inspect({kind:'permission'});assert.equal(r.inspectionPath,'tree-fallback');
 assert.equal(reads,1);assert.equal(trees,1);assert(r.nodes.some(n=>n.label==='Allow'&&n.target==='1'));
 assert.equal(d.snapshot.id,r.snapshot);
});
test('failed alert and foreground changes cannot become permission absence or a usable snapshot',async()=>{
 for(const mode of ['unknown','app-change']){
  const d=driver();let trees=0;d.snapshot={id:'c'.repeat(32),at:Date.now(),nodes:[]};
  d.readAlert=async()=>{if(mode==='unknown')throw Error('system_endpoint_deadline');return null;};
  d.http=async()=>{trees++;return {value:'<AppiumAUT/>'};};
  let contexts=0;d.context=async()=> ++contexts===1?'com.google.chrome.ios':'com.apple.Preferences';
  await assert.rejects(d.inspect({kind:'permission'}),new RegExp(mode==='unknown'?'system_endpoint_deadline':'system_app_changed'));
  assert.equal(trees,mode==='unknown'?0:1);assert.equal(d.snapshot,null);
 }
});
test('actual MCP admits bounded cold-start waits and permission mode before dispatch',async()=>{
 const seen=[];const {server}=createServer({systemBegin:async a=>{seen.push(a);return {ok:true,ready:false};},systemInspect:async a=>{seen.push(a);return {ok:true};}});
 const [a,b]=InMemoryTransport.createLinkedPair();const c=new Client({name:'release-schema',version:'1'});await server.connect(b);await c.connect(a);
 try{
  const tools=(await c.listTools()).tools;
  assert.equal(tools.find(t=>t.name==='ios_system_begin').inputSchema.properties.timeoutSeconds.maximum,30);
  await c.callTool({name:'ios_system_begin',arguments:{timeoutSeconds:25}});
  await c.callTool({name:'ios_system_inspect',arguments:{sessionId:'a'.repeat(32),kind:'permission',timeoutSeconds:30}});
  assert.equal(seen[0].timeoutSeconds,25);assert.equal(seen[1].kind,'permission');
  assert((await c.callTool({name:'ios_system_begin',arguments:{timeoutSeconds:31}})).isError);
  assert.equal(seen.length,2);
 }finally{await c.close();await server.close();}
});
test('cold runner transport is pending, later readiness carries one correlated recovery and no unknown dispatch',async()=>{
 const d=driver();d.sid=undefined;d.child={exitCode:null};d.base='http://127.0.0.1:1';d.startupStartedAt=Date.now();d.startupDeadline=Date.now()+300000;
 const traceId='d'.repeat(16),original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>{throw new TypeError('private endpoint');};
  await withSignalContext({traceId},async()=>{
   await assert.rejects(d.http('GET','/status'),/system_endpoint_unreachable/);
   await assert.rejects(d.http('GET','/status'),/system_endpoint_unreachable/);
   const pending=await d.continueStart(0);assert.equal(pending.reason,'system_runner_starting');assert.equal(pending.waitingFor,'runner_status');
   let posts=0;d.http=async(method,route)=>{if(route==='/status')return {value:{ready:true}};posts++;return {sessionId:'a'.repeat(36)};};
   assert.equal((await d.continueStart(0)).ready,true);assert.equal(posts,1);
  });
  const r=readSignals({traceId,limit:20});assert.match(r.text,/system.startup_wait level=info outcome=pending/);
  assert.match(r.text,/system.runner_ready.*outcome=verified/);assert.match(r.text,/system.session_requested.*outcome=dispatched/);
  assert(!r.text.includes('outcome=unknown'));assert.equal(r.text.split('\n').filter(l=>l.includes('system.startup_wait')).length,1);
  assert(r.text.includes('sessionId=bbbbbbbb'));
 }finally{globalThis.fetch=original;}
});
test('non-startup endpoint failure remains a warning and startup expiry stays a failure',async()=>{
 const d=driver();d.base='http://127.0.0.1:1';const original=globalThis.fetch,traceId='e'.repeat(16);
 try{
  globalThis.fetch=async()=>{throw new TypeError('private endpoint');};
  await withSignalContext({traceId},async()=>{
   await assert.rejects(d.http('GET','/status'),/system_endpoint_unreachable/);
   d.sid=undefined;d.child={exitCode:null};d.startupDeadline=Date.now()-1;
   assert.equal((await d.continueStart(0)).reason,'system_start_expired');
  });
  const r=readSignals({traceId});assert.match(r.text,/system.provider_failed level=warn/);assert.match(r.text,/system.startup_expired level=warn/);
 }finally{globalThis.fetch=original;}
});
test('verification signals match success and preserve actual failed predicates',async()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-verify-reason-'));
 const b=new Backend({state,run:async kind=>kind==='learning'?{ok:true,value:{}}:{ok:true}});
 const s={id:'a'.repeat(32),surface:'web',webRuntime:{browser:'ios-chrome',boot:'boot',version:'sdk'}};
 b.session=()=>s;b.webAction=async()=>({ok:true,value:{...s.webRuntime,visible:true,secureContext:true,indicator:true}});
 try{
  for(const [valid,traceId] of [[true,'f'.repeat(16)],[false,'1'.repeat(16)]]){
   b.webAction=async()=>({ok:true,value:{...s.webRuntime,visible:valid,secureContext:true,indicator:true}});
   const r=await withSignalContext({traceId},()=>b.webVerify({sessionId:s.id,gate:'web-ready'}));assert.equal(r.ok,valid);
   const log=readSignals({traceId});assert.equal(log.text.includes('reason=condition_not_met'),!valid);assert.match(log.text,valid?/outcome=verified/:/outcome=failed/);
  }
 }finally{fs.rmSync(state,{recursive:true,force:true});}
});
test('short-lived JS/Python writers retain recent tiny files and recover a pruned active file',()=>{
 const state=fs.mkdtempSync(path.join(os.tmpdir(),'ios-writer-retention-'));
 const env={...process.env,IOS_AGENT_SIGNAL_STATE_DIR:state};
 const module=new URL('../signal-log.mjs',import.meta.url).href,py=new URL('../../signals.py',import.meta.url).pathname;
 const js=`import fs from 'node:fs';import {emitSignal,readSignals} from ${JSON.stringify(module)};
 if(!emitSignal('mcp','fixture.first'))process.exit(2);
 const dir=${JSON.stringify(state+'/signals')};fs.unlinkSync(dir+'/'+fs.readdirSync(dir)[0]);
 if(!emitSignal('mcp','fixture.recovered'))process.exit(3);
 for(let i=0;i<40;i++){const name='signal-'+i.toString(16).padStart(16,'0')+'-1.jsonl';fs.writeFileSync(dir+'/'+name,JSON.stringify({v:1,time:new Date().toISOString(),id:i.toString(16).padStart(16,'0'),scope:'host',event:'fixture.row',level:'info'})+'\\n',{mode:0o600});}
 const r=readSignals({view:'summary'});if(r.count!==41)throw Error('recent writer files lost '+r.count);`;
 let r=spawnSync(process.execPath,['--input-type=module','-e',js],{env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 const code=`import importlib.util,json\ns=importlib.util.spec_from_file_location('signals',${JSON.stringify(py)});m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nassert m.emit_signal('host','fixture.first')\nm._current[0].unlink()\nassert m.emit_signal('host','fixture.recovered')\nassert len(m._files())==42\n`;
 r=spawnSync('python3',['-B','-c',code],{env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 fs.rmSync(state,{recursive:true,force:true});
});


test('concurrent pending inspections share one creation across async authorization',async()=>{
 const d=driver();d.sid=undefined;d.child={exitCode:null};d.startupDeadline=Date.now()+300000;
 let authorize,entered,posts=0;const held=new Promise(r=>{authorize=r;});const started=new Promise(r=>{entered=r;});
 d.authorize=async()=>{entered();await held;};
 d.http=async(method,route)=>{if(route==='/status')return {value:{ready:true}};posts++;return {sessionId:'a'.repeat(36)};};
 const first=d.continueStart(0);await started;const second=d.continueStart(0);authorize();
 const results=await Promise.all([first,second]);assert(results.every(r=>r.ready));assert.equal(posts,1);
 assert.equal((await d.continueStart(0)).ready,true);assert.equal(posts,1);
});
