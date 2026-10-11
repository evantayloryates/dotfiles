import test from 'node:test';
import assert from 'node:assert/strict';
import {SystemDriver,parseTree} from '../system-driver.mjs';
test('overflowing, malformed and nonfinite native bounds do not discard a valid hierarchy',async()=>{
  const tree=await parseTree('<AppiumAUT><XCUIElementTypeApplication x="0" y="0" width="390" height="844"><XCUIElementTypeOther x="-1.797693134862316e+308" width="1.797693134862316e+308"/><XCUIElementTypeOther x="nan" y="inf" width="bad"/><XCUIElementTypeButton label="Allow" visible="true" enabled="true" x="10" y="20" width="30" height="40"/></XCUIElementTypeApplication></AppiumAUT>');
  assert.equal(tree.nodes.length,5);assert.equal(tree.nodes[2].rect.x,null);assert.equal(tree.nodes[2].rect.width,null);assert.equal(tree.nodes[2].geometryValid,false);
  assert.equal(tree.nodes[3].geometryValid,false);assert.equal(tree.nodes[4].geometryValid,true);assert.equal(tree.nodes[4].label,'Allow');assert.doesNotThrow(()=>JSON.parse(JSON.stringify(tree)));
});
function fixture({count=1,moved=false,hittable=true}={}){
  const calls=[],d=new SystemDriver({state:'/unused',session:{},check:()=>{}});d.sid='a'.repeat(36);
  d.snapshot={id:'b'.repeat(32),at:Date.now(),bundle:'com.apple.shortcuts',nodes:[{type:'XCUIElementTypeApplication',rect:{x:0,y:0,width:390,height:844}},{type:'XCUIElementTypeButton',name:'',label:'',visible:true,enabled:true,rect:{x:89,y:57,width:24,height:24}}]};
  d.http=async(m,r,b)=>{calls.push({m,r,b});if(r.endsWith('/wda/locked'))return {value:false};if(r.endsWith('/wda/activeAppInfo'))return {value:{bundleId:'com.apple.shortcuts'}};
    if(r.endsWith('/elements')){assert.match(b.value,/name == nil/);return {value:Array.from({length:count},()=>({ELEMENT:'a'.repeat(36)}))};}
    if(r.endsWith('/rect'))return {value:{x:moved?120:89,y:57,width:24,height:24}};
    if(r.endsWith('/attribute/hittable'))return {value:hittable};return {value:null};};
  return {d,calls,args:{action:'tap',snapshot:d.snapshot.id,target:'1'}};
}
test('one observed anonymous native control requires matching live bounds and actual hittability',async()=>{
  const {d,calls,args}=fixture();assert((await d.action(args)).ok);assert.equal(calls.filter(x=>x.r.endsWith('/click')).length,1);assert(!calls.some(x=>x.r.includes('/wda/tap')));assert.equal(d.snapshot,null);
});
test('anonymous control ambiguity, movement, occlusion or invalid geometry never dispatches',async()=>{
  for(const options of [{count:0},{count:2},{moved:true},{hittable:false},{invalid:true}]){
    const {d,calls,args}=fixture(options);if(options.invalid)d.snapshot.nodes[1].rect.x=null;
    const result=await d.action(args);assert.equal(result.actionSent,false);assert(!calls.some(x=>x.r.endsWith('/click')||x.r.includes('/wda/tap')));
  }
});
function ordinaryField(options={}){
  const {d,calls,args}=fixture(options);d.snapshot.nodes[1].type='XCUIElementTypeTextField';
  const http=d.http;d.http=async(m,r,b)=>r.endsWith('/window/rect')?{value:{x:0,y:0,width:390,height:844}}:http(m,r,b);
  d.authorize=async()=>{if(options.lostOwner)throw Error('system_ownership_unconfirmed');};
  if(options.stale)d.snapshot.at-=6000;
  if(options.secure)d.snapshot.nodes[1].type='XCUIElementTypeSecureTextField';
  if(options.invalid)d.snapshot.nodes[1].rect.x=null;
  return {d,calls,args:{...args,action:'type',text:'Runner Home'}};
}
test('fresh snapshot addresses an unnamed ordinary field for focus, clear and type',async()=>{
  for(const action of ['focus','clear','type']){
    const {d,calls,args}=ordinaryField();const result=await d.action({...args,action,...(action==='type'?{}:{text:undefined})});
    assert.equal(result.ok,true);const suffix=action==='focus'?'/click':action==='clear'?'/clear':'/value';
    const writes=calls.filter(c=>c.r.endsWith(suffix));assert.equal(writes.length,1);assert.equal(d.snapshot,null);
    if(action==='type')assert.deepEqual(writes[0].b,{text:'Runner Home',frequency:40});
  }
});
test('snapshot field input rejects stale, secure, ambiguous, moved, occluded, invalid and lost-owner targets',async()=>{
  for(const options of [{stale:true},{secure:true},{count:2},{moved:true},{hittable:false},{invalid:true},{lostOwner:true}]){
    const {d,calls,args}=ordinaryField(options);const r=await d.action(args);assert.equal(r.actionSent,false);
    assert(!calls.some(c=>['/click','/clear','/value'].some(s=>c.r.endsWith(s))));
  }
});
test('MCP forwards snapshot field addressing and rejects mixed/incomplete addresses',async()=>{
  const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');const {InMemoryTransport}=await import('@modelcontextprotocol/sdk/inMemory.js');const {createServer}=await import('../server.mjs');
  const seen=[];const {server}=createServer({systemAction:async args=>{seen.push(args);return {ok:true}},cancel:async()=>{},close:async()=>{}});
  const [ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);const c=new Client({name:'anonymous-fields',version:'1'});await c.connect(ct);
  const base={sessionId:'a'.repeat(32),action:'type',snapshot:'b'.repeat(32),target:'1',text:'Runner Home'};
  try{
    assert.equal((await c.callTool({name:'ios_system_action',arguments:base})).structuredContent.ok,true);
    assert.equal(seen.length,1);assert.equal(seen[0].snapshot,base.snapshot);
    for(const patch of [{target:undefined},{snapshot:undefined},{label:'Mixed',elementType:'XCUIElementTypeTextField'},{elementType:'XCUIElementTypeTextField'}])assert.equal((await c.callTool({name:'ios_system_action',arguments:{...base,...patch}})).structuredContent.ok,false);
    assert.equal(seen.length,1);
  }finally{await c.close();await server.close();}
});
