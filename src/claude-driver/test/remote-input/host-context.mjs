// Real isolated host + deterministic localhost provider, without inference,
// credential copy or persisted trust injection. Native CUA is explicit opt-in;
// one-off hook review requires the exact human receipt. Default preserves trust.
import {spawn} from 'node:child_process'
import {EventEmitter,once} from 'node:events'
import {createInterface} from 'node:readline'
import {createServer} from 'node:http'
import * as zlib from 'node:zlib'
import {readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync} from 'node:fs'
import {createHash,randomUUID} from 'node:crypto'
import {homedir,hostname} from 'node:os'
import {join} from 'node:path'
import {JsonRpcPeer} from '../../../codex-bridge/lib/jsonrpc.mjs'
import {audit} from './native-audit.mjs'

const workspace='/Users/theo/.local/state/claude-driver/input-teardown-20261018'
if(process.platform!=='darwin'||homedir()!=='/Users/theo'||hostname().split('.')[0]!=='theo-air'||
   !process.env.SSH_CONNECTION)throw Error('remote host fixture identity refused')
const owner=JSON.parse(readFileSync(join(workspace,'owner.json'),'utf8'))
if(owner.threadId!=='01a112b1-fbf6-7cb0-8228-ce3e6cb6112d')throw Error('remote host fixture owner refused')
const run=join(workspace,'host-context-20261018','run-'+Date.now()+'-'+randomUUID().slice(0,8))
const home=join(run,'codex-home')
mkdirSync(home,{recursive:true,mode:0o700})
const node=join(workspace,'tools','cua_node','bin','node')
const cli=join(workspace,'tools','CodexCLI.app','Contents','MacOS','codex')
const observer=new URL('./hook-observer.mjs',import.meta.url).pathname
const hash=data=>createHash('sha256').update(data).digest('hex')
const hookBytes=readFileSync(new URL('./host-stop-hook.json',import.meta.url))
const hookDefinitionSha256=hash(hookBytes)
const reviewIndex=process.argv.indexOf('--review-receipt')
const reviewPath=reviewIndex>=0?process.argv[reviewIndex+1]:null
const nativeCatalogue=process.argv.includes('--catalogue-native')
const execEntry=process.argv.includes('--exec-entry')
const nativeTurn=process.argv.includes('--native-turn')
const pipeIndex=process.argv.indexOf('--isolated-pipe')
const isolatedPipe=pipeIndex>=0?process.argv[pipeIndex+1]:null
if(pipeIndex>=0&&(!nativeTurn||!isolatedPipe||!/^\/Users\/theo\/\.local\/state\/claude-driver\/input-teardown-20261018\/isolate\/run-[0-9]+\.sock$/.test(isolatedPipe)))throw Error('native host isolated pipe scope refused')
if(isolatedPipe){
    const parent=lstatSync(join(workspace,'isolate')),socket=lstatSync(isolatedPipe)
    if(!parent.isDirectory()||parent.isSymbolicLink()||parent.uid!==process.getuid()||(parent.mode&0o077)!==0||
       !socket.isSocket()||socket.isSymbolicLink()||socket.uid!==process.getuid())throw Error('native host isolated pipe ownership refused')
}
if(execEntry&&(!reviewPath||nativeCatalogue))throw Error('exec entry requires reviewed hook')
if(nativeTurn&&(!execEntry||!reviewPath||nativeCatalogue))throw Error('native turn requires reviewed exec entry')
if(nativeCatalogue&&reviewPath)throw Error('catalogue-only fixture does not override hook trust')
if(reviewIndex>=0&&!reviewPath)throw Error('hook review receipt path missing')
if(reviewPath){
    if(!reviewPath.startsWith(join(workspace,'evidence')+'/')||reviewPath.includes('/../'))throw Error('hook review receipt scope refused')
    const review=JSON.parse(readFileSync(reviewPath,'utf8'))
    if(review.source!=='Taylor via current Codex chat'||review.purpose!=='isolated-cua-stop-hook-diagnostic'||
       review.action!=='allow-one-off-test'||review.hookDefinitionSha256!==hookDefinitionSha256)throw Error('explicit human hook review does not match')
}
const report={run,startedAt:new Date().toISOString(),ephemeralRequested:true,provider:'localhost-deterministic-fixture',
    realModelCallsRequested:0,nativeComputerUseRequested:nativeTurn,hookTrustChanged:false,ok:false,
    hookDefinitionSha256,oneOffHookTrustOverrideRequested:!!reviewPath,reviewPath,nativeMcpCatalogueRequested:nativeCatalogue,isolatedPipe,
    sourceSha256:hash(readFileSync(new URL(import.meta.url))),observerSha256:hash(readFileSync(observer)),providerRequests:[],notifications:[],serverRequests:[]}
