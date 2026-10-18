// Own one native input service per private UI lease. No shared helper control,
// credential copy, permission edit or quarantine release is performed here.
import {spawn,execFile} from 'node:child_process'
import {readFileSync,existsSync,mkdtempSync,lstatSync,rmSync,fstatSync} from 'node:fs'
import {homedir} from 'node:os'
import {join,dirname,isAbsolute} from 'node:path'
import {createHash} from 'node:crypto'
import {promisify} from 'node:util'
import {CODEX_HOME,resolveCodexBinary} from '../../codex-bridge/lib/codex-paths.mjs'
import {KEEP_PLUGINS} from '../../codex-bridge/lib/codex-config.mjs'
import {DriverError} from './paths.mjs'
import {assertUiAvailable} from './ui-policy.mjs'
import {writeJsonAtomic} from './state.mjs'
const run=promisify(execFile),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const fail=message=>new DriverError(message,{category:'private_input_service_failed'})
export const REVIEWED_INPUT_FILES={
 node:'a90d52ad9b963c1c645f82e41909039510dd8958b8fc52b080a5ef5e8bbea0e1',
 nodeRepl:'a4bf42e64c504fc436b74e91b3e3588389a868cdc30cd49b41c7a82b26ffe879',
 launcher:'992174a5e637645aeb444adfdb1bae688e997bb84d7db07532f68e358e60f278',
 nativePipe:'60b3653f7ee052007b02a79e11416a89d424d73dac450e429a93b214839c267f',
 cli:'1afb28c01d7d49e892bd75f11076b10f1451e34e0ee308a95e5ab7f69f9c84fe',
 helper:'f21c31c0ee5df419dbd165bf76ebd65c64d864c6fec5b6c6c3a23c42ff3d2e13'
}
export async function inspectPrivateInputRuntime({resourceRoot,helperApp=join(CODEX_HOME,'computer-use','Codex Computer Use.app'),cli=resolveCodexBinary()}={}){
 if(process.platform!=='darwin')throw fail('Private native input service requires macOS')
 resourceRoot??=['/Applications/ChatGPT.app/Contents/Resources/cua_node','/Applications/Codex.app/Contents/Resources/cua_node'].find(existsSync)
 if(!resourceRoot)throw fail('Bundled Computer Use runtime unavailable')
 const files={node:join(resourceRoot,'bin','node'),nodeRepl:join(resourceRoot,'bin','node_repl'),launcher:join(resourceRoot,'lib','node_modules','@oai','cua-repl','bin','cua-repl.mjs'),nativePipe:join(resourceRoot,'lib','node_modules','@oai','sky','dist','project','cua','sky_js','src','targets','mac','native-pipe.js'),cli,helper:join(helperApp,'Contents','MacOS','SkyComputerUseService')}
 const hashes={}
 for(const [name,path]of Object.entries(files)){
  try{hashes[name]=createHash('sha256').update(readFileSync(path)).digest('hex')}catch{throw fail(`Reviewed input component unavailable: ${name}`)}
  if(hashes[name]!==REVIEWED_INPUT_FILES[name])throw fail(`Input component changed; isolated qualification required: ${name}`)
 }
 try{await run('/usr/bin/codesign',['--verify','--strict',helperApp],{timeout:10000,maxBuffer:65536})}catch{throw fail('Native input helper signature unverified')}
 return {resourceRoot,helperApp,files,hashes,codexHome:CODEX_HOME}
}

