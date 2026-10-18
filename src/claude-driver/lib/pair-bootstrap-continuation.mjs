import {inspectMetadataEnrollment} from './metadata-controller-index.mjs'
import {recoveryRoleFromHistory} from './recovery-role.mjs'
import {createHash} from 'node:crypto'
import {readPairBootstrapRoot,pairImportEpochQualified,pairMetadataEnrollmentMatches} from './pair-bootstrap-proof.mjs'
import {standbyEnrollmentDigest,readStandbyEnrollment} from './standby-enrollment.mjs'
import {inspectJob} from './jobs.mjs'
import {inspectIndependentService} from './independent-service-result.mjs'
import {loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {getRecord,openPrs,liveProcesses} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {inspectNativeResourcePid} from './native-resource-process.mjs'
import {ordinarySessionBinding} from './ordinary-session-control.mjs'
import {versions} from './paths.mjs'
const roles=['primary','standby'],job=/^j[a-f0-9]{32}$/
const prefix=['preflight','quiesce-primary','retire-primary','quiesce-standby','retire-standby']
export const pairBootstrapRootDigest=root=>createHash('sha256').update(JSON.stringify(root)).digest('hex')
// Pure original-failure proof. A failed import is never relabelled successful;
// fresh observations are evidence in the new continuation root only.
export function validatePairImportContinuation(root,parent,{rootJobId,expectedRootSha256,primary,expectedEnrollmentSha256}={}){
 if(!job.test(rootJobId||'')||root?.schemaVersion!==1||root.jobId!==rootJobId||pairBootstrapRootDigest(root)!==expectedRootSha256||!root.failure||!['before-import-primary','before-import-standby'].includes(root.phase)||root.binding?.primary?.sessionId!==primary||root.enrollmentSha256!==expectedEnrollmentSha256||standbyEnrollmentDigest(root.binding)!==expectedEnrollmentSha256||parent?.jobId!==rootJobId||parent.state!=='failed'||parent.error?.category!=='pair_bootstrap_unresolved'||parent.error.detail?.phase!==root.phase||parent.error.detail?.jobId!==rootJobId||!['broker_service_bootstrap_pair','broker_service_continue_pair_bootstrap'].includes(parent.operation)||parent.args?.session!==primary||parent.args.expected_enrollment_sha256!==expectedEnrollmentSha256)throw Error('original failed import root unqualified')
 if(parent.operation==='broker_service_continue_pair_bootstrap'&&(parent.args.original_root_job_id!==root.continuationOf||parent.args.expected_root_sha256!==root.originalRootSha256))throw Error('continuation parent chain changed')
 if(!Number.isSafeInteger(root.at)||root.at<0||!Number.isSafeInteger(root.originStartedAt??root.at)||(root.originStartedAt??root.at)>root.at||!/^[a-f0-9]{64}$/.test(root.runtimeBuild||'')||typeof root.metadataEnrollment?.enrolled!=='boolean')throw Error('original root context incomplete')
 const failedRole=root.phase.slice('before-import-'.length),allowed=new Set([...prefix,...failedRole==='standby'?['import-primary']:[]])
 if(Object.keys(root.results??{}).some(k=>!allowed.has(k))||prefix.some(k=>!Object.hasOwn(root.results,k))||root.results.preflight.bootstrapPreparationEligible!==true||Object.keys(root.children??{}).some(k=>!['quiesce-primary','retire-primary','quiesce-standby','retire-standby'].includes(k)))throw Error('continuation has unknown or later effects')
 for(const role of roles){
  if(!root.snapshots?.[role]?.identity||!root.snapshots[role].selection||!root.snapshots[role].policy||!root.snapshots[role].role)throw Error('original snapshot absent')
  for(const phase of ['quiesce','retire']){const c=root.children?.[phase+'-'+role],o=c?.observation,r=root.results[phase+'-'+role],old=root.binding[role];if(!job.test(c?.jobId||'')||o?.jobId!==c.jobId||o.operation!=='broker_service_'+phase||o.state!=='completed'||o.args?.session!==old.sessionId||o.args.service_id!==old.serviceId||o.args.offline!==true||phase==='quiesce'&&(o.args.require_new_stop!==true||r.quiescent!==true||r.offline!==true)||phase==='retire'&&r.filesRetired!==true||r.terminalAttemptReviewComplete!==true||JSON.stringify(o.result)!==JSON.stringify(r))throw Error('original terminal retirement proof absent')}
  const intent=root.importIntents?.[role]
  if(role===failedRole&&!intent||intent&&(!Number.isSafeInteger(intent.startedAt)||intent.startedAt<(root.originStartedAt??root.at)||intent.sessionId!==root.binding[role].sessionId||intent.cliSessionId!==root.binding[role].sessionId.slice(6)||intent.dispatchMayOccur!==true))throw Error('original import intent unqualified')
  if(role==='standby'&&failedRole==='primary'&&intent)throw Error('unexpected later import intent')
 }
 if(failedRole==='standby'&&root.results['import-primary']?.newEpochVerified!==true)throw Error('preceding import unverified')
 return {failedRole,retainedPrefix:prefix,importAttempts:roles.filter(r=>root.importIntents?.[r])}
}
export async function inspectPairImportContinuation(primary,expectedEnrollmentSha256,rootJobId,expectedRootSha256,{signal}={}){
 const root=readPairBootstrapRoot(rootJobId),parent=await inspectJob(rootJobId,{includeResult:true}),proof=validatePairImportContinuation(root,parent,{rootJobId,expectedRootSha256,primary,expectedEnrollmentSha256})
 if(signal?.aborted||JSON.stringify(versions())!==JSON.stringify(root.versions)||standbyEnrollmentDigest(readStandbyEnrollment(primary))!==expectedEnrollmentSha256)throw Error('continuation source account/version/binding changed')
 if(!pairMetadataEnrollmentMatches(root.metadataEnrollment,inspectMetadataEnrollment(root.binding.standby.sessionId)))throw Error('original public metadata enrollment changed')
 const retained=structuredClone(root.results),epochs={},now=Date.now(),processes=liveProcesses()
 for(const role of roles){
  const old=root.binding[role],other=root.binding[role==='primary'?'standby':'primary'],r=getRecord(old.sessionId),p=peerRecord(old.sessionId),snapshot=root.snapshots[role]
  if(!r||openPrs(r).length||r.worktreePath||r.permissionMode!=='bypassPermissions'||inspectNativeResourcePid(old.pid)!==null||JSON.stringify(ordinarySessionBinding(r,other.sessionId))!==JSON.stringify(snapshot.identity)||JSON.stringify(loadReceiverSelection(old.cwd))!==JSON.stringify(snapshot.selection))throw Error('original account/selector/absence changed')
  const history=await inspectIndependentService(old.sessionId,old.serviceId,{signal,historical:true})
  if(!history.verified||history.verificationMode!=='historical-retired'||history.sourceDisposition!=='files-retired'||history.admissionStopped!==true||history.stopMarkerMatchesGeneration!==true||history.terminalAttemptReviewComplete!==true||history.unresolvedRequestIds?.length||history.nativeEpoch?.pid!==old.pid||history.nativeEpoch.procStart!==old.procStart)throw Error('original retired history changed')
  const restoredRole=recoveryRoleFromHistory(history,snapshot.policy,{sessionId:old.sessionId,receiverCwd:old.cwd,admitTarget:t=>['sessionId','cwd','pid','procStart'].every(k=>t[k]===other[k])});if(JSON.stringify(restoredRole)!==JSON.stringify(snapshot.role))throw Error('original role changed')
  for(const phase of ['quiesce','retire']){const c=root.children[phase+'-'+role],fresh=await inspectJob(c.jobId,{includeResult:true});if(fresh.state!=='completed'||fresh.operation!==c.observation.operation||JSON.stringify(fresh.args)!==JSON.stringify(c.observation.args)||JSON.stringify(fresh.result)!==JSON.stringify(c.observation.result))throw Error('original child no longer terminal')}
  const intent=root.importIntents?.[role]
  if(intent){if(!pairImportEpochQualified({old,record:r,peer:p,oldPidAbsent:true,startedAt:intent.startedAt,observedAt:now}))throw Error('attempted import still lacks qualified changed-condition native epoch');const previous=root.results['import-'+role];if(previous&&(previous.epoch?.pid!==p.pid||previous.epoch.procStart!==p.procStart))throw Error('previously verified imported epoch changed');epochs[role]={sessionId:old.sessionId,cwd:old.cwd,pid:p.pid,procStart:p.procStart};retained['import-'+role]={newEpochVerified:true,epoch:epochs[role],startedAt:intent.startedAt,observedAt:now,processStartAttribution:'changed-condition-observation',servingQualified:false,originalImportRootJobId:rootJobId}}
  else if(p||processes.some(x=>x.hostSessionId===old.sessionId))throw Error('unattempted actor has unexpected live peer')
 }
 for(const role of roles){const old=root.binding[role],other=root.binding[role==='primary'?'standby':'primary'],current=peerRecord(old.sessionId),record=getRecord(old.sessionId);if(inspectNativeResourcePid(old.pid)!==null||JSON.stringify(ordinarySessionBinding(record,other.sessionId))!==JSON.stringify(root.snapshots[role].identity)||JSON.stringify(loadReceiverSelection(old.cwd))!==JSON.stringify(root.snapshots[role].selection)||epochs[role]&&(!current||current.status!=='idle'||current.pid!==epochs[role].pid||current.procStart!==epochs[role].procStart)||!epochs[role]&&(current||liveProcesses().some(p=>p.hostSessionId===old.sessionId)))throw Error('changed-condition evidence changed after review')}
 if(!pairMetadataEnrollmentMatches(root.metadataEnrollment,inspectMetadataEnrollment(root.binding.standby.sessionId)))throw Error('public metadata enrollment changed after review')
 if(pairBootstrapRootDigest(readPairBootstrapRoot(rootJobId))!==expectedRootSha256)throw Error('original root changed while reviewing')
 return {root,retained,epochs,proof,changedConditionObserved:true,originalOutcomePreserved:true,unattendedBootstrapQualified:false}
}
export function pairBootstrapContinuationStatus(rootJobId){const root=readPairBootstrapRoot(rootJobId);return {rootJobId,rootSha256:pairBootstrapRootDigest(root),phase:root.phase,failed:!!root.failure,primarySession:root.binding?.primary?.sessionId,importAttempts:roles.filter(r=>root.importIntents?.[r]),processStartupAssessed:false,continuationAuthorized:false,effectsPerformed:false}}
