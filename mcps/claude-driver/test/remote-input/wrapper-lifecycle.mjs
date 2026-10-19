// Remote-only transport comparison. A recording trusted service replaces Sky;
// no Computer Use bootstrap, native API, app acquisition or input is permitted.
import {spawn,execFileSync} from 'node:child_process'
import {EventEmitter,once} from 'node:events'
import {createInterface} from 'node:readline'
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import {hostname,homedir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {JsonRpcPeer} from '../../../codex-bridge/src/lib/jsonrpc.mjs'

const root='/Users/theo/.local/state/claude-driver/input-teardown-20261018'
if(process.platform!=='darwin'||hostname().split('.')[0]!=='theo-air'||homedir()!=='/Users/theo'||!process.env.SSH_CONNECTION||JSON.parse(readFileSync(join(root,'owner.json'))).threadId!=='01a112b1-fbf6-7cb0-8228-ce3e6cb6112d')throw Error('remote test owner/scope refused')
const runtime=join(root,'tools/cua_node'),node=join(runtime,'bin/node'),nodeRepl=join(runtime,'bin/node_repl'),launcher=join(runtime,'lib/node_modules/@oai/cua-repl/bin/cua-repl.mjs')
const expected={node:'a90d52ad9b963c1c645f82e41909039510dd8958b8fc52b080a5ef5e8bbea0e1',nodeRepl:'a4bf42e64c504fc436b74e91b3e3588389a868cdc30cd49b41c7a82b26ffe879',launcher:'992174a5e637645aeb444adfdb1bae688e997bb84d7db07532f68e358e60f278'}
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex')
for(const [key,path]of Object.entries({node,nodeRepl,launcher}))if(sha(path)!==expected[key])throw Error('runtime drift: '+key)
const run=join(root,'evidence','wrapper-lifecycle-'+Date.now())
mkdirSync(run,{mode:0o700})
writeFileSync(join(run,'source.mjs'),readFileSync(new URL(import.meta.url)),{flag:'wx',mode:0o600})
const report={scope:'trusted-service-lifecycle-contract-only',run,startedAt:new Date().toISOString(),runtimeHashes:expected,syntheticContext:true,nativeInputRequested:0,skyServiceConfigured:false,cuaBootstrapDisabled:true,realModelCallsRequested:0,routes:[],ok:false}
const save=()=>writeFileSync(join(run,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600})
function helpers(){return execFileSync('/bin/ps',['-axo','pid=,ppid=,comm='],{encoding:'utf8',timeout:5000}).split('\n').filter(x=>x.includes(join(root,'codex-home/computer-use/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService'))).map(x=>x.trim())}
report.helpersBefore=helpers();save()
if(report.helpersBefore.length)throw Error('owned native helper must be absent before stub comparison')
try{
for(const route of ['custom-direct-node-repl','packaged-cua-launcher']){
 const dir=join(run,route);mkdirSync(dir,{mode:0o700})
 const service=join(dir,'probe.mjs')
 const serviceSource=`let registered=false;const events=[];
 const record=value=>events.push({at:new Date().toISOString(),...value});
 export function handleRpc(request){const n=globalThis.nodeRepl;
 if(!registered){const available=typeof n?.addTurnEndedHandler==='function';record({event:'register',available,servicesOverridePreserved:true});if(!available)throw Error('trusted turn-ended registration missing');n.addTurnEndedHandler({timeoutMs:1000,run:event=>{record({event:'turn-ended',received:event})}});registered=true;}
 record({event:'rpc',phase:request.phase,requestMeta:n.requestMeta??null});return {phase:request.phase,registered,probeOnly:true,events:[...events]};}
 `
 writeFileSync(service,serviceSource,{flag:'wx',mode:0o600})
 const disabledApp=join(dir,'startup-disabled.app')
 if(existsSync(disabledApp))throw Error('startup sentinel must be absent')
 const env={HOME:homedir(),USER:'theo',LOGNAME:'theo',PATH:join(runtime,'bin')+':/usr/bin:/bin:/usr/sbin:/sbin',TMPDIR:join(root,'tmp'),CODEX_HOME:dir,CODEX_CLI_PATH:join(root,'tools/CodexCLI.app/Contents/MacOS/codex'),CUA_REPL_NODE_REPL_PATH:nodeRepl,CUA_REPL_ENABLED_SURFACES:'computer',NODE_REPL_NODE_MODULE_DIRS:join(runtime,'lib/node_modules'),NODE_REPL_TRUSTED_CODE_PATHS:dir+':'+join(runtime,'lib/node_modules'),NODE_REPL_NODE_PATH:node,NODE_REPL_TRUSTED_SERVICES:JSON.stringify({probe:service}),NODE_REPL_JS_BANNER:'',SKY_CUA_SERVICE_PATH:disabledApp,SKY_CUA_SERVICE_NATIVE_PIPE_PATH:join(dir,'no-native.sock')}
 const child=spawn(route==='custom-direct-node-repl'?nodeRepl:node,route==='custom-direct-node-repl'?[]:[launcher],{cwd:dir,env,detached:true,stdio:['pipe','pipe','pipe']})
 const exitPromise=once(child,'exit');let exit,stderrBytes=0,stdoutLines=0
 child.on('exit',(code,signal)=>{exit={code,signal}});child.stderr.on('data',b=>{stderrBytes+=b.length});child.stdin.on('error',()=>{})
 const transport=new EventEmitter(),lines=createInterface({input:child.stdout})
 lines.on('line',line=>{stdoutLines++;transport.emit('message',line)})
 child.on('error',e=>transport.emit('error',e));child.on('exit',()=>transport.emit('close','owned stub MCP exited'))
 transport.send=raw=>child.stdin.write(JSON.stringify({jsonrpc:'2.0',...JSON.parse(raw)})+'\n')
 transport.close=()=>child.stdin.end()
 const peer=new JsonRpcPeer(transport)
 peer.on('request',request=>request.fail(-32601,'stub lifecycle fixture refuses native approvals'))
 const row={route,pid:child.pid,serviceSha256:sha(service),calls:[],ok:false};report.routes.push(row);save()
 const call=async(method,params)=>{const out=await peer.request(method,params,{timeoutMs:15000});row.calls.push({method,...method==='tools/call'?{name:params.name,isError:!!out.isError}:{}});return out}
 try{
  await call('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'wrapper-lifecycle-stub-fixture',version:'1'}})
  peer.notify('notifications/initialized',{})
  const tools=await call('tools/list',{});row.publicTools=tools.tools.map(x=>x.name)
  const meta={'x-codex-turn-metadata':{session_id:'contract-only-session',thread_id:'contract-only-session',turn_id:'contract-only-turn'}}
  const first=await call('tools/call',{name:'js',arguments:{code:'console.log(JSON.stringify(await nodeRepl.rpc("probe",{phase:"before-stop"})));',timeout_ms:5000},_meta:meta})
  row.firstReply=first
  if(first.isError)throw Error('recording service call failed')
  const stop={hook_event_name:'Stop',session_id:'contract-only-session',turn_id:'contract-only-turn'}
  const ended=await call('tools/call',{name:'turn_ended',arguments:stop});row.stopReply=ended
  if(ended.isError)throw Error('turn-ended tool failed')
  const after=await call('tools/call',{name:'js',arguments:{code:'console.log(JSON.stringify(await nodeRepl.rpc("probe",{phase:"after-stop"})));',timeout_ms:5000},_meta:meta})
  row.afterReply=after
  if(after.isError)throw Error('recording service readback failed')
  const payload=after.content.filter(x=>x.type==='text').map(x=>x.text).join('\n')
  const events=JSON.parse(payload.slice(payload.indexOf('{'),payload.lastIndexOf('}')+1)).events
  row.events=events
  row.turnEndCallbacks=events.filter(e=>e.event==='turn-ended')
  row.ok=events.filter(e=>e.event==='register').length===1&&row.turnEndCallbacks.length===1&&row.turnEndCallbacks[0].received.session_id===stop.session_id&&row.turnEndCallbacks[0].received.turn_id===stop.turn_id
 }catch(e){row.error=e.message}
 finally{
  child.stdin.end()
  if(!exit)await Promise.race([exitPromise,new Promise(resolve=>setTimeout(resolve,5000))])
  row.forcedTermination=false
  if(!exit){row.forcedTermination=true;try{process.kill(-child.pid,'SIGTERM')}catch{};if(!exit)await Promise.race([exitPromise,new Promise(resolve=>setTimeout(resolve,2000))])}
  lines.close();row.exit=exit??null;row.stderrBytes=stderrBytes;row.stdoutLines=stdoutLines
  row.ok=row.ok&&exit?.code===0&&!row.forcedTermination;save()
 }
}
report.helpersAfter=helpers()
report.ok=report.routes.length===2&&report.routes.every(r=>r.ok)&&report.helpersAfter.length===0
}catch(e){report.error=e.message}
finally{report.helpersFinal=helpers();report.finishedAt=new Date().toISOString();save()}
console.log(JSON.stringify({run,ok:report.ok,routes:report.routes.map(r=>({route:r.route,ok:r.ok,exit:r.exit,forcedTermination:r.forcedTermination,publicTools:r.publicTools,turnEndCallbacks:r.turnEndCallbacks?.length,error:r.error})),helpersBefore:report.helpersBefore.length,helpersFinal:report.helpersFinal.length}))
if(!report.ok)process.exitCode=1
