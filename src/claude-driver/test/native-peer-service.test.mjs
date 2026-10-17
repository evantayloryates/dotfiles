import test from 'node:test'
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {buildNativePeerServicePackage} from '../lib/native-peer-service-package.mjs'
import {screenNativeServiceReady} from '../lib/native-peer-service-evidence.mjs'
const config={id:'a'.repeat(32),token:'claude-driver service-read '+'b'.repeat(32),brokerSession:'local_11111111-1111-4111-8111-111111111111',brokerCwd:'/Users/taylor/.local/state/claude-driver/broker',build:'c'.repeat(64),notBefore:1000,deadline:2000,maxRequests:2}
const target='local_22222222-2222-4222-8222-222222222222',r1='rpeer'+'1'.repeat(32),r2='rpeer'+'2'.repeat(32),r3='rpeer'+'3'.repeat(32)
function setup({files=new Map(),checkpoint={dispatch:true,op:'get_session',args:{session_id:target}},now=1000,controlCheck=false,autoStart=true,configPatch={}}={}){
 const localConfig={...config,...configPatch},pkg=buildNativePeerServicePackage({...localConfig,...controlCheck?{controlCheck:true}:{}}),hooks=new Map(),commands=[];let checks=0,reads=0,queued=0
 const boundConfig=localConfig
 const register=runInNewContext(pkg.files['hooks/register.js'].replace('export function register','function register')+';register',{Set,Object,JSON,Date,Number,Array})
 register((event,fn)=>hooks.set(event,fn))
 const $={session:{id:async()=>boundConfig.brokerSession,cwd:async()=>boundConfig.serviceStateBinding?.receiverCwd??boundConfig.brokerCwd},clock:{now:async()=>now},fs:{exists:async p=>files.has(p),read:async p=>JSON.stringify(files.get(p)),write:async(p,text)=>files.set(p,JSON.parse(text))},tool:{call:async input=>{checks++;commands.push(input.command);assert.match(input.command,/broker-check.mjs/);return {text:JSON.stringify(checkpoint)}}},mcp:{call:async(server,op,args)=>{reads++;assert.equal(server,'ccd_session_mgmt');assert.equal(op,'get_session');assert.equal(args.session_id,target);return {isError:false,content:[{type:'text',text:'PRIVATE'}]}}}}
 return {files,$,commands,config:boundConfig,start:()=>hooks.get('session.start')($,{},()=> 'next'),send:async(id,kind='peer')=>{if(autoStart)await hooks.get('session.start')($,{},()=>{});return hooks.get('session.receive')($,{origin:{kind},text:config.token+' '+id},()=>{queued++;return 'queued'})},counts:()=>({checks,reads,queued})}
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
test('only independent receiver can run the fixed bounded caller-family query',async()=>{
 const args={include_archived:true,limit:100,linked:true},receiverCwd='/owned/family',serviceStateBinding={version:1,id:config.id,receiverCwd,sessionId:config.brokerSession,build:config.build},brokerCwd=receiverCwd+'/.claude-driver-services/'+config.id+'/broker',configPatch={serviceStateBinding,brokerCwd}
 const legacy=setup({checkpoint:{dispatch:true,op:'list_sessions',args}});await legacy.send(r1);assert.equal(legacy.counts().reads,0)
 const s=setup({configPatch,checkpoint:{dispatch:true,op:'list_sessions',args}});let calls=0
 s.$.mcp.call=async(server,op,actual)=>{calls++;assert.equal(server,'ccd_session_mgmt');assert.equal(op,'list_sessions');assert.equal(JSON.stringify(actual),JSON.stringify(args));return {isError:false,content:[{type:'text',text:'[]'}]}}
 assert.equal((await s.send(r1)).consumed,'service-read-result-captured');assert.equal(calls,1)
 assert.equal(s.files.get(brokerCwd+'/.native-service-'+r1+'.result.json').targetSession,config.brokerSession)
 await s.send(r1);assert.equal(calls,1)
 for(const altered of [{...args,linked:false},{...args,include_archived:false},{...args,limit:101},{...args,group:'scratch'}]){const t=setup({configPatch,checkpoint:{dispatch:true,op:'list_sessions',args:altered}});await t.send(r1);assert.equal(t.counts().reads,0)}
})
test('archive callback requires exact sealed target and never accepts injected consent or self',async()=>{
 const receiverCwd='/owned/probe/controller',serviceStateBinding={version:1,id:config.id,receiverCwd,sessionId:config.brokerSession,build:config.build},archiveTarget={sessionId:target,cwd:'/owned/probe/target',pid:42,procStart:'synthetic'},configPatch={serviceStateBinding,brokerCwd:receiverCwd+'/.claude-driver-services/'+config.id+'/broker',archiveTarget},args={session_id:target,reason:'claude-driver scoped recovery test'}
 const s=setup({configPatch,checkpoint:{dispatch:true,op:'archive_session',args}});let calls=0;s.$.mcp.call=async(server,op,a)=>{calls++;assert.equal(server,'ccd_session_mgmt');assert.equal(op,'archive_session');assert.equal(JSON.stringify(a),JSON.stringify(args));return {isError:false,content:[{type:'text',text:'synthetic archive result'}]}}
 assert.equal((await s.send(r1)).consumed,'service-read-result-captured');await s.send(r1);assert.equal(calls,1)
 for(const altered of [{...args,session_id:config.brokerSession},{...args,reason:'other'},{...args,_consent:true}]){const t=setup({configPatch,checkpoint:{dispatch:true,op:'archive_session',args:altered}});await t.send(r1);assert.equal(t.counts().reads,0)}
 const unsealed=setup({checkpoint:{dispatch:true,op:'archive_session',args}});await unsealed.send(r1);assert.equal(unsealed.counts().reads,0)
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

test('receiver requires its own successful activation before checkpoint; stale readiness cannot rearm reload',async()=>{
 const cold=setup({autoStart:false});assert.equal((await cold.send(r1)).consumed,'service-read-not-ready');assert.deepEqual(cold.counts(),{checks:0,reads:0,queued:0})
 assert.equal((await cold.send('ready')).consumed,'service-read-ready');assert.deepEqual(cold.counts(),{checks:0,reads:0,queued:0})
 assert.equal((await cold.send(r1)).consumed,'service-read-result-captured')
 const reload=setup({files:cold.files,autoStart:false});assert.equal((await reload.send('ready')).consumed,'service-read-not-ready');await reload.start();assert.equal((await reload.send(r2)).consumed,'service-read-not-ready');assert.deepEqual(reload.counts(),{checks:0,reads:0,queued:0})
 cold.files.delete(config.brokerCwd+'/.native-service-'+config.id+'.ready.json');assert.equal((await cold.send(r2)).consumed,'service-read-not-ready');assert.equal(cold.counts().reads,1)
 const foreign=setup({autoStart:false});foreign.$.session.id=async()=>target;assert.equal((await foreign.send('ready')).consumed,'service-read-not-ready');assert.equal(foreign.files.size,0)
 const human=setup({autoStart:false});assert.equal(await human.send('ready','human'),'queued');assert.equal(human.files.size,0)
})

test('failed ready persistence and expired activation cannot admit checkpoint',async()=>{
 const s=setup({autoStart:false});s.$.fs.write=async()=>{throw Error('synthetic disk failure')};assert.equal((await s.send('ready')).consumed,'service-read-not-ready');assert.equal((await s.send(r1)).consumed,'service-read-not-ready');assert.deepEqual(s.counts(),{checks:0,reads:0,queued:0})
 const expired=setup({autoStart:false});await expired.send('ready');expired.$.clock.now=async()=>2001;assert.equal((await expired.send('ready')).consumed,'service-read-not-ready');assert.equal((await expired.send(r1)).consumed,'service-read-refused');assert.deepEqual(expired.counts(),{checks:0,reads:0,queued:0})
})

test('independent receiver uses only its bound lifecycle state and safely quoted sealed checkpoint',async()=>{
 const {dirname,join}=await import('node:path'),{execFileSync}=await import('node:child_process')
 const receiverCwd="/owned/scratch ' $(printf EXPANDED) `printf EXPANDED`",binding={version:1,id:config.id,receiverCwd,sessionId:config.brokerSession,build:config.build},brokerCwd=join(receiverCwd,'.claude-driver-services',config.id,'broker')
 const s=setup({autoStart:false,configPatch:{serviceStateBinding:binding,brokerCwd}})
 assert.equal((await s.send('ready')).consumed,'service-read-ready');assert.equal(s.files.has(brokerCwd+'/.native-service-'+config.id+'.ready.json'),true)
 assert.equal((await s.send(r1)).consumed,'service-read-result-captured');assert.equal(s.counts().reads,1)
 assert.equal([...s.files.keys()].every(p=>p.startsWith(brokerCwd+'/')),true)
 const argv=execFileSync('/bin/sh',['-c',s.commands[0].replace('/opt/homebrew/bin/node',"/usr/bin/printf '%s\\n'")],{encoding:'utf8'}).trim().split('\n')
 assert.deepEqual(argv,[join(dirname(brokerCwd),'releases',config.build,'scripts/broker-check.mjs'),r1,'0','--dir',brokerCwd])
 const {adaptEntryCommand}=await import('../scripts/broker-stop-rescue.mjs'),adapted=adaptEntryCommand({command:s.commands[0]},{brokerDir:brokerCwd,activeRoot:join(dirname(brokerCwd),'releases',config.build),stateDir:dirname(brokerCwd)});assert.ok(adapted);assert.equal(execFileSync('/bin/sh',['-c',adapted.command.replace('/opt/homebrew/bin/node',"/usr/bin/printf '%s\\n'")],{encoding:'utf8'}).trim(),argv.join('\n'))
 const foreign=setup({autoStart:false,configPatch:{serviceStateBinding:binding,brokerCwd}});foreign.$.session.cwd=async()=>brokerCwd;assert.equal((await foreign.send('ready')).consumed,'service-read-not-ready');assert.equal(foreign.files.size,0)
 for(const patch of [{brokerCwd:'/foreign'},{serviceStateBinding:{...binding,id:'d'.repeat(32)}},{serviceStateBinding:{...binding,build:'d'.repeat(64)}},{resourceProbe:true,marker:true,observeRetiredServiceId:null}])assert.throws(()=>buildNativePeerServicePackage({...config,brokerCwd,serviceStateBinding:binding,...patch}))
})

test('exact helper refusal records bounded no-MCP evidence; malformed and admitted replies do not',async()=>{
 for(const reason of ['invalid_request','cancelled','expired','request_generation_mismatch','already_dispatched_or_unclaimed']){
  const s=setup({checkpoint:{dispatch:false,reason}});await s.send(r1)
  const marker=s.files.get(config.brokerCwd+'/.native-service-'+r1+'.no-dispatch.json');assert.equal(marker.reason,reason);assert.equal(marker.nativeMcpCallsRequested,0);assert.equal(marker.modelCallsRequested,0);assert.equal(s.counts().reads,0)
  const snapshot=JSON.stringify(marker);await s.send(r1);assert.equal(JSON.stringify(s.files.get(config.brokerCwd+'/.native-service-'+r1+'.no-dispatch.json')),snapshot)
 }
 for(const checkpoint of [{dispatch:false,reason:'private-error'},{dispatch:false,reason:'cancelled',extra:'untrusted payload'},{dispatch:true,op:'archive',args:{session_id:target}}]){const s=setup({checkpoint});await s.send(r1);assert.equal(s.files.has(config.brokerCwd+'/.native-service-'+r1+'.no-dispatch.json'),false);assert.equal(s.counts().reads,0)}
 const admitted=setup();await admitted.send(r1);assert.equal(admitted.files.has(config.brokerCwd+'/.native-service-'+r1+'.no-dispatch.json'),false)
})
