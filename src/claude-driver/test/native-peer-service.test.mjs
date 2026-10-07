import test from 'node:test'
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {buildNativePeerServicePackage} from '../lib/native-peer-service-package.mjs'
import {screenNativeServiceReady} from '../lib/native-peer-service-evidence.mjs'
const config={id:'a'.repeat(32),token:'claude-driver service-read '+'b'.repeat(32),brokerSession:'local_11111111-1111-4111-8111-111111111111',brokerCwd:'/Users/taylor/.local/state/claude-driver/broker',build:'c'.repeat(64),notBefore:1000,deadline:2000,maxRequests:2}
const target='local_22222222-2222-4222-8222-222222222222',r1='rpeer'+'1'.repeat(32),r2='rpeer'+'2'.repeat(32),r3='rpeer'+'3'.repeat(32)
function setup({files=new Map(),checkpoint={dispatch:true,op:'get_session',args:{session_id:target}},now=1000,controlCheck=false}={}){
 const pkg=buildNativePeerServicePackage({...config,...controlCheck?{controlCheck:true}:{}}),hooks=new Map();let checks=0,reads=0,queued=0
 const register=runInNewContext(pkg.files['hooks/register.js'].replace('export function register','function register')+';register',{Set,Object,JSON,Date,Number,Array})
 register((event,fn)=>hooks.set(event,fn))
 const $={session:{id:async()=>config.brokerSession,cwd:async()=>config.brokerCwd},clock:{now:async()=>now},fs:{exists:async p=>files.has(p),read:async p=>JSON.stringify(files.get(p)),write:async(p,text)=>files.set(p,JSON.parse(text))},tool:{call:async input=>{checks++;assert.match(input.command,/broker-check.mjs/);return {text:JSON.stringify(checkpoint)}}},mcp:{call:async(server,op,args)=>{reads++;assert.equal(server,'ccd_session_mgmt');assert.equal(op,'get_session');assert.equal(args.session_id,target);return {isError:false,content:[{type:'text',text:'PRIVATE'}]}}}}
 return {files,$,start:()=>hooks.get('session.start')($,{},()=> 'next'),send:(id,kind='peer')=>hooks.get('session.receive')($,{origin:{kind},text:config.token+' '+id},()=>{queued++;return 'queued'}),counts:()=>({checks,reads,queued})}
}
test('owned readiness records zero calls once, and expired or foreign start refuses',async()=>{
 const s=setup();assert.equal(await s.start(),'next');await s.start()
 const ready=s.files.get(config.brokerCwd+'/.native-service-'+config.id+'.ready.json')
 assert.equal(ready.build,config.build);assert.equal(ready.nativeCallsRequested,0);assert.equal(ready.modelCallsRequested,0)
 assert.equal(screenNativeServiceReady({config,ready,now:1000}),true)
 for(const change of [{serviceId:'foreign'},{build:'foreign'},{brokerSession:target},{nativeCallsRequested:1},{registeredAt:'invalid'},{extra:true}])assert.equal(screenNativeServiceReady({config,ready:{...ready,...change},now:1000}),false)
 assert.equal(screenNativeServiceReady({config,ready,now:2001}),false)
 assert.equal(screenNativeServiceReady({config,ready,now:999}),false)
 assert.deepEqual(s.counts(),{checks:0,reads:0,queued:0})
 const expired=setup({now:2001});await expired.start();assert.equal(expired.files.size,0)
 const foreign=setup();foreign.$.session.id=async()=>target;await foreign.start();assert.equal(foreign.files.size,0)
})
test('one loaded receiver serves distinct requests, consumes concurrent duplicates and bounds capacity',async()=>{
 const s=setup();await Promise.all([s.send(r1),s.send(r1)]);await s.send(r2);await s.send(r3)
 assert.deepEqual(s.counts(),{checks:2,reads:2,queued:0})
 assert.equal(s.files.get(config.brokerCwd+'/.native-service-'+r2+'.result.json').targetSession,target)
 assert.equal(await s.send(r3,'human'),'queued')
})
test('durable intent prevents replay after module reload even if result was lost',async()=>{
 const s=setup();await s.send(r1);s.files.delete(config.brokerCwd+'/.native-service-'+r1+'.result.json')
 const reloaded=setup({files:s.files});await reloaded.send(r1)
 assert.deepEqual(reloaded.counts(),{checks:0,reads:0,queued:0})
})
test('cancelled, expired, wrong operation or malformed checkpoint never requests native read',async()=>{
 for(const checkpoint of [{dispatch:false,reason:'cancelled'},{dispatch:false,reason:'expired'},{dispatch:true,op:'archive',args:{session_id:target}},{dispatch:true,op:'get_session',args:{session_id:target,extra:true}},null]){
  const s=setup({checkpoint});await s.send(r1);await s.send(r1);assert.deepEqual(s.counts(),{checks:1,reads:0,queued:0})
 }
 const expired=setup({now:2001});await expired.send(r1);assert.deepEqual(expired.counts(),{checks:0,reads:0,queued:0})
})
test('service generation refuses unbounded life, capacity or injected configuration',()=>{
 for(const change of [{maxRequests:129},{deadline:3601001},{brokerCwd:'/tmp/other'},{extra:true},{build:'$(unsafe)'}])assert.throws(()=>buildNativePeerServicePackage({...config,...change}))
})

