import {join} from 'node:path'
import {STATE_DIR} from './state.mjs'
import {readReceiverFile} from './receiver-runtime-selection.mjs'
import {standbyEnrollmentDigest} from './standby-enrollment.mjs'
const job=/^j[a-f0-9]{32}$/
const same=(a,b)=>!!a&&!!b&&['sessionId','cwd','pid','procStart','serviceId'].every(k=>a[k]===b[k])
export function pairImportEpochQualified({old,record,peer,oldPidAbsent,startedAt,observedAt}={}){
 return !!(old&&oldPidAbsent===true&&record?.sessionId===old.sessionId&&record.cwd===old.cwd&&record.cliSessionId===old.sessionId.slice(6)&&record.isArchived===false&&record.permissionMode==='bypassPermissions'&&!record.worktreePath&&peer?.hostSessionId===old.sessionId&&peer.sessionId===record.cliSessionId&&peer.cwd===old.cwd&&peer.entrypoint==='claude-desktop'&&peer.version==='2.1.299'&&peer.status==='idle'&&Number.isSafeInteger(peer.pid)&&peer.pid>1&&peer.pid!==old.pid&&typeof peer.procStart==='string'&&peer.procStart!==old.procStart&&Number.isSafeInteger(peer.startedAt)&&Number.isSafeInteger(startedAt)&&Number.isSafeInteger(observedAt)&&peer.startedAt>=startedAt&&peer.startedAt<=observedAt)
}
export function pairBootstrapTransitionAllowed(before,after,root,rootJobId){
 if(!job.test(rootJobId||'')||root?.schemaVersion!==1||root.jobId!==rootJobId||root.failure||root.phase!=='before-enroll'||root.enrollmentSha256!==standbyEnrollmentDigest(before)||root.results?.verifyPair?.qualified!==true||root.results.verifyPair.rolesPreserved!==true||root.results.verifyPair.settingsPreserved!==true||root.results.verifyPair.noUnresolvedAttempts!==true||root.results.family?.receiptVerified!==true||root.results.family.state!=='completed'||root.results.family.requestId!==after.familyRequestId||before.familyRequestId===after.familyRequestId)return false
 for(const role of ['primary','standby']){
  const old=before[role],next=after[role],verified=root.results.verifyPair[role],imported=root.results['import-'+role]
  for(const [phase,operation]of [['prepare','broker_service_prepare'],['retire','broker_service_retire'],['activate','broker_service_activate']]){const c=root.children?.[phase+'-'+role],o=c?.observation;if(!job.test(c?.jobId||'')||o?.jobId!==c.jobId||o.state!=='completed'||o.operation!==operation||o.args?.session!==old.sessionId||phase==='retire'&&(o.args.service_id!==old.serviceId||o.args.offline!==true||o.result?.filesRetired!==true||o.result.terminalAttemptReviewComplete!==true)||phase==='prepare'&&(o.result?.serviceId!==next.serviceId||o.result.prepared!==true||o.result.verified!==true)||phase==='activate'&&(o.args.service_id!==next.serviceId||o.result?.installed!==true))return false}
  if(!same(root.binding?.[role],old)||!same(verified,next)||next.sessionId!==old.sessionId||next.cwd!==old.cwd||next.pid===old.pid||next.procStart===old.procStart||next.serviceId===old.serviceId||!job.test(root.children?.['prepare-'+role]?.jobId||'')||root.children['prepare-'+role].jobId.slice(1)!==next.serviceId||imported?.newEpochVerified!==true||imported.epoch?.pid!==next.pid||imported.epoch.procStart!==next.procStart||root.results['retire-'+role]?.filesRetired!==true||root.results['retire-'+role]?.terminalAttemptReviewComplete!==true)return false
 }
 return true
}
export function readPairBootstrapRoot(jobId){if(!job.test(jobId||''))throw Error('exact pair bootstrap root required');return JSON.parse(readReceiverFile(join(STATE_DIR,'pair-bootstraps',jobId+'.json'),1048576))}
