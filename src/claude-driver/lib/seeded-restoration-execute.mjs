import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {withLock} from './state.mjs'
import {RUNTIME_BUILD,runtimeFingerprint} from './build.mjs'
import {versions,activeStore,runCli,DriverError} from './paths.mjs'
import {readStandbyEnrollment,standbyEnrollmentDigest} from './standby-enrollment.mjs'
import {readServiceRecoveryIdentity} from './service-recovery-identity.mjs'
import {getRecord,callerHostSession} from './sessions.mjs'
import {loadReceiverSelection,readReceiverFile} from './receiver-runtime-selection.mjs'
import {requireIndependentOfflineMutation} from './independent-offline-review.mjs'
import {inspectIndependentService} from './independent-service-result.mjs'
import {recoveryRoleFromHistory} from './recovery-role.mjs'
import {validateMissingServiceOwnerEvidence} from './missing-service-plan.mjs'
import {inspectServiceSeedPlan} from './service-seed-plan.mjs'
import {inspectServiceSeedTranscript} from './service-seed-absence.mjs'
import {serviceSeedRecipe,serviceSeedDigest} from './service-rebuild-seed.mjs'
import {runSeededRecordRestoration,serviceSeedPlanDigest} from './seeded-record-restoration.mjs'
import {createSeededRestorationLedger} from './seeded-restoration-ledger.mjs'
import {runRestoredPairChild} from './restored-pair-ledger.mjs'
import {verifyRestoredServiceRecord} from './missing-service-restoration.mjs'
import {unarchiveViaLink} from './tiera.mjs'
import {withFocus} from './focus.mjs'
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex'),same=(a,b)=>!!a&&!!b&&['sessionId','cwd','pid','procStart'].every(k=>a[k]===b[k])
// Internal until seeded-root continuation proof and public status are integrated.
export async function executeSeededRestoration(primary,role,expectedEnrollmentSha256,expectedPlanSha256,{jobId,signal}={},d={}){
 if(!/^j[a-f0-9]{32}$/.test(jobId||'')||!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(primary||'')||!['primary','standby'].includes(role)||[expectedEnrollmentSha256,expectedPlanSha256].some(h=>!/^[a-f0-9]{64}$/.test(h||'')))throw new DriverError('exact durable seeded restoration context required',{category:'bad_args'})
 const dep={binding:readStandbyEnrollment,identity:readServiceRecoveryIdentity,record:getRecord,select:loadReceiverSelection,account:()=>createHash('sha256').update(activeStore().dir).digest('hex'),version:versions,fingerprint:runtimeFingerprint,caller:callerHostSession,absent:a=>requireIndependentOfflineMutation(a,a.sessionId),status:a=>inspectIndependentService(a.sessionId,a.serviceId,{offline:true,signal}),policy:a=>JSON.parse(readReceiverFile(join(a.cwd,'.claude-driver-services',a.serviceId,'broker','stop-rescue-policy.json'),65536)),plan:inspectServiceSeedPlan,transcript:inspectServiceSeedTranscript,bootstrap:(args,cwd)=>runCli(args,{cwd,signal,timeoutMs:60000}),importRecord:async identity=>withFocus('restore',()=>unarchiveViaLink(identity),{target:identity.sessionId}),...d}
 return withLock('independent-route-'+primary,async()=>{
  const initial=await dep.plan(primary,role,expectedEnrollmentSha256,{signal});if(initial.seedPreparationEligible!==true||serviceSeedPlanDigest(initial)!==expectedPlanSha256)throw new DriverError('seed plan changed or unqualified; no effects',{category:'seeded_restoration_unqualified'})
  const binding=dep.binding(primary),actor=binding[role],other=binding[role==='primary'?'standby':'primary'];if(actor.sessionId===dep.caller())throw new DriverError('cannot rebuild caller',{category:'gate_self'})
  const identity=dep.identity(actor.sessionId,actor.serviceId),recipe=serviceSeedRecipe(identity),selection=dep.select(actor.cwd),policy=dep.policy(actor),version=dep.version()
  if(standbyEnrollmentDigest(binding)!==expectedEnrollmentSha256||hash(identity)!==initial.identitySha256||serviceSeedDigest(recipe)!==initial.recipeSha256)throw Error('seed original context changed')
  const c=createSeededRestorationLedger(primary,role,initial,recipe,expectedPlanSha256,jobId),{ledger,save}=c;ledger.originalSnapshot={binding,identity,selection,policy};ledger.versions=version;save()
  const guard=async()=>{if(signal?.aborted||dep.fingerprint()!==RUNTIME_BUILD||!equal(dep.version(),version)||standbyEnrollmentDigest(dep.binding(primary))!==expectedEnrollmentSha256||dep.account()!==identity.storeHash||!equal(dep.identity(actor.sessionId,actor.serviceId),identity)||!equal(dep.select(actor.cwd),selection)||!equal(dep.policy(actor),policy))throw Error('seed source/account/binding/selection changed');const r=dep.record(actor.sessionId);if(r){if(!ledger.importAttempted)throw Error('record appeared before import');verifyRestoredServiceRecord(r,identity)}}
  const child=(step,operation)=>runRestoredPairChild(c,step,{operation,arguments:{session:actor.sessionId,service_id:actor.serviceId,experimental:true,offline:true,...step==='quiesce'?{require_new_stop:true}:{}},idempotency_key:'seeded-record:'+jobId+':'+step,timeout_sec:120},{signal,run:d.run})
  try{return await runSeededRecordRestoration(expectedPlanSha256,recipe,{
   guard,record:c.record,claim:async()=>{await guard()},inspect:()=>dep.plan(primary,role,expectedEnrollmentSha256,{signal}),inspectRetired:()=>dep.plan(primary,role,expectedEnrollmentSha256,{signal},{retiredByRoot:true}),
   quiesce:()=>child('quiesce','broker_service_quiesce'),retire:()=>child('retire','broker_service_retire'),bootstrap:dep.bootstrap,verifyTranscript:()=>dep.transcript(identity.cliSessionId),
   inspectSeed:async()=>{await guard();const absence=dep.absent(actor),status=await dep.status(actor),p=dep.policy(actor);validateMissingServiceOwnerEvidence({binding,expectedSha256:expectedEnrollmentSha256,role,record:dep.record(actor.sessionId),identity,accountStoreHash:dep.account(),absence,status,selected:selection,version:dep.version(),retiredByRoot:true});const retainedRole=recoveryRoleFromHistory(status,p,{sessionId:actor.sessionId,receiverCwd:actor.cwd,admitTarget:t=>same(t,other)}),transcript=dep.transcript(identity.cliSessionId);await guard();dep.absent(actor);return {...transcript,recordAbsent:!dep.record(actor.sessionId),oldPidAbsent:true,oldGenerationRetired:true,identitySha256:hash(identity),roleSha256:hash(retainedRole)}},
   import:async()=>{const r=await dep.importRecord(identity);ledger.focus=r.focus;save();return r.result},verifyRecord:async()=>verifyRestoredServiceRecord(dep.record(actor.sessionId),identity)
  })}catch(error){c.fail(error);throw new DriverError('seeded restoration stopped; inspect original root and bootstrap/import intents without replay',{category:'seeded_restoration_unresolved',detail:{jobId,restorationFile:c.file,phase:ledger.phase,bootstrapAttempted:ledger.bootstrapAttempted,importAttempted:ledger.importAttempted,childJobs:Object.fromEntries(Object.entries(ledger.children).map(([k,v])=>[k,v.jobId??null])),retrySafe:false}})}
 },{signal,timeoutMs:60000})
}