test('different concurrent requests cannot overwrite an in-flight shared checkpoint',async()=>{
 const s=setup();let release,entered
 const started=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve),original=s.$.tool.call
 s.$.tool.call=async input=>{entered();await gate;return original(input)}
 const first=s.send(r1);await started
 assert.equal((await s.send(r2)).consumed,'service-read-busy')
 release();await first
 assert.deepEqual(s.counts(),{checks:1,reads:1,queued:0})
 assert.equal((await s.send(r2)).consumed,'service-read-already-attempted')
})
test('expiry while checkpoint is in flight consumes the trigger without calling MCP',async()=>{
 const s=setup();let now=1000
 s.$.clock.now=async()=>now
 const original=s.$.tool.call;s.$.tool.call=async input=>{const result=await original(input);now=2001;return result}
 assert.equal((await s.send(r1)).consumed,'service-read-expired')
 assert.deepEqual(s.counts(),{checks:1,reads:0,queued:0})
 assert.equal((await s.send(r1)).consumed,'service-read-already-attempted')
})

test('STOP and diagnostic arms refuse before checkpoint and after in-flight checkpoint without clearing controls',async()=>{
 for(const name of ['STOP','stop-rescue-arm.json','mechanical-probe.json']){
  const path=config.brokerCwd+'/'+name,files=new Map([[path,{owner:'synthetic'}]]),s=setup({files})
  assert.equal((await s.send(r1)).consumed,'service-read-stopped');assert.deepEqual(s.counts(),{checks:0,reads:0,queued:0});assert.deepEqual(files.get(path),{owner:'synthetic'})
  const late=setup(),original=late.$.tool.call
  late.$.tool.call=async input=>{const result=await original(input);late.files.set(path,{owner:'synthetic'});return result}
  assert.equal((await late.send(r1)).consumed,'service-read-stopped');assert.deepEqual(late.counts(),{checks:1,reads:0,queued:0});assert.equal(late.files.has(path),true)
  assert.equal((await late.send(r1)).consumed,'service-read-already-attempted')
 }
})

test('opt-in receiver observes cancellation after checkpoint and does not call native MCP or model',async()=>{
 const s=setup({controlCheck:true})
 s.files.set(config.brokerCwd+'/controls/'+r1+'.json',{id:r1,state:'outcome_unknown',dispatched:[0],at:1000,cancelRequested:true})
 const result=await s.send(r1)
 assert.equal(result.consumed,'service-read-cancelled-before-call')
 assert.deepEqual(s.counts(),{checks:1,reads:0,queued:0})
 const receipt=s.files.get(config.brokerCwd+'/.native-service-'+r1+'.cancel.json')
 assert.equal(receipt.nativeMcpCallsRequested,0);assert.equal(receipt.modelCallsRequested,0)
})
test('opt-in control check refuses malformed/foreign controls but permits valid dispatch',async()=>{
 for(const control of [{id:r1,state:'dispatched',dispatched:[0],at:1000},{id:r2,state:'dispatched',dispatched:[0],at:1000},{id:r1,state:'dispatched',dispatched:[],at:1000}]){
  const s=setup({controlCheck:true});s.files.set(config.brokerCwd+'/controls/'+r1+'.json',control);await s.send(r1)
  assert.equal(s.counts().reads,control.id===r1&&control.dispatched.length===1?1:0)
 }
})

test('cancellation arriving during admitted checkpoint is observed before native call and cannot replay',async()=>{
 const s=setup({controlCheck:true}),file=config.brokerCwd+'/controls/'+r1+'.json'
 s.files.set(file,{id:r1,state:'dispatched',dispatched:[0],at:1000})
 const original=s.$.tool.call
 s.$.tool.call=async input=>{const checkpoint=await original(input);s.files.set(file,{id:r1,state:'outcome_unknown',dispatched:[0],at:1000,cancelRequested:true});return checkpoint}
 assert.equal((await s.send(r1)).consumed,'service-read-cancelled-before-call')
 assert.equal((await s.send(r1)).consumed,'service-read-already-attempted')
 assert.deepEqual(s.counts(),{checks:1,reads:0,queued:0})
})
