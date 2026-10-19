import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {STATE_DIR} from './state.mjs'
import {readReceiverFile,loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {readStandbyEnrollment,standbyEnrollmentDigest} from './standby-enrollment.mjs'
import {inspectIndependentService} from './independent-service-result.mjs'
import {inspectJob} from './jobs.mjs'
import {requireIndependentOfflineMutation} from './independent-offline-review.mjs'
import {recoveryRoleFromHistory,recoveryRoleProofMatches} from './recovery-role.mjs'
import {parseNativeFamilyMetadata} from './native-family-preflight.mjs'
const hash=x=>createHash('sha256').update(x).digest('hex')
const epoch=(a,b)=>a&&b&&['pid','procStart'].every(k=>a[k]===b[k])
// Qualifies one exact interrupted primary renewal, never arbitrary successor
// adoption. This proof is diagnostic until the pair executor consumes it.
export function qualifyInterruptedRenewalLineage({binding,selection,ledger,parent,predecessor,current,oldPolicy,newPolicy,familyReceipt,allowPendingRead=false}={}){
 const old=binding?.primary,other=binding?.standby,service=selection?.selector?.serviceId,job='j'+service
 if(!old||!other||!/^[a-f0-9]{32}$/.test(service||'')||service===old.serviceId||selection.selector.sessionId!==old.sessionId||!epoch(selection.selector,old))throw Error('lineage selection')
 const familyContext='j'+hash('standby-renewal-family:'+job).slice(0,32),familyRequestId='rpeer'+familyContext.slice(1)
 if(ledger?.schemaVersion!==1||ledger.jobId!==job||ledger.sessionId!==old.sessionId||ledger.serviceId!==old.serviceId||ledger.successorServiceId!==service||ledger.phase!=='before-standby-family'||ledger.failureCategory!=='outcome_unknown'||ledger.standbyRefresh?.phase!=='before-family'||ledger.standbyRefresh.contextId!==familyContext||ledger.standbyRefresh.expectedEnrollmentSha256!==standbyEnrollmentDigest(binding)||ledger.standbyRefresh.family!==undefined)throw Error('lineage renewal ledger')
 if(parent?.jobId!==job||parent.operation!=='broker_service_renew'||parent.state!=='failed'||parent.args?.session!==old.sessionId||parent.args.service_id!==old.serviceId||parent.error?.category!=='independent_service_renew_unresolved'||parent.error.detail?.successorServiceId!==service||parent.error.detail?.phase!==ledger.phase)throw Error('lineage original job')
 const diagnostic=current?.unresolvedAttempts?.[0],pendingRead=allowPendingRead===true&&current?.terminalAttemptReviewComplete===false&&current?.unresolvedRequestIds?.length===1&&current.unresolvedRequestIds[0]===familyRequestId&&current.abandonedReadRequestIds?.length===0&&diagnostic?.requestId===familyRequestId&&diagnostic.operation==='list_sessions'&&diagnostic.operationScope==='metadata-read'&&diagnostic.runtimeBindingVerified===true&&diagnostic.requestExpired===true&&diagnostic.workerFinished===true&&['intent','request','control'].every(k=>diagnostic.evidence?.[k]==='present')&&['entry','admission','moduleResult','publishedResult'].every(k=>diagnostic.evidence?.[k]==='absent')
 const results=ledger.results
 if(results?.prepare?.serviceId!==service||results.prepare.build!==selection.selector.build||results.activate?.installed!==true||results.activate.serviceId!==service||results.quiesce?.serviceId!==old.serviceId||results.quiesce.quiescent!==true||results.quiesce.terminalAttemptReviewComplete!==true||results.retire?.serviceId!==old.serviceId||results.retire.filesRetired!==true||results.retire.terminalAttemptReviewComplete!==true||results.verify?.serviceId!==service||results.verify.verified!==true||!epoch(results.verify.nativeEpoch,old)||results.verify.readinessObserved!==true||results.verify.nativePolicyObserved!==true)throw Error('lineage recorded turnover')
 for(const [s,id,mode,disposition]of [[predecessor,old.serviceId,'historical-retired','files-retired'],[current,service,'offline-installed','installed']])if(!s?.verified||s.sessionId!==old.sessionId||s.serviceId!==id||s.verificationMode!==mode||s.sourceDisposition!==disposition||!epoch(s.nativeEpoch,old)||(!pendingRead||s!==current)&&(s.terminalAttemptReviewComplete!==true||s.unresolvedRequestIds?.length))throw Error('lineage independent history')
 if(predecessor.admissionStopped!==true||predecessor.stopMarkerMatchesGeneration!==true||current.admissionStopped!==false||current.build!==selection.selector.build||!pendingRead&&(current.abandonedReadRequestIds?.length!==1||current.abandonedReadRequestIds[0]!==familyRequestId)||!predecessor.settledRequestIds?.includes(binding.familyRequestId))throw Error('lineage read or stop history')
 if(familyReceipt?.id!==binding.familyRequestId||familyReceipt.source!=='native-peer-service-result'||familyReceipt.results?.length!==1||familyReceipt.results[0].op!=='list_sessions'||familyReceipt.results[0].ok!==true||parseNativeFamilyMetadata(familyReceipt.results[0].result,old.sessionId)?.length!==0)throw Error('lineage retained family')
 const roleArgs={sessionId:old.sessionId,receiverCwd:old.cwd,admitTarget:t=>['sessionId','cwd','pid','procStart'].every(k=>t?.[k]===other[k])},oldRole=recoveryRoleFromHistory(predecessor,oldPolicy,roleArgs)
 // Pending read history is never relabelled terminal. Role bytes are compared
 // directly against the independently reviewed predecessor solely to screen the
 // candidate; the abandonment child still performs its full offline admission.
 const roleMatches=pendingRead?Object.keys(oldRole.grants).every(k=>(current[k]===true)===(oldRole.grants[k]===true)&&(newPolicy[k]===true)===(oldRole.grants[k]===true))&&['metadataTarget','archiveTarget'].every(k=>oldRole.bindings[k]?['sessionId','cwd','pid','procStart'].every(f=>current[k]?.[f]===oldRole.bindings[k][f]&&newPolicy[k]?.[f]===oldRole.bindings[k][f]):current[k]===undefined&&newPolicy[k]===undefined):recoveryRoleProofMatches(recoveryRoleFromHistory(current,newPolicy,roleArgs),oldRole)
 if(!roleMatches||newPolicy.sessionId!==old.sessionId||newPolicy.build!==current.build||!epoch(newPolicy,old)||oldPolicy.settingsHash!==newPolicy.settingsHash||oldPolicy.receiverHook?.anchorSha256!==newPolicy.receiverHook?.anchorSha256)throw Error('lineage authority changed')
 return {qualified:!pendingRead,...pendingRead?{metadataReadAbandonmentEligible:true,pendingFamilyRequestId:familyRequestId}:{},primarySession:old.sessionId,predecessorServiceId:old.serviceId,successorServiceId:service,renewalJobId:job,...pendingRead?{}:{abandonedFamilyRequestId:familyRequestId},retainedFamilyRequestId:binding.familyRequestId,rolesPreserved:true,settingsPreserved:true,outcomePreserved:'unknown',effectsPerformed:false,recoveryAuthorized:false}
}
export async function inspectInterruptedRenewalLineage(primary,expectedSha256,{signal,allowPendingRead=false}={}){
 const binding=readStandbyEnrollment(primary)
 if(!binding||standbyEnrollmentDigest(binding)!==expectedSha256)throw Error('lineage retained binding changed')
 const selection=loadReceiverSelection(binding.primary.cwd),service=selection.selector.serviceId,jobId='j'+service,file=join(STATE_DIR,'independent-service-renewals',jobId+'.json'),body=readReceiverFile(file,1048576),ledger=JSON.parse(body)
 requireIndependentOfflineMutation({...binding.primary,sessionId:primary},primary)
 const parent=await inspectJob(jobId,{includeResult:true}),predecessor=await inspectIndependentService(primary,binding.primary.serviceId,{signal,historical:true}),current=await inspectIndependentService(primary,service,{signal,offline:true})
 const policy=id=>JSON.parse(readReceiverFile(join(binding.primary.cwd,'.claude-driver-services',id,'broker','stop-rescue-policy.json'),65536)),familyReceipt=JSON.parse(readReceiverFile(join(binding.primary.cwd,'.claude-driver-services',binding.primary.serviceId,'broker','results',binding.familyRequestId+'.native.json'),65536))
 const proof=qualifyInterruptedRenewalLineage({binding,selection,ledger,parent,predecessor,current,oldPolicy:policy(binding.primary.serviceId),newPolicy:policy(service),familyReceipt,allowPendingRead})
 requireIndependentOfflineMutation({...binding.primary,sessionId:primary},primary)
 if(signal?.aborted||standbyEnrollmentDigest(readStandbyEnrollment(primary))!==expectedSha256||JSON.stringify(loadReceiverSelection(binding.primary.cwd))!==JSON.stringify(selection)||hash(readReceiverFile(file,1048576))!==hash(body))throw Error('lineage changed during observation')
 return {...proof,enrollmentSha256:expectedSha256,renewalLedgerSha256:hash(body),observedAt:Date.now()}
}

// Retain the original enrollment for CAS. Only the primary's SERVICE generation
// may differ in the offline source map; session, folder and native epoch cannot.
export function pairBootstrapSourceActors(binding,lineage){
 const actors={primary:{...binding.primary},standby:{...binding.standby}}
 if(lineage===undefined)return actors
 const successor=lineage?.successorServiceId,job='j'+successor,context='rpeer'+hash('standby-renewal-family:'+job).slice(0,32)
 if(lineage.qualified!==true||lineage.primarySession!==binding.primary.sessionId||lineage.predecessorServiceId!==binding.primary.serviceId||!/^[a-f0-9]{32}$/.test(successor||'')||successor===binding.primary.serviceId||lineage.renewalJobId!==job||lineage.abandonedFamilyRequestId!==context||lineage.retainedFamilyRequestId!==binding.familyRequestId||lineage.enrollmentSha256!==standbyEnrollmentDigest(binding)||!/^[a-f0-9]{64}$/.test(lineage.renewalLedgerSha256||'')||lineage.rolesPreserved!==true||lineage.settingsPreserved!==true||lineage.outcomePreserved!=='unknown'||lineage.effectsPerformed!==false||lineage.recoveryAuthorized!==false)throw Error('pair source lineage unqualified')
 actors.primary.serviceId=successor;return actors
}
