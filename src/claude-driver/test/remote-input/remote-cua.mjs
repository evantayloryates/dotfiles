// Run only on the explicitly named remote test host. Uses the packaged public
// cua_repl MCP launcher; no model/provider, private IPC or approval injection.
import {spawn,execFileSync} from 'node:child_process'
import {EventEmitter} from 'node:events'
import {createInterface} from 'node:readline'
import {readFileSync,writeFileSync,existsSync,lstatSync} from 'node:fs'
import {homedir,hostname} from 'node:os'
import {join} from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {JsonRpcPeer} from '../../../codex-bridge/lib/jsonrpc.mjs'

const args=process.argv.slice(2)
const option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1]}
const expectedHost=option('--expected-host'),workspace=option('--workspace'),phase=option('--phase')
const relayApproval=args.includes('--relay-approval')
const humanApproval=option('--human-approval')
const isolatedPipe=option('--isolated-pipe')
if(process.platform!=='darwin'||expectedHost!=='theo-air'||hostname().split('.')[0]!==expectedHost||
   homedir()!=='/Users/theo'||!process.env.SSH_CONNECTION||
   workspace!=='/Users/theo/.local/state/claude-driver/input-teardown-20261018'||
   !['catalogue','acquire','teardown','typing','hold'].includes(phase))throw Error('remote test identity/scope refused')
const marker=JSON.parse(readFileSync(join(workspace,'owner.json'),'utf8'))
if(marker.threadId!=='01a112b1-fbf6-7cb0-8228-ce3e6cb6112d')throw Error('workspace owner refused')
if(isolatedPipe&&(!isolatedPipe.startsWith(workspace+'/isolate/')||!/^\/Users\/theo\/\.local\/state\/claude-driver\/input-teardown-20261018\/isolate\/run-[0-9]+\.sock$/.test(isolatedPipe)))throw Error('isolated pipe scope refused')
if(isolatedPipe){
    const parent=lstatSync(join(workspace,'isolate')),socket=lstatSync(isolatedPipe)
    if(!parent.isDirectory()||parent.isSymbolicLink()||parent.uid!==process.getuid()||(parent.mode&0o077)!==0||
       !socket.isSocket()||socket.isSymbolicLink()||socket.uid!==process.getuid())throw Error('isolated pipe ownership refused')
}
if(humanApproval&&(!humanApproval.startsWith(join(workspace,'evidence')+'/')||
   !humanApproval.endsWith('.response.json')||humanApproval.includes('/../')))throw Error('human approval path refused')
const target=join(workspace,'fixture','ClaudeDriverInputFixture.app')
if(phase!=='catalogue'&&!existsSync(target))throw Error('fixture missing')
const runtime=join(workspace,'tools','cua_node'),evidence=join(workspace,'evidence',phase+'-'+Date.now()+'.json')
const source=readFileSync(new URL(import.meta.url))
const harnessSha256=createHash('sha256').update(source).digest('hex')
const sourceEvidence=join(workspace,'evidence','source-'+harnessSha256+'.mjs')
if(!existsSync(sourceEvidence))writeFileSync(sourceEvidence,source,{flag:'wx',mode:0o600})
const lifecycle=['teardown','typing','hold'].includes(phase)
const report={scope:'remote-input-teardown',phase,host:expectedHost,workspace,target,
    isolatedPipe,
    harnessSha256,sourceEvidence,
    startedAt:new Date().toISOString(),modelCallsRequested:0,localDesktopAccessed:false,
    consentAnswered:false,nativeInputReleaseAssessed:false,ok:false}
