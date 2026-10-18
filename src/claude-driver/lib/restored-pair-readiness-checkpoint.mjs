import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {STATE_DIR} from './state.mjs'
import {readReceiverFile} from './receiver-runtime-selection.mjs'
import {restoredPairPlanDigest,restoredPairChildSubmission} from './restored-pair-ledger.mjs'
import {readRestoredPairRoot} from './restored-pair-proof.mjs'
import {readRestoredRecordRoot,observeRecoveryRecordProof} from './restored-record-proof.mjs'
import {inspectJob} from './jobs.mjs'
export const pairReadinessCheckpointDigest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex')
const job=/^j[a-f0-9]{32}$/,hex=/^[a-f0-9]{64}$/,equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
export const pairReadinessPrefix=['preflight','prepare-primary','prepare-standby','quiesce-survivor','retire-survivor','activate-primary']
export const pairReadinessPrefixPhases=pairReadinessPrefix.flatMap(step=>['before-'+step,'after-'+step]).concat('before-readiness-primary')
const childSteps=pairReadinessPrefix.filter(x=>x!=='preflight')
// Evidence admission only. The exact verified prefix can be adopted without
// executing it again; it says nothing about current native readiness/authority.
export function validatePairReadinessCheckpoint(root,parent,claim,restoration,{rootJobId,expectedRootSha256}={}){
 const fail=()=>{throw Error('pair readiness checkpoint unqualified')},p=root?.plan,r=root?.results
 if(!job.test(rootJobId||'')||!hex.test(expectedRootSha256||'')||pairReadinessCheckpointDigest(root)!==expectedRootSha256||root?.schemaVersion!==1||root.jobId!==rootJobId||root.continuation!==undefined||root.phase!=='before-readiness-primary'||root.failure?.category!=='independent_service_readiness_timeout'||root.retrySafe!==false||!hex.test(root.runtimeBuild||'')||!['primary','standby'].includes(p?.restoredRole)||p.pairPreparationEligible!==true||restoredPairPlanDigest(p)!==root.expectedPlanSha256||!equal(root.steps?.map(x=>x.phase),pairReadinessPrefixPhases)||root.steps.some((x,i)=>!Number.isSafeInteger(x.at)||x.at<0||i>0&&x.at<root.steps[i-1].at))fail()
 if(restoration?.qualified!==true||restoration.rootJobId!==p.rootJobId||restoration.rootSha256!==p.rootSha256||(restoration.restorationKind??'record')!==(p.restorationKind??'record')||restoration.sessionId!==p.currentEpochs?.[p.restoredRole]?.sessionId||restoration.serviceId!==p.originalServiceIds?.[p.restoredRole])fail()
 if(!equal(Object.keys(r??{}).sort(),[...pairReadinessPrefix].sort())||!equal(r.preflight,p)||!equal(Object.keys(root.children??{}).sort(),[...childSteps].sort()))fail()
 if(claim?.reactivationJobId!==rootJobId||claim.restorationJobId!==p.rootJobId||claim.restorationRootSha256!==p.rootSha256||claim.expectedPlanSha256!==root.expectedPlanSha256)fail()
 const a=parent?.args,d=parent?.error?.detail
 if(parent?.jobId!==rootJobId||parent.operation!=='broker_service_reactivate_restored_pair'||parent.state!=='failed'||parent.runtimeBuild!==root.runtimeBuild||parent.result!==undefined||a?.restoration_job_id!==p.rootJobId||a.expected_root_sha256!==p.rootSha256||a.expected_plan_sha256!==root.expectedPlanSha256||(a.restoration_kind??'record')!==(p.restorationKind??'record')||a.experimental!==true||parent.error?.category!=='restored_pair_unresolved'||d?.jobId!==rootJobId||d.phase!==root.phase)fail()
 const survivor=p.restoredRole==='primary'?'standby':'primary'
 for(const role of ['primary','standby']){
  const e=p.currentEpochs?.[role],prep=r['prepare-'+role],s=root.snapshots?.[role]
  if(!e||!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(e.sessionId||'')||!hex.test(s?.policy?.settingsHash||'')||!hex.test(s.policy.receiverHook?.anchorSha256||'')||prep?.prepared!==true||prep.verified!==true||prep.sessionId!==e.sessionId||prep.serviceId!==root.children['prepare-'+role]?.jobId?.slice(1)||prep.build!==root.runtimeBuild||Object.values(p.originalServiceIds).includes(prep.serviceId))fail()
 }
 if(r['prepare-primary'].serviceId===r['prepare-standby'].serviceId)fail()
 for(const step of childSteps){
  const c=root.children[step],o=c?.observation,expected=step==='activate-primary'?{operation:'broker_service_activate',arguments:{session:p.currentEpochs.primary.sessionId,service_id:r['prepare-primary'].serviceId,experimental:true,stable_hook:true,...p.restoredRole==='primary'?{cold_rebind:true}:{}}}:restoredPairChildSubmission(p,rootJobId,step)
  if(!job.test(c?.jobId||'')||d.childJobs?.[step]!==c.jobId||o?.jobId!==c.jobId||o.state!=='completed'||o.operation!==expected.operation||!equal(o.args,expected.arguments)||c.submission?.operation!==expected.operation||!equal(c.submission.arguments,expected.arguments)||c.submission.idempotency_key!=='restored-pair:'+rootJobId+':'+step||!equal(o.result,r[step]))fail()
 }
 const q=r['quiesce-survivor'],retired=r['retire-survivor'],activated=r['activate-primary']
 if(q.quiescent!==true||q.offline===true||q.terminalAttemptReviewComplete!==true||q.sessionId!==p.currentEpochs[survivor].sessionId||q.serviceId!==p.originalServiceIds[survivor]||retired.filesRetired!==true||retired.terminalAttemptReviewComplete!==true||retired.sessionId!==q.sessionId||retired.serviceId!==q.serviceId||retired.ownedSettingsRetired===true||activated.installed!==true||activated.settingsInstalled!==true||activated.sessionId!==p.currentEpochs.primary.sessionId||activated.serviceId!==r['prepare-primary'].serviceId)fail()
 return {qualified:true,originalJobId:rootJobId,originalRootSha256:expectedRootSha256,restorationJobId:p.rootJobId,restorationRootSha256:p.rootSha256,preparedServiceIds:{primary:r['prepare-primary'].serviceId,standby:r['prepare-standby'].serviceId},installedPrimaryServiceId:activated.serviceId,prefixEffectsRepeated:false,nativeReadinessAssessed:false,servingQualified:false,replayAuthorized:false}
}
export async function readPairReadinessCheckpoint(rootJobId,expectedRootSha256,{dir=join(STATE_DIR,'restored-pair-reactivations'),read=readRestoredPairRoot,readRestoration,inspect=id=>inspectJob(id,{includeResult:true})}={}){
 const root=read(rootJobId),p=root.plan,kind=p?.restorationKind??'record',originalRead=readRestoration??(id=>readRestoredRecordRoot(id,{kind})),claimPath=join(dir,'claims',p?.rootJobId+'.json'),claimBytes=readReceiverFile(claimPath,4096),claim=JSON.parse(claimBytes),parent=await inspect(rootJobId),restored=originalRead(p.rootJobId),restoredParent=await inspect(p.rootJobId)
 const restoration=await observeRecoveryRecordProof(restored.root,restoredParent,restored.claim,{rootJobId:p.rootJobId,expectedRootSha256:p.rootSha256,restorationKind:kind},{read:originalRead,inspect})
 const proof=validatePairReadinessCheckpoint(root,parent,claim,restoration,{rootJobId,expectedRootSha256})
 for(const c of [...Object.values(root.children),...Object.values(restored.root.children)]){const actual=await inspect(c.jobId);if(!['jobId','operation','state','args','result'].every(k=>equal(actual[k],c.observation[k])))throw Error('checkpoint child observation changed')}
 if(!readReceiverFile(claimPath,4096).equals(claimBytes)||!equal(read(rootJobId),root)||!equal(await inspect(rootJobId),parent)||!equal(originalRead(p.rootJobId),restored)||!equal(await inspect(p.rootJobId),restoredParent))throw Error('checkpoint roots changed')
 if(restored.root.continuation)await observeRecoveryRecordProof(restored.root,restoredParent,restored.claim,{rootJobId:p.rootJobId,expectedRootSha256:p.rootSha256,restorationKind:kind},{read:originalRead,inspect})
 return {root,parent,claim,proof,restoration}
}
