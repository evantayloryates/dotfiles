import {createHash} from 'node:crypto'
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex')
const roles=['primary','standby']
const same=(a,b)=>!!a&&!!b&&['sessionId','cwd','pid','procStart'].every(k=>a[k]===b[k])
// No import step exists. Every effect is bracketed by durable checkpoints;
// callers reconcile the retained root rather than replaying this sequence.
export async function runRestoredPairReactivation(plan,d){
 if(plan?.pairPreparationEligible!==true||!roles.includes(plan.restoredRole)||!plan.currentEpochs||!plan.originalServiceIds||roles.some(r=>!/^[a-f0-9]{32}$/.test(plan.originalServiceIds[r]||''))||!plan.roles||hash(plan.roles)!==plan.rolesSha256||!/^[a-f0-9]{64}$/.test(plan.rolesSha256||''))throw Error('exact restored pair plan required')
 const result={},survivor=plan.restoredRole==='primary'?'standby':'primary'
 const step=async(name,fn,check)=>{await d.guard(name,result);await d.record('before-'+name,result);const value=await fn();result[name]=value;await d.record('after-'+name,result);if(!check(value))throw Error('restored pair '+name+' unqualified');return value}
 const prepared=async role=>step('prepare-'+role,()=>d.prepare(role),r=>r?.prepared===true&&r.verified===true&&r.sessionId===plan.currentEpochs[role].sessionId&&/^[a-f0-9]{32}$/.test(r.serviceId||'')&&!Object.values(plan.originalServiceIds).includes(r.serviceId))
 await step('preflight',d.preflight,r=>hash(r)===hash(plan))
 for(const role of roles)await prepared(role)
 if(result['prepare-primary'].serviceId===result['prepare-standby'].serviceId)throw Error('distinct prepared generations required')
 await step('quiesce-survivor',()=>d.quiesce(survivor),r=>r?.quiescent===true&&r.offline===false&&r.terminalAttemptReviewComplete===true&&r.sessionId===plan.currentEpochs[survivor].sessionId&&r.serviceId===plan.originalServiceIds[survivor])
 await step('retire-survivor',()=>d.retire(survivor),r=>r?.filesRetired===true&&r.terminalAttemptReviewComplete===true&&r.sessionId===plan.currentEpochs[survivor].sessionId&&r.serviceId===result['quiesce-survivor'].serviceId)
 for(const role of roles){
  const id=result['prepare-'+role].serviceId
  await step('activate-'+role,()=>d.activate(role,id),r=>r?.installed===true&&r.sessionId===plan.currentEpochs[role].sessionId&&r.serviceId===id)
  await step('readiness-'+role,()=>d.readiness(role,id),r=>r?.verified===true&&r.sessionId===plan.currentEpochs[role].sessionId&&r.serviceId===id&&r.readinessObserved===true)
  await step('policy-'+role,()=>d.policy(role,id),r=>r?.terminalRefusalVerified===true&&r.policyInvocationObserved===true)
 }
 for(const role of roles)await step('read-'+role,()=>d.read(role,result['prepare-'+role].serviceId),r=>r?.receiptVerified===true&&r.state==='completed')
 await step('verifyPair',()=>d.verifyPair(result),r=>r?.qualified===true&&r.rolesPreserved===true&&r.settingsPreserved===true&&r.noUnresolvedAttempts===true&&roles.every(role=>same(r[role],plan.currentEpochs[role])&&r[role].serviceId===result['prepare-'+role].serviceId))
 await step('family',()=>d.family(result['prepare-primary'].serviceId),r=>r?.receiptVerified===true&&r.state==='completed'&&/^rpeer[a-f0-9]{32}$/.test(r.requestId||''))
 await step('enroll',()=>d.enroll(result),r=>r?.enrolled===true&&r.verified===true)
 await step('metadataEnrollment',()=>d.metadataEnrollment(result),r=>r?.qualified===true)
 await step('verifyEnrollment',()=>d.verifyEnrollment(result),r=>r?.qualified===true)
 return result
}