writeFileSync(join(run,'host-context-source.mjs'),readFileSync(new URL(import.meta.url)),{flag:'wx',mode:0o600})
writeFileSync(join(run,'hook-observer-source.mjs'),readFileSync(observer),{flag:'wx',mode:0o600})
const proxy=new URL('./native-proxy.mjs',import.meta.url).pathname
const payload='REMOTE_INPUT_HOST_'+randomUUID().replaceAll('-','')
const intent={characters:payload.length,utf8Bytes:Buffer.byteLength(payload),sha256:hash(payload),attempts:1,isolatedPipe,
    acquireCode:'var fixture = await cua.getApp('+JSON.stringify(join(workspace,'fixture/ClaudeDriverInputFixture.app'))+');',
    typeCode:'await fixture.typeText('+JSON.stringify(payload)+'); await fixture.getAXState();'}
if(nativeTurn){
    report.before=audit(workspace)
    if(!report.before.fixtureProcessCurrent||report.before.fixtureState.characters!==0||report.before.helperProcesses.length!==(isolatedPipe?2:1)||report.before.helperKeyboardFilters.length!==0)throw Error('native turn requires empty live fixture and exact clean helper count')
    writeFileSync(join(run,'native-intent.json'),JSON.stringify(intent,null,2)+'\n',{flag:'wx',mode:0o600})
    for(const name of ['native-proxy.mjs','native-audit.mjs'])writeFileSync(join(run,name),readFileSync(new URL('./'+name,import.meta.url)),{flag:'wx',mode:0o600})
}
const http=createServer(async(req,res)=>{
    const chunks=[]
    for await(const chunk of req){chunks.push(chunk);if(chunks.reduce((n,b)=>n+b.length,0)>2*1024*1024){res.writeHead(413).end();return}}
    const body=Buffer.concat(chunks)
    const entry={method:req.method,url:req.url,bodyBytes:body.length,bodySha256:hash(body),authorizationPresent:!!req.headers.authorization,contentEncoding:req.headers['content-encoding']??null}
    try{
        let decoded=body
        if(entry.contentEncoding==='gzip')decoded=zlib.gunzipSync(body)
        if(entry.contentEncoding==='zstd')decoded=zlib.zstdDecompressSync(body)
        const input=JSON.parse(decoded.toString('utf8'))
        entry.toolInventory=(input.tools??[]).map(t=>({type:t.type,name:t.name,tools:t.tools?.map(n=>({type:n.type,name:n.name}))}))
    }catch(error){entry.toolInventoryError=error.message.slice(0,150)}
    report.providerRequests.push(entry)
    if(req.method!=='POST'||req.url!=='/v1/responses'||report.providerRequests.length>(nativeTurn?3:2)){res.writeHead(404).end();return}
    const id='resp_fixture_'+report.providerRequests.length,itemId='msg_fixture_'+report.providerRequests.length
    const text='Deterministic host lifecycle fixture completed.'
    let item={id:itemId,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]}
    if(nativeTurn&&report.providerRequests.length<=2){
        const step=report.providerRequests.length
        let admitted=true
        if(step===2){
            const events=join(run,'native-events.jsonl')
            const calls=existsSync(events)?readFileSync(events,'utf8').trim().split('\n').map(line=>JSON.parse(line)):[]
            const last=calls.at(-1)
            admitted=last?.event==='result'&&last.name==='js'&&last.acquired&&!last.isError&&last.snapshot.fixtureProcessCurrent&&last.snapshot.fixtureState.characters===0
        }
        if(admitted)item={id:'fc_fixture_'+step,type:'function_call',call_id:'call_fixture_'+step,name:'js',namespace:'mcp__cua_repl',arguments:JSON.stringify({code:step===1?intent.acquireCode:intent.typeCode,title:step===1?'Inspect isolated input fixture':'Type once in isolated fixture',timeout_ms:20000}),status:'completed'}
        else report.nativeAdmissionFailure='exact fixture acquisition/empty state not verified; no typing requested'
    }
    const response={id,object:'response',created_at:Math.floor(Date.now()/1000),model:'lifecycle-fixture',status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}}
    res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'})
    const event=(type,value)=>res.write('event: '+type+'\ndata: '+JSON.stringify({type,...value})+'\n\n')
    event('response.created',{response:{...response,status:'in_progress',output:[]}})
    event('response.output_item.added',{output_index:0,item:{...item,status:'in_progress',content:[]}})
    if(item.type==='message'){
        event('response.content_part.added',{item_id:itemId,output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}})
        event('response.output_text.delta',{item_id:itemId,output_index:0,content_index:0,delta:text})
        event('response.output_text.done',{item_id:itemId,output_index:0,content_index:0,text})
    }else event('response.function_call_arguments.done',{item_id:item.id,output_index:0,arguments:item.arguments})
    event('response.output_item.done',{output_index:0,item})
    event('response.completed',{response})
    res.end()
})
http.listen(0,'127.0.0.1')
await once(http,'listening')
const port=http.address().port
writeFileSync(join(home,'hooks.json'),hookBytes,{flag:'wx',mode:0o600})
const runtime=join(workspace,'tools','cua_node')
const nativeEnv={HOME:homedir(),USER:'theo',LOGNAME:'theo',PATH:join(runtime,'bin')+':/usr/bin:/bin:/usr/sbin:/sbin',TMPDIR:join(workspace,'tmp'),CODEX_HOME:join(workspace,'codex-home'),CODEX_CLI_PATH:cli,CUA_REPL_NODE_REPL_PATH:join(runtime,'bin','node_repl'),CUA_REPL_ENABLED_SURFACES:'computer',NODE_REPL_NODE_MODULE_DIRS:join(runtime,'lib','node_modules'),NODE_REPL_TRUSTED_CODE_PATHS:join(runtime,'lib','node_modules'),NODE_PATH:join(runtime,'lib','node_modules')}
const mcpArgs=nativeCatalogue?[join(runtime,'lib','node_modules','@oai','cua-repl','bin','cua-repl.mjs')]:nativeTurn?[proxy,run]:[observer,run]
const config='model = "lifecycle-fixture"\nmodel_provider = "lifecycle_fixture"\n'+
    '[model_providers.lifecycle_fixture]\nname = "Local deterministic fixture"\nbase_url = '+JSON.stringify('http://127.0.0.1:'+port+'/v1')+'\nwire_api = "responses"\nrequires_openai_auth = false\nsupports_websockets = false\nrequest_max_retries = 0\nstream_max_retries = 0\n'+
    '[mcp_servers.cua_repl]\ncommand = '+JSON.stringify(node)+'\nargs = '+JSON.stringify(mcpArgs)+'\nstartup_timeout_sec = 15\n'+
    (nativeCatalogue?'[mcp_servers.cua_repl.env]\n'+Object.entries(nativeEnv).map(([k,v])=>k+' = '+JSON.stringify(v)+'\n').join(''):'')+
    '[analytics]\nenabled = false\n'
