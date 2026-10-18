#!/usr/bin/env node
// Owned remote native-notifier gate. Read-only by default; --type-once adds one
// fixed synthetic input. Real host IDs, exact owned candidate, public notifier.
import {spawn,execFileSync,execFile} from 'node:child_process'
import {EventEmitter,once} from 'node:events'
import {createInterface} from 'node:readline'
import {createServer} from 'node:http'
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,existsSync,unlinkSync,lstatSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {hostname,homedir} from 'node:os'
import {join} from 'node:path'
import {promisify} from 'node:util'
import * as zlib from 'node:zlib'
import {JsonRpcPeer} from '../../../codex-bridge/lib/jsonrpc.mjs'
import {audit} from './native-audit.mjs'

const root='/Users/theo/.local/state/claude-driver/input-teardown-20261018',ownerId='01a112b1-fbf6-7cb0-8228-ce3e6cb6112d'
const childMode=['--proxy','--notify'].includes(process.argv[2])
if(process.platform!=='darwin'||homedir()!=='/Users/theo'||hostname().split('.')[0]!=='theo-air'||(!childMode&&!process.env.SSH_CONNECTION)||JSON.parse(readFileSync(join(root,'owner.json'))).threadId!==ownerId)throw Error('remote owner/scope refused')
const hash=b=>createHash('sha256').update(b).digest('hex'),runCommand=promisify(execFile),sleep=ms=>new Promise(r=>setTimeout(r,ms))
const self=new URL(import.meta.url).pathname,node=join(root,'tools/cua_node/bin/node'),launcher=join(root,'tools/cua_node/lib/node_modules/@oai/cua-repl/bin/cua-repl.mjs'),cli=join(root,'tools/CodexCLI.app/Contents/MacOS/codex'),helperHome=join(root,'codex-home'),helperApp=join(helperHome,'computer-use/Codex Computer Use.app'),helperPath=join(helperApp,'Contents/MacOS/SkyComputerUseService'),notifier=join(helperApp,'Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient')
for(const [path,sha]of [[node,'a90d52ad9b963c1c645f82e41909039510dd8958b8fc52b080a5ef5e8bbea0e1'],[launcher,'992174a5e637645aeb444adfdb1bae688e997bb84d7db07532f68e358e60f278'],[cli,'1afb28c01d7d49e892bd75f11076b10f1451e34e0ee308a95e5ab7f69f9c84fe'],[notifier,'4861d29eb73f6f71a5a82dc94fc7c696d34e8cd6493f1932f6ba7b51f6448cf5']])if(hash(readFileSync(path))!==sha)throw Error('reviewed runtime changed')
const nativeProcesses=()=>execFileSync('/bin/ps',['-axo','pid=,ppid=,pgid=,comm='],{encoding:'utf8',timeout:5000}).split('\n').flatMap(line=>{const m=line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);return m&&/SkyComputerUse(Service|Client)$/.test(m[4])?[{pid:+m[1],ppid:+m[2],pgid:+m[3],path:m[4]}]:[]})

