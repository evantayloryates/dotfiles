// Isolated integration candidate. Not imported by server/Tier C and never starts
// CUA itself. Adapters are trusted driver code, never tool arguments or reports.
import {randomUUID} from 'node:crypto'
import {existsSync,readFileSync} from 'node:fs'
import {isAbsolute} from 'node:path'
import {writeJsonAtomic} from '../../lib/state.mjs'
import {acquireKernelLock} from '../../lib/kernel-lock.mjs'

const refusal=reason=>Object.assign(new Error(`Input keeper refused: ${reason}`),{category:'input_keeper_fenced',reason})
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
const integer=n=>Number.isSafeInteger(n)&&n>0
const identityKeys=['pid','group','socketPath','socketDev','socketIno']
function identity(value){
 if(!value||!integer(value.pid)||!integer(value.group)||!integer(value.socketDev)||!integer(value.socketIno)||typeof value.socketPath!=='string'||!value.socketPath.startsWith('/')||value.socketPath.includes('\0'))throw refusal('invalid-resource-identity')
 return Object.fromEntries(identityKeys.map(k=>[k,value[k]]))
}
function owner(value){
 if(!value||!integer(value.pid)||!integer(value.group)||!integer(value.lock?.dev)||!integer(value.lock?.ino))throw refusal('invalid-lease-owner')
 return {pid:value.pid,group:value.group,lock:{dev:value.lock.dev,ino:value.lock.ino}}
}

