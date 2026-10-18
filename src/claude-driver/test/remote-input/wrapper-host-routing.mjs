// Actual ephemeral Codex host, deterministic localhost provider and two real
// NodeREPL entrypoints backed only by a recording service. Never loads Sky/CUA.
import {spawn,execFileSync} from 'node:child_process'
import {createServer} from 'node:http'
import {createInterface} from 'node:readline'
import {once} from 'node:events'
import {readFileSync,writeFileSync,appendFileSync,mkdirSync,existsSync} from 'node:fs'
import {createHash,randomUUID} from 'node:crypto'
import {hostname,homedir} from 'node:os'
import {join} from 'node:path'
import * as zlib from 'node:zlib'

const root='/Users/theo/.local/state/claude-driver/input-teardown-20261018'
const proxyMode=process.argv[2]==='--proxy'
const swapped=proxyMode?process.argv[5]==='swapped':process.argv.includes('--swap-entrypoints')
const single=proxyMode?process.argv[6]==='single':process.argv.includes('--single-endpoint')
// The SSH entry requires its connection marker; MCP children receive a filtered
// environment. Their exact host/user/owner/run/route guards still apply.
if(process.platform!=='darwin'||hostname().split('.')[0]!=='theo-air'||homedir()!=='/Users/theo'||(!proxyMode&&!process.env.SSH_CONNECTION)||JSON.parse(readFileSync(join(root,'owner.json'))).threadId!=='01a112b1-fbf6-7cb0-8228-ce3e6cb6112d')throw Error('remote owner/scope refused')
const hash=b=>createHash('sha256').update(b).digest('hex'),runtime=join(root,'tools/cua_node'),node=join(runtime,'bin/node'),nodeRepl=join(runtime,'bin/node_repl'),launcher=join(runtime,'lib/node_modules/@oai/cua-repl/bin/cua-repl.mjs'),cli=join(root,'tools/CodexCLI.app/Contents/MacOS/codex')
for(const [path,sha]of [[node,'a90d52ad9b963c1c645f82e41909039510dd8958b8fc52b080a5ef5e8bbea0e1'],[nodeRepl,'a4bf42e64c504fc436b74e91b3e3588389a868cdc30cd49b41c7a82b26ffe879'],[launcher,'992174a5e637645aeb444adfdb1bae688e997bb84d7db07532f68e358e60f278'],[cli,'1afb28c01d7d49e892bd75f11076b10f1451e34e0ee308a95e5ab7f69f9c84fe']])if(hash(readFileSync(path))!==sha)throw Error('reviewed runtime changed')
const routes=['node_repl','cua_repl']
const activeRoutes=single?['cua_repl']:routes
const code=route=>'console.log(JSON.stringify(await nodeRepl.rpc("probe",{phase:"host-register",endpoint:'+JSON.stringify(route)+'})));'

