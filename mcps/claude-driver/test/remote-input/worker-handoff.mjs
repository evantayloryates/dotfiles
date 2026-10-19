// Manual integration gate: actual Tier C worker + bundled app-server, but a
// harmless MCP fixture and deterministic localhost provider. No CUA, helper,
// inference, account credentials or hook-trust override. Keep failure evidence.
import {createServer} from 'node:http'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import * as zlib from 'node:zlib'
import {hostname,homedir} from 'node:os'
const base=process.argv[2]
if(!base)throw Error('Usage: worker-handoff.mjs <owned evidence parent>')
const recordNotify=process.argv.includes('--record-notify'),recorderIndex=process.argv.indexOf('--notify-recorder'),notifyRecorder=recorderIndex<0?null:process.argv[recorderIndex+1]
if(recordNotify){
 const owned='/Users/theo/.local/state/claude-driver/input-teardown-20261018'
 if(process.platform!=='darwin'||homedir()!=='/Users/theo'||hostname().split('.')[0]!=='theo-air'||!process.env.SSH_CONNECTION||base!==owned+'/evidence'||JSON.parse(readFileSync(join(owned,'owner.json'))).threadId!=='01a112b1-fbf6-7cb0-8228-ce3e6cb6112d'||!new RegExp('^'+owned+'/harness/src/claude-driver/test/remote-input/wrapper-host-routing-[a-f0-9]{12}\\.mjs$').test(notifyRecorder??''))throw Error('recording worker scope refused')
 if(!notifyRecorder.includes(createHash('sha256').update(readFileSync(notifyRecorder)).digest('hex').slice(0,12)))throw Error('recording notifier source changed')
}
mkdirSync(base,{recursive:true})
const root=mkdtempSync(join(resolve(base),'worker-handoff-'))
const home=join(root,'home'),state=join(root,'state'),backend=join(root,'backend')
for(const dir of [home,state,backend])mkdirSync(dir,{mode:0o700})
writeFileSync(join(state,'ui-quarantine.json'),JSON.stringify({blocked:false,scope:'synthetic MCP only; never starts native CUA'}))
const worker=fileURLToPath(new URL('../../src/scripts/tierc-worker.mjs',import.meta.url))
const cli=process.env.CLAUDE_DRIVER_TEST_CODEX_PATH||'/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex'
if(recordNotify&&createHash('sha256').update(readFileSync(cli)).digest('hex')!=='1afb28c01d7d49e892bd75f11076b10f1451e34e0ee308a95e5ab7f69f9c84fe')throw Error('reviewed worker CLI changed')
const launcher=join(root,'harmless-mcp.mjs'),envProof=join(root,'environment-proof.json')
const binding={version:1,node:process.execPath,launcher,resourceRoot:root,cli,codexHome:home,socketPath:join(root,'private.sock'),startupDisabledApp:join(root,'startup-disabled.app')}
writeFileSync(launcher,`import{createInterface}from'node:readline';import{writeFileSync}from'node:fs';
const emit=x=>console.log(JSON.stringify({jsonrpc:'2.0',...x}));
createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;let result;
if(r.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'harmless-private-binding-fixture',version:'1'}};
else if(r.method==='tools/list')result={tools:['js','js_reset','turn_ended'].map(name=>({name,description:'Harmless fixture. Does not evaluate JavaScript or access UI.',inputSchema:{type:'object',properties:{code:{type:'string'}},additionalProperties:true}}))};
else if(r.method==='tools/call'){
if(r.params.name!=='js'||r.params.arguments.code!=='PRIVATE_ENV_PROOF_ONLY'){emit({id:r.id,error:{code:-32602,message:'fixture intent refused'}});return}
const proof={pid:process.pid,ppid:process.ppid,SKY_CUA_SERVICE_NATIVE_PIPE_PATH:process.env.SKY_CUA_SERVICE_NATIVE_PIPE_PATH,SKY_CUA_SERVICE_PATH:process.env.SKY_CUA_SERVICE_PATH,CODEX_HOME:process.env.CODEX_HOME,CUA_REPL_ENABLED_SURFACES:process.env.CUA_REPL_ENABLED_SURFACES,hostMetadata:r.params._meta?.['x-codex-turn-metadata']??null};
writeFileSync(${JSON.stringify(envProof)},JSON.stringify(proof),{flag:'wx',mode:0o600});result={content:[{type:'text',text:'PRIVATE_ENV_VERIFIED'}]};
}else{emit({id:r.id,error:{code:-32601,message:'unsupported harmless fixture method'}});return}emit({id:r.id,result})});
`)
const report={scope:'actual-worker-bundled-backend-harmless-MCP',root,startedAt:new Date().toISOString(),nativeHelperRequested:false,nativeNotifierExecuted:false,recordNotify,notifyReceipts:[],providerRequests:[],sourceSha256:createHash('sha256').update(readFileSync(worker)).digest('hex'),fixtureSourceSha256:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex')}
writeFileSync(join(root,'source.mjs'),readFileSync(new URL(import.meta.url)),{flag:'wx',mode:0o600})
let notifyResolve;const notifyObserved=new Promise(resolve=>{notifyResolve=resolve})
const http=createServer(async(req,res)=>{
 try{
  const chunks=[];let bytes=0;for await(const b of req){bytes+=b.length;if(bytes>2*1024*1024)throw Error('request bound exceeded');chunks.push(b)}
  let data=Buffer.concat(chunks)
  if(req.headers['content-encoding']==='gzip')data=zlib.gunzipSync(data)
  if(req.headers['content-encoding']==='zstd')data=zlib.zstdDecompressSync(data)
  const input=JSON.parse(data)
  if(recordNotify&&req.url==='/notify-recording'){
   if(req.method!=='POST'||req.headers['x-fixture-run']!==root.split('/').at(-1)||req.headers.authorization){res.writeHead(403).end();return}
   report.notifyReceipts.push({receivedAt:new Date().toISOString(),...input});res.writeHead(200).end('recorded');notifyResolve();return
  }
  const step=report.providerRequests.length+1
  report.providerRequests.push({step,authorizationPresent:!!req.headers.authorization,tools:(input.tools??[]).map(t=>({type:t.type,name:t.name,tools:t.tools?.map(v=>v.name)}))})
  if(req.method!=='POST'||req.url!=='/v1/responses'||step>2){res.writeHead(404).end();return}
  const text='PRIVATE_WORKER_HANDOFF_OK',id='resp_fixture_'+step,itemId='msg_fixture_'+step
  const fn=(input.tools??[]).find(t=>t.type==='function'&&t.name==='mcp__cua_repl__js'),ns=(input.tools??[]).find(t=>t.type==='namespace'&&t.name==='mcp__cua_repl'&&t.tools?.some(x=>x.name==='js'))
  if(step===1&&!fn&&!ns)throw Error('actual harmless MCP tool missing; no synthetic call dispatched')
  const item=step===1?{id:'fc_fixture',type:'function_call',call_id:'call_fixture',...fn?{name:fn.name}:{name:'js',namespace:ns.name},arguments:JSON.stringify({code:'PRIVATE_ENV_PROOF_ONLY'}),status:'completed'}:{id:itemId,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]}
  const response={id,object:'response',created_at:Math.floor(Date.now()/1000),model:'handoff-fixture',status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}}
  res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'})
  const event=(type,value)=>res.write('event: '+type+'\ndata: '+JSON.stringify({type,...value})+'\n\n')
  event('response.created',{response:{...response,status:'in_progress',output:[]}})
  event('response.output_item.added',{output_index:0,item:{...item,status:'in_progress',content:[]}})
  if(step===1)event('response.function_call_arguments.done',{item_id:item.id,output_index:0,arguments:item.arguments})
  else{
   event('response.content_part.added',{item_id:itemId,output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}})
   event('response.output_text.delta',{item_id:itemId,output_index:0,content_index:0,delta:text})
   event('response.output_text.done',{item_id:itemId,output_index:0,content_index:0,text})
  }
  event('response.output_item.done',{output_index:0,item});event('response.completed',{response});res.end()
 }catch(error){report.providerError=error.message;res.writeHead(500).end()}
})
http.listen(0,'127.0.0.1');await once(http,'listening')
writeFileSync(join(home,'config.toml'),(recordNotify?'notify = '+JSON.stringify([process.execPath,notifyRecorder,'--notify-probe',root,'http://127.0.0.1:'+http.address().port+'/notify-recording'])+'\n':'')+'model = "handoff-fixture"\nmodel_provider = "handoff_fixture"\n[model_providers.handoff_fixture]\nname = "Harmless deterministic fixture"\nbase_url = '+JSON.stringify('http://127.0.0.1:'+http.address().port+'/v1')+'\nwire_api = "responses"\nrequires_openai_auth = false\nsupports_websockets = false\nrequest_max_retries = 0\nstream_max_retries = 0\n[analytics]\nenabled = false\n')
const env={HOME:process.env.HOME,USER:process.env.USER,LOGNAME:process.env.LOGNAME,PATH:'/usr/bin:/bin:/usr/sbin:/sbin',TMPDIR:process.env.TMPDIR||'/tmp',CODEX_HOME:home,CODEX_BRIDGE_CODEX_PATH:cli,CODEX_BRIDGE_STATE_DIR:backend,CLAUDE_DRIVER_STATE_DIR:state}
const child=spawn(process.execPath,[worker],{env,cwd:root,detached:true,stdio:['pipe','pipe','pipe']})
let output='',stderr=''
child.stdout.on('data',b=>{output=(output+b).slice(-1024*1024)})
child.stderr.on('data',b=>{stderr=(stderr+b).slice(-65536)})
child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({task:'Harmless MCP binding fixture only.',timeoutSec:30,inputService:binding}))
const timer=setTimeout(()=>{report.timeout=true;try{process.kill(-child.pid,'SIGKILL')}catch{}},60000)
try{
 const [code,signal]=await once(child,'exit');report.exit={code,signal};report.worker=JSON.parse(output)
 if(recordNotify&&!report.notifyReceipts.length){let waitTimer;await Promise.race([notifyObserved,new Promise(resolve=>{waitTimer=setTimeout(resolve,3000)})]);clearTimeout(waitTimer)}
 if(existsSync(envProof))report.environmentProof=JSON.parse(readFileSync(envProof))
 const proof=report.environmentProof
 report.ok=code===0&&report.providerRequests.length===2&&report.worker.result?.finalText==='PRIVATE_WORKER_HANDOFF_OK'&&report.worker.cleanup?.receipt?.archiveAcknowledged===true&&proof?.SKY_CUA_SERVICE_NATIVE_PIPE_PATH===binding.socketPath&&proof?.SKY_CUA_SERVICE_PATH===binding.startupDisabledApp&&proof?.CODEX_HOME===home&&proof?.CUA_REPL_ENABLED_SURFACES==='computer'
 if(recordNotify){const receipt=report.notifyReceipts[0],meta=proof?.hostMetadata;report.notifyQualified=report.notifyReceipts.length===1&&receipt.payload?.type==='agent-turn-complete'&&receipt.payload['thread-id']===meta?.thread_id&&receipt.payload['turn-id']===meta?.turn_id;report.notifyHasPrivatePipeBinding=receipt?.environment?.nativePipeOverride===binding.socketPath;report.ok=report.ok&&report.notifyQualified}
}catch(error){report.error=error.message;report.ok=false}
finally{
 clearTimeout(timer);if(!recordNotify)try{process.kill(-child.pid,'SIGTERM')}catch{}
 if(recordNotify){const{execFileSync}=await import('node:child_process');report.remainingOwnedGroup=execFileSync('/bin/ps',['-axo','pid=,ppid=,pgid=,comm='],{encoding:'utf8',timeout:5000}).split('\n').flatMap(line=>{const a=line.trim().split(/\s+/);return Number(a[2])===child.pid||report.notifyReceipts.some(x=>x.pid===Number(a[0]))?[{pid:Number(a[0]),ppid:Number(a[1]),pgid:Number(a[2]),path:a.slice(3).join(' ')}]:[]});report.ok=report.ok&&report.remainingOwnedGroup.length===0}
 http.closeAllConnections();http.close();report.stderr=stderr;report.finishedAt=new Date().toISOString()
 writeFileSync(join(root,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600})
 console.log(JSON.stringify({root,ok:report.ok,exit:report.exit,error:report.error,workerError:report.worker?.error,providerRequests:report.providerRequests.length,mcpAdmission:report.worker?.execution?.mcpAdmission,environmentProof:report.environmentProof,notifyQualified:report.notifyQualified,notifyHasPrivatePipeBinding:report.notifyHasPrivatePipeBinding,remainingOwnedGroup:report.remainingOwnedGroup?.length}))
}
process.exitCode=report.ok?0:1