// Trusted supervisor payload only. This builds an explicit server instead of
// assuming plugin subprocesses inherit the supervisor's environment.
export function privateInputThreadParams(params,binding){
 if(!binding||binding.version!==1)throw fail('Private input binding missing')
 for(const key of ['node','launcher','resourceRoot','cli','codexHome','socketPath','startupDisabledApp'])if(typeof binding[key]!=='string'||!isAbsolute(binding[key])||binding[key].includes('\0'))throw fail(`Invalid private input binding: ${key}`)
 if(binding.socketPath===binding.startupDisabledApp||dirname(binding.socketPath)!==dirname(binding.startupDisabledApp))throw fail('Private input startup sentinel is not owned by socket lease')
 if(existsSync(binding.startupDisabledApp))throw fail('Private input startup sentinel unexpectedly exists')
 const modules=join(binding.resourceRoot,'lib','node_modules')
 const env={HOME:homedir(),USER:process.env.USER||'',LOGNAME:process.env.LOGNAME||'',PATH:join(binding.resourceRoot,'bin')+':/usr/bin:/bin:/usr/sbin:/sbin',TMPDIR:process.env.TMPDIR||'/tmp',CODEX_HOME:binding.codexHome,CODEX_CLI_PATH:binding.cli,CUA_REPL_NODE_REPL_PATH:join(binding.resourceRoot,'bin','node_repl'),CUA_REPL_ENABLED_SURFACES:'computer',NODE_REPL_NODE_MODULE_DIRS:modules,NODE_REPL_TRUSTED_CODE_PATHS:modules,NODE_PATH:modules,SKY_CUA_SERVICE_NATIVE_PIPE_PATH:binding.socketPath,SKY_CUA_SERVICE_PATH:binding.startupDisabledApp}
 const plugins={...params.config?.plugins,...Object.fromEntries(KEEP_PLUGINS.map(id=>[id,{enabled:false}]))}
 // Only these reviewed local tool entrypoints inherit the caller's existing
 // lease authorization. Native per-app elicitation/person gates still apply.
 return {...params,config:{...params.config,plugins,mcp_servers:{...params.config?.mcp_servers,cua_repl:{command:binding.node,args:[binding.launcher],enabled:true,default_tools_approval_mode:'approve',enabled_tools:['js','js_reset','turn_ended'],startup_timeout_sec:15,env}}}}
}

export async function admitPrivateInputRoster(threadId,getStatus,{timeoutMs=15000}={}){
 const deadline=Date.now()+timeoutMs
 let lastObserved
 do{
  const rows=[];let cursor
  for(let page=0;page<5;page++){
   const result=await getStatus({threadId,limit:100,...(cursor?{cursor}:{})})
   if(!Array.isArray(result.data))throw fail('Private input MCP roster unavailable')
   rows.push(...result.data);cursor=result.nextCursor
   if(!cursor)break
  }
  if(cursor)throw fail('Private input MCP roster exceeds verification bound')
  lastObserved=rows.map(s=>({name:s.name,pluginId:s.pluginId??null,runtimeStatus:s.runtimeStatus??null,tools:Object.keys(s.tools??{}),toolsError:!!s.toolsError}))
  const own=rows.filter(s=>s.name==='cua_repl'),other=rows.filter(s=>s.name!=='cua_repl')
  const ready=own.length===1&&own[0].pluginId==null&&own[0].runtimeStatus==='connected'&&!own[0].toolsError
  const tools=ready?Object.keys(own[0].tools??{}):[]
  if(ready&&tools.includes('js')&&tools.includes('js_reset')&&tools.every(t=>['js','js_reset','turn_ended'].includes(t))&&other.every(s=>s.runtimeStatus==='disabled'&&Object.keys(s.tools??{}).length===0))return {serverName:'cua_repl',pluginId:null,runtimeStatus:'connected',tools:tools.sort(),disabledServers:other.length}
  if(Date.now()>=deadline)break
  await sleep(250)
 }while(true)
 throw new DriverError('Private input MCP roster did not establish exclusive owned server',{category:'private_input_service_failed',detail:{threadId,roster:lastObserved}})
}

