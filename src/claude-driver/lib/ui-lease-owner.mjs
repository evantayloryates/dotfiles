// A private resource owner, not a second bridge or shared daemon. Its IPC
// lifetime starts before native startup; caller and owner can reap its one group.
import {spawn,execFile} from 'node:child_process'
import {fstatSync,lstatSync,existsSync,rmSync} from 'node:fs'
import {join,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {DriverError} from './paths.mjs'
import {writeJsonAtomic,readJson} from './state.mjs'
import {assertUiAvailable} from './ui-policy.mjs'
import {assertInputHealthy} from './input-health.mjs'
import {openPrivateInputService} from './private-input-service.mjs'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const OWNER=fileURLToPath(new URL('../scripts/tierc-owner.mjs',import.meta.url))
const WORKER=fileURLToPath(new URL('../scripts/tierc-worker.mjs',import.meta.url))
const failed=(message,detail)=>new DriverError(message,{category:'ui_owner_failed',detail})
async function groupSnapshot(group){
 const {stdout,inspectorPid}=await new Promise((resolve,reject)=>{
  const child=execFile('/bin/ps',['-axo','pid=,ppid=,pgid=,stat=,comm='],{timeout:5000,maxBuffer:512*1024},(error,stdout)=>error?reject(error):resolve({stdout,inspectorPid:child.pid}))
 })
 return stdout.trim().split('\n').flatMap(line=>{const m=line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);return m&&Number(m[3])===group&&Number(m[1])!==inspectorPid&&!m[4].startsWith('Z')?[{pid:Number(m[1]),ppid:Number(m[2]),group:Number(m[3]),state:m[4],path:m[5]}]:[]})
}
export async function ownedGroupMembers(group){return (await groupSnapshot(group)).map(p=>p.pid)}
async function reapGroup(group,{excludeSelf=false,excludePids=[]}={}){
 const members=async()=>(await ownedGroupMembers(group)).filter(pid=>(!excludeSelf||pid!==process.pid)&&!excludePids.includes(pid))
 let current=await members()
 // Give normally closing backend/native descendants a brief drain window.
 for(let i=0;i<4&&current.length;i++){await sleep(50);current=await members()}
 const forced=current.length>0
 const terminated=forced?(await groupSnapshot(group)).filter(p=>current.includes(p.pid)):[]
 let escalated=false
 for(const signal of ['SIGTERM','SIGKILL']){
  if(signal==='SIGKILL'&&current.length)escalated=true
  const end=Date.now()+1500
  while(current.length&&Date.now()<end){
   for(const pid of current)try{process.kill(pid,signal)}catch(e){if(e.code!=='ESRCH')throw e}
   await sleep(50);current=await members()
  }
 }
 if(current.length)throw failed('Owned UI group still has resources',{group,remaining:current})
 return {group,forced,terminated,escalated,remaining:[]}
}
const ancillaryGit=path=>/^\/(?:usr\/bin|opt\/homebrew\/(?:bin|Cellar\/git\/[A-Za-z0-9._-]+\/(?:bin|libexec\/git-core)|opt\/git\/libexec\/git-core))\/(?:git|git-remote-https?)$/.test(path)
function retireAbandonedSocket(dir,group){
 const file=join(dir,'private-input-service.json'),row=readJson(file,null)
 if(row?.parentPid!==group||row.closed===true||typeof row.socketPath!=='string')return false
 const parent=dirname(row.socketPath)
 if(!new RegExp('^/private/tmp/claude-driver-cua-'+process.getuid()+'-[A-Za-z0-9]+/s$').test(row.socketPath))return false
 let removed=false
 if(existsSync(parent)){
  const s=lstatSync(parent)
  if(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&0o077)===0){rmSync(parent,{recursive:true,force:true});removed=true}
 }
 writeJsonAtomic(file,{...row,ownerFailureCleanup:{at:new Date().toISOString(),group,ownedSocketRemoved:removed,normalExitVerified:false}})
 return removed
}

