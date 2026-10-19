#!/usr/bin/env node
// Remote-only lifetime candidate: one ordinary helper, two real host/MCP leases.
// Retain the first client across an idle lease gap; close it during the second
// client's one fixed input. No per-lease native helper teardown or native patch.
import {spawn,execFileSync,execFile} from 'node:child_process'
import {EventEmitter,once} from 'node:events'
import {createInterface} from 'node:readline'
import {createServer} from 'node:http'
import {readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync,unlinkSync} from 'node:fs'
import {createHash,randomUUID} from 'node:crypto'
import {homedir,hostname} from 'node:os'
import {join} from 'node:path'
import {promisify} from 'node:util'
import * as zlib from 'node:zlib'
import {JsonRpcPeer} from '../../../codex-bridge/src/lib/jsonrpc.mjs'
import {audit} from './native-audit.mjs'
import {settleReceivingState} from './receiving-state.mjs'

const root='/Users/theo/.local/state/claude-driver/input-teardown-20261018',owner='01a112b1-fbf6-7cb0-8228-ce3e6cb6112d',proxy=process.argv[2]==='--proxy',notify=process.argv[2]==='--notify'
if(process.platform!=='darwin'||homedir()!=='/Users/theo'||hostname().split('.')[0]!=='theo-air'||(!proxy&&!notify&&!process.env.SSH_CONNECTION)||JSON.parse(readFileSync(join(root,'owner.json'))).threadId!==owner)throw Error('remote owner/scope refused')
const hash=b=>createHash('sha256').update(b).digest('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms)),self=new URL(import.meta.url).pathname,runCommand=promisify(execFile)
const runtime=join(root,'tools/cua_node'),node=join(runtime,'bin/node'),cli=join(root,'tools/CodexCLI.app/Contents/MacOS/codex'),launcher=join(runtime,'lib/node_modules/@oai/cua-repl/bin/cua-repl.mjs'),helperHome=join(root,'codex-home'),helperApp=join(helperHome,'computer-use/Codex Computer Use.app'),helperPath=join(helperApp,'Contents/MacOS/SkyComputerUseService'),socket=join(homedir(),'Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/IPC/computeruse.sock')
for(const [p,sha]of [[node,'a90d52ad9b963c1c645f82e41909039510dd8958b8fc52b080a5ef5e8bbea0e1'],[cli,'1afb28c01d7d49e892bd75f11076b10f1451e34e0ee308a95e5ab7f69f9c84fe'],[launcher,'992174a5e637645aeb444adfdb1bae688e997bb84d7db07532f68e358e60f278']])if(hash(readFileSync(p))!==sha)throw Error('reviewed runtime changed')
const roles=['first','second']
const notifier=join(helperApp,'Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient')
if(hash(readFileSync(notifier))!=='4861d29eb73f6f71a5a82dc94fc7c696d34e8cd6493f1932f6ba7b51f6448cf5')throw Error('reviewed notifier changed')
const nativeProcesses=()=>execFileSync('/bin/ps',['-axo','pid=,ppid=,pgid=,comm='],{encoding:'utf8',timeout:5000}).split('\n').flatMap(line=>{const m=line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);return m&&/SkyComputerUse(Service|Client)$/.test(m[4])?[{pid:+m[1],ppid:+m[2],pgid:+m[3],path:m[4]}]:[]})
const endpointExists=()=>{try{lstatSync(socket);return true}catch(e){if(e.code==='ENOENT')return false;throw e}}

