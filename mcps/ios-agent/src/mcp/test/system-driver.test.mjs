import test from 'node:test';import assert from 'node:assert/strict';
import {SystemDriver,parseTree,tailnetHost} from '../system-driver.mjs';
function fixture(){const d=new SystemDriver({state:'/unused',session:{},check:()=>{}});d.sid='a'.repeat(36);const calls=[];d.http=async(method,route)=>{calls.push([method,route]);if(route.endsWith('/wda/locked'))return {value:false};if(route.endsWith('/wda/activeAppInfo'))return {value:{bundleId:'com.apple.mobilesafari'}};return {value:null};};d.snapshot={id:'a'.repeat(32),at:Date.now(),bundle:'com.apple.mobilesafari',nodes:[{type:'XCUIElementTypeApplication',rect:{x:0,y:0,width:390,height:844}},{type:'XCUIElementTypeButton',name:'More',label:'More',visible:true,enabled:true,rect:{x:10,y:20,width:50,height:30}}]};return {d,calls};}
test('fallback refuses stale snapshots and locked-phone input before POST',async()=>{const {d,calls}=fixture();d.snapshot.at-=6000;const r=await d.action({action:'tap',snapshot:d.snapshot.id,target:'1'});assert.equal(r.actionSent,false);assert(!calls.some(x=>x[0]==='POST'));d.http=async()=>({value:true});const locked=await d.action({action:'home'});assert.equal(locked.ok,false);});
test('unknown native click blocks further mutation until a fresh observation',async()=>{const {d,calls}=fixture(),http=d.http;d.http=async(m,r,b)=>{if(r.endsWith('/elements'))return {value:[{ELEMENT:'a'.repeat(36)}]};if(r.endsWith('/attribute/hittable'))return {value:true};if(r.endsWith('/click')){calls.push([m,r]);throw Error('timeout');}return http(m,r,b);};const args={action:'tap',snapshot:d.snapshot.id,target:'1'};assert.equal((await d.action(args)).replay,false);assert.equal(d.snapshot,null);assert(d.uncertain);assert.equal((await d.action({action:'home'})).reason,'system_observation_required');assert.equal(calls.filter(x=>x[1].endsWith('/click')).length,1);});
test('native element must be unique and actually hittable before a click',async()=>{for(const count of [1,2]){const {d,calls}=fixture(),http=d.http;d.http=async(m,r,b)=>{if(r.endsWith('/elements'))return {value:Array.from({length:count},()=>({ELEMENT:'a'.repeat(36)}))};if(r.endsWith('/attribute/hittable'))return {value:false};return http(m,r,b);};assert.equal((await d.action({action:'tap',snapshot:d.snapshot.id,target:'1'})).actionSent,false);assert(!calls.some(x=>x[1].endsWith('/click')));}});
test('target validation rejects secure fields and offscreen centers',async()=>{for(const patch of [{type:'XCUIElementTypeSecureTextField'},{rect:{x:900,y:10,width:50,height:30}}]){const {d,calls}=fixture();Object.assign(d.snapshot.nodes[1],patch);assert.equal((await d.action({action:'tap',snapshot:d.snapshot.id,target:'1'})).actionSent,false);assert(!calls.some(x=>x[0]==='POST'));}});
test('native tree projection excludes secure values and keeps ordinary labels',async()=>{const r=await parseTree('<AppiumAUT><XCUIElementTypeApplication x="0" y="0" width="390" height="844"><XCUIElementTypeSecureTextField value="test-password" label="Password"/><XCUIElementTypeButton label="Allow" visible="true" enabled="true"/></XCUIElementTypeApplication></AppiumAUT>');assert(!JSON.stringify(r).includes('test-password'));assert(r.nodes.some(x=>x.label==='Allow'));});
test('system endpoint must be the configured IPv4 tailnet address',()=>{assert(tailnetHost('100.106.65.81'));for(const h of ['127.0.0.1','100.128.1.1','example.com','100.106.65.81:8100','100.064.1.1'])assert(!tailnetHost(h));});
test('an open native endpoint is distinguished from a refused socket',async()=>{const net=await import('node:net');const {endpointState}=await import('../system-driver.mjs');const server=net.createServer(socket=>socket.end());await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;assert.equal(await endpointState('127.0.0.1',port),'open');await new Promise(r=>server.close(r));assert.equal(await endpointState('127.0.0.1',port),'refused');});
test('native network failure reports transport cause without inferring a lock or exposing raw errors',async()=>{const d=new SystemDriver({state:'/unused',session:{},check:()=>{}});d.base='http://127.0.0.1:1';d.sid='a'.repeat(36);const original=globalThis.fetch;try{for(const [name,reason] of [['TimeoutError','system_endpoint_deadline'],['TypeError','system_endpoint_unreachable']]){globalThis.fetch=async()=>{const e=Error('private provider detail');e.name=name;throw e;};await assert.rejects(d.http('GET','/status'),{message:reason});}d.http=async()=>{throw Error('system_endpoint_deadline');};const result=await d.action({action:'home'});assert.equal(result.reason,'system_endpoint_deadline');assert.equal(result.actionSent,false);assert(!JSON.stringify(result).includes('private'));}finally{globalThis.fetch=original;}});
test('an exited owned runner reports its exact authorization gate before another request or input',async()=>{
 for(const gate of [undefined,'physical_unlock_required','xctest_authorization_failed']){
  const {d,calls}=fixture();d.child={exitCode:65};d.startupGate=gate;
  const r=await d.action({action:'home'});
  assert.equal(r.reason,gate||'system_runner_exited');assert.equal(r.actionSent,false);assert.equal(r.replay,false);
  assert.equal(calls.length,0);await assert.rejects(d.inspect(),{message:gate||'system_runner_exited'});
 }
});
test('a live child and retained drivers without a child still use current phone state',async()=>{
 for(const child of [null,{exitCode:null}]){const {d,calls}=fixture();d.child=child;d.startupGate='physical_unlock_required';
  assert.equal(await d.context(),'com.apple.mobilesafari');assert.equal(calls.length,2);
 }
});
test('uncertain or replaced broker ownership refuses native mutations before dispatch',async()=>{for(const reason of ['owner_not_active','system_ownership_unconfirmed'])for(const action of ['home','activate','scroll','tap']){const {d,calls}=fixture(),http=d.http;d.authorize=async()=>{throw Error(reason)};d.http=async(m,r,b)=>{if(r.endsWith('/elements'))return {value:[{ELEMENT:'a'.repeat(36)}]};if(r.endsWith('/attribute/hittable'))return {value:true};return http(m,r,b);};const result=await d.action({action,app:'chrome',direction:'up',snapshot:d.snapshot.id,target:'1'});assert.equal(result.actionSent,false);assert.equal(result.reason,reason);assert(!calls.some(([m,r])=>m==='POST'&&!r.endsWith('/elements')));}});
test('named SwiftUI switch targets its unique native child and refuses ambiguous children',async()=>{
 for(const count of [0,1,2]){const {d,calls}=fixture(),http=d.http;d.snapshot.nodes[1].type='XCUIElementTypeSwitch';const parent='a'.repeat(36),child='b'.repeat(36);
 d.http=async(m,r,b)=>{if(r.endsWith('/elements')){calls.push([m,r]);return {value:r.includes('/element/')?Array.from({length:count},()=>({ELEMENT:child})):[{ELEMENT:parent}]};}if(r.endsWith('/attribute/hittable'))return {value:true};return http(m,r,b);};
 const result=await d.action({action:'tap',snapshot:d.snapshot.id,target:'1'});assert.equal(result.ok,count<2);const clicks=calls.filter(c=>c[1].endsWith('/click'));assert.equal(clicks.length,count<2?1:0);if(count<2)assert(clicks[0][1].includes(count===1?child:parent));
 }
});
test('exact label uses live native query without source; ambiguity, occlusion and bounds refuse input',async()=>{
 for(const mode of ['unique','missing','duplicate','occluded','offscreen','authority']){const {d,calls}=fixture(),http=d.http;let authorized=0;d.authorize=async()=>{authorized++;if(mode==='authority')throw Error('system_ownership_unconfirmed');};
 d.http=async(m,r,b)=>{if(r.endsWith('/elements')){calls.push([m,r]);assert(b.value.includes('enabled == 1'));return {value:Array.from({length:mode==='missing'?0:mode==='duplicate'?2:1},()=>({ELEMENT:'a'.repeat(36)}))};}if(r.endsWith('/window/rect'))return {value:{x:0,y:0,width:390,height:844}};if(r.endsWith('/rect'))return {value:{x:mode==='offscreen'?900:10,y:20,width:50,height:30}};if(r.endsWith('/attribute/hittable'))return {value:mode!=='occluded'};if(r.endsWith('/source'))throw Error('full hierarchy not permitted');return http(m,r,b);};
 const r=await d.action({action:'tap',label:'Allow',elementType:'XCUIElementTypeButton'});assert.equal(r.ok,mode==='unique');assert.equal(calls.filter(c=>c[1].endsWith('/click')).length,mode==='unique'?1:0);if(mode!=='unique')assert.equal(r.actionSent,false);if(mode==='unique')assert.equal(authorized,1);
 }
});

