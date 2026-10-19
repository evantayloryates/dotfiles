// Exact owned remote candidate resource process. It owns helper and minimal
// public MCP outside all UI-lease groups, inheriting no UI-lock descriptor.
import {spawn,execFileSync} from 'node:child_process'
import {EventEmitter} from 'node:events'
import {createInterface} from 'node:readline'
import {hostname,homedir} from 'node:os'
import {readFileSync,writeFileSync,existsSync,lstatSync} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {JsonRpcPeer} from '../../../../codex-bridge/src/lib/jsonrpc.mjs'
import {inspectPrivateInputRuntime,openPrivateInputService,privateInputThreadParams} from '../../lib/private-input-service.mjs'
import {readProcessSnapshot,matchingLockDescriptors} from './process-observation.mjs'
const root='/Users/theo/.local/state/claude-driver/input-teardown-20261018'
if(process.platform!=='darwin'||hostname().split('.')[0]!=='theo-air'||homedir()!=='/Users/theo'||!process.env.SSH_CONNECTION||!process.send||!process.connected||JSON.parse(readFileSync(join(root,'owner.json'))).threadId!=='01a112b1-fbf6-7cb0-8228-ce3e6cb6112d')throw Error('exact remote keeper owner refused')
const hash=b=>createHash('sha256').update(b).digest('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms))
let service,client,peer,clientExit,helperReceipt,dir,uiLock,busy=false,started=false,closing=false
const row={version:1,scope:'owned-native-inventory-keeper-no-app-or-input',pid:process.pid,inputEventsRequested:0,appAcquisitionsRequested:0,startedAt:new Date().toISOString()}
const save=()=>{if(dir)writeFileSync(join(dir,'resource-host.json'),JSON.stringify(row,null,2)+'\n',{mode:0o600})}
const processRows=()=>readProcessSnapshot().rows
const singleton=()=>{
 const rows=processRows(),helpers=rows.filter(p=>p.path.endsWith('/SkyComputerUseService'))
 if(!service||helpers.length!==1||helpers[0].pid!==service.pid||helpers[0].group!==process.pid)throw Error('exact singleton keeper helper unverified')
 return {rows,helper:helpers[0]}
}
async function probe(){
 const {rows,helper}=singleton(),s=lstatSync(service.binding.socketPath)
 if(!s.isSocket()||s.isSymbolicLink()||s.uid!==process.getuid())throw Error('owned keeper socket changed')
 let peers=rows.filter(p=>p.group===process.pid),output
 for(let attempt=0;attempt<5;attempt++){
  try{output=execFileSync('/usr/sbin/lsof',['-nP','-a','-p',peers.map(p=>p.pid).join(','),'-F','pfiD'],{encoding:'utf8',timeout:5000,maxBuffer:256*1024});break}
  catch(error){
   const current=processRows().filter(p=>p.group===process.pid)
   // Retry only a changed observation set, never ignore a stable lsof error.
   if(attempt===4||JSON.stringify(current)===JSON.stringify(peers))throw error
   peers=current;await sleep(25)
  }
 }
 const matches=matchingLockDescriptors(output,uiLock)
 const socketRows=execFileSync('/usr/sbin/lsof',['-nP','-a','-p',String(service.pid),'-U'],{encoding:'utf8',timeout:5000,maxBuffer:128*1024}).split('\n')
 if(!socketRows.some(line=>line.trim().endsWith(' '+service.binding.socketPath)))throw Error('owned helper socket binding missing')
 if(matches.length)throw Error('keeper inherited per-lease UI lock')
 return {alive:true,uiLockInherited:false,identity:{pid:service.pid,group:helper.group,socketPath:service.binding.socketPath,socketDev:s.dev,socketIno:s.ino},peers:peers.map(({pid,ppid,group,path})=>({pid,ppid,group,path})),clientExit:clientExit??null,connectedHelperUnixRows:socketRows.filter(line=>line.includes('->')).length,uiLockMatches:matches}
}
async function close(){
 // A foreign helper appearing makes teardown unsafe to qualify. Keep the exact
 // owned channel/resources available for later reconciliation; never kill it.
 if(service&&!helperReceipt)singleton()
 peer?.close()
 for(let i=0;i<80&&client&&!clientExit;i++)await sleep(50)
 if(client&&(!clientExit||clientExit.code!==0||clientExit.signal!==null))throw Error('keeper MCP did not retire normally')
 helperReceipt??=service?await service.close():null
 if(helperReceipt?.forcedTermination)throw Error('keeper helper forced retirement')
 let remaining=processRows().filter(p=>p.group===process.pid&&p.pid!==process.pid)
 for(let i=0;i<40&&remaining.length;i++){await sleep(50);remaining=processRows().filter(p=>p.group===process.pid&&p.pid!==process.pid)}
 if(remaining.length)throw Error('owned keeper resource peers remain')
 row.closedNormally=true;row.clientExit=clientExit??null;row.helperReceipt=helperReceipt;row.finishedAt=new Date().toISOString();save()
 return {clientsRetired:true,helperExit:helperReceipt?.helperExit??null,resourceAbsent:!service||!existsSync(service.binding.socketPath),forced:false}
}
async function start(spec){
 if(started||typeof spec.dir!=='string'||!spec.dir.startsWith(root+'/evidence/keeper-native-')||spec.dir!==process.cwd()||!Number.isSafeInteger(spec.uiLock?.dev)||!Number.isSafeInteger(spec.uiLock?.ino))throw Error('owned keeper start spec refused')
 const st=lstatSync(spec.dir);if(st.isSymbolicLink()||!st.isDirectory()||st.uid!==process.getuid()||(st.mode&0o077)!==0)throw Error('owned keeper evidence directory refused')
 if(processRows().some(p=>p.path.endsWith('/SkyComputerUseService')))throw Error('preexisting native helper refuses startup')
 started=true;dir=spec.dir;uiLock=spec.uiLock;row.uiLock=uiLock;save()
 const runtime=await inspectPrivateInputRuntime({resourceRoot:join(root,'tools/cua_node'),helperApp:join(root,'codex-home/computer-use/Codex Computer Use.app'),cli:join(root,'tools/CodexCLI.app/Contents/MacOS/codex')})
 row.runtimeHashes=runtime.hashes;row.epoch=hash(JSON.stringify(runtime.hashes));save()
 service=await openPrivateInputService({evidenceDir:dir},{inspect:async()=>runtime})
 row.helperPid=service.pid;save()
 const server=privateInputThreadParams({},service.binding).config.mcp_servers.cua_repl
 const transport=new EventEmitter();client=spawn(server.command,server.args,{cwd:dir,env:server.env,detached:false,stdio:['pipe','pipe','pipe']})
 row.clientPid=client.pid;row.stderrBytes=0;client.stderr.on('data',b=>row.stderrBytes+=b.length)
 client.on('error',()=>transport.emit('error',Error('owned MCP spawn failed')))
 client.on('close',(code,signal)=>{clientExit={code,signal};transport.emit('close','owned MCP closed')})
 client.stdin.on('error',()=>{});createInterface({input:client.stdout}).on('line',line=>transport.emit('message',line))
 transport.send=raw=>client.stdin.write(JSON.stringify({jsonrpc:'2.0',...JSON.parse(raw)})+'\n');transport.close=()=>client.stdin.end()
 peer=new JsonRpcPeer(transport);peer.on('request',request=>{row.refusedNativeRequests=(row.refusedNativeRequests??0)+1;request.fail(-32601,'native consent requires the human; inventory-only candidate');save()})
 await peer.request('initialize',{protocolVersion:'2024-11-05',capabilities:{elicitation:{}},clientInfo:{name:'claude-driver-native-keeper-inventory',version:'1'}},{timeoutMs:15000});peer.notify('notifications/initialized',{})
 const tools=await peer.request('tools/list',{}, {timeoutMs:10000});row.tools=tools.tools.map(t=>t.name)
 if(!row.tools.includes('js')||row.tools.some(t=>!['js','js_reset','turn_ended','js_add_node_module_dir'].includes(t)))throw Error('public MCP inventory interface changed')
 const result=await peer.request('tools/call',{name:'js',arguments:{code:'await cua.getState();',title:'Inspect isolated keeper inventory',timeout_ms:15000}},{timeoutMs:20000})
 const text=(result.content??[]).filter(c=>c.type==='text').map(c=>c.text).join('\n')
 row.inventory={isError:result.isError===true,bytes:Buffer.byteLength(text),sha256:hash(text),hasText:!!text.length,images:(result.content??[]).filter(c=>c.type==='image').length};save()
 if(result.isError||!text.length||row.refusedNativeRequests)throw Error('public inventory keeper connection did not qualify')
 row.ready=await probe();save();return {epoch:row.epoch,observation:row.ready,inventory:row.inventory,runtimeHashes:runtime.hashes,inputBinding:service.binding}
}
process.on('message',async m=>{
 if(!Number.isSafeInteger(m?.id)||busy||closing){if(Number.isSafeInteger(m?.id))process.send?.({id:m.id,error:'resource operation unavailable'});return}
 busy=true
 try{
  let result
  if(m.type==='start')result=await start(m)
  else if(m.type==='probe')result=await probe()
  else if(m.type==='close'){result=await close();closing=true}
  else throw Error('fixed resource operation refused')
  if(process.connected)await new Promise(resolve=>process.send({id:m.id,result},()=>resolve()))
  if(closing)process.disconnect()
 }catch(error){row.failure=error.message;save();if(process.connected)process.send({id:m.id,error:error.message})}
 finally{busy=false}
})
process.on('disconnect',()=>{
 if(closing)return
 // Preserve a visible failure, not an invented native cleanup receipt. The
 // final owner/watchdog design must qualify this channel-loss path separately.
 row.controllerLost=true;save();process.exitCode=1
})