// A single future resident driver owner creates this coordinator. A durable
// record is a refusal fence, not authority to adopt/kill a PID after a restart.
export async function createKeeperLifetime({evidence,epoch,guardTimeoutMs=1000},adapters){
 if(!/^[a-f0-9]{64}$/.test(epoch)||typeof evidence!=='string'||!isAbsolute(evidence)||evidence.includes('\0'))throw refusal('invalid-keeper-spec')
 for(const key of ['runtimeEpoch','openResource','observeResource','observeOwner','openClient','retireClient','settleInput','closeResource'])if(typeof adapters?.[key]!=='function')throw refusal('missing-trusted-adapter')
 // Distinct from the UI mutex, and never passed to resource/client children.
 // Serializes constructors across harness processes; no PID-file lock stealing.
 const releaseGuard=await acquireKernelLock(evidence+'.lock',{timeoutMs:guardTimeoutMs})
 try{if(existsSync(evidence)){
  let prior;try{prior=JSON.parse(readFileSync(evidence))}catch{throw refusal('unreadable-prior-record')}
  if(prior.version!==1||prior.phase!=='closed'||prior.closedNormally!==true)throw refusal('unreconciled-prior-generation')
 }}catch(error){releaseGuard();throw error}
 const row={version:1,generation:randomUUID(),epoch,phase:'new',createdAt:new Date().toISOString(),revision:0,leaseCount:0,leases:[],closedNormally:false}
 let resource,active,busy=false
 const save=()=>{row.revision++;writeJsonAtomic(evidence,row)}
 const fence=reason=>{row.phase='fenced';row.fence??={reason,at:new Date().toISOString()};try{save()}finally{releaseGuard()}return refusal(reason)}
 const run=async fn=>{
  if(busy)throw refusal('lifecycle-operation-in-progress')
  busy=true;try{return await fn()}finally{busy=false}
 }
 const assertEpoch=async()=>{if(await adapters.runtimeEpoch()!==epoch)throw refusal('runtime-epoch-changed')}
 const observe=async()=>{
  await assertEpoch()
  const value=await adapters.observeResource(resource)
  if(value?.alive!==true||value.uiLockInherited!==false||!same(identity(value.identity),row.resource))throw refusal('resource-identity-changed')
  return value
 }
 const observeOwner=async lease=>{
  const value=await adapters.observeOwner(lease.owner)
  if(value?.alive!==true||value.kernelLockHeld!==true||!same(owner(value.owner),lease.owner))throw refusal('live-kernel-owner-unverified')
  if(lease.owner.group===row.resource?.group||lease.owner.pid===row.resource?.pid)throw refusal('keeper-inside-lease-group')
 }
 const publicLease=lease=>({token:lease.token,generation:row.generation,resource:{...row.resource},owner:structuredClone(lease.owner),...lease.client?.inputBinding?{inputBinding:structuredClone(lease.client.inputBinding)}:{}})
 const retire=async(lease,outcome)=>{
  // Do not accept receipt objects from callers. These adapters independently
  // inspect the tracked handle/group and target state while the lock is held.
  const retirement=await adapters.retireClient({client:lease.client,token:lease.token,owner:lease.owner,guardians:lease.guardians,evidenceDir:lease.evidenceDir,outcome})
  lease.record.retirement={clientsRetired:retirement?.clientsRetired===true,workerPeersRetired:retirement?.workerPeersRetired===true};save()
  if(!lease.record.retirement.clientsRetired||!lease.record.retirement.workerPeersRetired)throw refusal('lease-clients-not-retired')
  const settlement=await adapters.settleInput({token:lease.token,owner:lease.owner,guardians:lease.guardians,evidenceDir:lease.evidenceDir,outcome})
  const holder=owner(settlement?.lockHolder)
  lease.record.settlement={verified:settlement?.verified===true,lockHolder:holder};save()
  if(!lease.record.settlement.verified||![lease.owner,...lease.guardians].some(p=>same(p,holder)))throw refusal('receiving-settlement-unverified')
  await observeOwner({owner:holder})
  await observe()
  // The active owner or its checked watchdog must still hold the same lock.
  // For lost owners, settleInput must establish the surviving watchdog's lock;
  // no missing owner is relabelled as a normally completed operation.
  if(outcome==='completed')await observeOwner(lease)
  lease.record.outcome=outcome;lease.record.closedAt=new Date().toISOString();active=undefined
  if(row.phase!=='fenced')row.phase='idle'
  save()
  return {outcome,replayAllowed:false,helperRetained:true,resource:{...row.resource},clientsRetired:true,inputSettled:true,lockRetainedBy:holder}
 }
 try{save()}catch(error){releaseGuard();throw error}
 return {
  snapshot:()=>structuredClone(row),
  inspect:()=>run(async()=>{
   if(!['idle','leased'].includes(row.phase))return {phase:row.phase,generation:row.generation,epoch,live:false}
   try{await observe();return {phase:row.phase,generation:row.generation,epoch,live:true,resource:{...row.resource},leaseCount:row.leaseCount}}
   catch{throw fence('live-resource-inspection-failed')}
  }),
  start:()=>run(async()=>{
   if(row.phase!=='new')throw refusal('keeper-already-started-or-fenced')
   row.phase='starting';save()
   try{
    await assertEpoch();resource=await adapters.openResource({generation:row.generation,epoch})
    const first=await adapters.observeResource(resource)
    row.resource=identity(first?.identity)
    await observe();row.phase='idle';save();return {...row.resource}
   }catch{throw fence('keeper-startup-unverified')}
  }),
  acquire:({owner:proposedOwner,guardians=[],evidenceDir,signal}={})=>run(async()=>{
   if(row.phase!=='idle'||active)throw refusal('keeper-not-idle')
   if(signal?.aborted)throw refusal('lease-cancelled-before-admission')
   if(!Array.isArray(guardians)||guardians.length>2)throw refusal('invalid-lease-guardians')
   if(evidenceDir!==undefined&&(typeof evidenceDir!=='string'||!isAbsolute(evidenceDir)||evidenceDir.includes('\0')))throw refusal('invalid-lease-evidence-directory')
   const lease={owner:owner(proposedOwner),guardians:guardians.map(owner),evidenceDir,token:randomUUID()}
   if(lease.guardians.some(p=>!same(p.lock,lease.owner.lock)))throw refusal('guardian-lock-mismatch')
   // Admission failure before openClient creates no lease/client and still
   // fences observed runtime/resource drift rather than starting a replacement.
   try{await observe();await observeOwner(lease);for(const guardian of lease.guardians)await observeOwner({owner:guardian})}catch{throw fence('lease-admission-unverified')}
   if(signal?.aborted)throw refusal('lease-cancelled-before-client-start')
   lease.record={token:lease.token,owner:lease.owner,guardians:lease.guardians,...evidenceDir?{evidenceDir}:{},startedAt:new Date().toISOString(),outcome:'unknown'}
   active=lease;row.leases.push(lease.record);row.leases=row.leases.slice(-32);row.leaseCount++;row.phase='leased';save()
   try{
    lease.client=await adapters.openClient({resource,token:lease.token,owner:lease.owner,guardians:lease.guardians,evidenceDir,signal})
    await observe();await observeOwner(lease)
    if(signal?.aborted)throw refusal('lease-cancelled-during-admission')
    return publicLease(lease)
   }catch{
    fence('client-admission-unverified')
    // The token/group exists before startup: an adapter may reconcile partial
    // creation even when openClient throws before returning its child handle.
    try{await retire(lease,'unknown')}catch{fence('client-admission-cleanup-unverified')}
    throw refusal('client-admission-unverified')
   }
  }),
  release:({token,generation,outcome}={})=>run(async()=>{
   if(!active||generation!==row.generation||token!==active.token)throw refusal('stale-or-foreign-lease')
   if(!['completed','cancelled','owner-lost','unknown'].includes(outcome))throw refusal('invalid-lease-outcome')
   try{return await retire(active,outcome)}catch{throw fence('lease-retirement-unverified')}
  }),
  shutdown:()=>run(async()=>{
   if(active||row.phase!=='idle')throw refusal('keeper-not-safely-idle')
   row.phase='closing';save()
   try{
    await observe()
    const result=await adapters.closeResource(resource)
    if(result?.clientsRetired!==true||result?.helperExit?.code!==0||result?.helperExit?.signal!=null||result?.resourceAbsent!==true||result?.forced!==false)throw refusal('keeper-normal-exit-unverified')
    row.phase='closed';row.closedNormally=true;row.closedAt=new Date().toISOString();save();releaseGuard()
    return {closedNormally:true,generation:row.generation}
   }catch{throw fence('keeper-shutdown-unverified')}
  })
 }
}
