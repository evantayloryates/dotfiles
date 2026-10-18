import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {validateMissingServiceOwnerEvidence} from './missing-service-plan.mjs'
import {serviceSeedRecipe,serviceSeedDigest} from './service-rebuild-seed.mjs'
import {inspectServiceSeedTranscriptAbsence} from './service-seed-absence.mjs'
import {readStandbyEnrollment,standbyEnrollmentDigest} from './standby-enrollment.mjs'
import {readServiceRecoveryIdentity} from './service-recovery-identity.mjs'
import {getRecord} from './sessions.mjs'
import {activeStore,versions} from './paths.mjs'
import {loadReceiverSelection,readReceiverFile} from './receiver-runtime-selection.mjs'
import {requireIndependentOfflineMutation} from './independent-offline-review.mjs'
import {inspectIndependentService} from './independent-service-result.mjs'
import {recoveryRoleFromHistory} from './recovery-role.mjs'
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex')
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
const same=(a,b)=>!!a&&!!b&&['sessionId','cwd','pid','procStart'].every(k=>a[k]===b[k])
export function planServiceSeed(e={}){
 const no=reason=>({action:'inspect',reason,seedPreparationEligible:false,bootstrapAuthorized:false,importAuthorized:false,permissionRaiseAuthorized:false,replayAuthorized:false,effectsPerformed:false})
 try{
  const {actor,other}=validateMissingServiceOwnerEvidence(e),proof=e.transcriptAbsence
  if(proof?.verified!==true||proof.allTranscriptsAbsent!==true||proof.cliSessionId!==e.identity.cliSessionId||!/^[a-f0-9]{64}$/.test(proof.fingerprint||''))return no('all-project-transcript-absence-unqualified')
  const role=recoveryRoleFromHistory(e.status,e.policy,{sessionId:actor.sessionId,receiverCwd:actor.cwd,admitTarget:t=>same(t,other)}),recipe=serviceSeedRecipe(e.identity)
  return {action:'prepare',reason:'missing-record-and-transcript-seed-evidence-qualified',seedPreparationEligible:true,bootstrapAuthorized:false,importAuthorized:false,permissionRaiseAuthorized:false,replayAuthorized:false,effectsPerformed:false,sessionId:actor.sessionId,serviceId:actor.serviceId,role:e.role,enrollmentSha256:e.expectedSha256,identitySha256:hash(e.identity),transcriptAbsenceFingerprint:proof.fingerprint,roleSha256:hash(role),recipeSha256:serviceSeedDigest(recipe),recordAbsent:true,allTranscriptsAbsent:true,oldPidAbsent:true,oldGenerationRetired:e.retiredByRoot===true,rolesPreserved:true,requiresRetirementBeforeBootstrap:true,requiresActualNativePermission:true,servingQualified:false}
 }catch(error){return no(error.reason??'service-seed-evidence-unqualified')}
}
// Read-only exact enrolled actor only; no bootstrap, import or app-data writes.
export async function inspectServiceSeedPlan(primary,role,expectedSha256,{signal}={},d={}){
 const read=d.binding??readStandbyEnrollment,record=d.record??getRecord,identityRead=d.identity??readServiceRecoveryIdentity,select=d.select??loadReceiverSelection,absent=d.absent??(a=>requireIndependentOfflineMutation(a,a.sessionId)),inspect=d.status??(a=>inspectIndependentService(a.sessionId,a.serviceId,{offline:true,signal})),transcript=d.transcriptAbsence??inspectServiceSeedTranscriptAbsence,account=d.account??(()=>createHash('sha256').update(activeStore().dir).digest('hex')),policy=d.policy??(a=>JSON.parse(readReceiverFile(join(a.cwd,'.claude-driver-services',a.serviceId,'broker','stop-rescue-policy.json'),65536)))
 try{
  const binding=read(primary);if(!['primary','standby'].includes(role)||standbyEnrollmentDigest(binding)!==expectedSha256)throw Error('binding')
  const actor=binding[role],saved=record(actor.sessionId);if(saved)return {action:'wait',reason:'saved-service-record-present',seedPreparationEligible:false,effectsPerformed:false}
  const identity=identityRead(actor.sessionId,actor.serviceId);if(!identity)throw Error('identity')
  const selection=select(actor.cwd),absence=absent(actor),status=await inspect(actor),p=policy(actor),transcriptAbsence=transcript(identity.cliSessionId),accountStoreHash=account()
  if(signal?.aborted||record(actor.sessionId)||standbyEnrollmentDigest(read(primary))!==expectedSha256||!equal(identityRead(actor.sessionId,actor.serviceId),identity)||!equal(select(actor.cwd),selection)||!equal(policy(actor),p)||!equal(transcript(identity.cliSessionId),transcriptAbsence)||account()!==accountStoreHash)throw Error('changed')
  absent(actor)
  return planServiceSeed({binding,expectedSha256,role,record:null,identity,accountStoreHash,absence,status,selected:selection,version:(d.version??versions)(),policy:p,transcriptAbsence,retiredByRoot:d.retiredByRoot===true})
 }catch{return {action:'inspect',reason:'service-seed-inspection-unqualified',seedPreparationEligible:false,bootstrapAuthorized:false,importAuthorized:false,effectsPerformed:false}}
}