export async function openPrivateInputService({evidenceDir,signal,lockFd},{inspect=inspectPrivateInputRuntime,spawnChild=spawn,verifySocketOwner=async(pid,path)=>{
 const {stdout}=await run('/usr/sbin/lsof',['-nP','-a','-p',String(pid),'-U'],{timeout:5000,maxBuffer:65536})
 return stdout.split('\n').some(line=>line.trim().split(/\s+/)[1]===String(pid)&&line.trim().endsWith(' '+path))
}}={}){
 assertUiAvailable()
 if(signal?.aborted)throw fail('Private input startup cancelled')
 let lockIdentity
 if(lockFd!==undefined){
  try{if(!Number.isInteger(lockFd)||lockFd<3)throw Error();const s=fstatSync(lockFd);if(!s.isFile())throw Error();lockIdentity={dev:s.dev,ino:s.ino}}catch{throw fail('Inherited UI kernel lock descriptor unavailable')}
 }
 const runtime=await inspect()
 assertUiAvailable()
 if(signal?.aborted)throw fail('Private input startup cancelled')
 // Keep the AF_UNIX path well below macOS's 104-byte limit; durable evidence
 // stays in the caller's existing lease directory, outside this scratch root.
 const socketDir=mkdtempSync(`/private/tmp/claude-driver-cua-${process.getuid()}-`)
 const socketPath=join(socketDir,'s'),startupDisabledApp=join(socketDir,'startup-disabled.app')
 const binding={version:1,node:runtime.files.node,launcher:runtime.files.launcher,resourceRoot:runtime.resourceRoot,cli:runtime.files.cli,codexHome:runtime.codexHome,socketPath,startupDisabledApp}
 const evidence=join(evidenceDir,'private-input-service.json')
 const row={version:1,startedAt:new Date().toISOString(),socketPath,helperPath:runtime.files.helper,runtimeHashes:runtime.hashes,parentPid:process.pid,ready:false,closed:false,forcedTermination:false,...lockIdentity?{inheritedLock:{...lockIdentity,childFd:3,verified:false}}:{}}
 let exit,spawnError,stderrBytes=0,closePromise
 const env={HOME:homedir(),USER:process.env.USER||'',LOGNAME:process.env.LOGNAME||'',PATH:dirname(runtime.files.cli)+':'+join(runtime.resourceRoot,'bin')+':/usr/bin:/bin:/usr/sbin:/sbin',TMPDIR:process.env.TMPDIR||'/tmp',CODEX_HOME:runtime.codexHome,CODEX_CLI_PATH:runtime.files.cli,SKY_CUA_SERVICE_NATIVE_PIPE_PATH:socketPath}
 let child
 try{child=spawnChild(runtime.files.helper,[],{env,stdio:['ignore','ignore','pipe',...(lockIdentity?[lockFd]:[])]})}
 catch{row.failure='helper_spawn_failed';row.closed=true;writeJsonAtomic(evidence,row);rmSync(socketDir,{recursive:true,force:true});throw fail('Private input helper spawn failed')}
 row.pid=child.pid
 child.stderr?.on('data',b=>{stderrBytes+=b.length})
 child.on('error',error=>{spawnError=error.code||'spawn_failed'})
 child.on('exit',(code,signal)=>{exit={code,signal};row.exitedAt=new Date().toISOString()})
 const save=()=>writeJsonAtomic(evidence,{...row,exit:exit??null,spawnError,stderrBytes})
 const stopAtExit=()=>{if(!exit&&child.pid)try{child.kill('SIGTERM')}catch{}}
 process.once('exit',stopAtExit)
 const close=()=>closePromise??=(async()=>{
  for(let i=0;i<50&&!exit&&!spawnError;i++)await sleep(100)
  if(!exit&&!spawnError){row.forcedTermination=true;try{child.kill('SIGTERM')}catch{};for(let i=0;i<30&&!exit;i++)await sleep(100)}
  row.closed=!!exit||!!spawnError;row.finishedAt=new Date().toISOString();save()
  if(row.closed){process.removeListener('exit',stopAtExit);rmSync(socketDir,{recursive:true,force:true})}
  if(!row.closed||row.forcedTermination||exit?.code!==0||spawnError)throw fail('Private input helper did not close normally; inspect lease evidence')
  return {helperPid:row.pid,helperExit:exit,nativeHelperExited:true,forcedTermination:false,evidence}
 })()
 try{
  save()
  for(let i=0;i<80;i++){
   if(signal?.aborted)throw fail('Private input startup cancelled')
   if(exit||spawnError)throw fail('Private input helper exited before socket binding')
   if(existsSync(socketPath)){
    const parent=lstatSync(socketDir),socket=lstatSync(socketPath)
    if(parent.isSymbolicLink()||!parent.isDirectory()||parent.uid!==process.getuid()||(parent.mode&0o077)!==0||socket.isSymbolicLink()||!socket.isSocket()||socket.uid!==process.getuid())throw fail('Private input socket ownership unverified')
    if(!await verifySocketOwner(child.pid,socketPath))throw fail('Private input socket not bound to exact owned helper')
    if(lockIdentity){
     const {stdout}=await run('/usr/sbin/lsof',['-nP','-a','-p',String(child.pid),'-d','3','-F','fiD'],{timeout:5000,maxBuffer:65536})
     const fields=stdout.trim().split('\n')
     if(!fields.includes('f3')||!fields.includes('i'+lockIdentity.ino)||!fields.some(s=>s.startsWith('D')&&BigInt(s.slice(1))===BigInt(lockIdentity.dev)))throw fail('Owned helper did not retain the UI kernel lock')
     row.inheritedLock.verified=true
    }
    if(exit||spawnError)throw fail('Private input helper exited during verification')
    row.ready=true;save();return {binding,close,evidence,pid:child.pid}
   }
   await sleep(100)
  }
  throw fail('Private input socket startup timed out')
 }catch(error){row.failure=error.message;try{await close()}catch{};throw error}
}
