import {createHash} from 'node:crypto'
import {runServiceSeedProvision,serviceSeedDigest} from './service-rebuild-seed.mjs'
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex')
export function serviceSeedPlanDigest(plan){
 if(plan?.seedPreparationEligible!==true||plan.bootstrapAuthorized!==false||plan.importAuthorized!==false||plan.effectsPerformed!==false||!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(plan.sessionId||'')||!/^[a-f0-9]{32}$/.test(plan.serviceId||'')||['identitySha256','recipeSha256','roleSha256','transcriptAbsenceFingerprint','enrollmentSha256'].some(k=>!/^[a-f0-9]{64}$/.test(plan[k]||'')))throw Error('qualified seed plan required')
 return hash(plan)
}
// Retained retirement is consumed once in this root. No generic import plan is
// forged from the previously missing transcript, and no prior history is replayed.
export async function runSeededRecordRestoration(expectedPlanSha256,recipe,d){
 let plan
 const check=async()=>{await d.guard();const p=await d.inspect();if(p.oldGenerationRetired!==false||serviceSeedPlanDigest(p)!==expectedPlanSha256||p.recipeSha256!==serviceSeedDigest(recipe)||p.sessionId!==recipe.sessionId||p.identitySha256!==recipe.identitySha256)throw Error('seed plan or identity changed');return p}
 plan=await check();await d.record('plan-qualified',plan);await d.claim(plan);await d.record('claimed',plan);await check()
 await d.record('before-quiesce',plan);const q=await d.quiesce(plan)
 if(q?.sessionId!==plan.sessionId||q.serviceId!==plan.serviceId||q.quiescent!==true||q.offline!==true||q.terminalAttemptReviewComplete!==true)throw Error('seed original quiescence unqualified')
 await d.record('after-quiesce',q);await d.guard();await d.record('before-retire',plan);const r=await d.retire(plan)
 if(r?.sessionId!==plan.sessionId||r.serviceId!==plan.serviceId||r.filesRetired!==true||r.terminalAttemptReviewComplete!==true)throw Error('seed original retirement unqualified')
 await d.record('after-retire',r)
 const retired=async()=>{await d.guard();const p=await d.inspectRetired();if(p.oldGenerationRetired!==true||serviceSeedPlanDigest({...p,oldGenerationRetired:false})!==expectedPlanSha256)throw Error('seed retired proof changed');return p}
 const seed=await runServiceSeedProvision(recipe,plan.recipeSha256,{guard:d.guard,inspect:retired,claim:async()=>{},record:(phase,value)=>d.record('seed-'+phase,value),bootstrap:d.bootstrap,verifyTranscript:d.verifyTranscript})
 await d.record('seed-created',seed)
 const checkSeed=async()=>{await d.guard();const evidence=await d.inspectSeed(seed);if(evidence?.verified!==true||evidence.fingerprint!==seed.transcriptFingerprint||evidence.recordAbsent!==true||evidence.oldPidAbsent!==true||evidence.oldGenerationRetired!==true||evidence.identitySha256!==plan.identitySha256||evidence.roleSha256!==plan.roleSha256)throw Error('seed import proof changed')}
 await checkSeed();await d.record('before-import',{sessionId:plan.sessionId,serviceId:plan.serviceId,transcriptFingerprint:seed.transcriptFingerprint,importAttempted:true});await checkSeed()
 const imported=await d.import(plan);await d.record('after-import',{ok:imported?.ok===true});if(imported?.ok!==true)throw Error('seeded record import unverified')
 await d.guard();const record=await d.verifyRecord(plan)
 if(record?.recordRestored!==true||record.originalIdentityVerified!==true||typeof record.permissionMode!=='string'||!record.permissionMode)throw Error('seeded account record unqualified')
 await d.guard();const result={sessionId:plan.sessionId,serviceId:plan.serviceId,recordRestored:true,originalIdentityVerified:true,seedCreated:true,transcriptFingerprint:seed.transcriptFingerprint,permissionMode:record.permissionMode,actualBypassMode:record.permissionMode==='bypassPermissions',humanPermissionRequired:record.permissionMode!=='bypassPermissions',nativeEpochAssessed:false,serviceRestored:false,servingQualified:false,continuationRequired:true,importRepeated:false,historyReplayed:false,replayAuthorized:false,retrySafe:false}
 await d.record('record-restored',result);return result
}
