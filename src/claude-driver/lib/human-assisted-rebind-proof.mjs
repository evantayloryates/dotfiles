import {nativeDeliveryFailure} from './native-delivery-failure.mjs'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {STATE_DIR} from './state.mjs'
import {readReceiverFile,loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {getRecord,openPrs} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {inspectNativeResourcePid} from './native-resource-process.mjs'
import {inspectIndependentService,reconcileIndependentServiceResult} from './independent-service-result.mjs'
import {recoveryRoleFromHistory,recoveredRoleMatches} from './recovery-role.mjs'
import {metadataTargetPreflightMatches,metadataTargetRegistered} from './native-metadata-control.mjs'
const job=/^j[a-f0-9]{32}$/,service=/^[a-f0-9]{32}$/
export function validateHumanAssistedRecovery(binding,parent,child,parentJobId,receipt){
 const wake=child?.results?.wake,old=child?.results?.preflight?.oldEpoch,id=child?.children?.wake?.jobId
 if(!job.test(parentJobId||'')||parent?.parentJobId!==parentJobId||parent.primary!==binding.primary.sessionId||parent.enrollmentSha256!==createHash('sha256').update(JSON.stringify(binding)).digest('hex')||!parent.failure||!job.test(parent.childJobId||'')||child?.jobId!==parent.childJobId||child.phase!=='after-wake'||!child.failure||child.cycle!==false||child.session!==binding.standby.sessionId||child.serviceId!==binding.standby.serviceId||child.target!==binding.primary.sessionId||child.targetServiceId!==binding.primary.serviceId||old?.pid!==binding.primary.pid||old.procStart!==binding.primary.procStart||!job.test(id||'')||child.children.wake.observation?.state!=='completed'||wake?.state!=='failed'||wake.receiptVerified!==true||wake.requestId!=='rpeer'+id.slice(1)||receipt?.requestId!==wake.requestId||receipt.serviceId!==binding.standby.serviceId||receipt.receiptVerified!==true||receipt.state!=='failed'||receipt.nativeFailure?.category!=='workspace_trust_required'||receipt.nativeFailure.delivery!=='undelivered'||receipt.nativeFailure.humanActionRequired!==true)throw Error('human-assisted rebind requires original exact undelivered trust refusal')
 return {parentJobId,childJobId:child.jobId,requestId:wake.requestId,humanAssisted:true,unattendedRecoveryQualified:false}
}
export function retiredWorkspaceTrustReceipt(binding,wake,history,native){
 const result=native?.results?.[0]
 if(!history?.verified||history.sessionId!==binding.standby.sessionId||history.serviceId!==binding.standby.serviceId||history.verificationMode!=='historical-retired'||history.sourceDisposition!=='files-retired'||history.admissionStopped!==true||history.stopMarkerMatchesGeneration!==true||!history.terminalAttemptReviewComplete||history.unresolvedRequestIds?.length||history.nativeEpoch?.pid!==binding.standby.pid||history.nativeEpoch.procStart!==binding.standby.procStart||!history.settledRequestIds?.includes(wake.requestId)||native.id!==wake.requestId||native.source!=='native-peer-service-result'||native.results?.length!==1||result.op!=='send_message'||result.nativeToolUseId!==wake.nativeToolUseId)throw Error('retired standby receipt history unqualified')
 return {serviceId:binding.standby.serviceId,requestId:wake.requestId,receiptVerified:true,state:'failed',nativeFailure:nativeDeliveryFailure(result,binding.primary.sessionId)}
}
export async function readHumanAssistedRebindProof(binding,parentJobId,primaryServiceId,{signal}={}){
 if(!job.test(parentJobId||'')||!service.test(primaryServiceId||'')||primaryServiceId===binding.primary.serviceId)throw Error('exact distinct restored primary generation required')
 const read=(dir,id)=>JSON.parse(readReceiverFile(join(STATE_DIR,dir,id+'.json'),1048576)),parent=read('enrolled-controller-recoveries',parentJobId)
 if(!job.test(parent.childJobId||''))throw Error('original child required')
 const child=read('independent-service-recoveries',parent.childJobId),wake=child.results?.wake
 if(!/^rpeer[a-f0-9]{32}$/.test(wake?.requestId||''))throw Error('original wake receipt required')
 let receipt
 try{receipt=await reconcileIndependentServiceResult(binding.standby.sessionId,binding.standby.serviceId,wake.requestId,{signal})}catch{
  const history=await inspectIndependentService(binding.standby.sessionId,binding.standby.serviceId,{signal,historical:true}),native=JSON.parse(readReceiverFile(join(binding.standby.cwd,'.claude-driver-services',binding.standby.serviceId,'broker','results',wake.requestId+'.native.json'),65536))
  receipt=retiredWorkspaceTrustReceipt(binding,wake,history,native)
 }
 const proof=validateHumanAssistedRecovery(binding,parent,child,parentJobId,receipt)
 const id=binding.primary.sessionId,r=getRecord(id),p=peerRecord(id),selected=loadReceiverSelection(r?.cwd)
 if(!r||r.cwd!==binding.primary.cwd||r.isArchived||r.permissionMode!=='bypassPermissions'||r.worktreePath||openPrs(r).length||!p||p.status!=='idle'||p.pid===binding.primary.pid||p.procStart===binding.primary.procStart||inspectNativeResourcePid(binding.primary.pid)!==null||selected.selector.sessionId!==id||selected.selector.serviceId!==primaryServiceId||selected.selector.pid!==p.pid||selected.selector.procStart!==p.procStart)throw Error('human-started primary epoch unqualified')
 const old=await inspectIndependentService(id,binding.primary.serviceId,{signal,historical:true}),now=await inspectIndependentService(id,primaryServiceId,{signal}),policy=s=>JSON.parse(readReceiverFile(join(r.cwd,'.claude-driver-services',s,'broker','stop-rescue-policy.json'),65536)),before=policy(binding.primary.serviceId),after=policy(primaryServiceId),role=recoveryRoleFromHistory(old,before,{sessionId:id,receiverCwd:r.cwd,admitTarget:t=>{const rec=getRecord(t.sessionId);return metadataTargetPreflightMatches({target:t,record:rec,peer:peerRecord(t.sessionId),registered:metadataTargetRegistered(t,{controlStateDir:STATE_DIR}),openPrCount:rec?openPrs(rec).length:null})}})
 if(!recoveredRoleMatches(role,now)||!now.readinessObserved||!now.nativePolicyObserved||now.admissionStopped||now.expired||now.unresolvedRequestIds?.length||before.settingsHash!==after.settingsHash||before.receiverHook?.anchorSha256!==after.receiverHook?.anchorSha256)throw Error('human-restored primary role or settings unqualified')
 return {...proof,primary:{...binding.primary,serviceId:primaryServiceId,pid:p.pid,procStart:p.procStart},standby:{...binding.standby}}
}
