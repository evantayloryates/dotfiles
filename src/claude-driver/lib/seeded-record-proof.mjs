import {createHash} from 'node:crypto'
import {standbyEnrollmentDigest} from './standby-enrollment.mjs'
import {validateServiceRecoveryIdentity} from './service-recovery-identity.mjs'
import {serviceSeedRecipe,serviceSeedDigest} from './service-rebuild-seed.mjs'
import {serviceSeedPlanDigest} from './seeded-record-restoration.mjs'
import {validateMissingServiceOwnerEvidence} from './missing-service-plan.mjs'
import {recoveryRoleFromHistory} from './recovery-role.mjs'
import {validateSeededRetirementCheckpoint} from './seeded-retirement-checkpoint.mjs'
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex'),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),job=/^j[a-f0-9]{32}$/
const same=(a,b)=>!!a&&!!b&&['sessionId','cwd','pid','procStart'].every(k=>a[k]===b[k])
const phases=['plan-qualified','claimed','before-quiesce','after-quiesce','before-retire','after-retire','seed-claimed','seed-before-bootstrap','seed-after-bootstrap','seed-seed-created','seed-created','before-import','after-import','record-restored']
// Evidence admission only. Seed success does not prove native startup, bypass
// permission, consent, role installation, serving or an uncertain-effect retry.
export function validateSeededRestoredRecordRoot(root,parent,claim,{rootJobId,expectedRootSha256,origin}={}){
 const fail=()=>{throw Error('seeded record root unqualified')}
 if(!job.test(rootJobId||'')||root?.schemaVersion!==1||root.kind!=='seeded-record-restoration'||root.jobId!==rootJobId||hash(root)!==expectedRootSha256||root.phase!=='record-restored'||root.failure||root.bootstrapAttempted!==true||root.importAttempted!==true||root.retrySafe!==false||!['primary','standby'].includes(root.role))fail()
 const p=root.plan,s=root.originalSnapshot,b=s?.binding,a=b?.[root.role],other=b?.[root.role==='primary'?'standby':'primary'],identity=s?.identity
 if(standbyEnrollmentDigest(b)!==root.expectedEnrollmentSha256||b.primary.sessionId!==root.primary||serviceSeedPlanDigest(p)!==root.expectedPlanSha256||p.enrollmentSha256!==root.expectedEnrollmentSha256||p.role!==root.role||p.oldGenerationRetired!==false||p.sessionId!==a.sessionId||p.serviceId!==a.serviceId||hash(identity)!==p.identitySha256)fail()
 validateServiceRecoveryIdentity(identity,{session:a.sessionId,serviceId:a.serviceId})
 if(identity.cwd!==a.cwd||!equal(serviceSeedRecipe(identity),root.recipe)||serviceSeedDigest(root.recipe)!==p.recipeSha256)fail()
 validateMissingServiceOwnerEvidence({binding:b,expectedSha256:root.expectedEnrollmentSha256,role:root.role,record:null,identity,accountStoreHash:identity.storeHash,absence:{previousPidObservedAbsent:true,previousPid:a.pid,previousProcStart:a.procStart},status:s.status,selected:s.selection,version:root.versions})
 const retainedRole=recoveryRoleFromHistory(s.status,s.policy,{sessionId:a.sessionId,receiverCwd:a.cwd,admitTarget:t=>same(t,other)})
 if(hash(retainedRole)!==p.roleSha256||!equal(root.steps?.map(x=>x.phase),phases)||root.steps.some((x,i)=>!Number.isSafeInteger(x.at)||x.at<0||i>0&&x.at<root.steps[i-1].at))fail()
 if(claim?.jobId!==rootJobId||claim.sessionId!==a.sessionId||claim.serviceId!==a.serviceId||claim.expectedPlanSha256!==root.expectedPlanSha256||claim.recipeSha256!==p.recipeSha256)fail()
 const priorJob=root.continuation?.originalJobId??rootJobId
 if(root.continuation!==undefined){
  const c=root.continuation
  if(!job.test(c?.originalJobId||'')||c.originalJobId===rootJobId||!origin)fail()
  validateSeededRetirementCheckpoint(origin.root,origin.parent,origin.claim,{rootJobId:c.originalJobId,expectedRootSha256:c.originalRootSha256})
  if(claim.originalJobId!==c.originalJobId||claim.originalRootSha256!==c.originalRootSha256||!['primary','role','expectedEnrollmentSha256','expectedPlanSha256','plan','recipe','originalSnapshot','versions','children','quiescence','retirement'].every(k=>equal(root[k],origin.root[k]))||!equal(root.steps.slice(0,6),origin.root.steps)||parent?.operation!=='broker_service_continue_seeded_record'||parent.args?.original_job_id!==c.originalJobId||parent.args.expected_original_root_sha256!==c.originalRootSha256)fail()
 }else if(origin||parent?.operation!=='broker_service_rebuild_missing_record'||parent.args?.session!==root.primary||parent.args.role!==root.role||parent.args.expected_enrollment_sha256!==root.expectedEnrollmentSha256||parent.args.expected_plan_sha256!==root.expectedPlanSha256)fail()
 if(parent?.jobId!==rootJobId||parent.state!=='completed'||parent.runtimeBuild!==root.runtimeBuild||parent.args.experimental!==true||!equal(parent.result,root.result))fail()
 for(const [step,key]of [['quiesce','quiescence'],['retire','retirement']]){const c=root.children?.[step],o=c?.observation,args={session:a.sessionId,service_id:a.serviceId,experimental:true,offline:true,...step==='quiesce'?{require_new_stop:true}:{}},operation='broker_service_'+step;if(!job.test(c?.jobId||'')||o?.jobId!==c.jobId||o.state!=='completed'||o.operation!==operation||!equal(o.args,args)||c.submission?.operation!==operation||!equal(c.submission.arguments,args)||c.submission.idempotency_key!=='seeded-record:'+priorJob+':'+step||!equal(o.result,root[key])||o.result?.sessionId!==a.sessionId||o.result.serviceId!==a.serviceId||o.result.terminalAttemptReviewComplete!==true)fail()}
 const seed=root.seed,result=root.result
 if(root.quiescence.quiescent!==true||root.quiescence.offline!==true||root.retirement.filesRetired!==true||seed?.sessionId!==a.sessionId||seed.seedCreated!==true||seed.bootstrapReplyVerified!==true||seed.recipeSha256!==p.recipeSha256||!/^[a-f0-9]{64}$/.test(seed.transcriptFingerprint||'')||seed.importAttempted!==false||seed.serviceRestored!==false||result?.sessionId!==a.sessionId||result.serviceId!==a.serviceId||result.seedCreated!==true||result.transcriptFingerprint!==seed.transcriptFingerprint||result.recordRestored!==true||result.originalIdentityVerified!==true||result.nativeEpochAssessed!==false||result.serviceRestored!==false||result.servingQualified!==false||result.historyReplayed!==false||result.importRepeated!==false||result.replayAuthorized!==false||result.retrySafe!==false)fail()
 return {qualified:true,restorationKind:'seeded',rootJobId,rootSha256:expectedRootSha256,sessionId:a.sessionId,serviceId:a.serviceId,importStartedAt:root.steps.find(x=>x.phase==='before-import').at,recordRestored:true,seedCreated:true,nativeEpochAssessed:false,serviceRestored:false,activationAuthorized:false,importAuthorized:false,replayAuthorized:false,effectsPerformed:false}
}
