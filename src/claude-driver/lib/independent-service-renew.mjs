import {join} from 'node:path'
import {writeFileSync} from 'node:fs'
import {STATE_DIR,ensureDir,withLock,writeJsonAtomic} from './state.mjs'
import {getRecord} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {prepareIndependentService} from './independent-service-prepare.mjs'
import {quiesceIndependentService} from './independent-service-quiesce.mjs'
import {retireIndependentService} from './independent-service-retire.mjs'
import {activateIndependentService} from './independent-service-activate.mjs'
import {inspectIndependentService} from './independent-service-result.mjs'
import {DriverError} from './paths.mjs'
import {sleep} from './paths.mjs'
import {probeIndependentServicePolicy} from './independent-service-policy-probe.mjs'

export async function waitIndependentReadiness({timeoutMs=30000,signal}={},d){
 const start=d.now()
 for(;;){
  if(signal?.aborted)throw Error('readiness cancelled')
  await d.guard();const status=await d.inspect()
  if(!status.verified||status.sourceDisposition!=='installed'||status.admissionStopped||status.expired===true||status.unresolvedRequestIds?.length)throw Error('readiness context unqualified')
  if(status.readinessObserved)return {...status,readinessWaitMs:d.now()-start}
  if(d.now()-start>=timeoutMs){const error=Error('readiness observation deadline');error.category='independent_service_readiness_timeout';throw error}
  await d.wait()
 }
}

// Each effect has a durable before/after checkpoint. No recovery branch repeats
// an uncertain effect; the durable parent job is the reattachment identity.
export async function runIndependentRenewal(d){
 const results={}
 for(const phase of ['prepare','quiesce','retire','activate','readiness','policyProbe','verify']){
  await d.guard(phase);await d.record('before-'+phase,results)
  results[phase]=await d[phase](results)
  await d.record('after-'+phase,results)
 }
 return results
}
export async function renewIndependentService(session,serviceId,{jobId,lifetimeSec=300,maxRequests=8,signal}={}){
 if(!/^j[a-f0-9]{32}$/.test(jobId||'')||! /^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(session||'')||! /^[a-f0-9]{32}$/.test(serviceId||'')||jobId.slice(1)===serviceId)throw new DriverError('renewal requires one durable job and distinct predecessor',{category:'bad_args'})
 if(!Number.isInteger(maxRequests)||maxRequests<2||maxRequests>128)throw new DriverError('renewal requires capacity for policy probe and a later read',{category:'bad_args'})
 return withLock('independent-renewal-'+session,async()=>{
  const file=join(ensureDir(join(STATE_DIR,'independent-service-renewals')),jobId+'.json'),successorServiceId=jobId.slice(1),record=getRecord(session),peer=peerRecord(session)
  const ledger={schemaVersion:1,kind:'independent-service-renewal',jobId,sessionId:session,serviceId,successorServiceId,lifetimeSec,maxRequests,phase:'created',at:Date.now(),servingQualified:false,retrySafe:false}
  writeFileSync(file,JSON.stringify(ledger),{flag:'wx',mode:0o600})
  const guard=async phase=>{
   if(signal?.aborted)throw Error('renewal cancelled')
   const live=peerRecord(session,peer?.pid),r=getRecord(session),selected=loadReceiverSelection(record.cwd)
   if(!peer||!live||live.procStart!==peer.procStart||live.status!=='idle'||r.cwd!==record.cwd||r.permissionMode!=='bypassPermissions'||r.isArchived||selected.selector.sessionId!==session||selected.selector.pid!==live.pid||selected.selector.procStart!==live.procStart||selected.selector.serviceId!==(['readiness','policyProbe','verify'].includes(phase)?successorServiceId:serviceId))throw Error('renewal epoch or selection changed')
  }
  try{
   const before=await inspectIndependentService(session,serviceId)
   if(!before.verified||before.sourceDisposition!=='installed'||!before.terminalAttemptReviewComplete||before.unresolvedRequestIds?.length)throw Error('renewal predecessor unqualified')
   const results=await runIndependentRenewal({guard,record:async(phase,results)=>{ledger.phase=phase;ledger.results=results;ledger.updatedAt=Date.now();writeJsonAtomic(file,ledger)},
    prepare:async()=>{const r=await prepareIndependentService(session,{jobId,lifetimeSec,maxRequests,signal});if(r.serviceId!==successorServiceId||r.prepared!==true)throw Error('preparation identity');return r},
    quiesce:async()=>{const r=await quiesceIndependentService(session,serviceId,{signal});if(r.quiescent!==true||r.terminalAttemptReviewComplete!==true)throw Error('quiescence');return r},
    retire:async()=>{const r=await retireIndependentService(session,serviceId,{signal});if(r.filesRetired!==true)throw Error('retirement');return r},
    activate:()=>activateIndependentService(session,successorServiceId,{signal,stableHook:true}),
    readiness:()=>waitIndependentReadiness({signal},{guard:()=>guard('readiness'),inspect:()=>inspectIndependentService(session,successorServiceId,{signal}),now:Date.now,wait:()=>sleep(100)}),
    policyProbe:()=>probeIndependentServicePolicy(session,successorServiceId,{jobId,signal,timeoutMs:20000}),
    verify:async()=>{const r=await inspectIndependentService(session,successorServiceId,{signal});if(!r.verified||r.sourceDisposition!=='installed'||r.admissionStopped||r.expired===true||r.nativeEpoch.pid!==peer.pid||r.nativeEpoch.procStart!==peer.procStart||!r.readinessObserved||!r.nativePolicyObserved||!r.terminalAttemptReviewComplete||r.unresolvedRequestIds.length||r.unreservedSlots<1)throw Error('successor verification');return r}
   })
   ledger.phase='policy-qualified';ledger.readAdmissionQualified=true;ledger.updatedAt=Date.now();writeJsonAtomic(file,ledger)
   return {sessionId:session,predecessorServiceId:serviceId,serviceId:successorServiceId,installed:true,readinessObserved:results.verify.readinessObserved,nativePolicyObserved:results.verify.nativePolicyObserved,policyProbeRequestId:results.policyProbe.requestId,readAdmissionQualified:true,servingQualified:false,renewalFile:file,retrySafe:false}
  }catch(error){ledger.failureCategory=error.category??'renewal_step_failed';ledger.failedAt=Date.now();writeJsonAtomic(file,ledger);throw new DriverError('renewal refused or interrupted; inspect original job and phase without replay',{category:'independent_service_renew_unresolved',detail:{jobId,serviceId,successorServiceId,phase:ledger.phase,retrySafe:false}})}
 },{timeoutMs:5000,signal})
}
