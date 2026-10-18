// Exact remote owner only: real private worker/backend/MCP/helper together.
// Deterministic localhost provider requests only read-only fixture acquisition.
// The existing human fixture grant is scoped through an isolated test policy;
// production targets, saved trust and native permissions are not modified.
import {spawn,execFileSync} from 'node:child_process'
import {once} from 'node:events'
import {createServer} from 'node:http'
import * as zlib from 'node:zlib'
import {mkdirSync,writeFileSync,readFileSync,existsSync,unlinkSync} from 'node:fs'
import {homedir,hostname} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {audit} from './native-audit.mjs'
const root='/Users/theo/.local/state/claude-driver/input-teardown-20261018'
if(process.platform!=='darwin'||hostname().split('.')[0]!=='theo-air'||homedir()!=='/Users/theo'||!process.env.SSH_CONNECTION||JSON.parse(readFileSync(join(root,'owner.json'))).threadId!=='01a112b1-fbf6-7cb0-8228-ce3e6cb6112d')throw Error('remote owner refused')
const mode=process.argv[2]||'normal'
if(!['normal','abort-after-acquire','timeout-after-acquire'].includes(mode))throw Error('unknown native gate mode')
const run=join(root,'evidence','worker-native-'+Date.now()),home=join(run,'home'),backend=join(run,'backend'),state=join(run,'state')
for(const p of [run,home,backend,state])mkdirSync(p,{recursive:true,mode:0o700})
process.env.CLAUDE_DRIVER_STATE_DIR=state
writeFileSync(join(state,'ui-quarantine.json'),JSON.stringify({blocked:false,scope:'authorized remote combined worker test'}))
const {inspectPrivateInputRuntime,openPrivateInputService}=await import('../../lib/private-input-service.mjs')
const hash=b=>createHash('sha256').update(b).digest('hex')
const receiptPath=join(root,'evidence/acquire-1792351052633.request-1.response.json'),receipt=JSON.parse(readFileSync(receiptPath)),original=JSON.parse(readFileSync(receiptPath.replace('.response.json','.pending.json')))
const p=original.params
if(receipt.source!=='Taylor via current Codex chat'||receipt.action!=='accept'||receipt.requestSha256!==hash(JSON.stringify(p))||p.mode!=='form'||p.message!=='Allow Computer Use to use "Claude Driver Input Fixture"?'||p._meta?.connector_id!=='computer-use'||p._meta?.riskLevel!=='low'||p._meta?.tool_name!=='get_app_state'||JSON.stringify(p._meta?.tool_params)!==JSON.stringify({app:'dev.taylor.claudedriver.inputfixture'}))throw Error('exact existing read-only fixture test grant refused')
const policy=join(run,'fixture-policy.json')
writeFileSync(policy,JSON.stringify({apps:{session:['dev.taylor.claudedriver.inputfixture'],unknown:'deny'},commands:'deny',fileChanges:'deny',sandbox:'read-only',mcpRoster:'trim'}),{flag:'wx',mode:0o600})
const runtimeRoot=join(root,'tools/cua_node'),cli=join(root,'tools/CodexCLI.app/Contents/MacOS/codex'),helperApp=join(root,'codex-home/computer-use/Codex Computer Use.app')
const worker=fileURLToPath(new URL('../../scripts/tierc-worker.mjs',import.meta.url))
const report={run,mode,scope:'remote-combined-private-worker-native-readonly',startedAt:new Date().toISOString(),inputEventsRequested:0,realModelCallsRequested:0,hookTrustOverrideRequested:false,fixtureGrantReceipt:receiptPath,workerSha256:hash(readFileSync(worker)),harnessSha256:hash(readFileSync(new URL(import.meta.url))),providerRequests:[]}
writeFileSync(join(run,'worker-native-source.mjs'),readFileSync(new URL(import.meta.url)),{flag:'wx',mode:0o600})
let fixture,service,child,exit,stdout='',stderr='',http,timer,acquisitionVerified=false
const stop=join(root,'fixture/stop'),sleep=ms=>new Promise(r=>setTimeout(r,ms))
try{
 report.before=audit(root)
 if(report.before.helperProcesses.length||report.before.fixtureProcessCurrent||existsSync(stop))throw Error('remote baseline not empty')
 const cleanEnv={HOME:homedir(),USER:'theo',LOGNAME:'theo',PATH:'/usr/bin:/bin:/usr/sbin:/sbin',TMPDIR:join(root,'tmp')}
 fixture=spawn(join(root,'fixture/ClaudeDriverInputFixture.app/Contents/MacOS/InputFixture'),[],{env:cleanEnv,stdio:'ignore'})
 for(let i=0;i<40;i++){
  const s=audit(root);if(s.fixtureProcessCurrent&&s.fixtureState.pid===fixture.pid&&s.fixtureState.characters===0)break
  if(i===39)throw Error('empty owned fixture not ready');await sleep(100)
 }
 service=await openPrivateInputService({evidenceDir:run},{inspect:()=>inspectPrivateInputRuntime({resourceRoot:runtimeRoot,helperApp,cli})})
 report.ready={helperPid:service.pid,socket:service.binding.socketPath,evidence:service.evidence}
 http=createServer(async(req,res)=>{
  try{
   let bytes=0;const chunks=[];for await(const b of req){bytes+=b.length;if(bytes>2*1024*1024)throw Error('provider request exceeds bound');chunks.push(b)}
   let data=Buffer.concat(chunks);if(req.headers['content-encoding']==='gzip')data=zlib.gunzipSync(data);if(req.headers['content-encoding']==='zstd')data=zlib.zstdDecompressSync(data)
   const input=JSON.parse(data),step=report.providerRequests.length+1
   const outputs=(input.input??[]).filter(x=>x.type==='function_call_output').map(x=>typeof x.output==='string'?x.output:JSON.stringify(x.output))
   report.providerRequests.push({step,authorizationPresent:!!req.headers.authorization,toolOutputs:outputs.map(text=>({bytes:Buffer.byteLength(text),sha256:hash(text),initialStateOmitted:text.includes('[omitted 1 text items'),exactFixtureObserved:text.includes('Claude Driver Input Teardown Fixture')&&text.includes('claude-driver-test-editor')})),tools:(input.tools??[]).map(t=>({type:t.type,name:t.name,tools:t.tools?.map(v=>v.name)}))})
   if(req.method!=='POST'||req.url!=='/v1/responses'||step>3){res.writeHead(404).end();return}
   if(step===3){
    report.afterAcquisition=audit(root)
    acquisitionVerified=outputs.length===2&&report.providerRequests[2].toolOutputs.at(-1).exactFixtureObserved&&report.afterAcquisition.helperProcesses.length===1&&report.afterAcquisition.helperProcesses[0].pid===service.pid&&report.afterAcquisition.fixtureProcessCurrent&&report.afterAcquisition.fixtureState.pid===fixture.pid&&report.afterAcquisition.fixtureState.characters===0
    if(!acquisitionVerified){report.acquisitionFailure='exact native result/owned helper/empty fixture not verified';res.writeHead(503).end();return}
    if(mode==='abort-after-acquire'){
     const group=pid=>Number(execFileSync('/bin/ps',['-p',String(pid),'-o','pgid='],{encoding:'utf8'}).trim())
     report.beforeAbortGroups={worker:group(child.pid),helper:group(service.pid)}
     if(report.beforeAbortGroups.worker!==child.pid||report.beforeAbortGroups.helper===child.pid)throw Error('owned worker/helper group separation unverified')
     report.intentionalAbort={signal:'SIGKILL',ownedWorkerGroup:child.pid,afterReadOnlyAcquisition:true,helperOutsideGroup:true}
     process.kill(-child.pid,'SIGKILL');res.destroy();return
    }
    if(mode==='timeout-after-acquire'){
     // Hold only this fixture provider response. The real worker's normal
     // 30-second turn deadline must interrupt/archive/disconnect its clients.
     report.providerHeldAfterAcquisition=true;return
    }
   }
   const id='resp_native_'+step,itemId='msg_native_'+step,text='COMBINED_NATIVE_READONLY_OK'
   const item=step<=2?{id:'fc_native_'+step,type:'function_call',call_id:'call_native_'+step,name:'js',namespace:'mcp__cua_repl',arguments:JSON.stringify({code:step===1?'var fixture = await cua.getApp('+JSON.stringify(join(root,'fixture/ClaudeDriverInputFixture.app'))+');':'nodeRepl.write(await fixture.getAXState());',title:step===1?'Acquire isolated input fixture':'Read fresh isolated fixture state',timeout_ms:20000}),status:'completed'}:{id:itemId,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]}
   const response={id,object:'response',created_at:Math.floor(Date.now()/1000),model:'native-fixture',status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}}
   res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'})
   const event=(type,value)=>res.write('event: '+type+'\ndata: '+JSON.stringify({type,...value})+'\n\n')
   event('response.created',{response:{...response,status:'in_progress',output:[]}});event('response.output_item.added',{output_index:0,item:{...item,status:'in_progress',content:[]}})
   if(step<=2)event('response.function_call_arguments.done',{item_id:item.id,output_index:0,arguments:item.arguments})
   else{event('response.content_part.added',{item_id:itemId,output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}});event('response.output_text.delta',{item_id:itemId,output_index:0,content_index:0,delta:text});event('response.output_text.done',{item_id:itemId,output_index:0,content_index:0,text})}
   event('response.output_item.done',{output_index:0,item});event('response.completed',{response});res.end()
  }catch(error){report.providerError=error.message;res.writeHead(500).end()}
 })
 http.listen(0,'127.0.0.1');await once(http,'listening')
 writeFileSync(join(home,'config.toml'),'model = "native-fixture"\nmodel_provider = "native_fixture"\n[model_providers.native_fixture]\nname = "Deterministic localhost native fixture"\nbase_url = '+JSON.stringify('http://127.0.0.1:'+http.address().port+'/v1')+'\nwire_api = "responses"\nrequires_openai_auth = false\nsupports_websockets = false\nrequest_max_retries = 0\nstream_max_retries = 0\n[analytics]\nenabled = false\n',{flag:'wx',mode:0o600})
 child=spawn(process.execPath,[worker],{env:{...cleanEnv,CODEX_HOME:home,CODEX_BRIDGE_CODEX_PATH:cli,CODEX_BRIDGE_STATE_DIR:backend,CLAUDE_DRIVER_STATE_DIR:state,CODEX_BRIDGE_POLICY:policy},cwd:run,detached:true,stdio:['pipe','pipe','pipe']})
 report.workerPid=child.pid
 child.stdout.on('data',b=>{stdout=(stdout+b).slice(-1024*1024)});child.stderr.on('data',b=>{stderr=(stderr+b).slice(-65536)});child.stdin.on('error',()=>{})
 child.stdin.end(JSON.stringify({task:'Authorized isolated read-only fixture acquisition; no typing or other app access.',timeoutSec:30,inputService:service.binding}))
 timer=setTimeout(()=>{report.timeout=true;try{process.kill(-child.pid,'SIGKILL')}catch{}},60000)
 const [code,signal]=await once(child,'exit');exit={code,signal};clearTimeout(timer)
 report.workerExit=exit
 if(stdout.trim())try{report.worker=JSON.parse(stdout)}catch{report.invalidWorkerOutput=true}
 // Mirror the production supervisor: reap only the exact owned worker group.
 try{process.kill(-child.pid,'SIGTERM')}catch{}
 report.closeReceipt=await service.close()
 report.afterClose=audit(root)
 report.hostTurnCompleted=report.worker?.result?.status==='completed'
 report.archiveAcknowledged=report.worker?.cleanup?.receipt?.archiveAcknowledged===true
 const closed=report.closeReceipt.nativeHelperExited&&!report.closeReceipt.forcedTermination&&report.closeReceipt.helperExit.code===0&&report.afterClose.helperProcesses.length===0&&report.afterClose.helperKeyboardFilters.length===0&&report.afterClose.fixtureProcessCurrent&&report.afterClose.fixtureState.characters===0
 const expectedOutcome=mode==='normal'?code===0&&report.hostTurnCompleted&&report.archiveAcknowledged&&report.worker?.result?.finalText==='COMBINED_NATIVE_READONLY_OK'&&report.worker?.result?.denied?.length===0:mode==='timeout-after-acquire'?code===0&&report.worker?.result?.status==='timeout'&&!report.hostTurnCompleted&&report.archiveAcknowledged&&report.providerHeldAfterAcquisition:signal==='SIGKILL'&&!report.hostTurnCompleted&&!report.archiveAcknowledged
 report.ok=acquisitionVerified&&closed&&expectedOutcome
}catch(error){report.error={category:error.category,message:error.message};report.ok=false}
finally{
 clearTimeout(timer)
 if(child&&!exit){try{process.kill(-child.pid,'SIGTERM')}catch{};await sleep(1000)}
 if(service)try{report.finalClose=await service.close()}catch(error){report.cleanupError=error.message;report.ok=false}
 http?.closeAllConnections();http?.close()
 if(fixture&&fixture.exitCode===null&&fixture.signalCode===null){
  writeFileSync(stop,'owned fixture stop\n',{flag:'wx'});let t
  report.fixtureExit=await Promise.race([once(fixture,'exit').then(([code,signal])=>({code,signal})),new Promise(resolve=>{t=setTimeout(()=>resolve({unverified:true}),10000)})]);clearTimeout(t)
  if(!report.fixtureExit.unverified)unlinkSync(stop)
 }
 report.final=audit(root);report.stderr=stderr;report.finishedAt=new Date().toISOString()
 if(report.final.helperProcesses.length||report.final.helperKeyboardFilters.length||report.final.fixtureProcessCurrent||report.fixtureExit?.code!==0)report.ok=false
 writeFileSync(join(run,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600})
 console.log(JSON.stringify({run,mode,ok:report.ok,error:report.error,cleanupError:report.cleanupError,acquisitionVerified,workerExit:report.workerExit,workerError:report.worker?.error,hostTurnCompleted:report.hostTurnCompleted,archiveAcknowledged:report.archiveAcknowledged,closeReceipt:report.closeReceipt,remainingHelpers:report.final.helperProcesses.length,remainingFilters:report.final.helperKeyboardFilters.length,fixtureExit:report.fixtureExit}))
}
process.exitCode=report.ok?0:1