// Trusted dependency injection is only for isolated process tests. Production
// calls this with the bundled owner script; no task/config field can change it.
export async function runOwnedUiLease({payload,dir,lockFd,signal,progress=()=>{}},{ownerScript=OWNER}={}){
 assertUiAvailable()
 if(signal?.aborted)throw failed('UI owner cancelled before startup',{dir})
 const s=fstatSync(lockFd),ownerLock={fd:3,dev:s.dev,ino:s.ino}
 if(!s.isFile())throw failed('UI owner requires the kernel lock',{dir})
 const child=spawn(process.execPath,[ownerScript],{env:{...process.env,CODEX_BRIDGE_TRANSPORT:'stdio',CODEX_BRIDGE_STATE_DIR:dir},detached:true,stdio:['ignore','ignore','pipe',lockFd,'ipc']})
 let response,stderr='',spawnError,exit,cancelReason,hardTimer
 const evidence=join(dir,'ui-owner-client.json')
 const send=message=>{if(child.connected)try{child.send(message,()=>{})}catch{}}
 const cancel=reason=>{
  cancelReason??=reason;send({type:'cancel',reason:cancelReason})
  hardTimer??=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL')}catch{}},20000)
 }
 const abort=()=>cancel('caller-cancelled')
 signal?.addEventListener('abort',abort,{once:true})
 child.stderr.on('data',b=>{stderr=(stderr+b).slice(-65536)})
 child.on('message',m=>{if(m?.type==='result')response=m.value;else if(m?.type==='progress'&&typeof m.message==='string')progress(m.message)})
 const done=new Promise(resolve=>{
  child.once('exit',(code,signal)=>{exit={code,signal};resolve()})
  child.once('error',e=>{spawnError=e.code||'spawn_failed';resolve()})
 })
 send({type:'run',payload,dir,ownerLock})
 if(signal?.aborted)abort()
 const deadline=setTimeout(()=>cancel('owner-deadline'),(Math.max(30,payload.timeoutSec)+40)*1000)
 let groupCleanup
 try{
  await done
  // The owner deliberately has one group, including helper/worker/backends.
  // This still runs if that owner was SIGKILLed before sending a receipt.
  if(child.pid){groupCleanup=await reapGroup(child.pid);if(exit?.code!==0||!response?.worker)groupCleanup.abandonedSocketRemoved=retireAbandonedSocket(dir,child.pid)}
  writeJsonAtomic(evidence,{ownerPid:child.pid,exit,spawnError,cancelReason,response,groupCleanup,stderr})
  if(signal?.aborted)throw new DriverError('UI lease cancelled; inspect state before replay',{category:'cancelled',detail:{evidence}})
  if(spawnError||exit?.code!==0||response?.error||!response?.worker||groupCleanup?.forced)throw failed(response?.error?.message||'UI lease owner did not finish normally',{evidence})
  if(response.owner?.pid!==child.pid||response.owner?.group!==child.pid||JSON.stringify(response.owner?.lock)!==JSON.stringify(ownerLock))throw failed('UI owner identity receipt mismatch',{evidence})
  return {...response,evidence}
 }finally{
  clearTimeout(deadline);clearTimeout(hardTimer);signal?.removeEventListener('abort',abort)
  if(!exit&&child.pid){try{process.kill(-child.pid,'SIGKILL')}catch{};await reapGroup(child.pid)}
 }
}

