// Remote lease owner + actual worker/backend/MCP/helper. The provider and fixture
// stay outside the caller and owner groups when testing caller SIGKILL.
// Deterministic localhost provider requests only the exact owned fixture operations.
// The existing human fixture grant is scoped through an isolated test policy;
// production targets, saved trust and native permissions are not modified.
import {spawn,spawnSync,execFileSync} from 'node:child_process'
import {once} from 'node:events'
import {createServer} from 'node:http'
import * as zlib from 'node:zlib'
import {mkdirSync,writeFileSync,readFileSync,existsSync,unlinkSync} from 'node:fs'
import {homedir,hostname} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {audit} from './native-audit.mjs'
import {settleReceivingState} from './receiving-state.mjs'
const root='/Users/theo/.local/state/claude-driver/input-teardown-20261018'
if(process.platform!=='darwin'||hostname().split('.')[0]!=='theo-air'||homedir()!=='/Users/theo'||!process.env.SSH_CONNECTION||JSON.parse(readFileSync(join(root,'owner.json'))).threadId!=='01a112b1-fbf6-7cb0-8228-ce3e6cb6112d')throw Error('remote owner refused')
const mode=process.argv[2]||'normal'
if(!['normal','caller-loss','double-owner-loss','type-normal','cancel-input','concurrent-input','external-input','external-paste','type-long'].includes(mode))throw Error('unknown native gate mode')
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
const concurrent=mode==='concurrent-input',external=['external-input','external-paste'].includes(mode),paired=concurrent||external
const inputMode=['type-normal','cancel-input','concurrent-input','external-input','external-paste','type-long'].includes(mode),payload=('REMOTE_OWNED_INPUT_'+Date.now()+'_').padEnd(['cancel-input','type-long'].includes(mode)?4096:64,'x')
const secondPayload=('REMOTE_SECOND_INPUT_'+Date.now()+'_').padEnd(external?4096:64,'y'),combinedPayload=paired?payload+secondPayload:payload
const secondHome=join(run,'second-home'),secondBackend=join(run,'second-backend'),secondStarted=join(run,'second-started.json'),secondEntered=join(run,'second-entered.json'),secondState=join(run,'second-state')
if(paired)for(const p of [secondHome,secondBackend])mkdirSync(p,{mode:0o700})
if(external){mkdirSync(secondState,{mode:0o700});writeFileSync(join(secondState,'ui-quarantine.json'),JSON.stringify({blocked:false,scope:'authorized independent remote native client test'}),{flag:'wx',mode:0o600})}
const secondIntent={characters:secondPayload.length,utf8Bytes:Buffer.byteLength(secondPayload),sha256:hash(secondPayload),attempts:1}
const intent={characters:payload.length,utf8Bytes:Buffer.byteLength(payload),sha256:hash(payload),attempts:1}
if(inputMode)writeFileSync(join(run,'expected-input.json'),JSON.stringify({first:payload,second:paired?secondPayload:null}),{flag:'wx',mode:0o600})
if(inputMode)writeFileSync(join(run,'input-intent.json'),JSON.stringify(intent),{flag:'wx',mode:0o600})
const report={run,mode,scope:inputMode?'remote-ui-owner-native-input':'remote-ui-owner-native-readonly',startedAt:new Date().toISOString(),inputEventsPlanned:paired?2:inputMode?1:0,inputEventsRequested:0,realModelCallsRequested:0,hookTrustOverrideRequested:false,fixtureGrantReceipt:receiptPath,fixtureBinarySha256:hash(readFileSync(join(root,'fixture/ClaudeDriverInputFixture.app/Contents/MacOS/InputFixture'))),workerSha256:hash(readFileSync(worker)),harnessSha256:hash(readFileSync(new URL(import.meta.url))),providerRequests:[]}
report.receivingObserverSha256=hash(readFileSync(new URL('./receiving-state.mjs',import.meta.url)))
if(paired){report.second={providerRequests:[],intent:secondIntent};writeFileSync(join(run,'second-input-intent.json'),JSON.stringify(secondIntent),{flag:'wx',mode:0o600})}
writeFileSync(join(run,'owner-native-source.mjs'),readFileSync(new URL(import.meta.url)),{flag:'wx',mode:0o600})
writeFileSync(join(run,'receiving-state.mjs'),readFileSync(new URL('./receiving-state.mjs',import.meta.url)),{flag:'wx',mode:0o600})
let fixture,child,exit,secondChild,secondExit,secondDone,startSecond,secondStdout='',secondStderr='',stdout='',stderr='',http,timer,inputMonitor,acquisitionVerified=false
const stop=join(root,'fixture/stop'),sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function settleFixture(expected){
 return settleReceivingState({path:join(root,'fixture/state.json'),pid:fixture.pid,text:expected})
}
try{
 report.before=audit(root)
 if(report.before.helperProcesses.length||report.before.fixtureProcessCurrent||existsSync(stop))throw Error('remote baseline not empty')
 const cleanEnv={HOME:homedir(),USER:'theo',LOGNAME:'theo',PATH:'/usr/bin:/bin:/usr/sbin:/sbin',TMPDIR:join(root,'tmp')}
 fixture=spawn(join(root,'fixture/ClaudeDriverInputFixture.app/Contents/MacOS/InputFixture'),[],{env:{...cleanEnv,CLAUDE_DRIVER_FIXTURE_EVENT_LOG:join(run,'fixture-events.jsonl')},stdio:'ignore'})
 for(let i=0;i<40;i++){
  const s=audit(root);if(s.fixtureProcessCurrent&&s.fixtureState.pid===fixture.pid&&s.fixtureState.characters===0)break
  if(i===39)throw Error('empty owned fixture not ready');await sleep(100)
 }
 const ownerScript=join(run,'owner-entry.mjs'),callerScript=join(run,'caller.mjs')
 writeFileSync(ownerScript,`import{serveUiLeaseOwner}from${JSON.stringify(moduleUrl('ui-lease-owner.mjs'))};import{openPrivateInputService,inspectPrivateInputRuntime}from${JSON.stringify(moduleUrl('private-input-service.mjs'))};
 await serveUiLeaseOwner({openService:options=>openPrivateInputService(options,{inspect:async()=>({...await inspectPrivateInputRuntime(${JSON.stringify({resourceRoot:runtimeRoot,helperApp,cli})}),codexHome:${JSON.stringify(join(root,'codex-home'))}})})});`,{flag:'wx',mode:0o600})
 const writeCaller=(script,dir,text,markers=false)=>writeFileSync(script,`import{withLock}from${JSON.stringify(moduleUrl('state.mjs'))};import{runOwnedUiLease}from${JSON.stringify(moduleUrl('ui-lease-owner.mjs'))};import{writeFileSync}from'node:fs';
 ${markers?"writeFileSync("+JSON.stringify(secondStarted)+",JSON.stringify({pid:process.pid,at:Date.now()}));":''}const controller=new AbortController();process.once('SIGUSR1',()=>controller.abort());await withLock('ui-automation',async lockFd=>{${markers?"writeFileSync("+JSON.stringify(secondEntered)+",JSON.stringify({pid:process.pid,at:Date.now()}));":''}try{const value=await runOwnedUiLease({payload:{task:${JSON.stringify(text)},timeoutSec:30},dir:${JSON.stringify(dir)},lockFd,signal:controller.signal},{ownerScript:${JSON.stringify(ownerScript)}});console.log(JSON.stringify({ok:true,value}))}catch(e){console.log(JSON.stringify({ok:false,error:{category:e.category,message:e.message,detail:e.detail}}));process.exitCode=1}},{passKernelLock:true});`,{flag:'wx',mode:0o600})
 writeCaller(callerScript,backend,inputMode?'Authorized isolated fixture test. Acquire only Claude Driver Input Fixture, verify the fresh empty editor, then call '+(mode==='external-paste'?'paste with format text':'typeText')+' exactly once with '+JSON.stringify(payload)+'. No other input or apps.':'Authorized isolated read-only fixture acquisition.')
 const secondScript=join(run,'second-caller.mjs')
 if(paired)writeCaller(secondScript,secondBackend,'Authorized isolated fixture test. Verify the current editor retains the first64-character fixture input, then append exactly once with typeText: '+JSON.stringify(secondPayload)+'. No other input or apps.',true)
 for(const file of [ownerScript,callerScript,...(paired?[secondScript]:[])]){const check=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(check.status!==0)throw Error('generated fixture entry syntax failed: '+check.stderr.slice(0,300))}
 http=createServer(async(req,res)=>{
  try{
   let bytes=0;const chunks=[];for await(const b of req){bytes+=b.length;if(bytes>2*1024*1024)throw Error('provider request exceeds bound');chunks.push(b)}
   let data=Buffer.concat(chunks);if(req.headers['content-encoding']==='gzip')data=zlib.gunzipSync(data);if(req.headers['content-encoding']==='zstd')data=zlib.zstdDecompressSync(data)
   const isSecond=paired&&req.url==='/second/v1/responses',caseReport=isSecond?report.second:report,caseBackend=isSecond?secondBackend:backend,casePayload=isSecond?secondPayload:payload,caseIntent=isSecond?secondIntent:intent
   const input=JSON.parse(data),step=caseReport.providerRequests.length+1
   const outputs=(input.input??[]).filter(x=>x.type==='function_call_output').map(x=>typeof x.output==='string'?x.output:JSON.stringify(x.output))
   caseReport.providerRequests.push({step,authorizationPresent:!!req.headers.authorization,toolOutputs:outputs.map(text=>({bytes:Buffer.byteLength(text),sha256:hash(text),initialStateOmitted:text.includes('[omitted 1 text items'),exactFixtureObserved:text.includes('Claude Driver Input Teardown Fixture')&&text.includes('claude-driver-test-editor')})),tools:(input.tools??[]).map(t=>({type:t.type,name:t.name,tools:t.tools?.map(v=>v.name)}))})
   if(req.method!=='POST'||req.url!==(isSecond?'/second/v1/responses':'/v1/responses')||step>(inputMode?4:3)){res.writeHead(404).end();return}
   if(step===3){
    caseReport.afterAcquisition=audit(root)
    caseReport.ownerIdentity=JSON.parse(readFileSync(join(caseBackend,'ui-owner.json')))
    caseReport.acquisitionVerified=outputs.length===2&&caseReport.providerRequests[2].toolOutputs.at(-1).exactFixtureObserved&&caseReport.afterAcquisition.helperProcesses.length===(external&&isSecond?2:1)&&caseReport.afterAcquisition.helperProcesses.some(p=>p.pid===caseReport.ownerIdentity.helperPid)&&caseReport.afterAcquisition.fixtureProcessCurrent&&caseReport.afterAcquisition.fixtureState.pid===fixture.pid&&caseReport.afterAcquisition.fixtureState.characters===(isSecond?intent.characters:0)&&caseReport.afterAcquisition.fixtureState.sha256===hash(isSecond?payload:'')
    if(!isSecond)acquisitionVerified=caseReport.acquisitionVerified
    if(!caseReport.acquisitionVerified){caseReport.acquisitionFailure='exact native result/owned helper/empty fixture not verified';res.writeHead(503).end();return}
    if(mode==='external-paste'&&!isSecond){const f=caseReport.afterAcquisition.fixtureState;if(!f.isActive||!f.keyWindowMatches||!f.pasteMenuPresent||!f.pasteResponderIsEditor)throw Error('native paste fixture activation/menu/responder readiness unverified');const editor=outputs.at(-1).match(/focused UI element is (\d+) text entry area \(settable\) claude-driver-test-editor/);if(!editor||!Number.isSafeInteger(Number(editor[1])))throw Error('fresh exact editor index unavailable');caseReport.editorIndex=Number(editor[1])}
    if(inputMode){
     caseReport.inputIntent=caseIntent
    if(mode==='cancel-input')inputMonitor=setInterval(()=>{
      try{
       const observed=JSON.parse(readFileSync(join(root,'fixture/state.json')))
       if(observed.pid!==fixture.pid||observed.characters<=0||observed.characters>=intent.characters||caseReport.providerRequests.length!==3)return
       if(observed.sha256!==hash(payload.slice(0,observed.characters)))throw Error('partial input is not the submitted prefix')
       const snap=audit(root),current=JSON.parse(readFileSync(join(root,'fixture/state.json')))
       if(current.characters<=0||current.characters>=intent.characters||current.sha256!==hash(payload.slice(0,current.characters))||snap.helperKeyboardFilters.length!==2||!snap.helperKeyboardFilters.every(t=>t.ownerPid===caseReport.ownerIdentity.helperPid))return
       caseReport.beforeInputCancellation={snapshot:snap,current,pendingNativeToolResult:true,providerRequests:caseReport.providerRequests.length}
       caseReport.inputCancellation={signal:'SIGUSR1',callerPid:child.pid,at:new Date().toISOString()}
       clearInterval(inputMonitor);child.kill('SIGUSR1')
      }catch(error){caseReport.inputMonitorError=error.message;clearInterval(inputMonitor)}
     },10)
    }
    if(mode==='double-owner-loss'){
     const id=caseReport.ownerIdentity,members=await ownedGroupMembers(id.ownerPid)
     if(!id.watchReady||![id.watcherPid,id.helperPid,id.workerPid].every(pid=>members.includes(pid))||members.includes(child.pid))throw Error('live owned group/watch readiness not verified')
     caseReport.intentionalDoubleLoss={callerPid:child.pid,ownerPid:id.ownerPid,watcherPid:id.watcherPid,members,afterReadOnlyAcquisition:true}
     child.kill('SIGSTOP');process.kill(id.ownerPid,'SIGKILL');child.kill('SIGKILL');res.destroy();return
    }
    if(mode==='caller-loss'){
     caseReport.intentionalCallerLoss={signal:'SIGKILL',callerPid:child.pid,ownerPid:caseReport.ownerIdentity.ownerPid,afterReadOnlyAcquisition:true}
     child.kill('SIGKILL');res.destroy();return
    }
   }
   if(concurrent&&step===3){
    if(isSecond){
     const firstOwner=JSON.parse(readFileSync(join(backend,'ui-owner.json'))),firstService=JSON.parse(readFileSync(join(backend,'private-input-service.json')))
     caseReport.firstRetiredBeforeNativeEntry=firstOwner.closed===true&&firstOwner.watchDisarmed===true&&firstOwner.watchExit?.code===0&&firstService.closed===true&&firstService.exit?.code===0&&!existsSync(firstService.socketPath)&&!(await ownedGroupMembers(firstOwner.ownerPid)).length
     caseReport.sameMutex=JSON.stringify(firstOwner.lock)===JSON.stringify(caseReport.ownerIdentity.lock)
     if(!caseReport.firstRetiredBeforeNativeEntry||!caseReport.sameMutex)throw Error('successor native entry overlapped prior owned resources or mutex identity changed')
    }else{
     startSecond()
     const deadline=Date.now()+5000
     while(!existsSync(secondStarted)&&Date.now()<deadline&&secondExit===undefined)await sleep(25)
     if(!existsSync(secondStarted)||secondExit||existsSync(secondEntered))throw Error('second caller did not remain queued under first lease')
     caseReport.concurrentQueued={started:JSON.parse(readFileSync(secondStarted)),firstOwnerPid:caseReport.ownerIdentity.ownerPid,beforeFirstInput:true}
    }
   }
   if(external&&isSecond&&step===3){
    const first=report.ownerIdentity,current=caseReport.ownerIdentity
    caseReport.distinctMutex=first.lock.dev===current.lock.dev&&first.lock.ino!==current.lock.ino
    caseReport.overlappingOwnedHelpers=caseReport.afterAcquisition.helperProcesses.length===2&&caseReport.afterAcquisition.helperProcesses.every(p=>[first.helperPid,current.helperPid].includes(p.pid))&&(await ownedGroupMembers(first.ownerPid)).includes(first.helperPid)
    if(!caseReport.distinctMutex||!caseReport.overlappingOwnedHelpers)throw Error('independent owned helper overlap not verified')
    inputMonitor=setInterval(()=>{
     try{
      const state=JSON.parse(readFileSync(join(root,'fixture/state.json')))
      if(state.pid!==fixture.pid||state.characters<=intent.characters||state.characters>=combinedPayload.length||caseReport.providerRequests.length!==3)return
      const snap=audit(root),currentState=JSON.parse(readFileSync(join(root,'fixture/state.json')))
      if(currentState.characters<=intent.characters||currentState.characters>=combinedPayload.length||currentState.sha256!==hash(combinedPayload.slice(0,currentState.characters))||snap.helperProcesses.length!==2||snap.helperKeyboardFilters.filter(t=>t.ownerPid===first.helperPid).length!==(report.firstFilterCount??2)||![1,2].includes(snap.helperKeyboardFilters.filter(t=>t.ownerPid===current.helperPid).length)||snap.helperKeyboardFilters.some(t=>![first.helperPid,current.helperPid].includes(t.ownerPid))||![first.helperPid,current.helperPid].every(pid=>snap.helperKeyboardFilters.some(t=>t.ownerPid===pid&&t.targetPid===fixture.pid)))return
      caseReport.inputFilterCount=snap.helperKeyboardFilters.filter(t=>t.ownerPid===current.helperPid).length;report.externalPartial={snapshot:snap,current:currentState,secondInputResultPending:true,at:new Date().toISOString()};clearInterval(inputMonitor)
     }catch(error){report.externalMonitorError=error.message;clearInterval(inputMonitor)}
    },10)
   }
   if(inputMode&&step===4){
    clearInterval(inputMonitor);caseReport.inputSettlement=await settleFixture(isSecond?combinedPayload:payload);caseReport.afterInput=audit(root)
    caseReport.inputVerified=caseReport.afterInput.fixtureProcessCurrent&&caseReport.afterInput.fixtureState.characters===(isSecond?combinedPayload.length:intent.characters)&&caseReport.afterInput.fixtureState.utf8Bytes===(isSecond?Buffer.byteLength(combinedPayload):intent.utf8Bytes)&&caseReport.afterInput.fixtureState.sha256===hash(isSecond?combinedPayload:payload)
    if(!isSecond){report.firstFilterCount=caseReport.afterInput.helperKeyboardFilters.length;if(![0,1,2].includes(report.firstFilterCount)||caseReport.afterInput.helperKeyboardFilters.some(t=>t.ownerPid!==report.ownerIdentity.helperPid))throw Error('unexpected first input filter ownership')}
    if(concurrent&&!isSecond){caseReport.concurrentQueued.afterFirstInput={at:Date.now(),entered:existsSync(secondEntered),secondLive:secondExit===undefined,filters:caseReport.afterInput.helperKeyboardFilters};if(caseReport.concurrentQueued.afterFirstInput.entered||secondExit)throw Error('second caller entered before first native cleanup')}
    if(mode==='cancel-input'&&!caseReport.inputCancellation)caseReport.inputCancellationNotQualified='native input result arrived before a pending partial effect with owned filters could be verified'
   }
   if(external&&!isSecond&&step===4){
    if(!caseReport.inputVerified||!caseReport.inputSettlement?.verified){report.second.notSubmittedReason='first-effect-unverified';res.writeHead(422,{'content-type':'application/json'}).end(JSON.stringify({error:{type:'fixture_effect_unverified',message:'first native input effect not verified; no second input submitted'}}));return}
    startSecond()
    const deadline=Date.now()+15000
    while(!report.externalPartial&&Date.now()<deadline&&!secondExit&&!report.externalMonitorError)await sleep(25)
    if(!report.externalPartial)throw Error('partial independent input with both helpers and expected own filters was not observed before first lease completion')
   }
   const id='resp_native_'+step,itemId='msg_native_'+step,text='COMBINED_NATIVE_READONLY_OK'
   const toolStep=step<=2||(inputMode&&step===3)
   if(inputMode&&step===3){caseReport.inputCallSubmitted=true;report.inputEventsRequested++}
   const item=toolStep?{id:'fc_native_'+step,type:'function_call',call_id:'call_native_'+step,name:'js',namespace:'mcp__cua_repl',arguments:JSON.stringify({code:step===1?'var fixture = await cua.getApp('+JSON.stringify(join(root,'fixture/ClaudeDriverInputFixture.app'))+');':step===2?'nodeRepl.write(await fixture.getAXState());':(mode==='external-paste'&&!isSecond?'await fixture.click('+caseReport.editorIndex+'); ':'')+'await fixture.'+(mode==='external-paste'&&!isSecond?'paste('+JSON.stringify(casePayload)+', {format: "text"})':'typeText('+JSON.stringify(casePayload)+')')+'; nodeRepl.write(await fixture.getAXState());',title:step===1?'Acquire isolated input fixture':step===2?'Read fresh isolated fixture state':'Type once in isolated fixture',timeout_ms:20000}),status:'completed'}:{id:itemId,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]}
   const response={id,object:'response',created_at:Math.floor(Date.now()/1000),model:'native-fixture',status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}}
   res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'})
   const event=(type,value)=>res.write('event: '+type+'\ndata: '+JSON.stringify({type,...value})+'\n\n')
   event('response.created',{response:{...response,status:'in_progress',output:[]}});event('response.output_item.added',{output_index:0,item:{...item,status:'in_progress',content:[]}})
   if(toolStep)event('response.function_call_arguments.done',{item_id:item.id,output_index:0,arguments:item.arguments})
   else{event('response.content_part.added',{item_id:itemId,output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}});event('response.output_text.delta',{item_id:itemId,output_index:0,content_index:0,delta:text});event('response.output_text.done',{item_id:itemId,output_index:0,content_index:0,text})}
   event('response.output_item.done',{output_index:0,item});event('response.completed',{response});res.end()
  }catch(error){report.providerError=error.message;res.writeHead(422,{'content-type':'application/json'}).end(JSON.stringify({error:{type:'fixture_assessment_failed',message:error.message}}))}
 })
 http.listen(0,'127.0.0.1');await once(http,'listening')
 const writeConfig=(target,path)=>writeFileSync(join(target,'config.toml'),'model = "native-fixture"\nmodel_provider = "native_fixture"\n[model_providers.native_fixture]\nname = "Deterministic localhost native fixture"\nbase_url = '+JSON.stringify('http://127.0.0.1:'+http.address().port+path)+'\nwire_api = "responses"\nrequires_openai_auth = false\nsupports_websockets = false\nrequest_max_retries = 0\nstream_max_retries = 0\n[analytics]\nenabled = false\n',{flag:'wx',mode:0o600})
 writeConfig(home,'/v1')
 if(paired){writeConfig(secondHome,'/second/v1');startSecond=()=>{if(secondChild)throw Error('second caller submitted twice');secondChild=spawn(process.execPath,[secondScript],{env:{...cleanEnv,CODEX_HOME:secondHome,CODEX_BRIDGE_CODEX_PATH:cli,CODEX_BRIDGE_STATE_DIR:secondBackend,CLAUDE_DRIVER_STATE_DIR:external?secondState:state,CODEX_BRIDGE_POLICY:policy},cwd:run,detached:true,stdio:['ignore','pipe','pipe']});report.second.callerPid=secondChild.pid;secondChild.stdout.on('data',b=>secondStdout=(secondStdout+b).slice(-1024*1024));secondChild.stderr.on('data',b=>secondStderr=(secondStderr+b).slice(-65536));secondDone=once(secondChild,'close').then(([code,signal])=>secondExit={code,signal})}}
 child=spawn(process.execPath,[callerScript],{env:{...cleanEnv,CODEX_HOME:home,CODEX_BRIDGE_CODEX_PATH:cli,CODEX_BRIDGE_STATE_DIR:backend,CLAUDE_DRIVER_STATE_DIR:state,CODEX_BRIDGE_POLICY:policy},cwd:run,detached:true,stdio:['pipe','pipe','pipe']})
 report.workerPid=child.pid
 child.stdout.on('data',b=>{stdout=(stdout+b).slice(-1024*1024)});child.stderr.on('data',b=>{stderr=(stderr+b).slice(-65536)});child.stdin.on('error',()=>{})
 child.stdin.end()
 timer=setTimeout(()=>{report.timeout=true;for(const c of [child,secondChild])if(c)try{process.kill(-c.pid,'SIGKILL')}catch{}},60000)
 const [code,signal]=await once(child,'close');exit={code,signal};if(!paired)clearTimeout(timer)
 clearInterval(inputMonitor)
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
 if(paired&&secondDone){
  if(external){const snap=audit(root);report.firstRetiredWhileSecondActive={snapshot:snap,secondLive:secondExit===undefined,secondResultPending:report.second.providerRequests.length===3};report.firstRetiredWhileSecondActive.verified=report.firstRetiredWhileSecondActive.secondLive&&report.firstRetiredWhileSecondActive.secondResultPending&&snap.helperProcesses.length===1&&snap.helperProcesses[0].pid===report.second.ownerIdentity?.helperPid&&snap.helperKeyboardFilters.length===report.second.inputFilterCount&&snap.helperKeyboardFilters.every(t=>t.ownerPid===report.second.ownerIdentity.helperPid)&&snap.fixtureState.characters>intent.characters&&snap.fixtureState.characters<combinedPayload.length&&snap.fixtureState.sha256===hash(combinedPayload.slice(0,snap.fixtureState.characters))}
  await secondDone;clearTimeout(timer)
  report.second.exit=secondExit;report.second.stderrBytes=Buffer.byteLength(secondStderr)
  report.second.caller=JSON.parse(secondStdout);report.second.ownerFinal=JSON.parse(readFileSync(join(secondBackend,'ui-owner.json')))
  report.second.remainingOwnerMembers=await ownedGroupMembers(report.second.ownerFinal.ownerPid)
  report.second.entered=JSON.parse(readFileSync(secondEntered))
 }
 report.afterClose=audit(root)
 if(inputMode)report.inputAfterClose=report.afterClose.fixtureState
 if(inputMode){
  report.inputSettled=[]
  const boundary=Date.now()
  for(const elapsed of [1000,5000]){await sleep(Math.max(0,boundary+elapsed-Date.now()));report.inputSettled.push({elapsedMs:Date.now()-boundary,snapshot:audit(root)})}
  report.inputStableAfterClose=report.inputSettled.every(x=>x.snapshot.fixtureProcessCurrent&&x.snapshot.fixtureState.sha256===report.inputAfterClose.sha256&&x.snapshot.fixtureState.characters===report.inputAfterClose.characters&&x.snapshot.helperProcesses.length===0&&x.snapshot.helperKeyboardFilters.length===0)
  report.finalInputIsSubmittedPrefix=report.inputAfterClose.characters<=combinedPayload.length&&report.inputAfterClose.sha256===hash(combinedPayload.slice(0,report.inputAfterClose.characters))
 }
 report.hostTurnCompleted=report.worker?.result?.status==='completed'
 report.archiveAcknowledged=report.worker?.cleanup?.receipt?.archiveAcknowledged===true
 const fixtureStateValid=inputMode?report.afterClose.fixtureState.characters===combinedPayload.length&&report.afterClose.fixtureState.sha256===hash(combinedPayload):report.afterClose.fixtureState.characters===0
 const closed=report.closeReceipt?.nativeHelperExited&&!report.closeReceipt.forcedTermination&&report.closeReceipt.helperExit.code===0&&report.afterClose.helperProcesses.length===0&&report.afterClose.helperKeyboardFilters.length===0&&report.afterClose.fixtureProcessCurrent&&fixtureStateValid
 const expectedOutcome=['normal','type-normal','concurrent-input','external-input','external-paste','type-long'].includes(mode)?code===0&&report.hostTurnCompleted&&report.archiveAcknowledged&&report.caller?.ok===true:signal==='SIGKILL'&&!report.hostTurnCompleted&&!report.archiveAcknowledged&&report.ownerFinal.cancelled===true
 const resourcesEmpty=report.afterClose.helperProcesses.length===0&&report.afterClose.helperKeyboardFilters.length===0&&report.afterClose.fixtureProcessCurrent&&report.afterClose.fixtureState.characters===0&&report.remainingOwnerMembers.length===0
 report.ok=mode==='cancel-input'?acquisitionVerified&&!!report.inputCancellation&&code===1&&report.caller?.ok===false&&report.caller?.error?.category==='cancelled'&&!report.hostTurnCompleted&&report.afterClose.helperProcesses.length===0&&report.afterClose.helperKeyboardFilters.length===0&&report.remainingOwnerMembers.length===0&&report.inputStableAfterClose&&report.finalInputIsSubmittedPrefix&&report.closeReceipt?.nativeHelperExited===true&&report.closeReceipt.helperExit.code===0&&!report.closeReceipt.forcedTermination&&report.ownerFinal.closed===true&&report.ownerFinal.watchDisarmed===true&&report.ownerFinal.watchExit?.code===0:mode==='double-owner-loss'?acquisitionVerified&&signal==='SIGKILL'&&!report.hostTurnCompleted&&!report.archiveAcknowledged&&resourcesEmpty&&report.orphan?.phase==='retired'&&report.orphan.inputAuditPassed===true&&report.orphan.originalWorkCompleted===false&&report.orphan.normalNativeExitVerified===false&&report.successorLockAcquired===true:acquisitionVerified&&closed&&expectedOutcome&&report.ownerFinal.closed===true&&report.ownerFinal.watchDisarmed===true&&report.ownerFinal.watchExit?.code===0&&report.remainingOwnerMembers.length===0&&(!inputMode||(report.inputVerified===true&&report.inputSettlement?.verified===true&&report.inputStableAfterClose&&report.afterInput.helperKeyboardFilters.length===(report.firstFilterCount)&&report.afterInput.helperKeyboardFilters.every(t=>t.ownerPid===report.ownerIdentity.helperPid)))
 if(paired&&!secondDone)report.ok=false
 if(paired&&secondDone){const r=report.second;report.ok=report.ok&&r.acquisitionVerified&&r.inputVerified&&r.inputSettlement?.verified===true&&r.exit.code===0&&r.caller.ok===true&&r.caller.value.worker.result.status==='completed'&&r.caller.value.worker.cleanup.receipt.archiveAcknowledged===true&&r.caller.value.nativeInputService.helperExit.code===0&&r.ownerFinal.watchDisarmed===true&&r.ownerFinal.watchExit.code===0&&r.remainingOwnerMembers.length===0&&r.afterInput.helperKeyboardFilters.length===(external?r.inputFilterCount:report.firstFilterCount)&&r.afterInput.helperKeyboardFilters.every(t=>t.ownerPid===r.ownerIdentity.helperPid)
  if(concurrent)report.ok=report.ok&&r.firstRetiredBeforeNativeEntry&&r.sameMutex&&r.entered.at>=report.concurrentQueued.started.at
  if(external)report.ok=report.ok&&r.distinctMutex&&r.overlappingOwnedHelpers&&!!report.externalPartial&&report.firstRetiredWhileSecondActive.verified
 }
}catch(error){report.error={category:error.category,message:error.message};report.ok=false}
finally{
 clearTimeout(timer);clearInterval(inputMonitor)
 if(secondChild&&!secondExit){try{process.kill(-secondChild.pid,'SIGTERM')}catch{};await Promise.race([secondDone,sleep(2000)]);if(!secondExit){try{process.kill(-secondChild.pid,'SIGKILL')}catch{};await secondDone}}
 if(child&&!exit){try{process.kill(-child.pid,'SIGTERM')}catch{};await sleep(1000)}
 http?.closeAllConnections();http?.close()
 if(fixture&&fixture.exitCode===null&&fixture.signalCode===null){
  writeFileSync(stop,'owned fixture stop\n',{flag:'wx'});let t
  report.fixtureExit=await Promise.race([once(fixture,'exit').then(([code,signal])=>({code,signal})),new Promise(resolve=>{t=setTimeout(()=>resolve({unverified:true}),10000)})]);clearTimeout(t)
  if(!report.fixtureExit.unverified)unlinkSync(stop)
 }
 report.final=audit(root)
 const eventsPath=join(run,'fixture-events.jsonl')
 try{
  const bytes=readFileSync(eventsPath);if(bytes.length>32*1024*1024)throw Error('fixture event log exceeds bound')
  const rows=bytes.toString().trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)),summary=rows.at(-1)
  report.fixtureEventLog={bytes:bytes.length,sha256:hash(bytes),rows:rows.length,summary,verified:summary?.phase==='log-summary'&&summary.recordedEvents===rows.length-1&&summary.droppedEvents===0}
  if(!report.fixtureEventLog.verified)report.ok=false
 }catch(error){report.fixtureEventLog={verified:false,error:error.message};report.ok=false}
 report.stderr=stderr;report.finishedAt=new Date().toISOString()
 if(report.final.helperProcesses.length||report.final.helperKeyboardFilters.length||report.final.fixtureProcessCurrent||report.fixtureExit?.code!==0)report.ok=false
 writeFileSync(join(run,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600})
 console.log(JSON.stringify({run,mode,ok:report.ok,error:report.error,cleanupError:report.cleanupError,acquisitionVerified,workerExit:report.workerExit,workerError:report.worker?.error,hostTurnCompleted:report.hostTurnCompleted,archiveAcknowledged:report.archiveAcknowledged,closeReceipt:report.closeReceipt,orphan:report.orphan,successorLockAcquired:report.successorLockAcquired,inputVerified:report.inputVerified,inputCancellation:report.inputCancellation,inputCancellationNotQualified:report.inputCancellationNotQualified,inputAfterClose:report.inputAfterClose,fixtureEventLog:report.fixtureEventLog,firstFilterCount:report.firstFilterCount,externalPartialObserved:!!report.externalPartial,firstRetiredWhileSecondActive:report.firstRetiredWhileSecondActive?.verified,second:paired?{exit:report.second.exit,ok:report.second.caller?.ok,inputVerified:report.second.inputVerified,firstRetiredBeforeNativeEntry:report.second.firstRetiredBeforeNativeEntry,sameMutex:report.second.sameMutex}:undefined,remainingHelpers:report.final.helperProcesses.length,remainingFilters:report.final.helperKeyboardFilters.length,fixtureExit:report.fixtureExit}))
}
process.exitCode=report.ok?0:1
