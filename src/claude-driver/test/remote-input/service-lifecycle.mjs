// Remote-only production helper factory qualification. Read-only fixture
// acquisition through public MCP; no typing, host turn or hook-trust override.
import {spawn} from 'node:child_process'
import {EventEmitter,once} from 'node:events'
import {createInterface} from 'node:readline'
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import {homedir,hostname} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {JsonRpcPeer} from '../../../codex-bridge/lib/jsonrpc.mjs'
import {audit} from './native-audit.mjs'
const root='/Users/theo/.local/state/claude-driver/input-teardown-20261018'
if(process.platform!=='darwin'||hostname().split('.')[0]!=='theo-air'||homedir()!=='/Users/theo'||!process.env.SSH_CONNECTION||JSON.parse(readFileSync(join(root,'owner.json'))).threadId!=='01a112b1-fbf6-7cb0-8228-ce3e6cb6112d')throw Error('remote owner refused')
const run=join(root,'evidence','service-lifecycle-'+Date.now());mkdirSync(run,{mode:0o700})
process.env.CLAUDE_DRIVER_STATE_DIR=join(run,'policy');mkdirSync(process.env.CLAUDE_DRIVER_STATE_DIR)
writeFileSync(join(process.env.CLAUDE_DRIVER_STATE_DIR,'ui-quarantine.json'),JSON.stringify({blocked:false,scope:'authorized remote isolated lifecycle fixture'}))
const {inspectPrivateInputRuntime,openPrivateInputService,privateInputThreadParams}=await import('../../lib/private-input-service.mjs')
const runtimeRoot=join(root,'tools/cua_node'),cli=join(root,'tools/CodexCLI.app/Contents/MacOS/codex'),helperApp=join(root,'codex-home/computer-use/Codex Computer Use.app')
const report={run,scope:'production-private-helper-factory-readonly-fixture',startedAt:new Date().toISOString(),inputEventsRequested:0,actualHostTurn:false,approvalRelays:[]}
const hash=b=>createHash('sha256').update(b).digest('hex')
const receiptPath=join(root,'evidence/acquire-1792351052633.request-1.response.json'),receipt=JSON.parse(readFileSync(receiptPath)),original=JSON.parse(readFileSync(receiptPath.replace('.response.json','.pending.json')))
if(receipt.source!=='Taylor via current Codex chat'||receipt.action!=='accept'||receipt.requestSha256!==hash(JSON.stringify(original.params)))throw Error('original fixture test approval refused')
const fixtureEnv={HOME:homedir(),USER:'theo',LOGNAME:'theo',PATH:'/usr/bin:/bin:/usr/sbin:/sbin',TMPDIR:join(root,'tmp')}
let fixture,service,client,peer,clientExit,fixtureExit,fixtureStopRequested=false
const stop=join(root,'fixture/stop')
try{
 report.before=audit(root)
 if(report.before.helperProcesses.length||report.before.fixtureProcessCurrent||existsSync(stop))throw Error('remote baseline not empty')
 fixture=spawn(join(root,'fixture/ClaudeDriverInputFixture.app/Contents/MacOS/InputFixture'),[],{env:fixtureEnv,stdio:'ignore'})
 for(let i=0;i<40;i++){
  const snapshot=audit(root)
  if(snapshot.fixtureProcessCurrent&&snapshot.fixtureState.pid===fixture.pid&&snapshot.fixtureState.characters===0)break
  if(i===39)throw Error('owned empty fixture not ready')
  await new Promise(r=>setTimeout(r,100))
 }
 service=await openPrivateInputService({evidenceDir:run},{inspect:()=>inspectPrivateInputRuntime({resourceRoot:runtimeRoot,helperApp,cli})})
 report.ready={pid:service.pid,socketPath:service.binding.socketPath,evidence:service.evidence}
 const server=privateInputThreadParams({},service.binding).config.mcp_servers.cua_repl
 const transport=new EventEmitter()
 client=spawn(server.command,server.args,{env:server.env,cwd:run,detached:true,stdio:['pipe','pipe','pipe']})
 report.clientPid=client.pid
 let stderrBytes=0;client.stderr.on('data',b=>stderrBytes+=b.length)
 createInterface({input:client.stdout}).on('line',line=>transport.emit('message',line))
 client.on('exit',(code,signal)=>{clientExit={code,signal};report.stderrBytes=stderrBytes;transport.emit('close','owned client exited')})
 client.on('error',e=>transport.emit('error',e));client.stdin.on('error',()=>{})
 transport.send=raw=>client.stdin.write(JSON.stringify({jsonrpc:'2.0',...JSON.parse(raw)})+'\n');transport.close=()=>client.stdin.end()
 peer=new JsonRpcPeer(transport)
 peer.on('request',request=>{
  const p=request.params,isGrant=q=>q.mode==='form'&&q.message==='Allow Computer Use to use "Claude Driver Input Fixture"?'&&q._meta?.connector_id==='computer-use'&&q._meta?.riskLevel==='low'&&q._meta?.tool_name==='get_app_state'&&JSON.stringify(q._meta?.tool_params)===JSON.stringify({app:'dev.taylor.claudedriver.inputfixture'})
  if(request.method==='elicitation/create'&&isGrant(original.params)&&isGrant(p)){
   report.approvalRelays.push({receipt:receiptPath,requestSha256:hash(JSON.stringify(p)),action:'accept',persistedApprovalRequested:false});request.respond({action:'accept',content:{}})
  }else request.fail(-32601,'outside exact existing fixture test grant')
 })
 await peer.request('initialize',{protocolVersion:'2024-11-05',capabilities:{elicitation:{}},clientInfo:{name:'claude-driver-production-factory-gate',version:'1'}},{timeoutMs:20000});peer.notify('notifications/initialized',{})
 const list=await peer.request('tools/list',{}, {timeoutMs:10000});report.tools=list.tools.map(t=>t.name)
 const result=await peer.request('tools/call',{name:'js',arguments:{code:'var fixture = await cua.getApp('+JSON.stringify(join(root,'fixture/ClaudeDriverInputFixture.app'))+');',title:'Inspect isolated input fixture',timeout_ms:20000}},{timeoutMs:25000})
 const text=(result.content??[]).filter(c=>c.type==='text').map(c=>c.text).join('\n')
 report.acquisition={isError:result.isError===true,bytes:Buffer.byteLength(text),sha256:hash(text),exactFixtureObserved:text.includes('Claude Driver Input Teardown Fixture')&&text.includes('claude-driver-test-editor'),...(result.isError?{firstLine:text.split('\n')[0].slice(0,300)}:{})}
 report.afterAcquisition=audit(root)
 peer.close();for(let i=0;i<50&&!clientExit;i++)await new Promise(r=>setTimeout(r,100))
 report.clientExit=clientExit??null
 report.closeReceipt=await service.close()
 report.afterClose=audit(root)
 report.ok=!result.isError&&report.acquisition.exactFixtureObserved&&clientExit?.code===0&&report.closeReceipt.nativeHelperExited&&!report.closeReceipt.forcedTermination&&report.afterClose.helperProcesses.length===0&&report.afterClose.helperKeyboardFilters.length===0&&report.afterClose.fixtureState.characters===0&&report.afterClose.fixtureProcessCurrent
}catch(error){report.error={category:error.category,message:error.message};report.ok=false}
finally{
 peer?.close()
 if(client&&!clientExit){try{process.kill(-client.pid,'SIGTERM')}catch{};for(let i=0;i<30&&!clientExit;i++)await new Promise(r=>setTimeout(r,100))}
 if(service)try{report.finalClose=await service.close()}catch(e){report.cleanupError=e.message;report.ok=false}
 if(fixture&&fixture.exitCode===null&&fixture.signalCode===null){writeFileSync(stop,'owned fixture stop\n',{flag:'wx'});fixtureStopRequested=true;const timer=setTimeout(()=>{},10000);await Promise.race([once(fixture,'exit').then(([code,signal])=>{fixtureExit={code,signal}}),new Promise(r=>setTimeout(r,10000))]);clearTimeout(timer)}
 report.fixtureExit=fixtureExit??null;report.fixtureStopRequested=fixtureStopRequested
 report.final=audit(root);report.finishedAt=new Date().toISOString()
 writeFileSync(join(run,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600})
 console.log(JSON.stringify({run,ok:report.ok,error:report.error,cleanupError:report.cleanupError,acquisition:report.acquisition,closeReceipt:report.closeReceipt,clientExit:report.clientExit,fixtureExit:report.fixtureExit,remainingHelpers:report.final.helperProcesses.length,remainingFilters:report.final.helperKeyboardFilters.length}))
}
process.exitCode=report.ok?0:1