test('fixed launch/Home may leave an unrelated foreground app without inspecting it; scoped input and lock still refuse',async()=>{
 for(const action of ['activate','home','tap']){const {d,calls}=fixture(),http=d.http;let active='com.example.personal-app';
 d.http=async(m,r,b)=>{if(r.endsWith('/wda/activeAppInfo'))return {value:{bundleId:active}};if(r.endsWith('/wda/apps/activate'))active=b.bundleId;if(r==='/wda/homescreen')active='com.apple.springboard';if(r.endsWith('/source'))throw Error('unrelated contents must not be read');return http(m,r,b);};
 const result=await d.action({action,app:'chrome',label:'Allow',elementType:'XCUIElementTypeButton'});assert.equal(result.ok,action!=='tap');if(action==='tap')assert.equal(result.reason,'system_app_scope_required');assert(!calls.some(c=>c[1].endsWith('/source')));
 }
 const {d,calls}=fixture();d.http=async()=>({value:true});assert.equal((await d.action({action:'activate',app:'chrome'})).reason,'physical_unlock_required');assert.equal(calls.length,0);
});

 test('Shortcuts is a fixed setup target; arbitrary apps remain refused',async()=>{
 const {d,calls}=fixture(),http=d.http;let active='com.apple.mobilesafari';
 d.http=async(m,r,b)=>{if(r.endsWith('/wda/activeAppInfo'))return {value:{bundleId:active}};if(r.endsWith('/wda/apps/activate'))active=b.bundleId;return http(m,r,b);};
 assert.equal((await d.action({action:'activate',app:'shortcuts'})).foregroundConfirmed,true);
 assert.equal(await d.context(),'com.apple.shortcuts');
 assert.equal((await d.action({action:'activate',app:'com.example.arbitrary'})).actionSent,false);
 assert.equal(active,'com.apple.shortcuts');
 });

 test('foreground handoff waits on reads and never replays Home; owner loss stops observation',async()=>{
 const {d,calls}=fixture(),http=d.http;let reads=0;
 d.http=async(m,r,b)=>{if(r.endsWith('/wda/activeAppInfo'))return {value:{bundleId:++reads<3?'com.apple.Preferences':'com.apple.springboard'}};return http(m,r,b);};
 assert.equal((await d.action({action:'home'})).homeConfirmed,true);
 assert.equal(calls.filter(([m,r])=>m==='POST'&&r==='/wda/homescreen').length,1);
 d.check=()=>{throw Error('owner_not_active')};await assert.rejects(d.foregroundMatches('com.apple.springboard'),/owner_not_active/);
 });

 test('installed MCP schema admits fixed Shortcuts setup and rejects arbitrary activation',async()=>{
 const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');const {InMemoryTransport}=await import('@modelcontextprotocol/sdk/inMemory.js');const {createServer}=await import('../server.mjs');
 const seen=[];const {server}=createServer({systemAction:async args=>{seen.push(args);return {ok:true}},cancel:async()=>{},close:async()=>{}});
 const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);const c=new Client({name:'system-setup-test',version:'1'});await c.connect(ct);
 try{assert(!(await c.callTool({name:'ios_system_action',arguments:{sessionId:'a'.repeat(32),action:'activate',app:'shortcuts'}})).isError);
 assert((await c.callTool({name:'ios_system_action',arguments:{sessionId:'a'.repeat(32),action:'activate',app:'com.example.arbitrary'}})).isError);assert.equal(seen.length,1);
 }finally{await c.close();await server.close();}
 });

