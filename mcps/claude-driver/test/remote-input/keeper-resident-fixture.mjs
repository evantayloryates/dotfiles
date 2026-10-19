// Disposable synthetic resident: real sockets/process/kernel observations,
// no native runtime, app, model host, credential or input API.
import {spawn,spawnSync,execFileSync} from 'node:child_process'
import {connect} from 'node:net'
import {once} from 'node:events'
import {readFileSync,writeFileSync,existsSync,lstatSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {serveKeeperResident} from '../../src/candidates/input-keeper/resident.mjs'
import {matchingLockDescriptors,readProcessSnapshot} from '../../src/candidates/input-keeper/process-observation.mjs'
import {admitUiOwnerEvidence,observeUiKernelOwner,observeRetiredUiPeers,probeUiKernelLock} from '../../src/candidates/input-keeper/lease-observation.mjs'
import {syntheticInputBinding} from '../private-input-fixture.mjs'
const dir=process.argv[2],epoch='c'.repeat(64),sleep=ms=>new Promise(r=>setTimeout(r,ms))
const bindingMode=process.argv[3]==='--owner-binding'
if(!/^\/private\/tmp\/keeper-resident-test-[A-Za-z0-9]+$/.test(dir))throw Error('owned fixture directory required')
const st=lstatSync(dir);if(st.uid!==process.getuid()||st.isSymbolicLink()||(st.mode&0o077)!==0)throw Error('private fixture refused')
const helperPath=join(dir,'r'),row={scope:'synthetic-resident-transport-only',opens:0,clientStarts:0,pid:process.pid}
const save=()=>writeFileSync(join(dir,'fixture.json'),JSON.stringify(row),{mode:0o600})
let helper,helperDone,keeperSocket,sequence=0
const activeSockets=new Map()
const rpc=(type)=>new Promise((resolve,reject)=>{
 const id=++sequence,timer=setTimeout(()=>finish(Error('synthetic helper deadline')),3000)
 const finish=(error,result)=>{clearTimeout(timer);helper.off('message',message);error?reject(error):resolve(result)},message=m=>{if(m.id===id)finish(null,m)}
 helper.on('message',message);helper.send({id,type},error=>{if(error)finish(error)})
})
const adapters={
 runtimeEpoch:async()=>existsSync(join(dir,'drift'))?'d'.repeat(64):epoch,
 openResource:async()=>{
  row.opens++;helper=spawn(process.execPath,[fileURLToPath(new URL('./keeper-fixture.mjs',import.meta.url)),'resource',helperPath],{detached:false,stdio:['ignore','ignore','pipe','ipc']});row.helperPid=helper.pid;save()
  helperDone=once(helper,'exit').then(([code,signal])=>({code,signal}));await once(helper,'message')
  keeperSocket=connect(helperPath);await once(keeperSocket,'connect');return helper
 },
 observeResource:async()=>{
  if(helper.exitCode!==null||helper.signalCode!==null)return {alive:false}
  const value=await rpc('probe'),s=lstatSync(helperPath)
  return {alive:true,uiLockInherited:value.lock!==null,identity:{pid:helper.pid,group:process.pid,socketPath:helperPath,socketDev:s.dev,socketIno:s.ino}}
 },
 observeOwner:async owner=>{
   if(bindingMode)return observeUiKernelOwner(owner,join(dir,'state/locks/ui-automation.mutex'))
  const current=readProcessSnapshot().rows.find(p=>p.pid===owner.pid)
  if(!current||current.group!==owner.group)return {alive:false}
  const output=execFileSync('/usr/sbin/lsof',['-nP','-a','-p',String(owner.pid),'-F','pfiD'],{encoding:'utf8',timeout:3000,maxBuffer:256*1024})
  return {alive:true,owner,kernelLockHeld:matchingLockDescriptors(output,owner.lock).length>0&&probeUiKernelLock(join(dir,'ui.lock'),owner.lock).held}
 },
 openClient:async({token,owner,guardians,evidenceDir})=>{
  row.clientStarts++;save()
  if(bindingMode){admitUiOwnerEvidence({owner,guardians,evidenceDir},dir);return {inputBinding:{...syntheticInputBinding(dir),socketPath:helperPath}}}
  const socket=connect(helperPath);await once(socket,'connect');activeSockets.set(token,socket)
  while(existsSync(join(dir,'pause-open'))&&!existsSync(join(dir,'resume-open')))await sleep(20)
  return socket
 },
 retireClient:async({token,owner,guardians})=>{
  if(bindingMode)return observeRetiredUiPeers({owner,guardians})
  const socket=activeSockets.get(token);if(socket){socket.end();await once(socket,'close');activeSockets.delete(token)}
  return {clientsRetired:true,workerPeersRetired:true}
 },
 settleInput:async({owner,guardians})=>{
  for(let i=0;i<100;i++){
   if((await rpc('probe')).clients===1){
    const holder=bindingMode?[owner,...guardians].find(p=>{try{return observeUiKernelOwner(p,join(dir,'state/locks/ui-automation.mutex')).kernelLockHeld}catch{return false}}):owner
    if(holder)return {verified:true,lockHolder:holder}
   }
   await sleep(10)
  }
  return {verified:false,lockHolder:owner}
 },
 closeResource:async()=>{
  keeperSocket.end();await once(keeperSocket,'close');await rpc('stop');const helperExit=await helperDone;row.helperExit=helperExit;save()
  return {clientsRetired:activeSockets.size===0,helperExit,resourceAbsent:!existsSync(helperPath),forced:false}
 }
}
try{
 const resident=await serveKeeperResident({dir,epoch},adapters)
 process.send?.({type:'ready',pid:process.pid,generation:resident.generation})
 // Bootstrap launcher EOF is explicitly independent of the listening service.
 process.on('disconnect',()=>{})
 await resident.closed;row.closedNormally=true;save()
 if(process.connected)process.disconnect()
}catch(error){if(row.opens)save();writeFileSync(join(dir,'fixture-error-'+process.pid+'.json'),JSON.stringify({category:error.category,reason:error.reason??error.message}),{mode:0o600});process.exitCode=1;if(process.connected)process.disconnect()}
