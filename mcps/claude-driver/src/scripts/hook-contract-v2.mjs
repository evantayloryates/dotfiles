#!/usr/bin/env node
// Execute only the installed hook runner on synthetic dependencies. This never
// connects to an MCP server, desktop session, socket or inference provider.
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {resolveClaudeBinary,versions} from '../lib/paths.mjs'
import {installedWindowContaining,cutInstalledFunction} from '../lib/installed-source.mjs'
import {STATE_DIR,writeJsonAtomic} from '../lib/state.mjs'
import {recordMemory} from '../lib/memory.mjs'
import {EventEmitter} from 'node:events'

const report=join(STATE_DIR,'pressure','hook-contract-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json')
const binary=resolveClaudeBinary(),rows=[],sources={}
const hash=s=>createHash('sha256').update(s).digest('hex')
try{
 sources.runner=installedWindowContaining(binary,'async function GFe(e,n,r,s,g,h=vl,b)',{before:600,after:7000})
 sources.events=installedWindowContaining(binary,'z$t=new Set([',{after:2048})
 sources.script=installedWindowContaining(binary,'function q1r(e,n){throw Error("script hooks',{after:256})
 sources.watcher=installedWindowContaining(binary,'function i8n(){let e=null,n,r=[]',{after:6000})
 sources.emission=installedWindowContaining(binary,'function kee(e){if(ZWn.includes(e))',{after:3000})
 sources.output=installedWindowContaining(binary,'function i4({json:e,command:n,hookName:r',{after:6500})
 sources.sessionStart=installedWindowContaining(binary,'async function C9(e,n,',{after:3400})
 sources.workspace=installedWindowContaining(binary,'function jn(){return n().surfaceCapabilities.caps().workspace===',{after:150})
 sources.startup=installedWindowContaining(binary,'if(Er("setup_hooks_snapshot_ms",performance.now()-R,R),te(',{after:600})
 sources.matching=installedWindowContaining(binary,'async function EVt(e,n,r,s,g,h)',{after:5500})
 sources.dedupKey=installedWindowContaining(binary,'function bR(e){switch(e.type){case"command":return`command',{after:700})
 sources.dedupScope=installedWindowContaining(binary,'function eL(e,n){return`${e.pluginRoot??e.skillRoot??',{after:200})
 const runner=cutInstalledFunction(sources.runner.text,'async function GFe(e,n,r,s,g,h=vl,b)','var XKt=')
 const interpolation=cutInstalledFunction(sources.runner.text,'function jzo(e,n){','async function GFe(')
 const events=sources.events.text.match(/^z\$t=new Set\((\[[^\]]+\])\)/)?.[1]
 assert.ok(events,'installed observational event schema changed')
 const observational=runInNewContext(`new Set(${events})`,{},{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}})
 assert.ok(observational.has('FileChanged'));assert.ok(observational.has('StopFailure'));assert.ok(!observational.has('PreToolUse'))
 const hook={type:'mcp_tool',server:'synthetic',tool:'get_session',input:{session_id:'synthetic-session'},timeout:5}
 const connected={name:'synthetic',type:'connected'},pending={name:'synthetic',type:'pending'}
 function make(options={}){
  const calls=[],connections=[],waits=[];let cleaned=0,time=1000
  const controller=new AbortController()
  const context={vl:600000,XKt:50,z$t:observational,Date:{now:()=>time},u1o:()=>{},SS:()=>options.clients,
   t:()=>{},kl:()=>options.connectionTimeout??3000,xs:k=>k.type==='connected',S:JSON.stringify,l:e=>e.message,
   Gzo:async(server,ms,signal)=>{waits.push({server,ms});if(options.abortWaiting)controller.abort();time+=options.waitMs??0;return options.pendingResult},
   Es:(signal,{timeoutMs})=>({signal:controller.signal,cleanup:()=>cleaned++}),
   PO:()=>options.missingConnector?undefined:async(k,args)=>{connections.push({name:k.name,timeoutMs:args.timeoutMs,context:args.context});if(options.connectionError)throw Error('synthetic connection error');return k},
   Gbt:()=>!!options.memory,t1r:()=>!!options.withheld,v5n:()=>({mode:'synthetic'}),dfn:()=>({}),U:()=>({host:{}}),ZZ:'synthetic-meta',
   _F:async(client,input,{signal,timeout})=>{calls.push({client:client.name,input,timeout});if(options.abortTool)controller.abort();if(options.throwTool)throw Error('synthetic tool error');return options.result??{content:[{type:'text',text:'synthetic receipt'}]}}}
  const invoke=runInNewContext(`(()=>{${interpolation}${runner};return GFe})()`,context,{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}})
  return {invoke,calls,connections,waits,signal:controller.signal,cleaned:()=>cleaned}
 }
 const check=async(name,fn)=>{await fn();rows.push({name,ok:true})}
 await check('connected FileChanged directly invokes one MCP tool without model selection',async()=>{
  const c=make({clients:[connected]}),r=await c.invoke(hook,'FileChanged',{})
  assert.equal(r.ok,true);assert.equal(r.body,'synthetic receipt');assert.equal(c.calls.length,1)
  assert.equal(c.calls[0].input.name,'get_session');assert.equal(c.calls[0].input.arguments.session_id,'synthetic-session')
  assert.equal(c.connections[0].timeoutMs,3000);assert.equal(c.calls[0].timeout,5000);assert.equal(c.cleaned(),1)
 })
 await check('same connected hook invoked twice makes two calls; runner has no durable deduplication',async()=>{
  const c=make({clients:[connected]});await c.invoke(hook,'FileChanged',{});await c.invoke(hook,'FileChanged',{})
  assert.equal(c.calls.length,2);assert.equal(c.cleaned(),2)
 })
 const matching=cutInstalledFunction(sources.matching.text,'async function EVt(e,n,r,s,g,h)','function ept(')
 const dedupKey=cutInstalledFunction(sources.dedupKey.text,'function bR(e){','function lKo('),dedupScope=cutInstalledFunction(sources.dedupScope.text,'function eL(e,n){','function _ce(')
 function matched(hooks){
  const resolve=runInNewContext(`(()=>{${dedupKey}${dedupScope}${matching};return EVt})()`,{
   lH:()=>[{hooks}],d0e:()=>undefined,tKo:()=>{},t:()=>{},Jve:()=>undefined,TVt:()=>undefined,TKo:()=>true,F1r:()=>false,S:JSON.stringify,N2:()=>'/bin/sh',G:(xs,p)=>xs.filter(p).length,S0e:()=>false,
  },{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}})
  return resolve(undefined,'synthetic','Stop',{hook_event_name:'Stop'})
 }
 await check('actual hook matcher collapses identical MCP configurations within one event',async()=>{
  const resolved=await matched([hook,{...hook}]);assert.equal(resolved.length,1)
  const c=make({clients:[connected]});for(const r of resolved)await c.invoke(r.hook,'Stop',{});assert.equal(c.calls.length,1)
  for(const r of await matched([hook,{...hook}]))await c.invoke(r.hook,'Stop',{});assert.equal(c.calls.length,2)
 })
 await check('MCP configuration dedup ignores timeout but distinguishes argument order and targets',async()=>{
  const resolved=await matched([hook,{...hook,timeout:1}]);assert.equal(resolved.length,1);assert.equal(resolved[0].hook.timeout,1)
  assert.equal((await matched([hook,{...hook,input:{session_id:'other'}}])).length,2)
  assert.equal((await matched([{...hook,input:{a:1,b:2}},{...hook,input:{b:2,a:1}}])).length,2)
 })
 await check('actual installed input interpolation recurses through strings, objects and arrays',async()=>{
  const c=make({clients:[connected]})
  await c.invoke({...hook,input:{path:'${file_path}',nested:['${details.name}',7,false,{missing:'${absent}',object:'${details}'}]}},'FileChanged',{file_path:'/synthetic/trigger',details:{name:'nonce'}})
  assert.equal(JSON.stringify(c.calls[0].input.arguments),JSON.stringify({path:'/synthetic/trigger',nested:['nonce',7,false,{missing:'',object:'{"name":"nonce"}'}]}))
 })
 await check('no MCP context or disconnected server refuses without tool effects',async()=>{
  for(const clients of [undefined,[],[{name:'synthetic',type:'failed'}]]){
   const c=make({clients}),r=await c.invoke(hook,'FileChanged',{});assert.equal(r.ok,false);assert.equal(c.calls.length,0)
  }
 })
 await check('explicit client list falls back to global connected clients',async()=>{
  const c=make({clients:[connected]}),r=await c.invoke(hook,'FileChanged',{},[])
  assert.equal(r.ok,true);assert.equal(c.calls.length,1)
 })
 await check('observational FileChanged does not wait for a pending connection',async()=>{
  const c=make({clients:[pending],pendingResult:connected}),r=await c.invoke(hook,'FileChanged',{})
  assert.equal(r.ok,false);assert.equal(c.waits.length,0);assert.equal(c.calls.length,0)
 })
 await check('nonobservational event waits, charging elapsed time against tool deadline',async()=>{
  const c=make({clients:[pending],pendingResult:connected,waitMs:400}),r=await c.invoke(hook,'PreToolUse',{})
  assert.equal(r.ok,true);assert.equal(c.waits[0].ms,3000);assert.equal(c.calls[0].timeout,4600)
 })
 await check('pending timeout, exhausted budget and abort produce no tool call',async()=>{
  for(const options of [{},{pendingResult:connected,waitMs:5000},{pendingResult:connected,abortWaiting:true}]){
   const c=make({clients:[pending],...options}),r=await c.invoke(hook,'PreToolUse',{},undefined,c.signal)
   assert.equal(r.ok,false);assert.equal(c.calls.length,0)
  }
 })
 await check('missing connector and connection failure return errors and clean signal',async()=>{
  for(const options of [{missingConnector:true},{connectionError:true}]){
   const c=make({clients:[connected],...options}),r=await c.invoke(hook,'FileChanged',{})
   assert.equal(r.ok,false);assert.equal(c.calls.length,0);assert.equal(c.cleaned(),1)
  }
 })
 await check('account memory tool withholding precedes direct invocation',async()=>{
  const c=make({clients:[connected],memory:true,withheld:true}),r=await c.invoke(hook,'FileChanged',{})
  assert.equal(r.withheld,true);assert.equal(c.calls.length,0);assert.equal(c.cleaned(),1)
 })
 await check('tool error and thrown or aborted call stay failures, never successful receipts',async()=>{
  for(const options of [{result:{isError:true,content:[{type:'text',text:'synthetic refused'}]}},{throwTool:true},{throwTool:true,abortTool:true}]){
   const c=make({clients:[connected],...options}),r=await c.invoke(hook,'FileChanged',{})
   assert.equal(r.ok,false);assert.equal(c.calls.length,1);assert.equal(c.cleaned(),1)
   if(options.abortTool)assert.equal(r.aborted,true)
  }
 })
 await check('non-text and absent content follow actual installed serialization',async()=>{
  const c=make({clients:[connected],result:{content:[{type:'text',text:'a'},{type:'image',data:'synthetic'}]}})
  assert.equal((await c.invoke(hook,'FileChanged',{})).body,'a\n[image]')
  const empty=make({clients:[connected],result:{}});assert.equal((await empty.invoke(hook,'FileChanged',{})).body,'')
 })
 const script=cutInstalledFunction(sources.script.text,'function q1r(e,n){','var tZ=')
 await check('installed script-hook runner explicitly rejects script execution',()=>{
  const invoke=runInNewContext(`(()=>{${script};return q1r})()`,{},{timeout:1000})
  assert.throws(()=>invoke({},{}),/script hooks are not available in this build/)
 })
 // Execute the installed lifecycle, with fake filesystem watchers. This avoids
 // temporarily installing a file trigger that cannot be registered in a warm
 // native session merely by adding a hook to settings.
 const watcher=cutInstalledFunction(sources.watcher.text,'function i8n(){let e=null,n,r=[]','var ZK=')
 function watching(initial={},eventOutput={results:[],watchPaths:[],systemMessages:[]}){
  let settings=initial,subscription,disposed=0;const watches=[],events=[]
  const api=runInNewContext(`(()=>{${watcher};return i8n()})()`,{
   $8:()=>settings,sy:()=>true,Qve:()=>undefined,_t:fn=>{subscription=fn;return()=>disposed++},
   r8n:s=>s.startsWith('/'),s8n:(a,b)=>a+'/'+b,L:a=>[...new Set(a)],qI:()=>false,
   t:()=>{},l:e=>e.message,m:()=>{},y:()=>{},q:()=> 'synthetic-session',Ee:()=>'/synthetic',dr:()=>'/synthetic',
   Plt:async()=>{},nDr:async()=>({results:[],watchPaths:[],systemMessages:[]}),
   rDr:async(session,path,event)=>{events.push({sessionId:session.id,path,event});return eventOutput},
   bb:{watch:(paths,options)=>{const w=new EventEmitter();w.paths=Array.from(paths);w.options=options;w.closed=false;w.close=()=>w.closed=true;watches.push(w);return w}}
  },{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}})
  return {api,watches,events,set:s=>settings=s,settingsChanged:()=>subscription?.(),subscribed:()=>!!subscription,disposed:()=>disposed}
 }
 await check('FileChanged startup creates exact static paths, ignoreInitial and write-stability watcher',()=>{
  const c=watching({FileChanged:[{matcher:'trigger|/synthetic/fixed'}]});c.api.initialize('/synthetic')
  assert.equal(c.watches.length,1);assert.equal(JSON.stringify(c.watches[0].paths),JSON.stringify(['/synthetic/trigger','/synthetic/fixed']))
  assert.equal(c.watches[0].options.ignoreInitial,true);assert.equal(c.watches[0].options.awaitWriteFinish.stabilityThreshold,500)
  assert.equal(c.subscribed(),true)
 })
 await check('adding FileChanged settings after empty startup does not register or initialize a watcher',()=>{
  const c=watching();c.api.initialize('/synthetic');c.set({FileChanged:[{matcher:'/synthetic/new'}]});c.settingsChanged();c.api.initialize('/synthetic')
  assert.equal(c.subscribed(),false);assert.equal(c.watches.length,0)
  c.api.updateWatchPaths(['/synthetic/dynamic']);assert.equal(c.watches.length,1)
  assert.ok(c.watches[0].paths.includes('/synthetic/new'));assert.ok(c.watches[0].paths.includes('/synthetic/dynamic'))
 })
 await check('registered settings change disposes watcher; path update alone cannot revive disposed lifecycle',()=>{
  const c=watching({FileChanged:[{matcher:'/synthetic/old'}]});c.api.initialize('/synthetic');c.settingsChanged()
  assert.equal(c.watches[0].closed,true);assert.equal(c.disposed(),1)
  c.set({FileChanged:[{matcher:'/synthetic/new'}]});c.api.updateWatchPaths(['/synthetic/dynamic']);assert.equal(c.watches.length,1)
  c.api.initialize('/synthetic');assert.equal(c.watches.length,2);assert.equal(c.watches[1].paths[0],'/synthetic/new')
 })
 await check('actual FileChanged callbacks route event metadata; duplicate notifications invoke twice',async()=>{
  const c=watching({FileChanged:[{matcher:'/synthetic/trigger'}]});c.api.initialize('/synthetic')
  c.watches[0].emit('change','/synthetic/trigger');c.watches[0].emit('change','/synthetic/trigger');await Promise.resolve()
  assert.equal(c.events.length,2);assert.equal(c.events[0].event,'change');assert.equal(c.events[0].sessionId,'synthetic-session')
  c.api.dispose();assert.equal(c.watches[0].closed,true)
 })
 await check('FileChanged callback forwards failures/system messages but drops successful tool output',async()=>{
  const c=watching({FileChanged:[{matcher:'/synthetic/trigger'}]},{results:[{succeeded:true,output:'synthetic private read result'},{succeeded:false,output:'synthetic error'}],watchPaths:[],systemMessages:['synthetic notice']}),notified=[]
  c.api.initialize('/synthetic');c.api.setEnvHookNotifier((text,error)=>notified.push({text,error}));c.watches[0].emit('change','/synthetic/trigger');await Promise.resolve()
  assert.deepEqual(notified,[{text:'synthetic notice',error:false},{text:'synthetic error',error:true}]);assert.equal(JSON.stringify(notified).includes('private read result'),false)
  c.api.dispose()
 })
 const output=cutInstalledFunction(sources.output.text,'function i4({json:e,command:n,hookName:r','async function qqo(')
 const parseOutput=runInNewContext(`(()=>{${output};return i4})()`,{ln:x=>x,S:JSON.stringify,t:()=>{}},{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}})
 await check('only SessionStart output seeds watch paths; Stop cannot activate a watcher',()=>{
  for(const event of ['Stop','UserPromptSubmit','PostToolUse','SessionStart']){
   const r=parseOutput({json:{hookSpecificOutput:{hookEventName:event,watchPaths:['/synthetic/trigger']}},hookEvent:event,expectedHookEvent:event})
   assert.equal(r.watchPaths!==undefined,event==='SessionStart')
  }
  assert.throws(()=>parseOutput({json:{hookSpecificOutput:{hookEventName:'SessionStart',watchPaths:['/synthetic/trigger']}},expectedHookEvent:'Stop'}),/incorrect event name/)
 })
 const startHook=cutInstalledFunction(sources.sessionStart.text,'async function C9(e,n,','async function oMo(')
 function starting(watcher,{signal,newPluginsOnly}={}){
  const state={pluginsCovered:new Set(),hooksDispatched:0},paths=[],adds=[]
  const invoke=runInNewContext(`(()=>{${startHook};return C9})()`,{
   Vr:()=>false,yle:()=>state,kC:()=> 'synthetic',oDr:async function*(){yield{watchPaths:['/synthetic/dynamic']}},sy:()=>true,Sr:()=>true,t:()=>{},
   Hl:class extends Error{},Nkt:x=>{paths.push(x);watcher.api.updateWatchPaths(x)},Fkt:x=>{adds.push(x);watcher.api.addWatchPaths(x)},xE:()=>{},
  },{timeout:1000,contextCodeGeneration:{strings:false,wasm:false}})
  return {run:()=>invoke({id:'synthetic-session'},'compact',{signal,newPluginsOnly}),paths,adds}
 }
 await check('actual compact SessionStart consumer can seed an initialized warm watcher after empty startup',async()=>{
  const c=watching();c.api.initialize('/synthetic');c.set({FileChanged:[{matcher:'/synthetic/trigger'}]})
  const s=starting(c);await s.run();assert.equal(s.paths.length,1);assert.equal(c.watches.length,1)
  assert.deepEqual(c.watches[0].paths,['/synthetic/trigger','/synthetic/dynamic'])
 })
 await check('SessionStart path output cannot activate an uninitialized watcher and cancellation does not seed',async()=>{
  const cold=watching({FileChanged:[{matcher:'/synthetic/trigger'}]});await starting(cold).run();assert.equal(cold.watches.length,0)
  const c=watching();c.api.initialize('/synthetic');c.set({FileChanged:[{matcher:'/synthetic/trigger'}]})
  const controller=new AbortController();controller.abort();const s=starting(c,{signal:controller.signal});await s.run();assert.equal(s.paths.length,0);assert.equal(c.watches.length,0)
 })
 await check('late plugin SessionStart adds paths instead of replacing the initialized watch set',async()=>{
  const c=watching({FileChanged:[{matcher:'/synthetic/trigger'}]});c.api.initialize('/synthetic');c.api.updateWatchPaths(['/synthetic/existing'])
  const s=starting(c,{newPluginsOnly:{names:new Set(['synthetic'])}});await s.run();assert.equal(s.paths.length,0);assert.equal(s.adds.length,1)
  assert.ok(c.watches.at(-1).paths.includes('/synthetic/existing'));assert.ok(c.watches.at(-1).paths.includes('/synthetic/dynamic'))
 })
 await check('installed startup initializes the watcher for local workspace and skips remote workspace',()=>{
  const workspace=cutInstalledFunction(sources.workspace.text,'function jn(){','function X4(')
  const guard=cutInstalledFunction(sources.startup.text,'if(Er("setup_hooks_snapshot_ms",performance.now()-R,R),te(','let N=performance.now()')
  for(const kind of ['local','remote']){let initialized=0
   runInNewContext(`${workspace}${guard}`,{n:()=>({surfaceCapabilities:{caps:()=>({workspace:kind})}}),o:'/synthetic',v:{},R:0,performance:{now:()=>1},tOo:()=>initialized++,Er:()=>{},te:()=>{}},{timeout:1000})
   assert.equal(initialized,kind==='local'?1:0)
  }
 })
 await check('SDK hook-response emission is disabled for FileChanged and Stop by default; startup remains emitted',()=>{
  const filter=cutInstalledFunction(sources.emission.text,'function kee(e){','function See(')
  const response=cutInstalledFunction(sources.emission.text,'function qc(e){','function jIo(')
  const emitted=[],state={allHookEventsEnabled:false}
  const invoke=runInNewContext(`(()=>{${filter}${response};return qc})()`,{ZWn:['SessionStart','Setup'],Tg:['SessionStart','Setup','FileChanged','Stop'],cmt:()=>state,t:()=>{},Vi:e=>emitted.push(e)},{timeout:1000})
  const result=event=>({hookId:'synthetic-id',hookName:'synthetic',hookEvent:event,output:'synthetic receipt',stdout:'synthetic receipt',stderr:'',exitCode:0,outcome:'success'})
  invoke(result('FileChanged'));invoke(result('Stop'));assert.equal(emitted.length,0)
  invoke(result('SessionStart'));assert.equal(emitted.length,1);assert.equal(emitted[0].subtype,'hook_response')
  state.allHookEventsEnabled=true;invoke(result('FileChanged'));assert.equal(emitted.length,2);assert.equal(emitted[1].stdout,'synthetic receipt')
 })
 const evidence=Object.fromEntries(Object.entries(sources).map(([name,x])=>[name,{offset:x.offset,sha256:x.sha256,bytes:x.bytes}]))
 const limitations=['MCP connection classification, native clients, cancellation helper, memory policy, cgroup release and filesystem watcher are synthetic dependencies','Exact installed runner, matcher, output parsing, SessionStart consumer and watcher lifecycle execute; this isolated report proves no live FileChanged registration or native receipt','FileChanged added after an empty initialize requires an explicit watch-path update or later reinitialization; a settings file write alone is not activation evidence','The installed FileChanged callback drops successful hook tool output and forwards only failures/system messages; a separate actual result channel is required','Direct hook call has no PreToolUse admission call inside this extracted runner; upstream or host enforcement is unqualified','The matcher collapses identical configurations within one event; it ignores timeout and distinguishes JSON input key order. Repeated events still invoke again; no durable request deduplication or mutation delivery qualification']
 writeJsonAtomic(report,{scope:'installed-mcp-hook-runner-isolated',versions:versions(),binary,sources:evidence,runnerHash:hash(runner),interpolationHash:hash(interpolation),rows,ok:true,limitations})
 recordMemory({kind:'test_result',topic:'deterministic-hook-contract',source:'installed-source-isolated',status:'passed',evidence:report,lesson:'Installed MCP runner/matcher, input/output parsing, SessionStart consumer, watcher lifecycle and SDK emission execute with synthetic dependencies. SessionStart paths seed only an initialized watcher; Stop cannot. Identical definitions collapse within one event, not repeated events. Live FileChanged context/results and mutation safety remain unqualified.'})
 console.log(JSON.stringify({report,ok:true,checks:rows.length,claudeTurns:0,nativeWrites:false}))
}catch(error){
 writeJsonAtomic(report,{scope:'installed-mcp-hook-runner-isolated',versions:versions(),ok:false,error:{name:error.name,message:error.message.slice(0,400)},rows})
 recordMemory({kind:'test_result',topic:'deterministic-hook-contract',source:'installed-source-isolated',status:'failed',evidence:report,lesson:'Installed-source contract failed; preserve its report and determine whether extraction or an actual contract changed before native enrollment.'})
 console.log(JSON.stringify({report,ok:false,error:error.message.slice(0,400)}));process.exitCode=1
}