function fieldFixture(mode='ready'){
 const {d,calls}=fixture(),http=d.http;
 d.authorize=async()=>{if(mode==='authority')throw Error('system_ownership_unconfirmed');};
 d.http=async(m,r,b)=>{
  if(r.endsWith('/elements'))return {value:Array.from({length:mode==='duplicate'?2:1},()=>({ELEMENT:'a'.repeat(36)}))};
  if(r.endsWith('/window/rect'))return {value:{x:0,y:0,width:390,height:844}};
  if(r.endsWith('/rect'))return {value:{x:10,y:20,width:150,height:30}};
  if(r.endsWith('/attribute/hittable'))return {value:mode!=='occluded'};
  if(r.endsWith('/value')||r.endsWith('/clear')){calls.push([m,r,b]);if(mode==='unknown')throw Error('system_endpoint_deadline');return {value:null};}
  return http(m,r,b);
 };
 return {d,calls};
}
test('orientation sends once under owner authority and independently reads provider state',async()=>{
 for(const mode of ['ready','mismatch','authority','unknown']){
  const {d,calls}=fixture(),http=d.http;d.authorize=async()=>{if(mode==='authority')throw Error('system_ownership_unconfirmed');};
  d.http=async(m,r,b)=>{if(r.endsWith('/orientation')){calls.push([m,r,b]);if(m==='POST'){if(mode==='unknown')throw Error('system_endpoint_deadline');assert.deepEqual(b,{orientation:'PORTRAIT'});return {value:null};}return {value:mode==='mismatch'?'LANDSCAPE':'PORTRAIT'};}return http(m,r,b);};
  const r=await d.action({action:'orientation',orientation:'portrait'});
  assert.equal(calls.filter(([m,r])=>m==='POST'&&r.endsWith('/orientation')).length,mode==='authority'?0:1);
  assert.equal(r.orientationConfirmed,mode==='ready'?true:mode==='mismatch'?false:undefined);
  if(mode==='unknown'){assert.equal(r.outcome,'unknown_or_rejected');assert.equal((await d.action({action:'orientation',orientation:'portrait'})).reason,'system_observation_required');}
 }
 const {d,calls}=fixture();assert.equal((await d.action({action:'orientation',orientation:'upside-down'})).actionSent,false);assert(!calls.some(([m])=>m==='POST'));
});
test('MCP orientation is explicit and cannot be smuggled into another action',async()=>{
 const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');const {InMemoryTransport}=await import('@modelcontextprotocol/sdk/inMemory.js');const {createServer}=await import('../server.mjs');
 const seen=[];const {server}=createServer({systemAction:async args=>{seen.push(args);return {ok:true}},cancel:async()=>{},close:async()=>{}});
 const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);const c=new Client({name:'orientation-test',version:'1'});await c.connect(ct);
 try{
  const base={sessionId:'a'.repeat(32),action:'orientation',orientation:'portrait'};
  assert(!(await c.callTool({name:'ios_system_action',arguments:base})).isError);assert.equal(seen.length,1);
  for(const patch of [{orientation:undefined},{action:'home'}])assert.equal((await c.callTool({name:'ios_system_action',arguments:{...base,...patch}})).structuredContent.ok,false);
  assert((await c.callTool({name:'ios_system_action',arguments:{...base,orientation:'upside-down'}})).isError);assert.equal(seen.length,1);
 }finally{await c.close();await server.close();}
});
test('ordinary field typing appends once; clearing requires its own explicit action',async()=>{
 const {d,calls}=fieldFixture();const target={label:'Test draft',elementType:'XCUIElementTypeTextField'};
 assert.equal((await d.action({action:'type',...target,text:'Runner café 👋'})).ok,true);
 assert.equal(calls.filter(c=>c[1].endsWith('/value')).length,1);
 assert.deepEqual(calls.find(c=>c[1].endsWith('/value'))[2],{text:'Runner café 👋',frequency:40});
 assert.equal(calls.filter(c=>c[1].endsWith('/clear')).length,0);
 assert.equal((await d.action({action:'clear',...target})).ok,true);
 assert.equal(calls.filter(c=>c[1].endsWith('/clear')).length,1);
});
test('field focus is one guarded click with no implicit clear or text',async()=>{
 const {d,calls}=fieldFixture();
 assert.equal((await d.action({action:'focus',label:'Address',elementType:'XCUIElementTypeTextField'})).ok,true);
 assert.equal(calls.filter(c=>c[1].endsWith('/click')).length,1);
 assert(!calls.some(c=>c[1].endsWith('/value')||c[1].endsWith('/clear')));
 for(const mode of ['duplicate','occluded','authority']){
  const {d,calls}=fieldFixture(mode);
  assert.equal((await d.action({action:'focus',label:'Address',elementType:'XCUIElementTypeTextField'})).actionSent,false);
  assert(!calls.some(c=>c[1].endsWith('/click')));
 }
 assert.equal((await d.action({action:'focus',label:'Passcode',elementType:'XCUIElementTypeSecureTextField'})).actionSent,false);
});
test('field input refuses secure, oversized, ambiguous, occluded and lost-owner targets',async()=>{
 for(const [mode,patch] of [['ready',{elementType:'XCUIElementTypeSecureTextField'}],['ready',{text:'x'.repeat(257)}],['duplicate',{}],['occluded',{}],['authority',{}]]){
  const {d,calls}=fieldFixture(mode);const r=await d.action({action:'type',label:'Test draft',elementType:'XCUIElementTypeTextField',text:'draft',...patch});
  assert.equal(r.actionSent,false);assert(!calls.some(c=>c[1].endsWith('/value')||c[1].endsWith('/clear')));
 }
});
test('unknown field input is never automatically replayed',async()=>{
 const {d,calls}=fieldFixture('unknown');const args={action:'type',label:'Test draft',elementType:'XCUIElementTypeTextField',text:'draft'};
 assert.equal((await d.action(args)).outcome,'unknown_or_rejected');
 assert.equal((await d.action(args)).reason,'system_observation_required');
 assert.equal(calls.filter(c=>c[1].endsWith('/value')).length,1);
});
test('MCP admits ordinary field text and rejects missing, oversized or secure input',async()=>{
 const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');const {InMemoryTransport}=await import('@modelcontextprotocol/sdk/inMemory.js');const {createServer}=await import('../server.mjs');
 const seen=[];const {server}=createServer({systemAction:async args=>{seen.push(args);return {ok:true}},cancel:async()=>{},close:async()=>{}});
 const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);const c=new Client({name:'field-input-test',version:'1'});await c.connect(ct);
 const target={sessionId:'a'.repeat(32),action:'type',label:'Test draft',elementType:'XCUIElementTypeTextField',text:'draft'};
 try{
  assert(!(await c.callTool({name:'ios_system_action',arguments:target})).isError);
  for(const patch of [{text:'x'.repeat(257)},{elementType:'XCUIElementTypeSecureTextField'}])assert((await c.callTool({name:'ios_system_action',arguments:{...target,...patch}})).isError);
  for(const patch of [{text:undefined},{action:'clear'},{label:undefined}]){
   const r=await c.callTool({name:'ios_system_action',arguments:{...target,...patch}});
   assert.equal(r.structuredContent.ok,false);
  }
  assert.equal(seen.length,1);
  assert(!(await c.callTool({name:'ios_system_action',arguments:{...target,action:'focus',text:undefined}})).isError);
  assert.equal(seen.length,2);assert.equal(seen[1].action,'focus');
  assert((await c.callTool({name:'ios_system_action',arguments:{...target,action:'focus'}})).isError);assert.equal(seen.length,2);
 }finally{await c.close();await server.close();}
});

