import {join} from 'node:path'
import {STATE_DIR} from './state.mjs'
import {readReceiverFile} from './receiver-runtime-selection.mjs'
import {standbyEnrollmentDigest} from './standby-enrollment.mjs'
import {restoredPairPlanDigest,restoredPairChildSubmission} from './restored-pair-ledger.mjs'
import {readRestoredRecordRoot,validateRestoredRecordRoot} from './restored-record-proof.mjs'
import {inspectJob} from './jobs.mjs'
const job=/^j[a-f0-9]{32}$/
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
const same=(a,b)=>!!a&&!!b&&['sessionId','cwd','pid','procStart'].every(k=>a[k]===b[k])
export function restoredPairTransitionAllowed(before,after,root,rootJobId,restoration){
 try{
  const p=root?.plan,r=root?.results,lost=p?.restoredRole,survivor=lost==='primary'?'standby':'primary'
  if(!job.test(rootJobId||'')||root.jobId!==rootJobId||root.schemaVersion!==1||root.phase!=='before-enroll'||root.failure||root.retrySafe!==false||!['primary','standby'].includes(lost)||restoredPairPlanDigest(p)!==root.expectedPlanSha256||p.pairPreparationEligible!==true||p.enrollmentSha256!==standbyEnrollmentDigest(before)||restoration?.qualified!==true||restoration.rootJobId!==p.rootJobId||restoration.rootSha256!==p.rootSha256||restoration.sessionId!==before[lost].sessionId||restoration.serviceId!==before[lost].serviceId)return false
  const ordered=['preflight','prepare-primary','prepare-standby','quiesce-survivor','retire-survivor','activate-primary','readiness-primary','policy-primary','activate-standby','readiness-standby','policy-standby','read-primary','read-standby','verifyPair','family'].flatMap(step=>['before-'+step,'after-'+step]).concat('before-enroll')
  if(!equal(root.steps?.map(s=>s.phase),ordered)||root.steps.some((s,i)=>!Number.isSafeInteger(s.at)||s.at<0||i>0&&s.at<root.steps[i-1].at))return false
  if(after.schemaVersion!==before.schemaVersion||after.automaticRecovery!==before.automaticRecovery||r?.verifyPair?.qualified!==true||r.verifyPair.rolesPreserved!==true||r.verifyPair.settingsPreserved!==true||r.verifyPair.noUnresolvedAttempts!==true||r.family?.receiptVerified!==true||r.family.state!=='completed'||r.family.requestId!==after.familyRequestId||before.familyRequestId===after.familyRequestId)return false
  const observed=(step,operation,args)=>{const c=root.children?.[step],o=c?.observation;return !!(job.test(c?.jobId||'')&&o?.jobId===c.jobId&&o.state==='completed'&&o.operation===operation&&c.submission?.operation===operation&&equal(o.args,args)&&equal(c.submission.arguments,args)&&c.submission.idempotency_key==='restored-pair:'+rootJobId+':'+step&&equal(o.result,r[step]))}
  for(const role of ['primary','standby']){
   const old=before[role],next=after[role],prepared=r['prepare-'+role]
   if(p.originalServiceIds[role]!==old.serviceId||!same(p.currentEpochs[role],next)||!same(r.verifyPair[role],next)||r.verifyPair[role].serviceId!==next.serviceId||next.sessionId!==old.sessionId||next.cwd!==old.cwd||!/^[a-f0-9]{32}$/.test(next.serviceId||'')||[before.primary.serviceId,before.standby.serviceId].includes(next.serviceId)||root.children?.['prepare-'+role]?.jobId!=='j'+next.serviceId)return false
   if(role===lost?(next.pid===old.pid||next.procStart===old.procStart):!same(next,old))return false
   const prep=restoredPairChildSubmission(p,rootJobId,'prepare-'+role)
   if(!observed('prepare-'+role,prep.operation,prep.arguments)||prepared?.prepared!==true||prepared.verified!==true||prepared.sessionId!==old.sessionId||prepared.serviceId!==next.serviceId)return false
   const args={session:old.sessionId,service_id:next.serviceId,experimental:true,stable_hook:true,...role===lost?{cold_rebind:true}:{}}
   if(!observed('activate-'+role,'broker_service_activate',args)||r['activate-'+role]?.installed!==true||r['activate-'+role].serviceId!==next.serviceId||r['activate-'+role].sessionId!==old.sessionId||r['readiness-'+role]?.verified!==true||r['readiness-'+role].readinessObserved!==true||r['readiness-'+role].serviceId!==next.serviceId||r['policy-'+role]?.terminalRefusalVerified!==true||r['policy-'+role].policyInvocationObserved!==true||r['read-'+role]?.receiptVerified!==true||r['read-'+role].state!=='completed')return false
  }
  if(after.primary.serviceId===after.standby.serviceId)return false
  for(const step of ['quiesce-survivor','retire-survivor']){const s=restoredPairChildSubmission(p,rootJobId,step);if(!observed(step,s.operation,s.arguments)||r[step]?.sessionId!==before[survivor].sessionId||r[step].serviceId!==before[survivor].serviceId||r[step].terminalAttemptReviewComplete!==true)return false}
  if(r['quiesce-survivor'].quiescent!==true||r['quiesce-survivor'].offline===true||r['retire-survivor'].filesRetired!==true)return false
  return true
 }catch{return false}
}
export function readRestoredPairRoot(jobId,{dir=join(STATE_DIR,'restored-pair-reactivations')}={}){
 if(!job.test(jobId||''))throw Error('exact reactivation root required')
 return JSON.parse(readReceiverFile(join(dir,jobId+'.json'),1048576))
}
export async function readRestoredPairTransitionProof(rootJobId,{read=readRestoredPairRoot,readRestoration=readRestoredRecordRoot,inspect=id=>inspectJob(id,{includeResult:true}),dir=join(STATE_DIR,'restored-pair-reactivations')}={}){
 const root=read(rootJobId),p=root.plan
 if(!job.test(p?.rootJobId||''))throw Error('reactivation restoration owner unqualified')
 const claim=JSON.parse(readReceiverFile(join(dir,'claims',p.rootJobId+'.json'),4096))
 if(claim.reactivationJobId!==rootJobId||claim.restorationJobId!==p.rootJobId||claim.restorationRootSha256!==p.rootSha256||claim.expectedPlanSha256!==root.expectedPlanSha256)throw Error('reactivation claim unqualified')
 const original=readRestoration(p.rootJobId),parent=await inspect(p.rootJobId),restoration=validateRestoredRecordRoot(original.root,parent,original.claim,{rootJobId:p.rootJobId,expectedRootSha256:p.rootSha256})
 for(const c of [...Object.values(original.root.children),...Object.values(root.children??{})]){const actual=await inspect(c.jobId);if(!['jobId','operation','state','args','result'].every(k=>equal(actual[k],c.observation?.[k])))throw Error('durable child differs from retained observation')}
 if(!equal(read(rootJobId),root)||!equal(readRestoration(p.rootJobId),original))throw Error('transition roots changed')
 return {root,restoration}
}