async function executeLease({payload,dir,ownerLock},signal,{openService,audit}){
 assertUiAvailable()
 if(dir!==process.env.CODEX_BRIDGE_STATE_DIR||typeof payload?.task!=='string'||!Number.isFinite(payload.timeoutSec)||Buffer.byteLength(JSON.stringify(payload))>64*1024)throw failed('Invalid private UI owner input')
 const s=fstatSync(3)
 if(ownerLock?.fd!==3||!s.isFile()||s.dev!==ownerLock.dev||s.ino!==ownerLock.ino)throw failed('UI owner inherited lock identity mismatch')
 const group=(await ownedGroupMembers(process.pid))
 if(!group.includes(process.pid))throw failed('UI owner is not its resource group leader')
 let service,worker,workerExit,output='',stderr='',overflow=false,timedOut=false,spawnError,workerResult,response
 let timer,abort
 const row={version:1,ownerPid:process.pid,group:process.pid,parentPid:process.ppid,lock:ownerLock,startedAt:new Date().toISOString()}
 const path=join(dir,'ui-owner.json'),save=()=>writeJsonAtomic(path,row)
 save()
 try{
  if(signal.aborted)throw failed('UI owner cancelled before helper startup')
  service=await openService({evidenceDir:dir,signal,lockFd:3});row.helperPid=service.pid;save()
  if(signal.aborted)throw failed('UI owner cancelled before worker startup')
  const input=JSON.stringify({...payload,inputService:service.binding,ownerLock})
  if(Buffer.byteLength(input)>64*1024)throw failed('UI worker input exceeds bound')
  // Stay in the owner's group: its surviving caller can reap every resource
  // if the cleanup owner dies. Core backend inheritance is already scoped.
  worker=spawn(process.execPath,[WORKER],{env:process.env,detached:false,stdio:['pipe','pipe','pipe',3]})
  row.workerPid=worker.pid;save()
  const stop=()=>{try{worker.kill('SIGTERM')}catch{}}
  abort=stop;signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()
  timer=setTimeout(()=>{timedOut=true;stop()},(Math.max(30,payload.timeoutSec)+10)*1000)
  worker.stdout.on('data',b=>{output+=b;if(Buffer.byteLength(output)>1024*1024){overflow=true;stop()}})
  worker.stderr.on('data',b=>{stderr=(stderr+b).slice(-65536);for(const line of b.toString().split('\n'))try{const m=JSON.parse(line);if(typeof m.progress==='string'&&process.connected)process.send({type:'progress',message:m.progress})}catch{}})
  worker.stdin.on('error',()=>{});worker.stdin.end(input)
  workerExit=await new Promise(resolve=>{worker.once('exit',(code,signal)=>resolve({code,signal}));worker.once('error',e=>{spawnError=e.code;resolve({code:-1})})})
  clearTimeout(timer);signal.removeEventListener('abort',abort)
  try{workerResult=JSON.parse(output)}catch{}
  writeJsonAtomic(join(dir,'result.json'),{...workerExit,overflow,timedOut,spawnError,result:workerResult,stderr})
  if(signal.aborted)throw failed('UI owner lost caller or was cancelled')
  if(workerExit.code!==0||workerResult?.error||!workerResult?.result||overflow||timedOut)throw failed(workerResult?.error?.message||'Private UI worker failed')
  response={worker:workerResult,owner:{pid:process.pid,group:process.pid,lock:ownerLock,socket:service.binding.socketPath}}
  return response
 }finally{
  clearTimeout(timer);if(abort)signal.removeEventListener('abort',abort)
  // Worker cancellation can exit before all of its descendants. Retain the
  // owner's inherited mutex until cleanup and the independent audit finish.
  if(worker&&!workerExit)try{worker.kill('SIGTERM')}catch{}
  let cleanupError
  // A normally closed worker lets the native helper and its own internal
  // descendants drain first. Failed/cancelled workers must lose their clients.
  row.workerGroupCleanup=!signal.aborted&&workerExit?.code===0&&!workerResult?.error?{group:process.pid,forced:false,remaining:[],deferredUntilHelperExit:true}:await reapGroup(process.pid,{excludeSelf:true,excludePids:service?[service.pid]:[]})
  try{if(service){const receipt=await service.close();if(response)response.nativeInputService=receipt;row.nativeInputService=receipt}}catch(e){cleanupError=e.message}
  row.groupCleanup=await reapGroup(process.pid,{excludeSelf:true})
  // Current bundled backends can leave their own Git children after a normal
  // worker/native exit. Cooperative retirement is separate from native cleanup.
  // Unknown commands, escalation and every native-helper termination still fail.
  row.ancillaryGitRetired=!!response&&!!row.nativeInputService?.nativeHelperExited&&row.nativeInputService.helperExit?.code===0&&row.groupCleanup.forced&&!row.groupCleanup.escalated&&row.groupCleanup.terminated.length>0&&row.groupCleanup.terminated.every(p=>ancillaryGit(p.path))
  if(response)response.ancillaryCleanup=row.groupCleanup
  try{await audit({phase:'after-owner-lease',evidence:join(dir,'input-taps-owner-after.json')})}catch(e){cleanupError??=e.message}
  row.finishedAt=new Date().toISOString();row.workerExit=workerExit;row.cancelled=signal.aborted;row.closed=true;row.cleanupError=cleanupError;save()
  if(cleanupError||(row.groupCleanup.forced&&!row.ancillaryGitRetired)||row.workerGroupCleanup.forced)throw failed(cleanupError||'UI owner required forced resource cleanup',{evidence:path})
 }
}

