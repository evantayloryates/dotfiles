// Remote lease owner + actual worker/backend/MCP/helper. The provider and fixture
// stay outside the caller and owner groups when testing caller SIGKILL.
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
if(!['normal','caller-loss','double-owner-loss'].includes(mode))throw Error('unknown native gate mode')
const run=join(root,'evidence','owner-native-'+Date.now()),home=join(run,'home'),backend=join(run,'backend'),state=join(run,'state')
for(const p of [run,home,backend,state])mkdirSync(p,{recursive:true,mode:0o700})
process.env.CLAUDE_DRIVER_STATE_DIR=state
writeFileSync(join(state,'ui-quarantine.json'),JSON.stringify({blocked:false,scope:'authorized remote combined worker test'}))
const {ownedGroupMembers}=await import('../../lib/ui-lease-owner.mjs')
const {withLock}=await import('../../lib/state.mjs')
const moduleUrl=name=>new URL('../../lib/'+name,import.meta.url).href
const hash=b=>createHash('sha256').update(b).digest('hex')
const receiptPath=join(root,'evidence/acquire-1792351052633.request-1.response.json'),receipt=JSON.parse(readFileSync(receiptPath)),original=JSON.parse(readFileSync(receiptPath.replace('.response.json','.pending.json')))
const p=original.params
if(receipt.source!=='Taylor via current Codex chat'||receipt.action!=='accept'||receipt.requestSha256!==hash(JSON.stringify(p))||p.mode!=='form'||p.message!=='Allow Computer Use to use "Claude Driver Input Fixture"?'||p._meta?.connector_id!=='computer-use'||p._meta?.riskLevel!=='low'||p._meta?.tool_name!=='get_app_state'||JSON.stringify(p._meta?.tool_params)!==JSON.stringify({app:'dev.taylor.claudedriver.inputfixture'}))throw Error('exact existing read-only fixture test grant refused')
const policy=join(run,'fixture-policy.json')
writeFileSync(policy,JSON.stringify({apps:{session:['dev.taylor.claudedriver.inputfixture'],unknown:'deny'},commands:'deny',fileChanges:'deny',sandbox:'read-only',mcpRoster:'trim'}),{flag:'wx',mode:0o600})
const runtimeRoot=join(root,'tools/cua_node'),cli=join(root,'tools/CodexCLI.app/Contents/MacOS/codex'),helperApp=join(root,'codex-home/computer-use/Codex Computer Use.app')
const worker=fileURLToPath(new URL('../../scripts/tierc-worker.mjs',import.meta.url))
const report={run,mode,scope:'remote-ui-owner-native-readonly',startedAt:new Date().toISOString(),inputEventsRequested:0,realModelCallsRequested:0,hookTrustOverrideRequested:false,fixtureGrantReceipt:receiptPath,workerSha256:hash(readFileSync(worker)),harnessSha256:hash(readFileSync(new URL(import.meta.url))),providerRequests:[]}
writeFileSync(join(run,'owner-native-source.mjs'),readFileSync(new URL(import.meta.url)),{flag:'wx',mode:0o600})
let fixture,child,exit,stdout='',stderr='',http,timer,acquisitionVerified=false
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
 const ownerScript=join(run,'owner-entry.mjs'),callerScript=join(run,'caller.mjs')
 writeFileSync(ownerScript,`import{serveUiLeaseOwner}from${JSON.stringify(moduleUrl('ui-lease-owner.mjs'))};import{openPrivateInputService,inspectPrivateInputRuntime}from${JSON.stringify(moduleUrl('private-input-service.mjs'))};
 await serveUiLeaseOwner({openService:options=>openPrivateInputService(options,{inspect:async()=>({...await inspectPrivateInputRuntime(${JSON.stringify({resourceRoot:runtimeRoot,helperApp,cli})}),codexHome:${JSON.stringify(join(root,'codex-home'))}})})});`,{flag:'wx',mode:0o600})
 writeFileSync(callerScript,`import{withLock}from${JSON.stringify(moduleUrl('state.mjs'))};import{runOwnedUiLease}from${JSON.stringify(moduleUrl('ui-lease-owner.mjs'))};
 await withLock('ui-automation',async lockFd=>{try{const value=await runOwnedUiLease({payload:{task:'Authorized isolated read-only fixture acquisition.',timeoutSec:30},dir:${JSON.stringify(backend)},lockFd},{ownerScript:${JSON.stringify(ownerScript)}});console.log(JSON.stringify({ok:true,value}))}catch(e){console.log(JSON.stringify({ok:false,error:{category:e.category,message:e.message,detail:e.detail}}));process.exitCode=1}},{passKernelLock:true});`,{flag:'wx',mode:0o600})
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
    report.ownerIdentity=JSON.parse(readFileSync(join(backend,'ui-owner.json')))
    acquisitionVerified=outputs.length===2&&report.providerRequests[2].toolOutputs.at(-1).exactFixtureObserved&&report.afterAcquisition.helperProcesses.length===1&&report.afterAcquisition.helperProcesses[0].pid===report.ownerIdentity.helperPid&&report.afterAcquisition.fixtureProcessCurrent&&report.afterAcquisition.fixtureState.pid===fixture.pid&&report.afterAcquisition.fixtureState.characters===0
    if(!acquisitionVerified){report.acquisitionFailure='exact native result/owned helper/empty fixture not verified';res.writeHead(503).end();return}
    if(mode==='double-owner-loss'){
     const id=report.ownerIdentity,members=await ownedGroupMembers(id.ownerPid)
     if(!id.watchReady||![id.watcherPid,id.helperPid,id.workerPid].every(pid=>members.includes(pid))||members.includes(child.pid))throw Error('live owned group/watch readiness not verified')
     report.intentionalDoubleLoss={callerPid:child.pid,ownerPid:id.ownerPid,watcherPid:id.watcherPid,members,afterReadOnlyAcquisition:true}
     child.kill('SIGSTOP');process.kill(id.ownerPid,'SIGKILL');child.kill('SIGKILL');res.destroy();return
    }
    if(mode==='caller-loss'){
     report.intentionalCallerLoss={signal:'SIGKILL',callerPid:child.pid,ownerPid:report.ownerIdentity.ownerPid,afterReadOnlyAcquisition:true}
     child.kill('SIGKILL');res.destroy();return
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
 child=spawn(process.execPath,[callerScript],{env:{...cleanEnv,CODEX_HOME:home,CODEX_BRIDGE_CODEX_PATH:cli,CODEX_BRIDGE_STATE_DIR:backend,CLAUDE_DRIVER_STATE_DIR:state,CODEX_BRIDGE_POLICY:policy},cwd:run,detached:true,stdio:['pipe','pipe','pipe']})
 report.workerPid=child.pid
 child.stdout.on('data',b=>{stdout=(stdout+b).slice(-1024*1024)});child.stderr.on('data',b=>{stderr=(stderr+b).slice(-65536)});child.stdin.on('error',()=>{})
 child.stdin.end()
 timer=setTimeout(()=>{report.timeout=true;try{process.kill(-child.pid,'SIGKILL')}catch{}},60000)
 const [code,signal]=await once(child,'close');exit={code,signal};clearTimeout(timer)
 report.workerExit=exit
 if(stdout.trim())try{report.caller=JSON.parse(stdout);report.worker=report.caller.value?.worker}catch{report.invalidWorkerOutput=true}
 const ownerPath=join(backend,'ui-owner.json'),deadline=Date.now()+25000
 if(existsSync(ownerPath)){
  const id=JSON.parse(readFileSync(ownerPath)).ownerPid
  while((await ownedGroupMembers(id)).length&&Date.now()<deadline)await sleep(100)
  report.ownerFinal=JSON.parse(readFileSync(ownerPath));report.remainingOwnerMembers=await ownedGroupMembers(id)
  report.closeReceipt=report.ownerFinal.nativeInputService
 }
 const orphanPath=join(backend,'ui-owner-orphan.json')
 if(existsSync(orphanPath))report.orphan=JSON.parse(readFileSync(orphanPath))
 if(mode==='double-owner-loss'&&report.remainingOwnerMembers?.length===0){
  await withLock('ui-automation',async()=>{report.successorLockAcquired=true},{timeoutMs:2000})
 }
 report.afterClose=audit(root)
 report.hostTurnCompleted=report.worker?.result?.status==='completed'
 report.archiveAcknowledged=report.worker?.cleanup?.receipt?.archiveAcknowledged===true
 const closed=report.closeReceipt?.nativeHelperExited&&!report.closeReceipt.forcedTermination&&report.closeReceipt.helperExit.code===0&&report.afterClose.helperProcesses.length===0&&report.afterClose.helperKeyboardFilters.length===0&&report.afterClose.fixtureProcessCurrent&&report.afterClose.fixtureState.characters===0
 const expectedOutcome=mode==='normal'?code===0&&report.hostTurnCompleted&&report.archiveAcknowledged&&report.caller?.ok===true:signal==='SIGKILL'&&!report.hostTurnCompleted&&!report.archiveAcknowledged&&report.ownerFinal.cancelled===true
 const resourcesEmpty=report.afterClose.helperProcesses.length===0&&report.afterClose.helperKeyboardFilters.length===0&&report.afterClose.fixtureProcessCurrent&&report.afterClose.fixtureState.characters===0&&report.remainingOwnerMembers.length===0
 report.ok=mode==='double-owner-loss'?acquisitionVerified&&signal==='SIGKILL'&&!report.hostTurnCompleted&&!report.archiveAcknowledged&&resourcesEmpty&&report.orphan?.phase==='retired'&&report.orphan.inputAuditPassed===true&&report.orphan.originalWorkCompleted===false&&report.orphan.normalNativeExitVerified===false&&report.successorLockAcquired===true:acquisitionVerified&&closed&&expectedOutcome&&report.ownerFinal.closed===true&&report.ownerFinal.watchDisarmed===true&&report.ownerFinal.watchExit?.code===0&&report.remainingOwnerMembers.length===0
}catch(error){report.error={category:error.category,message:error.message};report.ok=false}
finally{
 clearTimeout(timer)
 if(child&&!exit){try{process.kill(-child.pid,'SIGTERM')}catch{};await sleep(1000)}
 http?.closeAllConnections();http?.close()
 if(fixture&&fixture.exitCode===null&&fixture.signalCode===null){
  writeFileSync(stop,'owned fixture stop\n',{flag:'wx'});let t
  report.fixtureExit=await Promise.race([once(fixture,'exit').then(([code,signal])=>({code,signal})),new Promise(resolve=>{t=setTimeout(()=>resolve({unverified:true}),10000)})]);clearTimeout(t)
  if(!report.fixtureExit.unverified)unlinkSync(stop)
 }
 report.final=audit(root);report.stderr=stderr;report.finishedAt=new Date().toISOString()
 if(report.final.helperProcesses.length||report.final.helperKeyboardFilters.length||report.final.fixtureProcessCurrent||report.fixtureExit?.code!==0)report.ok=false
 writeFileSync(join(run,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600})
 console.log(JSON.stringify({run,mode,ok:report.ok,error:report.error,cleanupError:report.cleanupError,acquisitionVerified,workerExit:report.workerExit,workerError:report.worker?.error,hostTurnCompleted:report.hostTurnCompleted,archiveAcknowledged:report.archiveAcknowledged,closeReceipt:report.closeReceipt,orphan:report.orphan,successorLockAcquired:report.successorLockAcquired,remainingHelpers:report.final.helperProcesses.length,remainingFilters:report.final.helperKeyboardFilters.length,fixtureExit:report.fixtureExit}))
}
process.exitCode=report.ok?0:1