test('anchored scrolling targets a unique live control with bounded content-direction gesture and no click',async()=>{
 for(const mode of ['ready','duplicate','occluded','authority','unknown']){
  const {d,calls}=fieldFixture(mode),http=d.http;
  d.http=async(m,r,b)=>{if(r.endsWith('/wda/dragfromtoforduration')){calls.push([m,r,b]);if(mode==='unknown')throw Error('system_endpoint_deadline');return {value:null};}return http(m,r,b);};
  const args={action:'scroll',direction:'up',label:'Nested panel control',elementType:'XCUIElementTypeButton'};
  const result=await d.action(args),gestures=calls.filter(c=>c[1].endsWith('/wda/dragfromtoforduration'));
  assert.equal(gestures.length,['ready','unknown'].includes(mode)?1:0);
  if(mode==='ready'){assert.equal(result.ok,true);assert.deepEqual(gestures[0][2],{fromX:85,fromY:35,toX:85,toY:185,duration:0.05});}
  if(mode==='unknown'){assert.equal(result.outcome,'unknown_or_rejected');assert.equal((await d.action(args)).reason,'system_observation_required');}
  assert(!calls.some(c=>c[1].endsWith('/click')));
 }
});
test('MCP admits an exact typed scroll anchor and rejects conflicting snapshot addressing',async()=>{
 const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');const {InMemoryTransport}=await import('@modelcontextprotocol/sdk/inMemory.js');const {createServer}=await import('../server.mjs');
 const seen=[];const {server}=createServer({systemAction:async args=>{seen.push(args);return {ok:true}},cancel:async()=>{},close:async()=>{}});
 const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);const c=new Client({name:'anchored-scroll-test',version:'1'});await c.connect(ct);
 const args={sessionId:'a'.repeat(32),action:'scroll',direction:'down',label:'Panel',elementType:'XCUIElementTypeButton'};
 try{assert(!(await c.callTool({name:'ios_system_action',arguments:args})).isError);assert.equal(seen.length,1);
 assert.equal((await c.callTool({name:'ios_system_action',arguments:{...args,snapshot:'b'.repeat(32)}})).structuredContent.ok,false);assert.equal(seen.length,1);
 }finally{await c.close();await server.close();}
});
test('backend does not spend a full XML read on an exact scroll anchor',async()=>{
 const {Backend}=await import('../backend.mjs');const b=Object.create(Backend.prototype);let reads=0,seen;
 b.session=()=>({systemDriver:{inspect:async()=>{reads++;return {snapshot:'fresh'};},action:async args=>{seen=args;return {ok:true};}}});
 await b.systemAction({sessionId:'owned',action:'scroll',direction:'down',label:'Panel',elementType:'XCUIElementTypeButton'});assert.equal(reads,0);assert.equal(seen.snapshot,undefined);
 await b.systemAction({sessionId:'owned',action:'scroll',direction:'down'});assert.equal(reads,1);assert.equal(seen.snapshot,'fresh');
});
test('named native web-select containers can open once but cannot receive ordinary field text',async()=>{
 const {d,calls}=fieldFixture();assert.equal((await d.action({action:'tap',label:'Audio transport strategy',elementType:'XCUIElementTypeOther'})).ok,true);assert.equal(calls.filter(c=>c[1].endsWith('/click')).length,1);
 assert.equal((await d.action({action:'type',label:'Audio transport strategy',elementType:'XCUIElementTypeOther',text:'webrtc'})).actionSent,false);assert(!calls.some(c=>c[1].endsWith('/value')));
});
test('MCP exposes named web-select tapping without granting container text input',async()=>{
 const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');const {InMemoryTransport}=await import('@modelcontextprotocol/sdk/inMemory.js');const {createServer}=await import('../server.mjs');const seen=[];
 const {server}=createServer({systemAction:async args=>{seen.push(args);return {ok:true}},cancel:async()=>{},close:async()=>{}}),[ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);const c=new Client({name:'web-select-test',version:'1'});await c.connect(ct);
 const args={sessionId:'a'.repeat(32),action:'tap',label:'Audio transport strategy',elementType:'XCUIElementTypeOther'};
 try{assert.equal((await c.callTool({name:'ios_system_action',arguments:args})).structuredContent.ok,true);assert.equal(seen.length,1);assert.equal((await c.callTool({name:'ios_system_action',arguments:{...args,action:'type',text:'webrtc'}})).structuredContent.ok,false);assert.equal(seen.length,1);}finally{await c.close();await server.close();}
});
