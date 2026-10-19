// Linked owner/watchdog adapter candidate. No caller-supplied receipt is trusted;
// the resident independently observes peers, receiving state and lock holders.
import {fstatSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {connectKeeperResident,inspectKeeperRequest} from './resident.mjs'
import {readProcessSnapshot} from './process-observation.mjs'
import {privateInputThreadParams} from '../../lib/private-input-service.mjs'
import {retireUiWorkerPeers} from '../../lib/ui-lease-owner.mjs'
import {writeJsonAtomic} from '../../lib/state.mjs'
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),fail=reason=>Object.assign(new Error('Resident UI lease: '+reason),{category:'resident_ui_lease_failed',reason})
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
function localIdentity(evidenceDir,lockFd,record){
 const s=fstatSync(lockFd),lock={dev:s.dev,ino:s.ino},rows=readProcessSnapshot().rows,current=rows.find(p=>p.pid===process.pid)
 if(!s.isFile()||!current||!same(lock,record.owner.lock)||current.group!==record.owner.group)throw fail('live inherited UI lock/group unverified')
 if(process.pid!==record.owner.pid&&!record.guardians.some(p=>p.pid===process.pid&&p.group===current.group))throw fail('not the registered live owner or guardian')
 return {lock,current,rows}
}
async function requestOnce(spec,client,op,args,id,timeoutMs){
 const end=Date.now()+timeoutMs
 try{return (await client.request(op,args,{id,timeoutMs:Math.min(timeoutMs,3000)})).result}
 catch(error){
  if(error.remoteError)throw error
  // A timeout/EOF is observation uncertainty. Read the exact existing intent;
  // never submit again or make a new ID to obtain an answer.
  while(Date.now()<end){
   let row;try{row=inspectKeeperRequest(spec.dir,id,client.generation)}catch{}
   if(row?.state==='completed')return row.result
   if(row?.state==='failed')throw fail('exact resident request failed')
   await sleep(50)
  }
  throw fail('resident request outcome unknown; no replay')
 }
}
export async function finishResidentUiLease({evidenceDir,lockFd=3,outcome},spec){
 const file=join(evidenceDir,'resident-lease.json'),record=JSON.parse(readFileSync(file)),identity=localIdentity(evidenceDir,lockFd,record)
 const client=connectKeeperResident(spec)
 if(record.generation!==client.generation)throw fail('resident generation changed')
 if(record.releaseResult)return record.releaseResult
 if(!record.lease){
  const result=inspectKeeperRequest(spec.dir,record.acquireId,record.generation)
  if(result.state!=='completed')throw fail('acquisition unresolved; no replay')
  record.lease=result.result
 }
 if(process.pid===record.owner.pid){
  record.peerCleanup=await retireUiWorkerPeers({watcherPid:record.guardians[0]?.pid,lock:identity.lock})
 }else{
  if(identity.rows.some(p=>p.group===identity.current.group&&p.pid!==process.pid))throw fail('orphan worker peers not independently retired')
  record.peerCleanup={group:identity.current.group,forced:false,remaining:[],orphanPeersAlreadyRetired:true}
 }
 const unsafeForced=record.peerCleanup.forced&&!record.peerCleanup.ancillaryGitOnly
 // Forced unknown resources can be reconciled as unknown, never completed.
 const effectiveOutcome=unsafeForced?'unknown':outcome
 record.releaseId??=randomUUID();record.releaseOutcome??=effectiveOutcome
 writeJsonAtomic(file,record)
 const lease=record.lease
 const result=await requestOnce(spec,client,'release',{token:lease.token,generation:record.generation,outcome:record.releaseOutcome},record.releaseId,12000)
 if(result.helperRetained!==true||result.clientsRetired!==true||result.inputSettled!==true||result.replayAllowed!==false||!same(result.resource,lease.resource))throw fail('resident retirement receipt unverified')
 record.releaseResult={...result,peerCleanup:record.peerCleanup};writeJsonAtomic(file,record)
 if(unsafeForced)throw fail('unknown worker resources required forced retirement')
 return record.releaseResult
}
export async function openResidentUiLease({evidenceDir,lockFd=3,signal},spec){
 const s=fstatSync(lockFd),ownerRow=JSON.parse(readFileSync(join(evidenceDir,'ui-owner.json'))),lock={dev:s.dev,ino:s.ino}
 if(lockFd!==3||!s.isFile()||ownerRow.ownerPid!==process.pid||ownerRow.group!==process.pid||ownerRow.watchReady!==true||ownerRow.lock?.dev!==lock.dev||ownerRow.lock?.ino!==lock.ino||!Number.isSafeInteger(ownerRow.watcherPid))throw fail('checked owner/watchdog state unverified')
 const owner={pid:process.pid,group:process.pid,lock},guardians=[{pid:ownerRow.watcherPid,group:process.pid,lock}]
 const record={version:1,owner,guardians,acquireId:randomUUID()},file=join(evidenceDir,'resident-lease.json'),client=connectKeeperResident(spec)
 record.generation=client.generation;localIdentity(evidenceDir,lockFd,record);writeJsonAtomic(file,record)
 const lease=await requestOnce(spec,client,'acquire',{owner,guardians,evidenceDir},record.acquireId,12000)
 record.lease=lease;writeJsonAtomic(file,record)
 try{
  if(lease.generation!==record.generation||!same(lease.owner,owner)||lease.resource.group===owner.group||lease.resource.socketPath!==lease.inputBinding?.socketPath)throw fail('resident service binding identity mismatch')
  privateInputThreadParams({},lease.inputBinding) // existing path/sentinel schema
 }catch(error){try{await finishResidentUiLease({evidenceDir,lockFd,outcome:'unknown'},spec)}catch{};throw error}
 let closing
 return {persistent:true,pid:lease.resource.pid,binding:lease.inputBinding,evidence:file,close:()=>closing??=(async()=>{
  let result;try{result=JSON.parse(readFileSync(join(evidenceDir,'result.json')))}catch{}
  const outcome=signal?.aborted?'cancelled':result?.code===0&&!result?.result?.error?'completed':'unknown'
  const receipt=await finishResidentUiLease({evidenceDir,lockFd,outcome},spec)
  return {...receipt,nativeHelperExited:false,forcedTermination:false,evidence:file}
 })()}
}