if(childMode){
 const run=process.argv[3]
 if(!new RegExp('^'+root+'/evidence/notifier-lifecycle-[A-Za-z0-9]{6}$').test(run))throw Error('child run scope refused')
 const admission=JSON.parse(readFileSync(join(run,'admission.json')))
 if(admission.owner!==ownerId||admission.sourceSha256!==hash(readFileSync(self))||!/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(admission.origin))throw Error('child admission refused')
 const post=async(path,body)=>{const response=await fetch(admission.origin+path,{method:'POST',headers:{'content-type':'application/json','x-owned-run':admission.token},body:JSON.stringify(body),signal:AbortSignal.timeout(55000)});const value=await response.json();if(!response.ok)throw Error(value.error??'owned relay refused');return value}
 if(process.argv[2]==='--notify'){
  const raw=process.argv[4];if(typeof raw!=='string'||Buffer.byteLength(raw)>65536)throw Error('notify payload bound refused')
  const result=await post('/native-notify',{raw,pid:process.pid,parentPid:process.ppid})
  if(!result.nativeCommandExitedNormally)process.exitCode=1
 }else{
  createInterface({input:process.stdin}).on('line',async line=>{
   let m;try{m=JSON.parse(line)}catch{return}
   try{const value=await post('/relay',{method:m.method,params:m.params??{},hasId:m.id!==undefined});if(m.id!==undefined)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,...value})+'\n')}
   catch(e){if(m.id!==undefined)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:e.message}})+'\n')}
  })
 }
}else{
 const typeOnce=process.argv.includes('--type-once')
 const sharedSocket=process.argv.includes('--shared-socket'),ordinarySocket=join(homedir(),'Library/Group Containers/2DC432GLL2.com.openai.sky.CUAService/IPC/computeruse.sock')
 const run=mkdtempSync(join(root,'evidence/notifier-lifecycle-')),home=join(run,'home'),state=join(run,'state'),stop=join(root,'fixture/stop'),fixturePath=join(root,'fixture/ClaudeDriverInputFixture.app/Contents/MacOS/InputFixture')
 for(const dir of [home,state])mkdirSync(dir,{mode:0o700})
 process.env.CLAUDE_DRIVER_STATE_DIR=state
 writeFileSync(join(state,'ui-quarantine.json'),JSON.stringify({blocked:false,scope:'owned remote disposable fixture notifier test only'}),{flag:'wx',mode:0o600})
 const {openPrivateInputService,inspectPrivateInputRuntime}=await import('../../lib/private-input-service.mjs')
 const payload=('NATIVE_NOTIFIER_INPUT_'+Date.now()+'_').padEnd(64,'q')
 const report={run,startedAt:new Date().toISOString(),scope:typeOnce?'one-owned-helper-single-input-native-notify':'one-owned-helper-readonly-native-notify',sourceSha256:hash(readFileSync(self)),typeOnce,sharedSocket,inputRequested:false,inputAttempts:0,inputIntent:typeOnce?{characters:payload.length,utf8Bytes:Buffer.byteLength(payload),sha256:hash(payload),attempts:1}:null,realInferenceRequested:false,nativeReceiverReceiptQualified:false,notifierCalls:[],relayCalls:[],providerRequests:[],ok:false}
 writeFileSync(join(run,'source.mjs'),readFileSync(self),{flag:'wx',mode:0o600})
 const save=()=>writeFileSync(join(run,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600})
 const clean={HOME:homedir(),USER:'theo',LOGNAME:'theo',PATH:'/usr/bin:/bin:/usr/sbin:/sbin',TMPDIR:join(root,'tmp'),SSH_CONNECTION:process.env.SSH_CONNECTION}
 const candidateSource=join(root,'harness/src/claude-driver/test/remote-input/notifier-candidates-e4c3178e1958.swift'),candidateExe=join(run,'candidate-audit')
 if(hash(readFileSync(candidateSource))!=='e4c3178e1958449d79ee90a75a2d06aa77953c4e9a6c1a155c8c01295db954b4')throw Error('reviewed candidate audit changed')
 const candidates=()=>JSON.parse(execFileSync(candidateExe,[],{env:clean,encoding:'utf8',timeout:5000})).candidates
 const ordinaryEndpointExists=()=>{try{lstatSync(ordinarySocket);return true}catch(e){if(e.code==='ENOENT')return false;throw e}}
 const grantPath=join(root,'evidence/acquire-1792351052633.request-1.response.json'),grant=JSON.parse(readFileSync(grantPath)),original=JSON.parse(readFileSync(grantPath.replace('.response.json','.pending.json')))
 const exactGrant=p=>p.mode==='form'&&p.message==='Allow Computer Use to use "Claude Driver Input Fixture"?'&&p._meta?.connector_id==='computer-use'&&p._meta?.riskLevel==='low'&&(p._meta?.tool_name==='get_app_state'||typeOnce&&p._meta?.tool_name==='type_text')&&JSON.stringify(p._meta?.tool_params)===JSON.stringify({app:'dev.taylor.claudedriver.inputfixture'})
 if(grant.source!=='Taylor via current Codex chat'||grant.action!=='accept'||grant.requestSha256!==hash(JSON.stringify(original.params))||original.params._meta?.tool_name!=='get_app_state'||!exactGrant(original.params))throw Error('exact human fixture grant refused')
 const hook=readFileSync(new URL('./host-stop-hook.json',import.meta.url)),review=JSON.parse(readFileSync(join(root,'evidence/host-hook-human-review-20261018.json')))
 if(hash(hook)!=='fbf85b86181f2c7edff5591fb0bdb82a58f88d4666173d46e9b847f14308b017'||review.hookDefinitionSha256!==hash(hook)||review.source!=='Taylor via current Codex chat'||review.purpose!=='isolated-cua-stop-hook-diagnostic'||review.action!=='allow-one-off-test')throw Error('exact reviewed hook refused')
 writeFileSync(join(home,'hooks.json'),hook,{flag:'wx',mode:0o600})
 const acquire='var fixture = await cua.getApp('+JSON.stringify(join(root,'fixture/ClaudeDriverInputFixture.app'))+');'
 const inputCode='await fixture.typeText('+JSON.stringify(payload)+'); await fixture.getAXState();'
 let fixture,fixtureExit,service,mcp,mcpExit,peer,server,host,hostExit,hostTimer,context,notified=false,acquired=false,stopCount=0,notifierDone
 const notificationDone=new Promise(resolve=>{notifierDone=resolve})
 const nativeAdmission=()=>{
  const rows=nativeProcesses(),list=candidates(),p=list[0]
  if(rows.length!==1||rows[0].pid!==service.pid||rows[0].path!==helperPath||list.length!==1||p.pid!==service.pid||!p.matchesOwnedBundlePath||!p.matchesOwnedExecutablePath||p.terminated)throw Error('one exact owned running-helper candidate not established')
  const lsof=execFileSync('/usr/sbin/lsof',['-nP','-a','-p',String(service.pid),'-U'],{encoding:'utf8',timeout:5000})
  if(!lsof.split('\n').some(line=>line.trim().split(/\s+/)[1]===String(service.pid)&&line.trim().endsWith(' '+service.binding.socketPath)))throw Error('exact helper socket owner unavailable')
  return {at:new Date().toISOString(),rows,candidates:list,socketPath:service.binding.socketPath,socketOwnerVerified:true}
 }
 try{
  report.before={snapshot:audit(root),nativeProcesses:nativeProcesses()};save()
  if(report.before.nativeProcesses.length||report.before.snapshot.fixtureProcessCurrent||existsSync(stop))throw Error('empty native/fixture baseline required')
  if(sharedSocket&&ordinaryEndpointExists())throw Error('ordinary socket already exists; do not replace or unlink it for this test')
  await runCommand('/usr/bin/swiftc',['-module-cache-path',join(root,'tmp/notifier-candidates-cache'),candidateSource,'-o',candidateExe],{env:clean,timeout:45000,maxBuffer:65536})
  report.before.candidates=candidates();if(report.before.candidates.length)throw Error('running helper candidate baseline not empty')
  fixture=spawn(fixturePath,[],{env:clean,stdio:'ignore'});fixture.on('exit',(code,signal)=>{fixtureExit={code,signal}})
  for(let i=0;i<40;i++){const s=audit(root);if(s.fixtureProcessCurrent&&s.fixtureState.pid===fixture.pid&&s.fixtureState.characters===0)break;if(i===39)throw Error('owned empty fixture not ready');await sleep(100)}
  if(sharedSocket){
   const runtime={...await inspectPrivateInputRuntime({resourceRoot:join(root,'tools/cua_node'),helperApp,cli}),codexHome:helperHome}
   const helper=spawn(runtime.files.helper,[],{env:{...clean,CODEX_HOME:helperHome,CODEX_CLI_PATH:cli},stdio:['ignore','ignore','pipe']});let helperExit,helperError,closePromise;report.sharedHelperStderrBytes=0
   helper.on('error',e=>{helperError=e.message;report.sharedHelperSpawnError=e.message});helper.on('exit',(code,signal)=>{helperExit={code,signal}});helper.stderr.on('data',b=>{report.sharedHelperStderrBytes+=b.length})
   service={pid:helper.pid,binding:{version:1,node:runtime.files.node,launcher:runtime.files.launcher,resourceRoot:runtime.resourceRoot,cli,codexHome:helperHome,socketPath:ordinarySocket,startupDisabledApp:join(run,'startup-disabled.app')},close:()=>closePromise??=(async()=>{for(let i=0;i<50&&!helperExit&&!helperError;i++)await sleep(100);let forcedTermination=false;if(!helperExit&&!helperError){forcedTermination=true;helper.kill('SIGTERM');for(let i=0;i<30&&!helperExit;i++)await sleep(100)}return {helperPid:helper.pid,helperExit:helperExit??null,nativeHelperExited:!!helperExit,forcedTermination}})()}
   for(let i=0;i<80;i++){if(helperExit||helperError)throw Error('owned ordinary helper exited before readiness');if(existsSync(ordinarySocket)){const s=lstatSync(ordinarySocket);if(!s.isSocket()||s.isSymbolicLink()||s.uid!==process.getuid())throw Error('ordinary socket identity refused');break}if(i===79)throw Error('ordinary socket startup timeout');await sleep(100)}
  }else service=await openPrivateInputService({evidenceDir:run},{inspect:async()=>({...await inspectPrivateInputRuntime({resourceRoot:join(root,'tools/cua_node'),helperApp,cli}),codexHome:helperHome})})
  report.helper={pid:service.pid,socketPath:service.binding.socketPath};
  for(let i=0;i<20;i++){try{report.helperAdmission=nativeAdmission();break}catch(e){if(i===19)throw e;await sleep(100)}}
  save()
  const transport=new EventEmitter(),env={...clean,CODEX_HOME:helperHome,CODEX_CLI_PATH:cli,CUA_REPL_NODE_REPL_PATH:join(root,'tools/cua_node/bin/node_repl'),CUA_REPL_ENABLED_SURFACES:'computer',NODE_REPL_NODE_MODULE_DIRS:join(root,'tools/cua_node/lib/node_modules'),NODE_REPL_TRUSTED_CODE_PATHS:join(root,'tools/cua_node/lib/node_modules'),NODE_PATH:join(root,'tools/cua_node/lib/node_modules'),SKY_CUA_SERVICE_NATIVE_PIPE_PATH:service.binding.socketPath,SKY_CUA_SERVICE_PATH:service.binding.startupDisabledApp}
  if(sharedSocket)delete env.SKY_CUA_SERVICE_NATIVE_PIPE_PATH
  mcp=spawn(node,[launcher],{env,cwd:run,detached:true,stdio:['pipe','pipe','pipe']});report.mcpPid=mcp.pid
  createInterface({input:mcp.stdout}).on('line',line=>transport.emit('message',line));mcp.stderr.on('data',b=>{report.mcpStderrBytes=(report.mcpStderrBytes??0)+b.length});mcp.stdin.on('error',()=>{});mcp.on('error',e=>transport.emit('error',e));mcp.on('exit',(code,signal)=>{mcpExit={code,signal};transport.emit('close','owned MCP closed')})
  transport.send=raw=>mcp.stdin.write(JSON.stringify({jsonrpc:'2.0',...JSON.parse(raw)})+'\n');transport.close=()=>mcp.stdin.end();peer=new JsonRpcPeer(transport)
  peer.on('request',request=>{if(request.method==='elicitation/create'&&exactGrant(request.params)){report.grantRelays??=[];report.grantRelays.push({receipt:grantPath,requestSha256:hash(JSON.stringify(request.params))});request.respond({action:'accept',content:{}})}else{report.refusedNativeRequest=request.method;request.fail(-32601,'outside exact existing fixture grant')}})
  const token=hash(Buffer.from(run+Date.now())),hostEvents=[]
  server=createServer(async(req,res)=>{
   try{
    const chunks=[];let size=0;for await(const b of req){size+=b.length;if(size>2*1024*1024)throw Error('body limit exceeded');chunks.push(b)}
    let body=Buffer.concat(chunks);if(req.headers['content-encoding']==='gzip')body=zlib.gunzipSync(body,{maxOutputLength:2*1024*1024});if(req.headers['content-encoding']==='zstd')body=zlib.zstdDecompressSync(body,{maxOutputLength:2*1024*1024});const input=JSON.parse(body)
    if(req.method!=='POST'||req.headers.authorization)throw Error('unexpected method/auth')
    if(['/relay','/native-notify'].includes(req.url)){
     if(req.headers['x-owned-run']!==token)throw Error('owned relay admission refused')
     if(req.url==='/native-notify'){
      if(notified||!acquired||typeOnce&&!report.inputVerified||!context||typeof input.raw!=='string'||Buffer.byteLength(input.raw)>65536)throw Error('notifier scope refused')
      const payload=JSON.parse(input.raw);if(payload.type!=='agent-turn-complete'||payload['thread-id']!==context.thread_id||payload['turn-id']!==context.turn_id)throw Error('actual notifier IDs do not match native acquisition')
      notified=true;const row={at:new Date().toISOString(),wrapperPid:input.pid,wrapperParentPid:input.parentPid,payload,admission:nativeAdmission(),before:audit(root),environment:{codexHome:helperHome,nativePipeOverride:null,nativeServiceApp:null},exactRawSha256:hash(input.raw)};report.notifierCalls.push(row);save()
      try{const r=await runCommand(notifier,['turn-ended',input.raw],{cwd:run,env:{...clean,CODEX_HOME:helperHome},timeout:10000,maxBuffer:65536});row.exit={code:0,signal:null};row.stdout=r.stdout;row.stderr=r.stderr}catch(e){row.exit={code:e.code??null,signal:e.signal??null,killed:!!e.killed};row.stdout=e.stdout??'';row.stderr=e.stderr??''}
      row.after=audit(root);row.helperStillSame=service.pid===row.after.helperProcesses[0]?.pid&&row.after.helperProcesses.length===1&&!mcpExit;row.finishedAt=new Date().toISOString();save();notifierDone();res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({nativeCommandExitedNormally:row.exit.code===0}));return
     }
     const {method,params,hasId}=input
     if(!['initialize','notifications/initialized','tools/list','ping','tools/call','notifications/cancelled'].includes(method))throw Error('relay protocol refused')
     if(method==='tools/call'){
      const a=params.arguments??{},meta=params._meta?.['x-codex-turn-metadata']
      if(params.name==='js'){
       const valid=meta&&typeof meta.thread_id==='string'&&meta.session_id===meta.thread_id&&typeof meta.turn_id==='string'
       const isAcquire=!acquired&&!report.relayCalls.some(x=>x.name==='js')&&a.code===acquire
       const isInput=typeOnce&&acquired&&!report.inputAttempts&&a.code===inputCode&&valid&&meta.thread_id===context?.thread_id&&meta.turn_id===context?.turn_id
       if(!valid||!isAcquire&&!isInput)throw Error('exact fixture operation refused')
       if(isAcquire)context=meta
       if(isInput){const before=audit(root);if(!before.fixtureProcessCurrent||before.fixtureState.pid!==fixture.pid||before.fixtureState.characters!==0)throw Error('single input requires the unchanged empty owned fixture');report.beforeInput=before;report.inputRequested=true;report.inputAttempts++}
      }else if(params.name==='turn_ended'){
       if(!context||a.hook_event_name!=='Stop'||a.session_id!==context.session_id||a.turn_id!==context.turn_id||stopCount++)throw Error('exact Stop context refused')
      }else throw Error('unapproved native tool refused')
      const row={at:new Date().toISOString(),name:params.name,arguments:a,metadata:params._meta};report.relayCalls.push(row)
      const value=await peer.request(method,params,{timeoutMs:30000}),text=(value.content??[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');row.isError=!!value.isError;row.resultBytes=Buffer.byteLength(text);row.resultSha256=hash(text);row.exactFixtureObserved=text.includes('Claude Driver Input Teardown Fixture')&&text.includes('claude-driver-test-editor');row.snapshot=audit(root)
      if(params.name==='js'&&a.code===acquire)acquired=!value.isError&&row.exactFixtureObserved&&row.snapshot.fixtureProcessCurrent&&row.snapshot.fixtureState.pid===fixture.pid&&row.snapshot.fixtureState.characters===0
      if(params.name==='js'&&a.code===inputCode){const s=row.snapshot.fixtureState;report.inputVerified=!value.isError&&row.exactFixtureObserved&&row.snapshot.fixtureProcessCurrent&&s.pid===fixture.pid&&s.characters===payload.length&&s.utf8Bytes===Buffer.byteLength(payload)&&s.sha256===hash(payload);report.afterInput=row.snapshot}
      save();res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({result:value}));return
     }
     const forwarded=method==='initialize'?{...params,capabilities:{...params.capabilities,elicitation:{}}}:params
     const value=hasId?await peer.request(method,forwarded,{timeoutMs:15000}):peer.notify(method,forwarded)
     res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({result:value??{}}));return
    }
    if(req.url!=='/v1/responses'||report.providerRequests.length>=(typeOnce?3:2))throw Error('provider scope refused')
    const index=report.providerRequests.length,fn=(input.tools??[]).find(t=>t.type==='function'&&t.name==='mcp__cua_repl__js'),ns=(input.tools??[]).find(t=>t.type==='namespace'&&t.name==='mcp__cua_repl'&&t.tools?.some(t=>t.name==='js'));report.providerRequests.push({index,bytes:body.length,sha256:hash(body),authorizationPresent:false,toolAdmitted:!!(fn||ns)})
    if(index===0&&!fn&&!ns)throw Error('actual native MCP missing; no synthetic call dispatched')
    if(index===1&&!acquired)throw Error('exact read-only acquisition not verified')
    if(index===2&&!report.inputVerified)throw Error('exact single-input effect not verified; no retry')
    const toolStep=index===0||typeOnce&&index===1
    if(toolStep&&!fn&&!ns)throw Error('actual native MCP missing at operation boundary')
    const text=typeOnce?'NOTIFIER_SINGLE_INPUT_COMPLETE':'NOTIFIER_READONLY_COMPLETE',item=toolStep?{id:'fc_native_'+index,type:'function_call',call_id:'call_native_'+index,...fn?{name:fn.name}:{name:'js',namespace:ns.name},arguments:JSON.stringify({code:index===0?acquire:inputCode,title:index===0?'Inspect owned remote fixture':'Type once in disposable fixture',timeout_ms:20000}),status:'completed'}:{id:'msg_final',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]},response={id:'resp_native_'+index,object:'response',created_at:Math.floor(Date.now()/1000),model:'notifier-fixture',status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}}
    res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});const event=(type,v)=>res.write('event: '+type+'\ndata: '+JSON.stringify({type,...v})+'\n\n');event('response.created',{response:{...response,status:'in_progress',output:[]}});event('response.output_item.added',{output_index:0,item:{...item,status:'in_progress',content:[]}})
    if(toolStep)event('response.function_call_arguments.done',{item_id:item.id,output_index:0,arguments:item.arguments});else{event('response.content_part.added',{item_id:item.id,output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}});event('response.output_text.delta',{item_id:item.id,output_index:0,content_index:0,delta:text});event('response.output_text.done',{item_id:item.id,output_index:0,content_index:0,text})}event('response.output_item.done',{output_index:0,item});event('response.completed',{response});res.end();save()
   }catch(e){report.serverErrors??=[];report.serverErrors.push({path:req.url,message:e.message});save();if(!res.headersSent)res.writeHead(403,{'content-type':'application/json'}).end(JSON.stringify({error:e.message}));else res.end()}
  })
  server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port
  writeFileSync(join(run,'admission.json'),JSON.stringify({owner:ownerId,sourceSha256:report.sourceSha256,origin,token}),{flag:'wx',mode:0o600})
  writeFileSync(join(home,'config.toml'),'notify = '+JSON.stringify([node,self,'--notify',run])+'\nmodel = "notifier-fixture"\nmodel_provider = "notifier_fixture"\n[model_providers.notifier_fixture]\nname = "Owned deterministic notifier fixture"\nbase_url = '+JSON.stringify(origin+'/v1')+'\nwire_api = "responses"\nrequires_openai_auth = false\nsupports_websockets = false\nrequest_max_retries = 0\nstream_max_retries = 0\n[mcp_servers.cua_repl]\ncommand = '+JSON.stringify(node)+'\nargs = '+JSON.stringify([self,'--proxy',run])+'\nstartup_timeout_sec = 15\n[analytics]\nenabled = false\n',{flag:'wx',mode:0o600})
  host=spawn(cli,['exec','--dangerously-bypass-hook-trust','--strict-config','--ephemeral','--skip-git-repo-check','--ignore-rules','--sandbox','read-only','--json',typeOnce?'Owned disposable fixture lifecycle test: one exact synthetic input, no shell, files, retries or other apps.':'Read-only owned fixture lifecycle test. No input, shell, files or other apps.'],{env:{...clean,CODEX_HOME:home},cwd:run,detached:true,stdio:['ignore','pipe','pipe']});report.hostPid=host.pid
  createInterface({input:host.stdout}).on('line',line=>{try{hostEvents.push(JSON.parse(line))}catch{report.invalidHostJson=true}});host.stderr.on('data',b=>{report.hostStderr=((report.hostStderr??'')+b).slice(-65536)});host.on('exit',(code,signal)=>{hostExit={code,signal}});hostTimer=setTimeout(()=>{report.hostTimeout=true;try{process.kill(-host.pid,'SIGTERM')}catch{}},60000)
  await once(host,'close');clearTimeout(hostTimer);report.hostExit=hostExit;report.hostEvents=hostEvents;report.context=context;save()
  let waitTimer;await Promise.race([notificationDone,new Promise(resolve=>{waitTimer=setTimeout(resolve,20000)})]);clearTimeout(waitTimer)
  report.settled=[];const started=Date.now();for(const delay of [0,1000,5000]){await sleep(Math.max(0,started+delay-Date.now()));report.settled.push({elapsedMs:Date.now()-started,snapshot:audit(root),mcpAlive:!mcpExit})}
  const expectedText=typeOnce?payload:'',n=report.notifierCalls[0];report.notifierCommandQualified=report.notifierCalls.length===1&&n.exit?.code===0&&n.helperStillSame&&report.hostExit?.code===0&&hostEvents.some(x=>x.type==='turn.completed')&&acquired&&(!typeOnce||report.inputVerified&&report.inputAttempts===1)&&stopCount===1&&report.relayCalls.length===(typeOnce?3:2)&&report.relayCalls.every(x=>!x.isError)&&!report.serverErrors?.length
  report.releaseQualified=report.notifierCommandQualified&&n.before.helperKeyboardFilters.length>0&&[n.after,...report.settled.map(x=>x.snapshot)].every(x=>x.helperProcesses.length===1&&x.helperProcesses[0].pid===service.pid&&x.helperKeyboardFilters.length===0&&x.fixtureProcessCurrent&&x.fixtureState.pid===fixture.pid&&x.fixtureState.characters===expectedText.length&&x.fixtureState.sha256===hash(expectedText))&&report.settled.every(x=>x.mcpAlive)
  report.combinedCleanupQualified=report.notifierCommandQualified&&report.afterInput?.helperKeyboardFilters.length>0&&[n.after,...report.settled.map(x=>x.snapshot)].every(x=>x.helperProcesses.length===1&&x.helperProcesses[0].pid===service.pid&&x.helperKeyboardFilters.length===0&&x.fixtureProcessCurrent&&x.fixtureState.pid===fixture.pid&&x.fixtureState.characters===expectedText.length&&x.fixtureState.sha256===hash(expectedText))&&report.settled.every(x=>x.mcpAlive)
  report.ok=report.releaseQualified||report.combinedCleanupQualified
 }catch(e){report.error={category:e.category,message:e.message};report.ok=false}
 finally{
  clearTimeout(hostTimer);if(host&&!hostExit){report.forcedHostCleanup=true;try{process.kill(-host.pid,'SIGTERM')}catch{}}
  peer?.close();if(mcp)for(let i=0;i<50&&!mcpExit;i++)await sleep(100);report.mcpExit=mcpExit??null
  if(mcp&&!mcpExit){report.forcedMcpCleanup=true;try{process.kill(-mcp.pid,'SIGTERM')}catch{};for(let i=0;i<30&&!mcpExit;i++)await sleep(100)}
  report.mcpExit=mcpExit??null
  if(service)try{report.closeReceipt=await service.close()}catch(e){report.cleanupError=e.message;report.ok=false}
  if(fixture&&!fixtureExit){writeFileSync(stop,'owned fixture stop\n',{flag:'wx'});for(let i=0;i<100&&!fixtureExit;i++)await sleep(100);if(fixtureExit)unlinkSync(stop)}
  report.fixtureExit=fixtureExit??null;server?.closeAllConnections();server?.close();report.final={snapshot:audit(root),nativeProcesses:nativeProcesses(),...(sharedSocket?{ordinarySocketPresent:existsSync(ordinarySocket)}:{})};report.finishedAt=new Date().toISOString()
  report.ok=report.ok&&mcpExit?.code===0&&fixtureExit?.code===0&&report.closeReceipt?.nativeHelperExited&&report.closeReceipt?.helperExit?.code===0&&!report.closeReceipt?.forcedTermination&&!report.final.nativeProcesses.length&&!report.final.snapshot.fixtureProcessCurrent;save()
 }
 console.log(JSON.stringify({run,ok:report.ok,error:report.error,typeOnce,sharedSocket,inputVerified:report.inputVerified,inputAttempts:report.inputAttempts,notifierCommandQualified:report.notifierCommandQualified,releaseQualified:report.releaseQualified,notifierCalls:report.notifierCalls.length,filterCounts:report.notifierCalls.map(x=>({before:x.before.helperKeyboardFilters.length,after:x.after?.helperKeyboardFilters.length,exit:x.exit,helperStillSame:x.helperStillSame})),settled:report.settled?.map(x=>({elapsedMs:x.elapsedMs,filters:x.snapshot.helperKeyboardFilters.length,mcpAlive:x.mcpAlive})),closeReceipt:report.closeReceipt,mcpExit:report.mcpExit,fixtureExit:report.fixtureExit,remainingNative:report.final.nativeProcesses.length,serverErrors:report.serverErrors}));if(!report.ok)process.exitCode=1
}