if(proxyMode){
 const run=process.argv[3],route=process.argv[4]
 if(!new RegExp('^'+root+'/evidence/wrapper-host-routing-[0-9]+-[a-f0-9]{8}$').test(run)||!routes.includes(route))throw Error('proxy scope refused')
 const log=e=>appendFileSync(join(run,route+'-events.jsonl'),JSON.stringify({at:new Date().toISOString(),...e})+'\n',{mode:0o600})
 const env={HOME:homedir(),USER:'theo',LOGNAME:'theo',PATH:join(runtime,'bin')+':/usr/bin:/bin:/usr/sbin:/sbin',TMPDIR:join(root,'tmp'),CODEX_HOME:join(run,'home'),CODEX_CLI_PATH:cli,CUA_REPL_NODE_REPL_PATH:nodeRepl,CUA_REPL_ENABLED_SURFACES:'computer',NODE_REPL_NODE_MODULE_DIRS:join(runtime,'lib/node_modules'),NODE_REPL_TRUSTED_CODE_PATHS:run+':'+join(runtime,'lib/node_modules'),NODE_REPL_NODE_PATH:node,NODE_REPL_TRUSTED_SERVICES:JSON.stringify({probe:join(run,'probe.mjs')}),NODE_REPL_JS_BANNER:'',SKY_CUA_SERVICE_PATH:join(run,'startup-disabled.app'),SKY_CUA_SERVICE_NATIVE_PIPE_PATH:join(run,'unused-native.sock')}
 if(existsSync(env.SKY_CUA_SERVICE_PATH))throw Error('startup sentinel must be absent')
 const direct=route===(swapped?'cua_repl':'node_repl')
 const child=spawn(direct?nodeRepl:node,direct?[]:[launcher],{cwd:run,env,stdio:['pipe','pipe','pipe']})
 log({event:'start',pid:process.pid,childPid:child.pid,route,entryPoint:direct?'direct-node-repl':'packaged-cua-launcher',skyConfigured:false})
 const pending=new Map();let realContext,stopResult,readbackId
 child.stdin.on('error',()=>{});child.stderr.on('data',b=>log({event:'child-stderr',bytes:b.length}))
 createInterface({input:process.stdin}).on('line',line=>{
  let m;try{m=JSON.parse(line)}catch{log({event:'invalid-client-json'});return}
  if(m.method==='tools/call'){
   const p=m.params??{},a=p.arguments??{},meta=p._meta?.['x-codex-turn-metadata']
   const valid=meta&&typeof meta.thread_id==='string'&&meta.session_id===meta.thread_id&&typeof meta.turn_id==='string'
   const isJs=p.name==='js'&&a.code===code(route)&&valid
   // Hook metadata can arrive on the endpoint that the host names; bind it
   // to the real context independently captured from this server's JS call.
   const isStop=p.name==='turn_ended'&&realContext&&a.hook_event_name==='Stop'&&a.session_id===realContext.session_id&&a.turn_id===realContext.turn_id
   if(!isJs&&!isStop){log({event:'refused',name:p.name});process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'recording-only routing fixture refused tool'}})+'\n');return}
   if(isJs)realContext=meta
   pending.set(m.id,p.name);log({event:'call',name:p.name,arguments:a,metadata:p._meta??null})
  }else if(!['initialize','notifications/initialized','notifications/cancelled','tools/list','ping'].includes(m.method)){
   if(m.id!==undefined)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'recording-only protocol scope refused'}})+'\n')
   return
  }
  child.stdin.write(JSON.stringify(m)+'\n')
 }).on('close',()=>child.stdin.end())
 createInterface({input:child.stdout}).on('line',line=>{
  let m;try{m=JSON.parse(line)}catch{log({event:'invalid-server-json'});return}
  if(readbackId&&m.id===readbackId){
   log({event:'callback-readback',isError:!!m.error||!!m.result?.isError,result:m.result??null})
   process.stdout.write(JSON.stringify(stopResult)+'\n');readbackId=null;stopResult=null;return
  }
  if(pending.has(m.id)){
   const name=pending.get(m.id);log({event:'result',name,isError:!!m.error||!!m.result?.isError,result:m.result??null});pending.delete(m.id)
   if(single&&name==='turn_ended'&&!m.error&&!m.result?.isError){
    // Fixture-only readback from the recording service before releasing the
    // original hook reply. Real host IDs are reused unchanged; no native RPC.
    stopResult=m;readbackId='recording-post-stop-readback'
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:readbackId,method:'tools/call',params:{name:'js',arguments:{code:'console.log(JSON.stringify(await nodeRepl.rpc("probe",{phase:"after-stop-readback",endpoint:"cua_repl"})));',timeout_ms:5000},_meta:{'x-codex-turn-metadata':realContext}}})+'\n');return
   }
  }
  // A service approval request would be a fixture failure, never answered.
  if(m.method&&m.id!==undefined){log({event:'unexpected-server-request',method:m.method});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'no native capabilities or approvals in routing fixture'}})+'\n');return}
  process.stdout.write(line+'\n')
 })
 await new Promise(resolve=>{child.on('error',e=>{log({event:'error',message:e.message});resolve()});child.on('close',(code,signal)=>{log({event:'exit',code,signal});process.exitCode=code??1;resolve()})})
}else{
 const run=join(root,'evidence','wrapper-host-routing-'+Date.now()+'-'+randomUUID().slice(0,8)),home=join(run,'home')
 mkdirSync(home,{recursive:true,mode:0o700})
 const hook=readFileSync(new URL('./host-stop-hook.json',import.meta.url)),hookSha=hash(hook)
 const reviewPath=join(root,'evidence/host-hook-human-review-20261018.json'),review=JSON.parse(readFileSync(reviewPath))
 if(hookSha!=='fbf85b86181f2c7edff5591fb0bdb82a58f88d4666173d46e9b847f14308b017'||review.source!=='Taylor via current Codex chat'||review.purpose!=='isolated-cua-stop-hook-diagnostic'||review.action!=='allow-one-off-test'||review.hookDefinitionSha256!==hookSha)throw Error('exact isolated Stop hook review missing')
 writeFileSync(join(home,'hooks.json'),hook,{flag:'wx',mode:0o600})
 writeFileSync(join(run,'source.mjs'),readFileSync(new URL(import.meta.url)),{flag:'wx',mode:0o600})
 writeFileSync(join(run,'probe.mjs'),`let registered=false;const events=[];export function handleRpc(request){const n=globalThis.nodeRepl;if(!registered){if(typeof n?.addTurnEndedHandler!=='function')throw Error('trusted handler unavailable');n.addTurnEndedHandler({timeoutMs:1000,run:event=>{events.push({event:'turn-ended',received:event})}});registered=true;}return {probeOnly:true,endpoint:request.endpoint,registered,events};}`,{flag:'wx',mode:0o600})
 const report={run,startedAt:new Date().toISOString(),scope:'actual-host-input-free-cleanup-routing',sourceSha256:hash(readFileSync(new URL(import.meta.url))),hookSha256:hookSha,reviewPath,swappedEntryPoints:swapped,singleEndpoint:single,activeRoutes,entryPoints:Object.fromEntries(activeRoutes.map(route=>[route,route===(swapped?'cua_repl':'node_repl')?'direct-node-repl':'packaged-cua-launcher'])),realModelCallsRequested:0,skyConfigured:false,nativeInputRequested:0,cuaBootstrapDisabled:true,savedTrustChanged:false,providerRequests:[],ok:false}
 const save=()=>writeFileSync(join(run,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600})
 const helpers=()=>execFileSync('/bin/ps',['-axo','pid=,ppid=,comm='],{encoding:'utf8',timeout:5000}).split('\n').filter(l=>l.includes(join(root,'codex-home/computer-use/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService'))).map(l=>l.trim())
 report.helpersBefore=helpers();save();if(report.helpersBefore.length)throw Error('owned helper must be absent')
 const server=createServer(async(req,res)=>{
  const chunks=[];let bytes=0
  for await(const b of req){bytes+=b.length;if(bytes>2*1024*1024){res.writeHead(413).end();return}chunks.push(b)}
  const raw=Buffer.concat(chunks),encoding=req.headers['content-encoding'];let body
  try{body=JSON.parse((encoding==='gzip'?zlib.gunzipSync(raw):encoding==='zstd'?zlib.zstdDecompressSync(raw):raw).toString())}catch{res.writeHead(400).end();return}
  const index=report.providerRequests.length
  report.providerRequests.push({index,method:req.method,url:req.url,bytes:raw.length,sha256:hash(raw),authorizationPresent:!!req.headers.authorization,toolInventory:(body.tools??[]).map(t=>({type:t.type,name:t.name,tools:t.tools?.map(x=>({type:x.type,name:x.name}))}))});save()
  if(req.method!=='POST'||req.url!=='/v1/responses'||index>activeRoutes.length||req.headers.authorization){res.writeHead(403).end();return}
  const descriptor=route=>{
   for(const tool of body.tools??[]){
    if(tool.type==='function'&&tool.name==='mcp__'+route+'__js')return {name:tool.name}
    if(tool.type==='namespace'&&tool.name==='mcp__'+route&&tool.tools?.some(t=>t.name==='js'))return {name:'js',namespace:tool.name}
   }
   return null
  }
  const admission=Object.fromEntries(activeRoutes.map(route=>[route,descriptor(route)]))
  if(activeRoutes.some(route=>!admission[route]))report.admissionFailure='actual recording MCP tools were not in the provider inventory'
  let item
  if(index<activeRoutes.length&&!report.admissionFailure)item={id:'fc_recording_'+index,type:'function_call',call_id:'call_recording_'+index,...admission[activeRoutes[index]],arguments:JSON.stringify({code:code(activeRoutes[index]),timeout_ms:5000}),status:'completed'}
  else item={id:'msg_recording_final',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'RECORDING_ROUTING_COMPLETE',annotations:[]}]}
  const response={id:'resp_recording_'+index,object:'response',created_at:Math.floor(Date.now()/1000),model:'routing-fixture',status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}}
  res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'})
  const event=(type,value)=>res.write('event: '+type+'\ndata: '+JSON.stringify({type,...value})+'\n\n')
  event('response.created',{response:{...response,status:'in_progress',output:[]}});event('response.output_item.added',{output_index:0,item:{...item,status:'in_progress',content:[]}})
  if(item.type==='message'){event('response.content_part.added',{item_id:item.id,output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}});event('response.output_text.delta',{item_id:item.id,output_index:0,content_index:0,delta:'RECORDING_ROUTING_COMPLETE'});event('response.output_text.done',{item_id:item.id,output_index:0,content_index:0,text:'RECORDING_ROUTING_COMPLETE'})}
  else event('response.function_call_arguments.done',{item_id:item.id,output_index:0,arguments:item.arguments})
  event('response.output_item.done',{output_index:0,item});event('response.completed',{response});res.end()
 })
 server.listen(0,'127.0.0.1');await once(server,'listening')
 const port=server.address().port
 let config='model = "routing-fixture"\nmodel_provider = "routing_fixture"\n[model_providers.routing_fixture]\nname = "Recording routing fixture"\nbase_url = '+JSON.stringify('http://127.0.0.1:'+port+'/v1')+'\nwire_api = "responses"\nrequires_openai_auth = false\nsupports_websockets = false\nrequest_max_retries = 0\nstream_max_retries = 0\n'
 for(const route of activeRoutes)config+='[mcp_servers.'+route+']\ncommand = '+JSON.stringify(node)+'\nargs = '+JSON.stringify([new URL(import.meta.url).pathname,'--proxy',run,route,swapped?'swapped':'normal',single?'single':'multiple'])+'\nstartup_timeout_sec = 15\n'
 config+='[analytics]\nenabled = false\n';writeFileSync(join(home,'config.toml'),config,{flag:'wx',mode:0o600})
 const events=[];let exit,stderr=''
 const child=spawn(cli,['exec','--dangerously-bypass-hook-trust','--strict-config','--ephemeral','--skip-git-repo-check','--ignore-rules','--sandbox','read-only','--json','Recording-only lifecycle fixture; use the two provided fixed probe calls. No UI, shell, files or native capabilities.'],{cwd:run,env:{HOME:homedir(),USER:'theo',LOGNAME:'theo',PATH:join(runtime,'bin')+':/usr/bin:/bin:/usr/sbin:/sbin',TMPDIR:join(root,'tmp'),CODEX_HOME:home,SSH_CONNECTION:process.env.SSH_CONNECTION},detached:true,stdio:['ignore','pipe','pipe']})
 report.hostPid=child.pid;save()
 createInterface({input:child.stdout}).on('line',line=>{try{events.push(JSON.parse(line))}catch{report.invalidHostJson=true}});child.stderr.on('data',b=>{stderr=(stderr+b).slice(-65536)})
 const closed=new Promise(resolve=>{child.on('close',(code,signal)=>{exit={code,signal};resolve()});child.on('error',e=>{report.error=e.message;resolve()})});let timer
 try{
  await Promise.race([closed,new Promise(resolve=>{timer=setTimeout(()=>{report.forcedHostTermination=true;try{process.kill(-child.pid,'SIGTERM')}catch{};resolve()},45000)})]);clearTimeout(timer)
  if(!exit)await Promise.race([closed,new Promise(resolve=>setTimeout(resolve,5000))])
  report.exit=exit??null;report.threadId=events.find(x=>x.type==='thread.started')?.thread_id
  writeFileSync(join(run,'host-events.json'),JSON.stringify(events,null,2)+'\n',{mode:0o600});writeFileSync(join(run,'host.stderr'),stderr,{mode:0o600})
  report.routes={}
  for(const route of routes){const p=join(run,route+'-events.jsonl'),rows=existsSync(p)?readFileSync(p,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];report.routes[route]={calls:rows.filter(x=>x.event==='call'),results:rows.filter(x=>x.event==='result').map(x=>({name:x.name,isError:x.isError})),exits:rows.filter(x=>x.event==='exit'),callbackReadbacks:rows.filter(x=>x.event==='callback-readback')};}
  const direct=report.routes.node_repl,packaged=report.routes.cua_repl,directJs=direct.calls.filter(x=>x.name==='js'),packagedJs=packaged.calls.filter(x=>x.name==='js'),directStops=direct.calls.filter(x=>x.name==='turn_ended'),packagedStops=packaged.calls.filter(x=>x.name==='turn_ended')
  report.observed={nodeReplServerJs:directJs.length,cuaReplServerJs:packagedJs.length,nodeReplServerStops:directStops.length,cuaReplServerStops:packagedStops.length}
  const context=(single?packagedJs:directJs)[0]?.metadata?.['x-codex-turn-metadata'],other=packagedJs[0]?.metadata?.['x-codex-turn-metadata'],stop=packagedStops[0]?.arguments
  report.realContext=context;report.contextsMatch=!!context&&context.thread_id===report.threadId&&context.turn_id===other?.turn_id&&context.session_id===stop?.session_id&&context.turn_id===stop?.turn_id
  report.helpersAfter=helpers()
  report.routingQualified=exit?.code===0&&!report.forcedHostTermination&&!report.admissionFailure&&report.providerRequests.length===activeRoutes.length+1&&report.providerRequests.every(x=>!x.authorizationPresent)&&directJs.length===(single?0:1)&&packagedJs.length===1&&directStops.length===0&&packagedStops.length===1&&report.contextsMatch&&activeRoutes.every(route=>report.routes[route].results.length===report.routes[route].calls.length&&report.routes[route].results.every(x=>!x.isError))
  if(single){
   const readbacks=packaged.callbackReadbacks
   try{const text=readbacks[0].result.content.filter(x=>x.type==='text').map(x=>x.text).join('\n'),recording=JSON.parse(text.slice(text.indexOf('{'),text.lastIndexOf('}')+1));report.callbackReceipt=recording;report.callbackQualified=readbacks.length===1&&!readbacks[0].isError&&recording.events.length===1&&recording.events[0].received.session_id===context.session_id&&recording.events[0].received.turn_id===context.turn_id}catch(e){report.callbackQualified=false;report.callbackError=e.message}
  }
  report.proxyExitReceiptsComplete=routes.every(route=>report.routes[route].exits.length===1&&report.routes[route].exits[0].code===0)
  // Host shutdown can terminate a proxy before its child-close callback runs.
  // Preserve missing receipts separately; independently observe the owned group.
  const group=()=>execFileSync('/bin/ps',['-axo','pid=,ppid=,pgid=,comm='],{encoding:'utf8',timeout:5000}).split('\n').flatMap(line=>{const a=line.trim().split(/\s+/);return Number(a[2])===child.pid?[{pid:Number(a[0]),ppid:Number(a[1]),pgid:Number(a[2]),path:a.slice(3).join(' ')}]:[]})
  report.retirementObservations=[]
  const deadline=Date.now()+2000
  do{report.remainingOwnedHostGroup=group();report.retirementObservations.push({at:new Date().toISOString(),members:report.remainingOwnedHostGroup});if(!report.remainingOwnedHostGroup.length)break;await new Promise(resolve=>setTimeout(resolve,100))}while(Date.now()<deadline)
  report.ok=report.routingQualified&&(!single||report.callbackQualified)&&report.helpersAfter.length===0&&report.remainingOwnedHostGroup.length===0
 }catch(e){report.error=e.message}
 finally{clearTimeout(timer);await new Promise(resolve=>server.close(resolve));report.finishedAt=new Date().toISOString();save()}
 console.log(JSON.stringify({run,ok:report.ok,exit:report.exit,threadId:report.threadId,realContext:report.realContext,contextsMatch:report.contextsMatch,singleEndpoint:report.singleEndpoint,callbackQualified:report.callbackQualified,observed:report.observed,remainingOwnedGroup:report.remainingOwnedHostGroup?.length,helpersBefore:report.helpersBefore.length,helpersAfter:report.helpersAfter?.length,error:report.error}))
 if(!report.ok)process.exitCode=1
}
