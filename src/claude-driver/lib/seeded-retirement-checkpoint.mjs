import {createHash} from 'node:crypto'
import {standbyEnrollmentDigest} from './standby-enrollment.mjs'
import {validateServiceRecoveryIdentity} from './service-recovery-identity.mjs'
import {serviceSeedRecipe,serviceSeedDigest} from './service-rebuild-seed.mjs'
import {serviceSeedPlanDigest} from './seeded-record-restoration.mjs'
import {validateMissingServiceOwnerEvidence} from './missing-service-plan.mjs'
import {recoveryRoleFromHistory} from './recovery-role.mjs'
export const seededCheckpointDigest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex')
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),job=/^j[a-f0-9]{32}$/
const same=(a,b)=>!!a&&!!b&&['sessionId','cwd','pid','procStart'].every(k=>a[k]===b[k])
export const seededRetirementPhases=['plan-qualified','claimed','before-quiesce','after-quiesce','before-retire','after-retire']
// This admits only a failed, fully observed pre-bootstrap checkpoint. Neither
// absence of a result nor a parent's claim of cancellation authorizes replay.
export function validateSeededRetirementCheckpoint(root,parent,claim,{rootJobId,expectedRootSha256}={}){
 const fail=()=>{throw Error('seeded retirement checkpoint unqualified')},hash=seededCheckpointDigest
 if(!job.test(rootJobId||'')||hash(root)!==expectedRootSha256||root?.schemaVersion!==1||root.kind!=='seeded-record-restoration'||root.jobId!==rootJobId||root.continuation!==undefined||root.phase!=='after-retire'||root.bootstrapAttempted!==false||root.importAttempted!==false||root.retrySafe!==false||!root.failure||root.seed!==undefined||root.result!==undefined||!['primary','standby'].includes(root.role))fail()
 const p=root.plan,s=root.originalSnapshot,b=s?.binding,a=b?.[root.role],other=b?.[root.role==='primary'?'standby':'primary'],identity=s?.identity
 if(standbyEnrollmentDigest(b)!==root.expectedEnrollmentSha256||b.primary.sessionId!==root.primary||serviceSeedPlanDigest(p)!==root.expectedPlanSha256||p.enrollmentSha256!==root.expectedEnrollmentSha256||p.role!==root.role||p.oldGenerationRetired!==false||p.sessionId!==a.sessionId||p.serviceId!==a.serviceId||hash(identity)!==p.identitySha256)fail()
 validateServiceRecoveryIdentity(identity,{session:a.sessionId,serviceId:a.serviceId})
 if(identity.cwd!==a.cwd||!equal(serviceSeedRecipe(identity),root.recipe)||serviceSeedDigest(root.recipe)!==p.recipeSha256)fail()
 validateMissingServiceOwnerEvidence({binding:b,expectedSha256:root.expectedEnrollmentSha256,role:root.role,record:null,identity,accountStoreHash:identity.storeHash,absence:{previousPidObservedAbsent:true,previousPid:a.pid,previousProcStart:a.procStart},status:s.status,selected:s.selection,version:root.versions})
 if(hash(recoveryRoleFromHistory(s.status,s.policy,{sessionId:a.sessionId,receiverCwd:a.cwd,admitTarget:t=>same(t,other)}))!==p.roleSha256||!equal(root.steps?.map(x=>x.phase),seededRetirementPhases)||root.steps.some((x,i)=>!Number.isSafeInteger(x.at)||x.at<0||i>0&&x.at<root.steps[i-1].at))fail()
 if(claim?.jobId!==rootJobId||claim.sessionId!==a.sessionId||claim.serviceId!==a.serviceId||claim.expectedPlanSha256!==root.expectedPlanSha256||claim.recipeSha256!==p.recipeSha256)fail()
 const detail=parent?.error?.detail
 if(parent?.jobId!==rootJobId||parent.operation!=='broker_service_rebuild_missing_record'||parent.state!=='failed'||parent.runtimeBuild!==root.runtimeBuild||parent.result!==undefined||parent.args?.session!==root.primary||parent.args.role!==root.role||parent.args.expected_enrollment_sha256!==root.expectedEnrollmentSha256||parent.args.expected_plan_sha256!==root.expectedPlanSha256||parent.args.experimental!==true||parent.error?.category!=='seeded_restoration_unresolved'||detail?.jobId!==rootJobId||detail.phase!=='after-retire'||detail.bootstrapAttempted!==false||detail.importAttempted!==false)fail()
 if(!equal(Object.keys(root.children??{}).sort(),['quiesce','retire']))fail()
 for(const [step,key]of [['quiesce','quiescence'],['retire','retirement']]){
  const c=root.children[step],o=c?.observation,args={session:a.sessionId,service_id:a.serviceId,experimental:true,offline:true,...step==='quiesce'?{require_new_stop:true}:{}},operation='broker_service_'+step
  if(!job.test(c?.jobId||'')||detail.childJobs?.[step]!==c.jobId||o?.jobId!==c.jobId||o.state!=='completed'||o.operation!==operation||!equal(o.args,args)||c.submission?.operation!==operation||!equal(c.submission.arguments,args)||c.submission.idempotency_key!=='seeded-record:'+rootJobId+':'+step||!equal(o.result,root[key])||o.result?.sessionId!==a.sessionId||o.result.serviceId!==a.serviceId||o.result.terminalAttemptReviewComplete!==true)fail()
 }
 if(root.quiescence.quiescent!==true||root.quiescence.offline!==true||root.retirement.filesRetired!==true)fail()
 return {qualified:true,originalJobId:rootJobId,originalRootSha256:expectedRootSha256,sessionId:a.sessionId,serviceId:a.serviceId,bootstrapAttempted:false,importAttempted:false,replayAuthorized:false}
}
