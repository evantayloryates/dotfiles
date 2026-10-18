// Exact claim/parent/child observations. No native reads, recovery effects,
// directory discovery, or authority to replay the original target operation.
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {STATE_DIR} from './state.mjs'
import {readReceiverFile} from './receiver-runtime-selection.mjs'
import {inspectJob} from './jobs.mjs'
import {ordinarySessionBindingValid} from './ordinary-session-control.mjs'
import {missingServicePlanDigest} from './missing-service-restoration.mjs'
import {serviceSeedPlanDigest} from './seeded-record-restoration.mjs'
const job=/^j[a-f0-9]{32}$/,hex=/^[a-f0-9]{64}$/
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
export const ordinaryRecordCheckpointDigest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex')
const operations=['pin_session','rename_session','set_session_config','archive_session','unarchive_session']
export const ordinaryRecordRecoveryBase=()=>join(STATE_DIR,'ordinary-record-recoveries')
const parse=(read,file,limit)=>JSON.parse(read(file,limit))
export function readOrdinaryRecordRecovery(controller,serviceId,enrollmentSha256,{base=ordinaryRecordRecoveryBase(),read=readReceiverFile}={}){
 if(!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(controller||'')||!/^[a-f0-9]{32}$/.test(serviceId||'')||!hex.test(enrollmentSha256||''))throw Error('exact ordinary recovery identity required')
 const claimFile=join(base,'claims',serviceId+'.json');let claim
 try{claim=parse(read,claimFile,4096)}catch(e){if(e.code==='ENOENT')return null;throw e}
 if(claim.schemaVersion!==1||claim.controllerSession!==controller||claim.serviceId!==serviceId||claim.enrollmentSha256!==enrollmentSha256||!job.test(claim.jobId||''))throw Error('ordinary recovery generation claim differs')
 const readRoot=id=>{const r=parse(read,join(base,id+'.json'),1048576);if(r.schemaVersion!==1||r.jobId!==id||r.controllerSession!==controller||r.serviceId!==serviceId||r.enrollmentSha256!==enrollmentSha256||!['record','seeded'].includes(r.kind)||!hex.test(r.runtimeBuild||'')||typeof r.phase!=='string'||!/^[-a-z]{1,80}$/.test(r.phase)||r.targetDispatched!==false||r.replayAuthorized!==false||!ordinarySessionBindingValid(r.binding,controller)||r.binding.sessionId!==r.target||!operations.includes(r.operation)||!hex.test(r.intentSha256||'')||!r.children||Object.keys(r.children).some(k=>!['restore','reactivate','continue-pair'].includes(k)))throw Error('ordinary recovery root differs');return r}
 let original
 try{original=readRoot(claim.jobId)}catch(e){if(e.code==='ENOENT')return {claim,root:null,base,claimFile};throw e}
 if(original.origin!==undefined||original.restorationOrigin!==undefined||original.pairReadinessOrigin!==undefined||original.children['continue-pair']!==undefined)throw Error('generation owner cannot be a continuation')
 const originalRootSha256=ordinaryRecordCheckpointDigest(original),continuationFile=join(base,'continuation-claims',original.jobId+'.json');let continuation
 try{continuation=parse(read,continuationFile,4096)}catch(e){if(e.code!=='ENOENT')throw e}
 let root=original
 if(continuation){
  if(continuation.schemaVersion!==1||continuation.originalJobId!==original.jobId||continuation.originalRootSha256!==originalRootSha256||continuation.controllerSession!==controller||continuation.serviceId!==serviceId||continuation.enrollmentSha256!==enrollmentSha256||!job.test(continuation.jobId||'')||continuation.jobId===original.jobId)throw Error('ordinary continuation claim differs')
  try{root=readRoot(continuation.jobId)}catch(e){if(e.code==='ENOENT')return {claim,root:null,original,originalRootSha256,continuation,base,claimFile,continuationFile};throw e}
  if(original.children.reactivate!==undefined||!equal(root.origin,{jobId:original.jobId,rootSha256:originalRootSha256})||root.pairReadinessOrigin!==undefined||root.children.restore!==undefined||root.children['continue-pair']!==undefined||!equal(root.plan,original.plan)||root.kind!==original.kind||root.restorationOrigin?.kind!==original.kind||root.restorationOrigin.jobId!==original.children.restore?.jobId||!hex.test(root.restorationOrigin.rootSha256||''))throw Error('ordinary continuation origin differs')
 }
 const recordSuffix=continuation?root:null,pairOwner=root,pairJobId=pairOwner.children.reactivate?.jobId,pairContinuationFile=job.test(pairJobId||'')?join(base,'pair-continuation-claims',pairJobId+'.json'):null
 let pairContinuation
 if(pairContinuationFile)try{pairContinuation=parse(read,pairContinuationFile,4096)}catch(e){if(e.code!=='ENOENT')throw e}
 if(pairContinuation){
  const c=pairContinuation,ownerSha=ordinaryRecordCheckpointDigest(pairOwner)
  if(c.schemaVersion!==1||c.originalJobId!==pairOwner.jobId||c.originalRootSha256!==ownerSha||c.controllerSession!==controller||c.serviceId!==serviceId||c.enrollmentSha256!==enrollmentSha256||c.pairJobId!==pairJobId||!hex.test(c.pairRootSha256||'')||!hex.test(c.preparedBuild||'')||!job.test(c.jobId||'')||[original.jobId,pairOwner.jobId].includes(c.jobId))throw Error('ordinary readiness continuation claim differs')
  try{root=readRoot(c.jobId)}catch(e){if(e.code==='ENOENT')return {claim,root:null,original,originalRootSha256,continuation,recordSuffix,pairOwner,pairContinuation,base,claimFile,continuationFile,pairContinuationFile};throw e}
  if(!equal(root.origin,{jobId:pairOwner.jobId,rootSha256:ownerSha})||!equal(root.pairReadinessOrigin,{jobId:pairJobId,rootSha256:c.pairRootSha256,preparedBuild:c.preparedBuild})||root.generationOwnerJobId!==original.jobId||root.children.restore!==undefined||root.children.reactivate!==undefined||!equal(root.plan,original.plan)||root.kind!==original.kind||root.restorationOrigin?.kind!==original.kind||root.restorationOrigin.jobId!==original.children.restore?.jobId||root.restorationOrigin.rootSha256!==pairOwner.children.reactivate.submission?.arguments?.expected_root_sha256)throw Error('ordinary readiness continuation origin differs')
 }
 return {claim,root,original,originalRootSha256,continuation,recordSuffix,pairOwner,pairContinuation,base,claimFile,continuationFile,pairContinuationFile}
}
function validateParent(root,parent){
 if(parent?.jobId!==root.jobId||parent.operation!==root.operation||parent.args?.session!==root.target||ordinaryRecordCheckpointDigest({operation:parent.operation,arguments:parent.args})!==root.intentSha256)throw Error('ordinary recovery actual parent differs')
 return parent.state==='failed'&&parent.error?.category==='ordinary_controller_record_recovery_pending'&&parent.error.detail?.recoveryParentJobId===root.jobId&&parent.error.detail.targetDispatched===false
}
export async function observeOrdinaryRecordCheckpoint(controller,serviceId,enrollmentSha256,{base=ordinaryRecordRecoveryBase(),read=readReceiverFile,inspect=id=>inspectJob(id,{includeResult:true}),signal}={}){
 const first=readOrdinaryRecordRecovery(controller,serviceId,enrollmentSha256,{base,read})
 if(!first)return null
 if(!first.root)return {...first,checkpointVerified:false,suffixInspectionEligible:false,pairReadinessInspectionEligible:false,reason:'journal-not-published'}
 const {root,original,claim}=first,parents={},children={}
 const originalTerminal=validateParent(original,parents.original=await inspect(original.jobId))
 let allTerminal=originalTerminal
 if(first.recordSuffix)allTerminal=validateParent(first.recordSuffix,parents.leaf=await inspect(first.recordSuffix.jobId))&&allTerminal
 if(first.pairContinuation)allTerminal=validateParent(root,parents.readiness=await inspect(root.jobId))&&allTerminal
 const plan=original.plan,planSha256=original.kind==='seeded'?serviceSeedPlanDigest(plan):missingServicePlanDigest(plan)
 if(plan.sessionId!==controller||plan.serviceId!==serviceId||plan.enrollmentSha256!==enrollmentSha256)throw Error('ordinary recovery plan differs')
 const restore=original.children.restore
 if(restore){
  const expected={session:controller,role:'primary',expected_enrollment_sha256:enrollmentSha256,expected_plan_sha256:planSha256,experimental:true}
  if(restore.submission?.operation!==(original.kind==='seeded'?'broker_service_rebuild_missing_record':'broker_service_restore_missing_record')||!equal(restore.submission.arguments,expected)||restore.submission.idempotency_key!=='ordinary-record:'+original.jobId+':restore')throw Error('ordinary restoration submission differs')
  if(restore.jobId){if(!job.test(restore.jobId))throw Error('ordinary restoration handle differs');const actual=await inspect(restore.jobId);if(actual.jobId!==restore.jobId||actual.operation!==restore.submission.operation||!equal(actual.args,expected))throw Error('ordinary restoration actual child differs');children.restore=actual}
 }
 for(const [label,node]of first.recordSuffix?[['original',original],['leaf',first.recordSuffix]]:[['original',original]]){
  const c=node.children.reactivate;if(!c)continue
  const expectedRoot=node.restorationOrigin?.rootSha256??node.result?.restorationRootSha256??node.result?.rootSha256
  if(c.submission?.operation!=='broker_service_reactivate_restored_pair'||c.submission.idempotency_key!=='ordinary-record:'+node.jobId+':reactivate'||c.submission.arguments?.restoration_job_id!==restore?.jobId||c.submission.arguments.restoration_kind!==original.kind||c.submission.arguments.experimental!==true||!hex.test(expectedRoot||'')||c.submission.arguments.expected_root_sha256!==expectedRoot||!hex.test(c.submission.arguments.expected_plan_sha256||''))throw Error('ordinary pair submission differs')
  if(c.jobId){if(!job.test(c.jobId))throw Error('ordinary pair handle differs');const actual=await inspect(c.jobId);if(actual.jobId!==c.jobId||actual.operation!==c.submission.operation||!equal(actual.args,c.submission.arguments))throw Error('ordinary pair actual child differs');children[label+'Pair']=actual}
 }
 if(first.pairContinuation){
  const c=root.children['continue-pair'],origin=root.pairReadinessOrigin
  if(c){const expected={original_job_id:origin.jobId,expected_original_root_sha256:origin.rootSha256,experimental:true};if(c.submission?.operation!=='broker_service_continue_restored_pair'||!equal(c.submission.arguments,expected)||c.submission.idempotency_key!=='ordinary-record:'+root.jobId+':continue-pair')throw Error('ordinary readiness suffix submission differs');if(c.jobId){if(!job.test(c.jobId))throw Error('ordinary readiness child handle differs');const actual=await inspect(c.jobId);if(actual.jobId!==c.jobId||actual.operation!==c.submission.operation||!equal(actual.args,expected))throw Error('ordinary readiness actual child differs');children.pairContinuation=actual}}
 }
 const after=readOrdinaryRecordRecovery(controller,serviceId,enrollmentSha256,{base,read})
 if(signal?.aborted||!equal(after,first))throw Error('ordinary recovery checkpoint changed')
 for(const actual of Object.values(parents))if(!equal(await inspect(actual.jobId),actual))throw Error('ordinary recovery actual parent changed')
 for(const actual of Object.values(children))if(!equal(await inspect(actual.jobId),actual))throw Error('ordinary recovery actual child changed')
 if(signal?.aborted||!equal(readOrdinaryRecordRecovery(controller,serviceId,enrollmentSha256,{base,read}),first))throw Error('ordinary recovery journal changed after observation')
 const restored=children.restore?.state==='completed'&&children.restore.result?.recordRestored===true&&children.restore.result.originalIdentityVerified===true&&children.restore.result.servingQualified===false&&children.restore.result.replayAuthorized===false
 const suffixInspectionEligible=allTerminal&&root===original&&restored&&!original.children.reactivate
 const candidate=children.leafPair??children.originalPair,pairReadinessInspectionEligible=allTerminal&&restored&&!first.pairContinuation&&candidate?.state==='failed'&&candidate.error?.category==='restored_pair_unresolved'&&candidate.error.detail?.phase==='before-readiness-primary'
 return {...first,parents,children,checkpointVerified:true,suffixInspectionEligible,pairReadinessInspectionEligible,pairReadinessCandidate:pairReadinessInspectionEligible?candidate:null,reason:!allTerminal?'original-parent-active-or-unqualified':first.pairContinuation?'pair-continuation-already-claimed':pairReadinessInspectionEligible?'pair-readiness-suffix-inspection-available':first.continuation?'continuation-already-claimed':original.children.reactivate?'pair-child-already-attempted':!restored?'restoration-not-independently-completed':'restored-record-suffix-inspection-available',restorationJobId:restore?.jobId??null,rootSha256:ordinaryRecordCheckpointDigest(root)}
}
export async function assertOrdinaryRecordCheckpointStable(checkpoint,{read=readReceiverFile,inspect=id=>inspectJob(id,{includeResult:true}),signal}={}){
 const {original,claim,base}=checkpoint,now=readOrdinaryRecordRecovery(claim.controllerSession,claim.serviceId,claim.enrollmentSha256,{base,read})
 // A new continuation is allowed to add only its separate claim/root. The
 // original generation owner and failed parent remain unchanged.
 if(signal?.aborted||!equal(now?.claim,claim)||!equal(now?.original,original)||checkpoint.recordSuffix&&!equal(now?.recordSuffix,checkpoint.recordSuffix))throw Error('ordinary continuation origin changed')
 for(const actual of Object.values(checkpoint.parents))if(!equal(await inspect(actual.jobId),actual))throw Error('ordinary continuation actual parent changed')
 const after=readOrdinaryRecordRecovery(claim.controllerSession,claim.serviceId,claim.enrollmentSha256,{base,read})
 if(signal?.aborted||!equal(after?.claim,claim)||!equal(after?.original,original)||checkpoint.recordSuffix&&!equal(after?.recordSuffix,checkpoint.recordSuffix))throw Error('ordinary continuation origin changed after observation')
}
const safeState=x=>['queued','running','completed','failed','cancelled','outcome_unknown'].includes(x)?x:'unqualified'
export async function inspectOrdinaryRecordRecovery(controller,serviceId,enrollmentSha256,options={}){
 const common={scope:'ordinary-controller-record-recovery',controllerSession:controller,nativeEffectsRequested:0,nativeEpochAssessed:false,recoveryAttempted:false,replayAuthorized:false,targetAssessed:false}
 try{
  const c=await observeOrdinaryRecordCheckpoint(controller,serviceId,enrollmentSha256,options)
  if(!c)return {...common,configured:false}
  const root=c.root
  return {...common,configured:true,checkpointVerified:c.checkpointVerified,reason:c.reason,recoveryParentJobId:root?.jobId??c.pairContinuation?.jobId??c.continuation?.jobId??c.claim.jobId,originalRecoveryParentJobId:c.claim.jobId,phase:root?.phase??null,kind:root?.kind??c.original?.kind??null,...c.rootSha256?{rootSha256:c.rootSha256}:{},suffixInspectionEligible:c.suffixInspectionEligible,pairReadinessInspectionEligible:c.pairReadinessInspectionEligible,...c.pairReadinessCandidate?{pairReadinessCandidateJobId:c.pairReadinessCandidate.jobId}:{},parentState:safeState((c.parents?.readiness??c.parents?.leaf??c.parents?.original)?.state),children:Object.fromEntries(Object.entries(c.children??{}).map(([key,j])=>[key,{jobId:j.jobId,operation:j.operation,state:safeState(j.state)}]))}
 }catch{
  let pointer
  try{const raw=readOrdinaryRecordRecovery(controller,serviceId,enrollmentSha256,options);if(raw)pointer={recoveryParentJobId:raw.root?.jobId??raw.pairContinuation?.jobId??raw.continuation?.jobId??raw.claim.jobId,originalRecoveryParentJobId:raw.claim.jobId,phase:raw.root?.phase??null}}catch{}
  return {...common,...pointer,configured:true,checkpointVerified:false,reason:'ordinary-record-checkpoint-unqualified',suffixInspectionEligible:false,pairReadinessInspectionEligible:false}
 }
}
export async function inspectEnrolledOrdinaryRecordRecovery(controller,{signal}={},d={}){
 if(!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(controller||''))throw Error('exact ordinary controller required')
 const read=d.enrollment??(await import('./session-management-controller.mjs')).readSessionManagementEnrollment,{readStandbyEnrollment,standbyEnrollmentDigest}=await import('./standby-enrollment.mjs'),pairRead=d.pair??readStandbyEnrollment
 const row=read(),common={scope:'ordinary-controller-record-recovery',controllerSession:controller,nativeEffectsRequested:0,recoveryAttempted:false,nativeEpochAssessed:false,replayAuthorized:false,targetAssessed:false}
 if(!row||row.controllerSession!==controller)return {...common,configured:false}
 const pair=pairRead(controller);if(!pair)return {...common,configured:false}
 const digest=standbyEnrollmentDigest(pair),result=await inspectOrdinaryRecordRecovery(controller,pair.primary.serviceId,digest,{...d,signal})
 if(signal?.aborted||!equal(read(),row)||standbyEnrollmentDigest(pairRead(controller))!==digest)return {...common,configured:true,checkpointVerified:false,reason:'ordinary-record-enrollment-changed',suffixInspectionEligible:false}
 return result
}
