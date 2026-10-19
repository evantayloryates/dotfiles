import {readHumanAssistedRebindProof} from './human-assisted-rebind-proof.mjs'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {writeFileSync} from 'node:fs'
import {STATE_DIR,ensureDir,withLock,writeJsonAtomic} from './state.mjs'
import {readStandbyEnrollment,standbyEnrollmentDigest,enrollStandby} from './standby-enrollment.mjs'
import {readStandbyRebindProof} from './standby-rebind-proof.mjs'
import {getRecord} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {loadReceiverSelection,readReceiverFile} from './receiver-runtime-selection.mjs'
import {inspectIndependentService,readIndependentService} from './independent-service-result.mjs'
import {prepareIndependentService} from './independent-service-prepare.mjs'
import {quiesceIndependentService} from './independent-service-quiesce.mjs'
import {retireIndependentService} from './independent-service-retire.mjs'
import {activateIndependentService} from './independent-service-activate.mjs'
import {probeIndependentServicePolicy} from './independent-service-policy-probe.mjs'
import {runIndependentRenewal,waitIndependentReadiness} from './independent-service-renew.mjs'
import {DriverError,sleep} from './paths.mjs'
const same=(a,b)=>!!a&&!!b&&['sessionId','cwd','pid','procStart'].every(k=>a[k]===b[k])
export async function runStandbyRebind(d){
 const result=await runIndependentRenewal(d)
 await d.guard('family');await d.record('before-family',result)
 result.family=await d.family();await d.record('after-family',result)
 if(result.family?.receiptVerified!==true||result.family.state!=='completed')throw Error('fresh primary family unverified')
 await d.guard('enroll');await d.record('before-enroll',result)
 result.enrollment=await d.enroll(result.family.requestId);await d.record('after-enroll',result)
 if(result.enrollment?.verified!==true||result.enrollment.enrolled!==true)throw Error('rebind enrollment unverified')
 return result
}
export async function rebindEnrolledStandby(primary,recoveryParentJobId,expectedSha256,{jobId,signal,routeLockHeld=false,humanAssistedPrimaryServiceId}={}){
 if(!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(primary||'')||!/^j[a-f0-9]{32}$/.test(jobId||'')||!/^j[a-f0-9]{32}$/.test(recoveryParentJobId||'')||!/^[a-f0-9]{64}$/.test(expectedSha256||''))throw new DriverError('rebind requires durable parent and exact original recovery/digest',{category:'bad_args'})
 const run=async()=>{
  const binding=readStandbyEnrollment(primary)
  if(!binding||standbyEnrollmentDigest(binding)!==expectedSha256)throw new DriverError('rebind enrollment changed',{category:'standby_rebind_unqualified',detail:{dispatched:false,retrySafe:true}})
  const readProof=()=>humanAssistedPrimaryServiceId?readHumanAssistedRebindProof(binding,recoveryParentJobId,humanAssistedPrimaryServiceId,{signal}):readStandbyRebindProof(binding,recoveryParentJobId)
  let proof;try{proof=await readProof()}catch{throw new DriverError('original verified cold recovery unavailable; no standby effects',{category:'standby_rebind_unqualified',detail:{dispatched:false,retrySafe:true}})}
  const standby=binding.standby.sessionId,oldService=binding.standby.serviceId,newService=jobId.slice(1)
  if(newService===oldService)throw new DriverError('rebind successor identity must be distinct',{category:'bad_args'})
  return withLock('independent-renewal-'+standby,async()=>{
   let ledger;const file=join(ensureDir(join(STATE_DIR,'standby-rebinds')),jobId+'.json'),save=()=>writeJsonAtomic(file,ledger)
   const guard=async phase=>{
    if(signal?.aborted||standbyEnrollmentDigest(readStandbyEnrollment(primary))!==expectedSha256)throw Error('rebind cancelled or binding changed')
    const current=await readProof()
    if(JSON.stringify(proof)!==JSON.stringify(current))throw Error('original recovery proof changed')
    for(const [sid,epoch,service]of [[primary,proof.primary,proof.primary.serviceId],[standby,proof.standby,['readiness','policyProbe','verify','family','enroll'].includes(phase)?newService:oldService]]){
     const r=getRecord(sid),p=peerRecord(sid),selection=loadReceiverSelection(r?.cwd)
     if(!same(epoch,{sessionId:sid,cwd:r?.cwd,pid:p?.pid,procStart:p?.procStart})||p.status!=='idle'||r.permissionMode!=='bypassPermissions'||r.isArchived||selection.selector.sessionId!==sid||selection.selector.serviceId!==service||selection.selector.pid!==p.pid||selection.selector.procStart!==p.procStart)throw Error('rebind current owner epoch or selection changed')
    }
    const p=await inspectIndependentService(primary,proof.primary.serviceId,{signal})
    if(!p.verified||!p.readinessObserved||!p.nativePolicyObserved||p.admissionStopped||p.expired||p.deadline-Date.now()<(phase==='prepare'?180000:25000)||p.unresolvedRequestIds?.length||p.unreservedSlots<(phase==='enroll'?1:2))throw Error('recovered primary no longer qualified')
   }
   try{
    await guard('prepare')
    const old=await inspectIndependentService(standby,oldService,{signal}),policy=id=>JSON.parse(readReceiverFile(join(binding.standby.cwd,'.claude-driver-services',id,'broker','stop-rescue-policy.json'),65536)),baseline=policy(oldService)
    if(!/^[a-f0-9]{64}$/.test(baseline.settingsHash||'')||!/^[a-f0-9]{64}$/.test(baseline.receiverHook?.anchorSha256||''))throw Error('standby stable settings evidence missing')
    if(!old.verified||!old.terminalAttemptReviewComplete||old.unresolvedRequestIds?.length||!same(old.archiveTarget,binding.primary)||old.metadataTarget||old.metadataModelControl||old.metadataSendControl||old.metadataStopControl)throw Error('old standby role unqualified')
    const initial={schemaVersion:1,jobId,primary,recoveryParentJobId,expectedEnrollmentSha256:expectedSha256,humanAssisted:proof.humanAssisted===true,standby,oldService,newService,phase:'created',steps:[],at:Date.now(),retrySafe:false};writeFileSync(file,JSON.stringify(initial),{flag:'wx',mode:0o600});ledger=initial
    const results=await runStandbyRebind({guard,record:async(phase,results)=>{ledger.phase=phase;ledger.results=results;ledger.steps.push({phase,at:Date.now()});save()},
     prepare:()=>prepareIndependentService(standby,{jobId,signal,lifetimeSec:3600,maxRequests:32,archiveTargetSession:primary}),
     quiesce:async()=>{const r=await quiesceIndependentService(standby,oldService,{signal});if(!r.quiescent||!r.terminalAttemptReviewComplete)throw Error('standby quiescence unverified');return r},
     retire:async()=>{const r=await retireIndependentService(standby,oldService,{signal});if(!r.filesRetired)throw Error('standby retirement unverified');return r},
     activate:()=>activateIndependentService(standby,newService,{signal,stableHook:true}),
     readiness:()=>waitIndependentReadiness({signal},{guard:()=>guard('readiness'),inspect:()=>inspectIndependentService(standby,newService,{signal}),now:Date.now,wait:()=>sleep(100)}),
     policyProbe:()=>probeIndependentServicePolicy(standby,newService,{jobId,signal,timeoutMs:20000}),
     verify:async()=>{const s=await inspectIndependentService(standby,newService,{signal}),after=policy(newService);if(after.settingsHash!==baseline.settingsHash||after.receiverHook?.anchorSha256!==baseline.receiverHook?.anchorSha256||!s.verified||!s.readinessObserved||!s.nativePolicyObserved||s.admissionStopped||s.expired||s.unresolvedRequestIds?.length||!same(s.archiveTarget,proof.primary)||s.metadataTarget||s.metadataModelControl||s.metadataSendControl||s.metadataStopControl)throw Error('new standby role unqualified');return s},
     family:()=>readIndependentService(primary,proof.primary.serviceId,primary,{family:true,signal,jobId:'j'+createHash('sha256').update('standby-rebind-family:'+jobId).digest('hex').slice(0,32),timeoutMs:20000}),
     enroll:familyRequestId=>enrollStandby({session:standby,service_id:newService,session_id:primary,target_service_id:proof.primary.serviceId,family_request_id:familyRequestId},{signal,expectedSha256,recoveryParentJobId,humanAssistedPrimaryServiceId})
    })
    ledger.phase='completed';save();return {primarySession:primary,standbySession:standby,standbyServiceId:newService,recoveryParentJobId,enrollment:results.enrollment,standbyRebindRequired:false,...proof.humanAssisted?{humanAssistedRecoveryQualified:true,unattendedRecoveryQualified:false}:{},verified:true,rebindFile:file,retrySafe:false}
   }catch(error){if(ledger){ledger.failure={at:Date.now(),category:error.category??'standby-rebind-unresolved'};save()}throw new DriverError('standby rebind stopped; reconcile original parent without replay',{category:ledger||error.code==='EEXIST'?'standby_rebind_unresolved':'standby_rebind_unqualified',detail:{jobId,rebindFile:ledger||error.code==='EEXIST'?file:null,retrySafe:!ledger&&error.code!=='EEXIST',...!ledger&&error.code!=='EEXIST'?{dispatched:false}:{}}})}
  },{timeoutMs:5000,signal})
 }
 return routeLockHeld?run():withLock('independent-route-'+primary,run,{timeoutMs:60000,signal})
}