if(proxy||notify){
 const run=process.argv[3],role=process.argv[4]
 if(!new RegExp('^'+root+'/evidence/owner-native-shared-[0-9]+-[a-f0-9]{8}$').test(run)||!roles.includes(role))throw Error('proxy role/run refused')
 const binding=JSON.parse(readFileSync(join(run,'relay.json')))
 if(binding.owner!==owner||binding.sourceSha256!==hash(readFileSync(self))||!/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(binding.origin))throw Error('proxy binding refused')
 if(notify){
  const raw=process.argv[5];if(typeof raw!=='string'||Buffer.byteLength(raw)>65536)throw Error('notify payload bound')
  const r=await fetch(binding.origin+'/notify/'+role,{method:'POST',headers:{'content-type':'application/json','x-owned-run':binding.token},body:JSON.stringify({raw,pid:process.pid}),signal:AbortSignal.timeout(20000)}),v=await r.json();if(!r.ok||!v.commandExitedNormally)process.exitCode=1
 }else createInterface({input:process.stdin}).on('line',async line=>{
  let m;try{m=JSON.parse(line)}catch{return}
  try{const r=await fetch(binding.origin+'/relay/'+role,{method:'POST',headers:{'content-type':'application/json','x-owned-run':binding.token},body:JSON.stringify({method:m.method,params:m.params??{},hasId:m.id!==undefined}),signal:AbortSignal.timeout(90000)}),v=await r.json();if(!r.ok)throw Error(v.error??'relay refused');if(m.id!==undefined)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,...v})+'\n')}
  catch(e){if(m.id!==undefined)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:e.message}})+'\n')}
 })
}else{
 const run=join(root,'evidence','owner-native-shared-'+Date.now()+'-'+randomUUID().slice(0,8)),stop=join(root,'fixture/stop'),fixturePath=join(root,'fixture/ClaudeDriverInputFixture.app/Contents/MacOS/InputFixture')
 mkdirSync(run,{mode:0o700});const stateDir=join(run,'state');mkdirSync(stateDir,{mode:0o700});process.env.CLAUDE_DRIVER_STATE_DIR=stateDir
 writeFileSync(join(stateDir,'ui-quarantine.json'),JSON.stringify({blocked:false,scope:'owned remote shared-helper candidate only'}),{flag:'wx',mode:0o600})
 const {inspectPrivateInputRuntime}=await import('../../src/lib/private-input-service.mjs')
 const firstPayload=('SHARED_FIRST_'+Date.now()+'_').padEnd(64,'x'),secondPayload=('SHARED_SECOND_'+Date.now()+'_').padEnd(4096,'y'),expected=firstPayload+secondPayload
 const report={run,startedAt:new Date().toISOString(),scope:'one-long-lived-default-helper-two-owned-client-leases',sourceSha256:hash(readFileSync(self)),receivingObserverSha256:hash(readFileSync(new URL('./receiving-state.mjs',import.meta.url))),inputAttempts:{first:0,second:0},realInferenceRequested:false,nativeNotifyConfigured:true,nativeReceiverReceiptQualified:false,fixtureBinarySha256:hash(readFileSync(fixturePath)),actors:{},ok:false}
 writeFileSync(join(run,'source.mjs'),readFileSync(self),{flag:'wx',mode:0o600});writeFileSync(join(run,'expected-input.json'),JSON.stringify({first:firstPayload,second:secondPayload}),{flag:'wx',mode:0o600})
 writeFileSync(join(run,'receiving-state.mjs'),readFileSync(new URL('./receiving-state.mjs',import.meta.url)),{flag:'wx',mode:0o600})
 const save=()=>writeFileSync(join(run,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600})
 const clean={HOME:homedir(),USER:'theo',LOGNAME:'theo',PATH:'/usr/bin:/bin:/usr/sbin:/sbin',TMPDIR:join(root,'tmp'),SSH_CONNECTION:process.env.SSH_CONNECTION}
 const candidateSource=join(root,'harness/src/claude-driver/test/remote-input/notifier-candidates-e4c3178e1958.swift'),candidateExe=join(run,'candidate-audit')
 if(hash(readFileSync(candidateSource))!=='e4c3178e1958449d79ee90a75a2d06aa77953c4e9a6c1a155c8c01295db954b4')throw Error('candidate audit source changed')
 const candidates=()=>JSON.parse(execFileSync(candidateExe,[],{env:clean,encoding:'utf8',timeout:5000})).candidates
 const hook=readFileSync(new URL('./host-stop-hook.json',import.meta.url)),review=JSON.parse(readFileSync(join(root,'evidence/host-hook-human-review-20261018.json')))
 if(hash(hook)!=='fbf85b86181f2c7edff5591fb0bdb82a58f88d4666173d46e9b847f14308b017'||review.hookDefinitionSha256!==hash(hook)||review.source!=='Taylor via current Codex chat'||review.purpose!=='isolated-cua-stop-hook-diagnostic'||review.action!=='allow-one-off-test')throw Error('exact reviewed Stop hook refused')
 const grantPath=join(root,'evidence/acquire-1792351052633.request-1.response.json'),grant=JSON.parse(readFileSync(grantPath)),original=JSON.parse(readFileSync(grantPath.replace('.response.json','.pending.json')))
 const exactGrant=p=>p.mode==='form'&&p.message==='Allow Computer Use to use "Claude Driver Input Fixture"?'&&p._meta?.connector_id==='computer-use'&&p._meta?.riskLevel==='low'&&['get_app_state','type_text'].includes(p._meta?.tool_name)&&JSON.stringify(p._meta?.tool_params)===JSON.stringify({app:'dev.taylor.claudedriver.inputfixture'})
 if(grant.source!=='Taylor via current Codex chat'||grant.action!=='accept'||grant.requestSha256!==hash(JSON.stringify(original.params))||original.params._meta?.tool_name!=='get_app_state'||!exactGrant(original.params))throw Error('exact fixture grant refused')
 const acquire='var fixture = await cua.getApp('+JSON.stringify(join(root,'fixture/ClaudeDriverInputFixture.app'))+');'
 const code=role=>'await fixture.typeText('+JSON.stringify(role==='first'?firstPayload:secondPayload)+'); await fixture.getAXState();'
 const actors=new Map();let helper,helperExit,helperError,fixture,fixtureExit,server,monitor,handoffPromise
 const nativeIdentity=()=>{const rows=nativeProcesses();if(rows.length!==1||rows[0].pid!==helper.pid||rows[0].path!==helperPath)throw Error('single owned helper identity changed');return rows}
 const exactState=(text)=>{const s=JSON.parse(readFileSync(join(root,'fixture/state.json')));return {state:s,exact:s.pid===fixture.pid&&s.characters===text.length&&s.utf8Bytes===Buffer.byteLength(text)&&s.sha256===hash(text)}}
 const closeClient=async actor=>{actor.peer.close();let timer;await Promise.race([actor.mcpDone,new Promise(resolve=>{timer=setTimeout(resolve,10000)})]);clearTimeout(timer);return actor.row.mcpExit??null}
 async function makeActor(role){
  const home=join(run,role+'-home');mkdirSync(home,{mode:0o700});writeFileSync(join(home,'hooks.json'),hook,{flag:'wx',mode:0o600})
  const row={role,home,requests:[],calls:[],inputIntent:{characters:(role==='first'?firstPayload:secondPayload).length,sha256:hash(role==='first'?firstPayload:secondPayload),attempts:1}},actor={role,row,acquired:false,inputPending:false,stops:0,hostEvents:[]};report.actors[role]=row
  const t=new EventEmitter(),mcp=spawn(node,[launcher],{cwd:run,env:{...clean,CODEX_HOME:helperHome,CODEX_CLI_PATH:cli,CUA_REPL_NODE_REPL_PATH:join(runtime,'bin/node_repl'),CUA_REPL_ENABLED_SURFACES:'computer',NODE_REPL_NODE_MODULE_DIRS:join(runtime,'lib/node_modules'),NODE_REPL_TRUSTED_CODE_PATHS:join(runtime,'lib/node_modules'),NODE_PATH:join(runtime,'lib/node_modules'),SKY_CUA_SERVICE_PATH:join(run,'startup-disabled.app')},detached:true,stdio:['pipe','pipe','pipe']})
  actor.mcp=mcp;row.mcpPid=mcp.pid;actor.mcpDone=new Promise(resolve=>{mcp.on('error',e=>{row.mcpError=e.message;t.emit('error',e);resolve()});mcp.on('close',(code,signal)=>{row.mcpExit={code,signal};t.emit('close','owned client closed');resolve()})})
  mcp.stdin.on('error',()=>{});mcp.stderr.on('data',b=>{row.stderrBytes=(row.stderrBytes??0)+b.length});createInterface({input:mcp.stdout}).on('line',line=>t.emit('message',line));t.send=raw=>mcp.stdin.write(JSON.stringify({jsonrpc:'2.0',...JSON.parse(raw)})+'\n');t.close=()=>mcp.stdin.end();actor.peer=new JsonRpcPeer(t)
  actor.peer.on('request',request=>{if(request.method==='elicitation/create'&&exactGrant(request.params)){row.grantRelays??=[];row.grantRelays.push({receipt:grantPath,sha256:hash(JSON.stringify(request.params))});request.respond({action:'accept',content:{}})}else{row.refusedRequest=request.method;request.fail(-32601,'outside exact human fixture grant')}})
  actors.set(role,actor);return actor
 }
 async function runHost(actor,origin){
  writeFileSync(join(actor.row.home,'config.toml'),'notify = '+JSON.stringify([node,self,'--notify',run,actor.role])+'\nmodel = "shared-fixture"\nmodel_provider = "shared_fixture"\n[model_providers.shared_fixture]\nname = "Owned shared-helper fixture"\nbase_url = '+JSON.stringify(origin+'/'+actor.role+'/v1')+'\nwire_api = "responses"\nrequires_openai_auth = false\nsupports_websockets = false\nrequest_max_retries = 0\nstream_max_retries = 0\n[mcp_servers.cua_repl]\ncommand = '+JSON.stringify(node)+'\nargs = '+JSON.stringify([self,'--proxy',run,actor.role])+'\nstartup_timeout_sec = 15\n[analytics]\nenabled = false\n',{flag:'wx',mode:0o600})
  const host=spawn(cli,['exec','--dangerously-bypass-hook-trust','--strict-config','--ephemeral','--skip-git-repo-check','--ignore-rules','--sandbox','read-only','--json','Owned disposable fixture lifetime test: exactly the two fixed calls provided. No shell, files, retries or other apps.'],{cwd:run,env:{...clean,CODEX_HOME:actor.row.home},detached:true,stdio:['ignore','pipe','pipe']});actor.host=host;actor.row.hostPid=host.pid
  createInterface({input:host.stdout}).on('line',line=>{try{actor.hostEvents.push(JSON.parse(line))}catch{actor.row.invalidJson=true}});host.stderr.on('data',b=>{actor.row.hostStderr=((actor.row.hostStderr??'')+b).slice(-65536)});host.on('exit',(code,signal)=>{actor.row.hostExit={code,signal}})
  actor.hostTimer=setTimeout(()=>{actor.row.hostTimedOut=true;try{process.kill(-host.pid,'SIGTERM')}catch{}},110000)
  await once(host,'close');clearTimeout(actor.hostTimer);actor.row.hostEvents=actor.hostEvents;actor.row.hostCompleted=actor.row.hostExit?.code===0&&actor.hostEvents.some(x=>x.type==='turn.completed');
  if(!actor.row.hostCompleted)throw Error('actual host did not complete; no completion notifier is assumed')
  for(let i=0;i<200&&!actor.row.nativeCommand?.finishedAt;i++)await sleep(100)
  if(actor.row.nativeCommand?.exit?.code!==0)throw Error('native notify command did not finish normally')
  save()
 }
 try{
  report.before={snapshot:audit(root),nativeProcesses:nativeProcesses(),socketPresent:endpointExists()};save()
  if(report.before.nativeProcesses.length||report.before.socketPresent||report.before.snapshot.fixtureProcessCurrent||existsSync(stop))throw Error('empty helper/socket/fixture baseline required; never replace a preexisting service')
  await runCommand('/usr/bin/swiftc',['-module-cache-path',join(root,'tmp/notifier-candidates-cache'),candidateSource,'-o',candidateExe],{env:clean,timeout:45000,maxBuffer:65536});report.before.candidates=candidates();if(report.before.candidates.length)throw Error('native running-app baseline not empty')
  const runtimeProof=await inspectPrivateInputRuntime({resourceRoot:runtime,helperApp,cli});report.runtimeHashes=runtimeProof.hashes
  fixture=spawn(fixturePath,[],{env:{...clean,CLAUDE_DRIVER_FIXTURE_EVENT_LOG:join(run,'fixture-events.jsonl')},stdio:'ignore'});fixture.on('exit',(code,signal)=>{fixtureExit={code,signal}})
  for(let i=0;i<40;i++){const s=audit(root);if(s.fixtureProcessCurrent&&exactState('').exact)break;if(i===39)throw Error('owned empty fixture not ready');await sleep(100)}
  helper=spawn(helperPath,[],{env:{...clean,CODEX_HOME:helperHome,CODEX_CLI_PATH:cli},stdio:['ignore','ignore','pipe']});report.helperPid=helper.pid;helper.on('error',e=>{helperError=e.message});helper.on('exit',(code,signal)=>{helperExit={code,signal}});helper.stderr.on('data',b=>{report.helperStderrBytes=(report.helperStderrBytes??0)+b.length})
  for(let i=0;i<80;i++){if(helperExit||helperError)throw Error('owned helper exited during startup');if(endpointExists()){const s=lstatSync(socket);if(!s.isSocket()||s.isSymbolicLink()||s.uid!==process.getuid())throw Error('socket identity refused');break}if(i===79)throw Error('default socket not ready');await sleep(100)}
  report.socketOwner=execFileSync('/usr/sbin/lsof',['-nP','-a','-p',String(helper.pid),'-U'],{encoding:'utf8',timeout:5000}).split('\n').some(x=>x.trim().split(/\s+/)[1]===String(helper.pid)&&x.trim().endsWith(' '+socket));if(!report.socketOwner)throw Error('exact helper socket owner unavailable');nativeIdentity()
  const token=randomUUID()
  server=createServer(async(req,res)=>{
   try{
    const chunks=[];let size=0;for await(const b of req){size+=b.length;if(size>2*1024*1024)throw Error('body limit');chunks.push(b)}let raw=Buffer.concat(chunks);if(req.headers['content-encoding']==='gzip')raw=zlib.gunzipSync(raw,{maxOutputLength:2*1024*1024});if(req.headers['content-encoding']==='zstd')raw=zlib.zstdDecompressSync(raw,{maxOutputLength:2*1024*1024});const input=JSON.parse(raw)
    if(req.method!=='POST'||req.headers.authorization)throw Error('method/auth refused')
    const relay=req.url.match(/^\/relay\/(first|second)$/),notification=req.url.match(/^\/notify\/(first|second)$/),provider=req.url.match(/^\/(first|second)\/v1\/responses$/),role=relay?.[1]??notification?.[1]??provider?.[1],actor=actors.get(role)
    if(!actor)throw Error('actor scope refused')
    if(notification){
     if(req.headers['x-owned-run']!==token||actor.row.nativeCommand||!actor.row.inputVerified||!actor.context||typeof input.raw!=='string'||Buffer.byteLength(input.raw)>65536)throw Error('native notify scope refused')
     const payload=JSON.parse(input.raw);if(payload.type!=='agent-turn-complete'||payload['thread-id']!==actor.context.thread_id||payload['turn-id']!==actor.context.turn_id)throw Error('native notify actual IDs mismatch')
     const helperRows=nativeIdentity(),list=candidates();if(list.length!==1||list[0].pid!==helper.pid||!list[0].matchesOwnedBundlePath||!list[0].matchesOwnedExecutablePath||list[0].terminated)throw Error('native notify owned running-app admission failed')
     const row={startedAt:new Date().toISOString(),payload,wrapperPid:input.pid,helper:helperRows,candidates:list};actor.row.nativeCommand=row;save()
     try{const r=await runCommand(notifier,['turn-ended',input.raw],{env:{...clean,CODEX_HOME:helperHome},cwd:run,timeout:10000,maxBuffer:65536});row.exit={code:0,signal:null};row.stdout=r.stdout;row.stderr=r.stderr}catch(e){row.exit={code:e.code??null,signal:e.signal??null};row.stdout=e.stdout??'';row.stderr=e.stderr??''}
     row.finishedAt=new Date().toISOString();save();res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({commandExitedNormally:row.exit.code===0}));return
    }
    if(relay){
     if(req.headers['x-owned-run']!==token)throw Error('relay token refused')
     const {method,params,hasId}=input;if(!['initialize','notifications/initialized','notifications/cancelled','tools/list','ping','tools/call'].includes(method))throw Error('protocol refused')
     if(method==='tools/call'){
      const a=params.arguments??{},meta=params._meta?.['x-codex-turn-metadata'],valid=meta&&typeof meta.thread_id==='string'&&meta.session_id===meta.thread_id&&typeof meta.turn_id==='string',same=valid&&(!actor.context||actor.context.thread_id===meta.thread_id&&actor.context.turn_id===meta.turn_id)
      if(params.name==='js'){
       const isAcquire=!actor.row.calls.some(x=>x.name==='js')&&a.code===acquire,isInput=actor.acquired&&!report.inputAttempts[role]&&a.code===code(role)
       if(!same||!isAcquire&&!isInput)throw Error('exact fixture call/context refused')
       if(isAcquire)actor.context=meta
       if(isInput){nativeIdentity();if(!exactState(role==='first'?'':firstPayload).exact)throw Error('input starting state changed');report.inputAttempts[role]++;actor.inputPending=true}
      }else if(params.name==='turn_ended'){if(!actor.context||a.session_id!==actor.context.session_id||a.turn_id!==actor.context.turn_id||a.hook_event_name!=='Stop'||actor.stops++)throw Error('exact Stop refused')}
      else throw Error('unapproved tool refused')
      const call={at:new Date().toISOString(),name:params.name,arguments:a,metadata:params._meta};actor.row.calls.push(call);save()
      const value=await actor.peer.request(method,params,{timeoutMs:85000});if(a.code===code(role)){
       actor.inputPending=false
       actor.row.receivingSettlement=await settleReceivingState({path:join(root,'fixture/state.json'),pid:fixture.pid,text:role==='first'?firstPayload:expected})
      }
      const text=(value.content??[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');call.isError=!!value.isError;call.resultSha256=hash(text);call.resultBytes=Buffer.byteLength(text);call.exactFixtureObserved=text.includes('Claude Driver Input Teardown Fixture')&&text.includes('claude-driver-test-editor');call.snapshot=audit(root)
      if(a.code===acquire)actor.acquired=!value.isError&&call.exactFixtureObserved&&call.snapshot.fixtureProcessCurrent&&exactState(role==='first'?'':firstPayload).exact
      if(a.code===code(role))actor.row.inputVerified=!value.isError&&call.exactFixtureObserved&&actor.row.receivingSettlement?.verified&&exactState(role==='first'?firstPayload:expected).exact
      actor.row.context=actor.context;save();res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({result:value}));return
     }
     const value=hasId?await actor.peer.request(method,method==='initialize'?{...params,capabilities:{...params.capabilities,elicitation:{}}}:params,{timeoutMs:15000}):actor.peer.notify(method,params);res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({result:value??{}}));return
    }
    if(!provider||actor.row.requests.length>=3)throw Error('provider scope refused')
    const step=actor.row.requests.length,fn=(input.tools??[]).find(t=>t.type==='function'&&t.name==='mcp__cua_repl__js'),ns=(input.tools??[]).find(t=>t.type==='namespace'&&t.name==='mcp__cua_repl'&&t.tools?.some(x=>x.name==='js'));actor.row.requests.push({step,bytes:raw.length,sha256:hash(raw),actualToolPresent:!!(fn||ns),authorizationPresent:false})
    if(step<2&&!fn&&!ns)throw Error('actual native MCP missing; no fabricated call')
    if(step===1&&!actor.acquired||step===2&&!actor.row.inputVerified)throw Error('native effect not verified; input never replayed')
    const finalText=role.toUpperCase()+'_SHARED_LEASE_OK',item=step<2?{id:'fc_'+role+'_'+step,type:'function_call',call_id:'call_'+role+'_'+step,...fn?{name:fn.name}:{name:'js',namespace:ns.name},arguments:JSON.stringify({code:step===0?acquire:code(role),title:step===0?'Inspect disposable fixture':'Type once in disposable fixture',timeout_ms:75000}),status:'completed'}:{id:'msg_'+role,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:finalText,annotations:[]}]},response={id:'resp_'+role+'_'+step,object:'response',created_at:Math.floor(Date.now()/1000),model:'shared-fixture',status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}}
    res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});const event=(type,v)=>res.write('event: '+type+'\ndata: '+JSON.stringify({type,...v})+'\n\n');event('response.created',{response:{...response,status:'in_progress',output:[]}});event('response.output_item.added',{output_index:0,item:{...item,status:'in_progress',content:[]}})
    if(step<2)event('response.function_call_arguments.done',{item_id:item.id,output_index:0,arguments:item.arguments});else{event('response.content_part.added',{item_id:item.id,output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}});event('response.output_text.delta',{item_id:item.id,output_index:0,content_index:0,delta:finalText});event('response.output_text.done',{item_id:item.id,output_index:0,content_index:0,text:finalText})}event('response.output_item.done',{output_index:0,item});event('response.completed',{response});res.end();save()
   }catch(e){report.serverErrors??=[];report.serverErrors.push({path:req.url,error:e.message});save();if(!res.headersSent)res.writeHead(403,{'content-type':'application/json'}).end(JSON.stringify({error:e.message}));else res.end()}
  })
  server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port
  writeFileSync(join(run,'relay.json'),JSON.stringify({owner,sourceSha256:report.sourceSha256,origin,token}),{flag:'wx',mode:0o600})
  const first=await makeActor('first');await runHost(first,origin)
  if(!first.row.hostCompleted||!first.row.inputVerified||first.row.mcpExit||first.stops!==1)throw Error('first lease did not finish while its keeper client stayed live')
  report.idleLeaseGap={at:new Date().toISOString(),helper:nativeIdentity(),snapshot:audit(root),firstClientStillAlive:!first.row.mcpExit,firstHostCompleted:true}
  const second=await makeActor('second')
  monitor=setInterval(()=>{
   if(handoffPromise||!second.inputPending)return
   const s=JSON.parse(readFileSync(join(root,'fixture/state.json')))
   if(s.pid!==fixture.pid||s.characters<=firstPayload.length||s.characters>=expected.length)return
   if(s.sha256!==hash(expected.slice(0,s.characters))){report.handoffRefused='receiving state is not the exact submitted prefix';clearInterval(monitor);save();return}
   clearInterval(monitor)
   handoffPromise=(async()=>{
    report.beforeFirstClientEof={at:new Date().toISOString(),state:s,secondNativeToolPending:true,helper:nativeIdentity()};save()
    const closed=await closeClient(first),after=JSON.parse(readFileSync(join(root,'fixture/state.json')))
    report.firstClientEof={at:new Date().toISOString(),exit:closed,secondNativeToolPending:second.inputPending,state:after,helper:nativeIdentity(),snapshot:audit(root)}
    // Qualify the state captured at first-client EOF, before the independent
    // (potentially slower) tap audit. Its latency must not redefine that boundary.
    report.handoffQualified=closed?.code===0&&report.firstClientEof.secondNativeToolPending&&after.pid===fixture.pid&&after.characters>firstPayload.length&&after.characters<expected.length&&after.sha256===hash(expected.slice(0,after.characters));save()
   })().catch(e=>{report.handoffError=e.message;save()})
  },10)
  await runHost(second,origin);clearInterval(monitor);if(handoffPromise)await handoffPromise
  report.settled=[];const t=Date.now();for(const delay of [0,1000,5000]){await sleep(Math.max(0,t+delay-Date.now()));report.settled.push({elapsedMs:Date.now()-t,snapshot:audit(root),helper:nativeIdentity(),secondClientAlive:!second.row.mcpExit,exactReceivingState:exactState(expected).exact})}
  report.ok=!!report.handoffQualified&&first.row.inputVerified&&second.row.inputVerified&&second.row.hostCompleted&&second.stops===1&&report.inputAttempts.first===1&&report.inputAttempts.second===1&&first.context.thread_id!==second.context.thread_id&&report.settled.every(x=>x.exactReceivingState&&x.secondClientAlive)&&!report.serverErrors?.length
 }catch(e){report.error={category:e.category,message:e.message};report.ok=false}
 finally{
  clearInterval(monitor)
  for(const actor of actors.values()){
   clearTimeout(actor.hostTimer);if(actor.host&&!actor.row.hostExit){actor.row.forcedHostCleanup=true;try{process.kill(-actor.host.pid,'SIGTERM')}catch{}}
   await closeClient(actor);if(!actor.row.mcpExit){actor.row.forcedClientCleanup=true;try{process.kill(-actor.mcp.pid,'SIGTERM')}catch{};for(let i=0;i<30&&!actor.row.mcpExit;i++)await sleep(100)}
  }
  if(helper){for(let i=0;i<50&&!helperExit&&!helperError;i++)await sleep(100);if(!helperExit&&!helperError){report.forcedHelperCleanup=true;helper.kill('SIGTERM');for(let i=0;i<30&&!helperExit;i++)await sleep(100)}}
  if(fixture&&!fixtureExit){writeFileSync(stop,'owned fixture stop\n',{flag:'wx'});for(let i=0;i<100&&!fixtureExit;i++)await sleep(100);if(fixtureExit)unlinkSync(stop)}
  server?.closeAllConnections();server?.close();report.helperExit=helperExit??null;report.fixtureExit=fixtureExit??null;report.finishedAt=new Date().toISOString();report.final={snapshot:audit(root),nativeProcesses:nativeProcesses(),socketPresent:endpointExists()}
  report.ok=report.ok&&helperExit?.code===0&&fixtureExit?.code===0&&!report.forcedHelperCleanup&&[...actors.values()].every(x=>x.row.mcpExit?.code===0&&!x.row.forcedClientCleanup&&!x.row.forcedHostCleanup)&&!report.final.nativeProcesses.length&&!report.final.snapshot.fixtureProcessCurrent;save()
 }
 console.log(JSON.stringify({run,ok:report.ok,error:report.error,handoffQualified:report.handoffQualified,handoffError:report.handoffError,handoffRefused:report.handoffRefused,inputAttempts:report.inputAttempts,actors:Object.fromEntries([...actors].map(([role,a])=>[role,{hostExit:a.row.hostExit,mcpExit:a.row.mcpExit,inputVerified:a.row.inputVerified,context:a.row.context}])),handoff:report.firstClientEof?{firstExit:report.firstClientEof.exit,secondPending:report.firstClientEof.secondNativeToolPending,characters:report.firstClientEof.state.characters}:null,settled:report.settled?.map(x=>({elapsedMs:x.elapsedMs,characters:x.snapshot.fixtureState.characters,exact:x.exactReceivingState,helperPid:x.helper[0].pid})),helperExit:report.helperExit,fixtureExit:report.fixtureExit,remainingNative:report.final.nativeProcesses.length,socketPresent:report.final.socketPresent,forcedHelperCleanup:report.forcedHelperCleanup,serverErrors:report.serverErrors}));if(!report.ok)process.exitCode=1
}
