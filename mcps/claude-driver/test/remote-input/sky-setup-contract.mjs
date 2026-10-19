// Pure-JS dependency contract on the owned remote rig. Imports the actual Sky
// service, calls setup only, and traps native startup and network capabilities.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {hostname,homedir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
const root='/Users/theo/.local/state/claude-driver/input-teardown-20261018'
if(process.platform!=='darwin'||homedir()!=='/Users/theo'||hostname().split('.')[0]!=='theo-air'||!process.env.SSH_CONNECTION||JSON.parse(readFileSync(join(root,'owner.json'))).threadId!=='01a112b1-fbf6-7cb0-8228-ce3e6cb6112d')throw Error('remote scope refused')
const runtime=join(root,'tools/cua_node'),service=join(runtime,'lib/node_modules/@oai/sky/dist/project/cua/sky_js/src/service.js'),hash=b=>createHash('sha256').update(b).digest('hex')
if(hash(readFileSync(service))!=='5b2fa2f0e19c8401a9be8c71be17008d88049ab107972c1e4a5cb615f4ef5993')throw Error('reviewed Sky service changed')
const run=join(root,'evidence','sky-setup-contract-'+Date.now());mkdirSync(run,{mode:0o700})
const report={run,startedAt:new Date().toISOString(),sourceSha256:hash(readFileSync(new URL(import.meta.url))),serviceSha256:hash(readFileSync(service)),scope:'actual JS service setup only, capability traps, not native NodeREPL/app proof',registeredHandlers:0,nativeConnectionAttempts:0,launchAttempts:0,networkAttempts:0,nativeInputRequested:0,ok:false}
const helpers=()=>execFileSync('/bin/ps',['-axo','pid=,ppid=,comm='],{encoding:'utf8',timeout:5000}).split('\n').filter(x=>x.includes(join(root,'codex-home/computer-use/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService'))).map(x=>x.trim())
writeFileSync(join(run,'source.mjs'),readFileSync(new URL(import.meta.url)),{flag:'wx',mode:0o600})
report.helpersBefore=helpers()
process.env.OAI_SKY_CONFIG_PATH=''
globalThis.nodeRepl={config:{},env:{NODE_REPL_DISABLE_ANALYTICS:'1',BROWSER_USE_DISABLE_AMBIENT_NETWORK:'1'},requestMeta:{},addTurnEndedHandler(){report.registeredHandlers++;return()=>{}},nativePipe:{createConnection(){report.nativeConnectionAttempts++;throw Error('native capability denied by setup-only contract')}},launchServices:{openApplication(){report.launchAttempts++;throw Error('launch denied by setup-only contract')}},async fetch(){report.networkAttempts++;throw Error('network denied by setup-only contract')}}
try{
 const module=await import(pathToFileURL(service).href)
 const first=await module.handleRpc({type:'setup'}),second=await module.handleRpc({type:'setup'})
 report.setups=[first,second]
 report.helpersAfter=helpers()
 report.ok=first.target==='mac'&&second.target==='mac'&&Array.isArray(first.methods)&&first.methods.includes('get_app_state')&&first.methods.includes('type_text')&&report.registeredHandlers===0&&report.nativeConnectionAttempts===0&&report.launchAttempts===0&&report.networkAttempts===0&&report.helpersBefore.length===0&&report.helpersAfter.length===0
}catch(e){report.error=e.message}
finally{delete globalThis.nodeRepl;report.finishedAt=new Date().toISOString();writeFileSync(join(run,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600})}
console.log(JSON.stringify({run,ok:report.ok,registeredHandlers:report.registeredHandlers,nativeConnectionAttempts:report.nativeConnectionAttempts,launchAttempts:report.launchAttempts,networkAttempts:report.networkAttempts,methodCount:report.setups?.[0]?.methods.length,helpersBefore:report.helpersBefore.length,helpersAfter:report.helpersAfter?.length,error:report.error}))
if(!report.ok)process.exitCode=1
