import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {STATE_DIR} from './state.mjs'
import {readReceiverFile} from './receiver-runtime-selection.mjs'
import {standbyEnrollmentDigest} from './standby-enrollment.mjs'
import {missingServicePlanDigest} from './missing-service-restoration.mjs'
const job=/^j[a-f0-9]{32}$/
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex')
const phases=['plan-qualified','claimed','before-quiesce','after-quiesce','before-retire','after-retire','before-import','after-import','record-restored']
export const restoredRecordRootDigest=hash
// Evidence admission only: this proof authorizes neither import replay nor activation.
export function validateRestoredRecordRoot(root,parent,claim,{rootJobId,expectedRootSha256}={}){
 const refuse=()=>{throw Error('restored record root unqualified')}
 if(!job.test(rootJobId||'')||! /^[a-f0-9]{64}$/.test(expectedRootSha256||'')||hash(root)!==expectedRootSha256||root?.schemaVersion!==1||root.jobId!==rootJobId||root.failure||root.phase!=='record-restored'||root.importAttempted!==true||root.retrySafe!==false||!['primary','standby'].includes(root.role))refuse()
 const snapshot=root.originalSnapshot,plan=root.plan,result=root.result
 if(!snapshot?.binding||standbyEnrollmentDigest(snapshot.binding)!==root.expectedEnrollmentSha256||snapshot.binding.primary.sessionId!==root.primary||snapshot.binding.schemaVersion!==2||snapshot.binding.automaticRecovery!==true||missingServicePlanDigest(plan)!==root.expectedPlanSha256||plan.enrollmentSha256!==root.expectedEnrollmentSha256||hash(snapshot.identity)!==plan.identitySha256)refuse()
 const actor=snapshot.binding[root.role],identity=snapshot.identity,selector=snapshot.selection?.selector
 if(plan.sessionId!==actor.sessionId||plan.serviceId!==actor.serviceId||identity.sessionId!==actor.sessionId||identity.serviceId!==actor.serviceId||identity.cwd!==actor.cwd||identity.cliSessionId!==actor.sessionId.slice(6)||identity.permissionMode!=='bypassPermissions'||selector?.sessionId!==actor.sessionId||selector.serviceId!==actor.serviceId||selector.pid!==actor.pid||selector.procStart!==actor.procStart)refuse()
 if(!equal(root.steps?.map(s=>s.phase),phases)||root.steps.some((s,i)=>!Number.isSafeInteger(s.at)||s.at<0||i>0&&s.at<root.steps[i-1].at))refuse()
 if(claim?.jobId!==rootJobId||claim.sessionId!==actor.sessionId||claim.serviceId!==actor.serviceId||claim.expectedPlanSha256!==root.expectedPlanSha256)refuse()
 if(parent?.jobId!==rootJobId||parent.operation!=='broker_service_restore_missing_record'||parent.state!=='completed'||!equal(parent.result,result)||parent.args?.session!==root.primary||parent.args.role!==root.role||parent.args.expected_enrollment_sha256!==root.expectedEnrollmentSha256||parent.args.expected_plan_sha256!==root.expectedPlanSha256||parent.args.experimental!==true)refuse()
 for(const [step,operation,key]of [['quiesce','broker_service_quiesce','quiescence'],['retire','broker_service_retire','retirement']]){
  const child=root.children?.[step],o=child?.observation,args={session:actor.sessionId,service_id:actor.serviceId,experimental:true,offline:true,...step==='quiesce'?{require_new_stop:true}:{}}
  if(!job.test(child?.jobId||'')||o?.jobId!==child.jobId||o.state!=='completed'||o.operation!==operation||!equal(o.args,args)||!equal(child.submission?.arguments,args)||child.submission.operation!==operation||child.submission.idempotency_key!=='missing-record:'+rootJobId+':'+step||!equal(o.result,root[key])||o.result?.sessionId!==actor.sessionId||o.result.serviceId!==actor.serviceId||o.result.terminalAttemptReviewComplete!==true)refuse()
 }
 if(root.quiescence.quiescent!==true||root.quiescence.offline!==true||root.retirement.filesRetired!==true||result?.sessionId!==actor.sessionId||result.serviceId!==actor.serviceId||result.recordRestored!==true||result.originalIdentityVerified!==true||result.nativeEpochAssessed!==false||result.serviceRestored!==false||result.servingQualified!==false||result.importRepeated!==false||result.replayAuthorized!==false||result.retrySafe!==false)refuse()
 return {qualified:true,rootJobId,rootSha256:expectedRootSha256,sessionId:actor.sessionId,serviceId:actor.serviceId,importStartedAt:root.steps[6].at,recordRestored:true,nativeEpochAssessed:false,serviceRestored:false,activationAuthorized:false,importAuthorized:false,replayAuthorized:false,effectsPerformed:false}
}
export function readRestoredRecordRoot(rootJobId,{dir=join(STATE_DIR,'missing-service-restorations')}={}){
 if(!job.test(rootJobId||''))throw Error('exact restoration root required')
 const root=JSON.parse(readReceiverFile(join(dir,rootJobId+'.json'),1048576))
 if(!/^[a-f0-9]{32}$/.test(root.plan?.serviceId||''))throw Error('exact restoration generation required')
 return {root,rootSha256:hash(root),claim:JSON.parse(readReceiverFile(join(dir,'claims',root.plan?.serviceId+'.json'),4096))}
}
