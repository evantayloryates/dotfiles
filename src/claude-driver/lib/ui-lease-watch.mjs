// The live member of an owned lease group watches its creator's IPC lifetime.
// Recovery is authorized by its own group and inherited descriptor, not stale PIDs.
import {execFile} from 'node:child_process'
import {fstatSync} from 'node:fs'
import {join} from 'node:path'
import {writeJsonAtomic} from './state.mjs'
import {assertInputHealthy} from './input-health.mjs'
import {ownedGroupMembers,retireOrphanUiPeers} from './ui-lease-owner.mjs'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
export async function serveUiLeaseWatch({audit=assertInputHealthy}={}){
 if(!process.send)throw Error('UI watchdog requires its creator channel')
 const spec=JSON.parse(process.env.CLAUDE_DRIVER_UI_WATCH||'null')
 if(!Number.isInteger(spec?.group)||spec.group<=1||spec.dir!==process.env.CODEX_BRIDGE_STATE_DIR||spec.lock?.fd!==3)throw Error('Invalid UI watchdog identity')
 let verified=false,retiring=false,disarmed=false,lost=!process.connected,resolveDone
 const done=new Promise(resolve=>resolveDone=resolve)
 const file=join(spec.dir,'ui-owner-orphan.json')
 const force=()=>{if(verified)process.kill(-spec.group,'SIGKILL');else process.exit(1)}
 const retire=async()=>{
  if(!verified||retiring||disarmed)return
  retiring=true
  const row={version:1,watcherPid:process.pid,group:spec.group,lock:spec.lock,startedAt:new Date().toISOString(),phase:'retiring',liveGroupVerified:true,inheritedLockVerified:true,originalWorkCompleted:false,normalNativeExitVerified:false}
  writeJsonAtomic(file,row)
  const deadline=setTimeout(()=>{try{writeJsonAtomic(file,{...row,phase:'emergency',normalCleanupVerified:false})}finally{force()}},20000)
  try{
   const cleanup=await retireOrphanUiPeers({group:spec.group,dir:spec.dir,lock:spec.lock},{audit})
   writeJsonAtomic(file,{...row,...cleanup,phase:'retired',finishedAt:new Date().toISOString()})
  }catch(error){writeJsonAtomic(file,{...row,phase:'failed',error:error.message,normalCleanupVerified:false});force()}
  finally{clearTimeout(deadline)}
  process.exitCode=1
  if(process.connected)process.disconnect()
  resolveDone()
 }
 const onLoss=()=>{lost=true;retire().catch(force)}
 process.on('disconnect',onLoss)
 process.on('message',m=>{
  if(m?.type!=='disarm'||!verified||retiring||disarmed)return
  ;(async()=>{
   // A premature disarm must not recreate the orphan window. Wait for other
   // resource processes (including short audit inspectors) to finish first.
   const end=Date.now()+3000
   while((await ownedGroupMembers(spec.group)).some(pid=>pid!==process.pid&&pid!==spec.group)){
    if(Date.now()>=end)throw Error('UI watchdog refused early disarm')
    await sleep(50)
   }
   if(lost)return retire()
   disarmed=true
   if(process.connected)process.disconnect()
   resolveDone()
  })().catch(()=>{lost=true;retire().catch(force)})
 })
 try{
  const lock=fstatSync(3)
  const group=await new Promise((resolve,reject)=>execFile('/bin/ps',['-p',String(process.pid),'-o','pgid='],{timeout:5000},(e,out)=>e?reject(e):resolve(Number(out.trim()))))
  if(group!==spec.group||(process.connected&&process.ppid!==spec.group&&process.ppid!==1)||!lock.isFile()||lock.dev!==spec.lock.dev||lock.ino!==spec.lock.ino)throw Error('UI watchdog creator/group/lock identity mismatch')
  verified=true
  if(lost||!process.connected)await retire()
  else process.send({type:'watch-ready',pid:process.pid,group,lock:spec.lock},error=>{if(error){lost=true;retire().catch(force)}})
  await done
 }catch(error){process.exitCode=1;if(process.connected)process.disconnect();throw error}
 finally{process.removeListener('disconnect',onLoss)}
}