writeFileSync(join(home,'config.toml'),config,{flag:'wx',mode:0o600})
// exec exposes the one-off trust flag on its own command. Keep the failed
// app-server route as evidence rather than manufacturing persisted hook trust.
if(execEntry){
    report.entryPoint='exec'
    const args=['exec','--dangerously-bypass-hook-trust','--strict-config','--ephemeral','--skip-git-repo-check','--ignore-rules','--sandbox','read-only','--json','Deterministic local lifecycle fixture only; no UI, files or shell actions.']
    const child=spawn(cli,args,{cwd:run,detached:true,stdio:['ignore','pipe','pipe'],env:{HOME:homedir(),USER:'theo',LOGNAME:'theo',PATH:join(runtime,'bin')+':/usr/bin:/bin:/usr/sbin:/sbin',TMPDIR:join(workspace,'tmp'),CODEX_HOME:home}})
    let stderr='',exit
    const events=[]
    createInterface({input:child.stdout}).on('line',line=>{try{events.push(JSON.parse(line))}catch{report.invalidJsonLines=(report.invalidJsonLines??0)+1}})
    child.stderr.on('data',b=>{stderr=(stderr+b).slice(-65536)})
    const closed=new Promise(resolve=>{child.on('close',(code,signal)=>{exit={code,signal};resolve()});child.on('error',error=>{report.error={message:error.message};resolve()})})
    let timer
    await Promise.race([closed,new Promise(resolve=>{timer=setTimeout(()=>{report.ownedHostTerminationRequested=true;try{process.kill(-child.pid,'SIGTERM')}catch{};resolve()},45000)})])
    clearTimeout(timer)
    if(!exit)await Promise.race([closed,new Promise(resolve=>setTimeout(resolve,5000))])
    report.notifications=events
    report.threadId=events.find(e=>e.type==='thread.started')?.thread_id
    const eventPath=join(run,'hook-events.jsonl')
    report.hookEvents=existsSync(eventPath)?readFileSync(eventPath,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[]
    if(nativeTurn){
        const nativePath=join(run,'native-events.jsonl')
        report.nativeEvents=existsSync(nativePath)?readFileSync(nativePath,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[]
        report.hookEvents=report.nativeEvents.filter(e=>e.event==='call'&&e.name==='turn_ended').map(e=>e.arguments)
        report.afterHostEof=audit(workspace)
        report.settledAfterHostEof=[]
        const boundary=Date.now()
        for(const delay of [1000,5000,15000]){
            await new Promise(resolve=>setTimeout(resolve,Math.max(0,boundary+delay-Date.now())))
            report.settledAfterHostEof.push({elapsedMs:Date.now()-boundary,snapshot:audit(workspace)})
        }
        const state=report.afterHostEof.fixtureState
        report.syntheticInputVerified=report.afterHostEof.fixtureProcessCurrent&&state.characters===intent.characters&&state.utf8Bytes===intent.utf8Bytes&&state.sha256===intent.sha256
        report.nativeFiltersReleased=[report.afterHostEof,...report.settledAfterHostEof.map(e=>e.snapshot)].every(s=>s.helperProcesses.length===1&&s.helperKeyboardFilters.length===0)
        report.syntheticInputStable=report.settledAfterHostEof.every(e=>e.snapshot.fixtureProcessCurrent&&e.snapshot.fixtureState.sha256===intent.sha256&&e.snapshot.fixtureState.characters===intent.characters)
    }
    report.hookDispatchVerified=report.hookEvents.length===1&&report.hookEvents[0].session_id===report.threadId&&typeof report.hookEvents[0].turn_id==='string'
    report.turnId=report.hookEvents[0]?.turn_id
    report.turnIdEvidence='native hook payload; exec JSON does not independently expose a turn id'
    report.ok=exit?.code===0&&events.some(e=>e.type==='turn.completed')&&report.providerRequests.length===(nativeTurn?3:1)&&report.hookDispatchVerified
    if(nativeTurn)report.ok=report.ok&&report.syntheticInputVerified&&report.syntheticInputStable&&report.nativeFiltersReleased&&!report.nativeAdmissionFailure&&report.nativeEvents.some(e=>e.event==='result'&&e.name==='turn_ended'&&!e.isError)
    report.exit=exit??{outcome:'unverified'}
    report.stderr=stderr
    report.finishedAt=new Date().toISOString()
    await new Promise(resolve=>http.close(resolve))
    writeFileSync(join(run,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600})
    console.log(JSON.stringify({run,ok:report.ok,entryPoint:report.entryPoint,threadId:report.threadId,turnId:report.turnId,hookDispatchVerified:report.hookDispatchVerified,exit:report.exit,stderr:report.stderr.slice(-3000)}))
    process.exit(report.ok?0:1)
}
const child=spawn(cli,[...(reviewPath?['--dangerously-bypass-hook-trust']:[]),'app-server','--strict-config','--listen','stdio://'],{cwd:run,detached:true,stdio:['pipe','pipe','pipe'],env:{HOME:homedir(),USER:'theo',LOGNAME:'theo',PATH:join(workspace,'tools','cua_node','bin')+':/usr/bin:/bin:/usr/sbin:/sbin',TMPDIR:join(workspace,'tmp'),CODEX_HOME:home}})
let exit,stderr=''
const transport=new EventEmitter()
createInterface({input:child.stdout}).on('line',line=>transport.emit('message',line))
child.stderr.on('data',b=>{stderr=(stderr+b).slice(-65536)})
child.on('exit',(code,signal)=>{exit={code,signal};transport.emit('close','owned host exited')})
child.on('error',e=>transport.emit('error',e))
child.stdin.on('error',()=>{})
transport.send=raw=>child.stdin.write(raw+'\n')
transport.close=()=>child.stdin.end()
const peer=new JsonRpcPeer(transport)
let complete
const completion=new Promise(resolve=>{complete=resolve})
peer.on('notification',(method,params)=>{
    report.notifications.push({method,threadId:params.threadId,turnId:params.turnId,run:method.startsWith('hook/')?params.run:undefined})
    if(method==='turn/completed'&&params.threadId===report.threadId)complete(params.turn)
})
peer.on('request',request=>{
    report.serverRequests.push({method:request.method})
    request.fail(-32601,'observer fixture does not answer approvals or consent requests')
})
try{
    report.initialize=await peer.request('initialize',{clientInfo:{name:'claude-driver-host-fixture',version:'1'},capabilities:{experimentalApi:true}},{timeoutMs:15000})
    peer.notify('initialized',{})
    const listed=await peer.request('hooks/list',{cwds:[run]},{timeoutMs:10000})
    report.hooks=listed.data?.flatMap(entry=>entry.hooks.filter(h=>h.sourcePath.startsWith(run)))??[]
    report.hookInventoryCount=listed.data?.flatMap(entry=>entry.hooks).length??0
    report.hookErrors=listed.data?.flatMap(entry=>entry.errors)??[]
    if(report.hookInventoryCount!==1||report.hooks.length!==1||report.hookErrors.length||
       report.hooks[0].eventName!=='stop'||report.hooks[0].server!=='cua_repl'||report.hooks[0].tool!=='turn_ended')throw Error('unexpected hook inventory; no turn admitted')
    if(nativeCatalogue&&report.hooks[0].trustStatus!=='untrusted')throw Error('catalogue-only hook state changed; no turn admitted')
    const started=await peer.request('thread/start',{cwd:run,model:'lifecycle-fixture',modelProvider:'lifecycle_fixture',ephemeral:true,approvalPolicy:'on-request',sandbox:'read-only'},{timeoutMs:15000})
    report.threadId=started.thread.id
    const turn=await peer.request('turn/start',{threadId:report.threadId,input:[{type:'text',text:'Deterministic local lifecycle fixture only; no UI, files or shell actions.'}]},{timeoutMs:15000})
    report.turnId=turn.turn.id
    let timer
    try{report.turn=await Promise.race([completion,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('owned fixture turn completion timeout')),30000)})])}
    finally{clearTimeout(timer)}
    const events=join(run,'hook-events.jsonl')
    report.hookEvents=existsSync(events)?readFileSync(events,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[]
    report.hookDispatchVerified=report.hookEvents.length===1&&report.hookEvents[0].session_id===report.threadId&&report.hookEvents[0].turn_id===report.turnId
    report.ok=report.turn.status==='completed'&&report.providerRequests.length===1&&report.serverRequests.length===0
    if(reviewPath&&!report.hookDispatchVerified)report.ok=false
}catch(error){report.error={name:error.name,message:error.message.slice(0,600)}}
finally{
    if(report.threadId&&report.turnId&&!report.turn){
        try{report.interrupt=await peer.request('turn/interrupt',{threadId:report.threadId,turnId:report.turnId},{timeoutMs:5000})}catch(e){report.interruptError=e.message}
    }
    peer.close()
    for(let i=0;i<50&&!exit;i++)await new Promise(resolve=>setTimeout(resolve,100))
    if(!exit){report.ownedHostTerminationRequested=true;try{process.kill(-child.pid,'SIGTERM')}catch{}}
    for(let i=0;i<20&&!exit;i++)await new Promise(resolve=>setTimeout(resolve,100))
    report.exit=exit??{outcome:'unverified'}
    report.stderr=stderr
    report.finishedAt=new Date().toISOString()
    await new Promise(resolve=>http.close(resolve))
    writeFileSync(join(run,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600})
    console.log(JSON.stringify({run,ok:report.ok,error:report.error,threadId:report.threadId,turnId:report.turnId,turnStatus:report.turn?.status,hooks:report.hooks,observedHookEvents:report.hookEvents,providerRequests:report.providerRequests,exit:report.exit}))
}
process.exitCode=report.ok?0:1