export async function serveUiLeaseOwner({openService=openPrivateInputService,audit=assertInputHealthy}={}){
 if(!process.send||!process.connected)throw failed('UI owner requires its caller lifetime channel')
 let groupVerified=false
 const groupReady=ownedGroupMembers(process.pid).then(pids=>groupVerified=pids.includes(process.pid)).catch(()=>false)
 const forceExit=()=>{if(groupVerified)process.kill(-process.pid,'SIGKILL');else process.exit(1)}
 const controller=new AbortController();let started=false,finished=false,resolveDone,abortDeadline
 const done=new Promise(resolve=>resolveDone=resolve)
 const abort=()=>{
  if(finished)return
  controller.abort()
  abortDeadline??=setTimeout(()=>{
   try{writeJsonAtomic(join(process.env.CODEX_BRIDGE_STATE_DIR,'ui-owner-emergency.json'),{ownerPid:process.pid,reason:'owner cleanup deadline',at:new Date().toISOString(),normalCleanupVerified:false})}
   finally{forceExit()}
  },20000)
 }
 process.on('disconnect',abort);process.on('SIGTERM',abort);process.on('SIGINT',abort)
 const startup=setTimeout(()=>{if(!started){process.exitCode=1;finished=true;process.disconnect?.();resolveDone()}},15000)
 const message=async m=>{
  if(m?.type==='cancel'){abort();return}
  if(m?.type!=='run'||started)return
  started=true;clearTimeout(startup)
  let value
  try{if(!await groupReady)throw failed('UI owner must lead its private resource group');value=await executeLease(m,controller.signal,{openService,audit})}
  catch(e){
   process.exitCode=1;value={error:{category:e.category||'ui_owner_failed',message:e.message,detail:e.detail}}
   // A failure inside teardown must not leave the owner alive with children.
   // This emergency receipt never claims graceful/native cleanup success.
   if((await ownedGroupMembers(process.pid)).includes(process.pid)){
    try{const cleanup=await reapGroup(process.pid,{excludeSelf:true});if(cleanup.forced){writeJsonAtomic(join(process.env.CODEX_BRIDGE_STATE_DIR,'ui-owner-emergency.json'),{ownerPid:process.pid,reason:e.message,cleanup,normalCleanupVerified:false});try{await audit({phase:'after-owner-emergency',evidence:join(process.env.CODEX_BRIDGE_STATE_DIR,'input-taps-owner-emergency.json')})}catch{}}}
    catch(error){writeJsonAtomic(join(process.env.CODEX_BRIDGE_STATE_DIR,'ui-owner-emergency.json'),{ownerPid:process.pid,reason:error.message,normalCleanupVerified:false});forceExit()}
   }
  }
  finished=true
  if(process.connected)await new Promise(resolve=>process.send({type:'result',value},()=>resolve()))
  if(process.connected)process.disconnect()
  resolveDone()
 }
 const onMessage=m=>message(m).catch(error=>{
  try{writeJsonAtomic(join(process.env.CODEX_BRIDGE_STATE_DIR,'ui-owner-emergency.json'),{ownerPid:process.pid,reason:error.message,normalCleanupVerified:false})}
  finally{forceExit()}
 })
 process.on('message',onMessage)
 try{await done}finally{clearTimeout(startup);clearTimeout(abortDeadline);process.removeListener('message',onMessage);process.removeListener('disconnect',abort);process.removeListener('SIGTERM',abort);process.removeListener('SIGINT',abort)}
}