function audit(){
    const env={HOME:homedir(),PATH:'/usr/bin:/bin:/usr/sbin:/sbin',TMPDIR:join(workspace,'tmp')}
    const taps=JSON.parse(execFileSync('/usr/bin/swift',[join(workspace,'tools','input-taps.swift')],{env,timeout:20000,encoding:'utf8'}))
    const rows=execFileSync('/bin/ps',['-axo','pid=,ppid=,comm='],{env,timeout:5000,encoding:'utf8'}).trim().split('\n')
    const helperPath=join(workspace,'codex-home','computer-use','Codex Computer Use.app','Contents','MacOS','SkyComputerUseService')
    const helperProcesses=rows.flatMap(line=>{
        const match=line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)
        return match&&match[3]===helperPath?[{pid:Number(match[1]),ppid:Number(match[2]),path:match[3]}]:[]
    })
    const statePath=join(workspace,'fixture','state.json')
    const fixtureState=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):null
    const fixtureProcessCurrent=fixtureState!==null&&rows.some(line=>{
        const match=line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)
        return match&&Number(match[1])===fixtureState.pid&&match[3]===join(target,'Contents','MacOS','InputFixture')
    })
    const helperPids=new Set(helperProcesses.map(p=>p.pid))
    const helperKeyboardFilters=taps.filter(t=>helperPids.has(t.ownerPid)&&t.enabled&&t.options===0&&(BigInt(t.mask)&7168n)!==0n)
    return {at:new Date().toISOString(),taps,helperProcesses,fixtureState,fixtureProcessCurrent,helperKeyboardFilters,
        fixtureFilters:helperKeyboardFilters.filter(t=>t.targetPid===fixtureState?.pid)}
}
if(lifecycle)report.before=audit()
const transport=new EventEmitter()
const child=spawn(join(runtime,'bin','node'),[join(runtime,'lib','node_modules','@oai','cua-repl','bin','cua-repl.mjs')],{
    cwd:workspace,detached:true,stdio:['pipe','pipe','pipe'],env:{
        HOME:homedir(),USER:'theo',LOGNAME:'theo',TMPDIR:join(workspace,'tmp'),
        PATH:join(runtime,'bin')+':/usr/bin:/bin:/usr/sbin:/sbin',
        CODEX_HOME:join(workspace,'codex-home'),
        CODEX_CLI_PATH:join(workspace,'tools','CodexCLI.app','Contents','MacOS','codex'),
        CUA_REPL_NODE_REPL_PATH:join(runtime,'bin','node_repl'),
        CUA_REPL_ENABLED_SURFACES:'computer',
        NODE_REPL_NODE_MODULE_DIRS:join(runtime,'lib','node_modules'),
        NODE_REPL_TRUSTED_CODE_PATHS:join(runtime,'lib','node_modules'),
        NODE_PATH:join(runtime,'lib','node_modules'),
        ...(isolatedPipe?{SKY_CUA_SERVICE_NATIVE_PIPE_PATH:isolatedPipe}:{})
    }})
let stderr='',exit
child.stderr.on('data',b=>{stderr=(stderr+b).slice(-65536)})
const lines=createInterface({input:child.stdout})
lines.on('line',line=>transport.emit('message',line))
child.on('error',error=>transport.emit('error',error))
child.on('exit',(code,signal)=>{exit={code,signal};transport.emit('close','owned MCP exited')})
child.stdin.on('error',()=>{})
transport.send=raw=>child.stdin.write(JSON.stringify({jsonrpc:'2.0',...JSON.parse(raw)})+'\n')
transport.close=()=>child.stdin.end()
const peer=new JsonRpcPeer(transport)
peer.on('request',request=>{
    report.serverRequests??=[]
    report.serverRequests.push({method:request.method})
    if(!relayApproval||request.method!=='elicitation/create'){
        request.fail(-32601,'Remote test does not answer approval or consent requests')
        return
    }
    // Standard MCP form relay: acceptance requires a separate, exact human
    // response. Never fabricate persisted approval or alter review settings.
    const params=request.params
    const requestSha256=createHash('sha256').update(JSON.stringify(params)).digest('hex')
    if(humanApproval){
        const prior=JSON.parse(readFileSync(humanApproval,'utf8'))
        const original=JSON.parse(readFileSync(humanApproval.replace('.response.json','.pending.json'),'utf8'))
        const originalHash=createHash('sha256').update(JSON.stringify(original.params)).digest('hex')
        const isFixtureGrant=p=>p.mode==='form'&&p.message==='Allow Computer Use to use "Claude Driver Input Fixture"?'&&
            p._meta?.connector_id==='computer-use'&&p._meta?.riskLevel==='low'&&
            ['get_app_state','type_text'].includes(p._meta?.tool_name)&&
            JSON.stringify(p._meta?.tool_params)===JSON.stringify({app:'dev.taylor.claudedriver.inputfixture'})
        const sameAppTestGrant=phase==='typing'&&isFixtureGrant(original.params)&&isFixtureGrant(params)
        if(prior.requestSha256===originalHash&&prior.source==='Taylor via current Codex chat'&&prior.action==='accept'&&
           (prior.requestSha256===requestSha256||sameAppTestGrant)){
            report.approvalRelays??=[]
            report.approvalRelays.push({requestSha256,outcome:'accept',humanReceipt:humanApproval,sameAppTestGrant})
            report.consentAnswered=true
            request.respond({action:'accept',content:{}})
            return
        }
    }
    const suffix='.request-'+report.serverRequests.length
    const pending=evidence.replace('.json',suffix+'.pending.json')
    const response=evidence.replace('.json',suffix+'.response.json')
    writeFileSync(pending,JSON.stringify({requestSha256,params,response},null,2)+'\n',{flag:'wx',mode:0o600})
    const relay={pending,response,requestSha256,outcome:'awaiting-human'}
    report.approvalRelays??=[]
    report.approvalRelays.push(relay)
    ;(async()=>{
        const deadline=Date.now()+300000
        while(Date.now()<deadline&&!peer.closed){
            if(existsSync(response)){
                const reply=JSON.parse(readFileSync(response,'utf8'))
                if(reply.requestSha256!==requestSha256||reply.source!=='Taylor via current Codex chat'||
                   !['accept','decline'].includes(reply.action))throw Error('human response does not match exact request')
                relay.outcome=reply.action
                report.consentAnswered=true
                request.respond({action:reply.action,...(reply.action==='accept'?{content:{}}:{})})
                return
            }
            await new Promise(resolve=>setTimeout(resolve,250))
        }
        throw Error('exact human approval response not received before deadline')
    })().catch(error=>{
        relay.outcome=error.message
        if(!peer.closed)request.fail(-32603,error.message)
    })
})
try{
    report.initialize=await peer.request('initialize',{protocolVersion:'2024-11-05',capabilities:relayApproval?{elicitation:{}}:{},clientInfo:{name:'claude-driver-remote-input',version:'1'}},{timeoutMs:20000})
    peer.notify('notifications/initialized',{})
    const catalogue=await peer.request('tools/list',{}, {timeoutMs:10000})
    report.tools=catalogue.tools
    if(phase!=='catalogue'){
        if(!catalogue.tools?.some(t=>t.name==='js'))throw Error('documented js tool unavailable')
        // First CUA invocation is exactly the documented app entry call.
        const timeout=relayApproval&&!humanApproval?320000:20000
        report.acquisition=await peer.request('tools/call',{name:'js',arguments:{code:'var fixture = await cua.getApp('+JSON.stringify(target)+');',title:'Inspect isolated input fixture',timeout_ms:timeout}},{timeoutMs:timeout+5000})
        report.ok=report.acquisition?.isError!==true
        if(lifecycle&&report.ok){
            const text=report.acquisition.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n')??''
            if(!text.includes('Claude Driver Input Teardown Fixture')||!text.includes('claude-driver-test-editor'))throw Error('exact fixture AX state not verified')
            report.acquired=audit()
            if(!report.acquired.fixtureProcessCurrent)throw Error('fixture process identity not current')
            if(phase==='typing'){
                if(report.acquired.fixtureState.characters!==0)throw Error('typing requires the empty owned fixture')
                const payload='REMOTE_INPUT_TEARDOWN_'+randomUUID().replaceAll('-','')
                report.syntheticInputIntent={characters:payload.length,utf8Bytes:Buffer.byteLength(payload),sha256:createHash('sha256').update(payload).digest('hex'),attempts:1}
                writeFileSync(evidence.replace('.json','.intent.json'),JSON.stringify(report.syntheticInputIntent,null,2)+'\n',{flag:'wx',mode:0o600})
                report.typing=await peer.request('tools/call',{name:'js',arguments:{code:'await fixture.typeText('+JSON.stringify(payload)+'); await fixture.getAXState();',title:'Type once in isolated fixture',timeout_ms:20000}},{timeoutMs:25000})
                report.afterTyping=audit()
                const state=report.afterTyping.fixtureState,intent=report.syntheticInputIntent
                report.syntheticInputVerified=report.typing?.isError!==true&&report.afterTyping.fixtureProcessCurrent&&
                    state.characters===intent.characters&&state.utf8Bytes===intent.utf8Bytes&&state.sha256===intent.sha256
                if(!report.syntheticInputVerified)report.ok=false
            }
            if(phase==='hold'){
                const ready=evidence.replace('.json','.ready.json'),release=evidence.replace('.json','.release.json')
                report.hold={ready,release,deadline:new Date(Date.now()+90000).toISOString()}
                writeFileSync(ready,JSON.stringify({threadId:marker.threadId,release,snapshot:report.acquired},null,2)+'\n',{flag:'wx',mode:0o600})
                const deadline=Date.now()+90000
                while(Date.now()<deadline&&!existsSync(release))await new Promise(resolve=>setTimeout(resolve,250))
                if(!existsSync(release))throw Error('owned hold release deadline elapsed')
                const command=JSON.parse(readFileSync(release,'utf8'))
                if(command.threadId!==marker.threadId||command.release!==true)throw Error('hold release owner refused')
                report.beforeRelease=audit()
            }else{
                report.reset=await peer.request('tools/call',{name:'js_reset',arguments:{}},{timeoutMs:15000})
                if(report.reset?.isError)throw Error('JS reset failed')
                report.afterReset=audit()
            }
        }
    }else report.ok=Array.isArray(catalogue.tools)&&catalogue.tools.some(t=>t.name==='js')
}catch(error){report.ok=false;report.error={name:error.name,message:error.message.slice(0,500)}}
finally{
    peer.close()
    for(let i=0;i<50&&!exit;i++)await new Promise(resolve=>setTimeout(resolve,100))
    if(!exit&&child.pid){report.ownedMcpTerminationRequested=true;try{process.kill(-child.pid,'SIGTERM')}catch{}}
    for(let i=0;i<20&&!exit;i++)await new Promise(resolve=>setTimeout(resolve,100))
    report.exit=exit??{outcome:'unverified'}
    if(lifecycle){
        try{
            report.afterEof=audit()
            report.nativeFilterInventoryAssessed=true
            if(report.afterEof.helperKeyboardFilters.length)report.ok=false
            if(report.syntheticInputIntent){
                report.syntheticInputStableAfterEof=report.afterEof.fixtureProcessCurrent&&
                    report.afterEof.fixtureState.sha256===report.syntheticInputIntent.sha256&&
                    report.afterEof.fixtureState.characters===report.syntheticInputIntent.characters
                if(!report.syntheticInputStableAfterEof)report.ok=false
            }
        }
        catch(error){report.auditError=error.message;report.ok=false}
    }
    report.stderr=stderr
    report.finishedAt=new Date().toISOString()
    writeFileSync(evidence,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600})
    console.log(JSON.stringify({evidence,ok:report.ok,phase,tools:report.tools?.map(t=>t.name),error:report.error,exit:report.exit}))
}
process.exitCode=report.ok?0:1
