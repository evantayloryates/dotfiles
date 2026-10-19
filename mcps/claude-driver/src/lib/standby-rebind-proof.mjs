import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {STATE_DIR} from './state.mjs'
import {readReceiverFile} from './receiver-runtime-selection.mjs'
const job=/^j[a-f0-9]{32}$/
const same=(a,b)=>!!a&&!!b&&['sessionId','cwd','pid','procStart'].every(k=>a[k]===b[k])
// Only a completed original recovery may authorize this epoch transition.
// No arbitrary PID, caller-supplied result or latest-generation lookup is authority.
export function validateStandbyRebindProof(binding,parent,child,parentJobId){
 const result=parent?.result,verified=child?.results?.verify,old=child?.results?.preflight?.oldEpoch
 if(parent?.failure||child?.failure||parent?.enrollmentSha256!==createHash('sha256').update(JSON.stringify(binding)).digest('hex')||!job.test(parentJobId||'')||parent?.schemaVersion!==1||parent.parentJobId!==parentJobId||parent.primary!==binding.primary.sessionId||parent.phase!=='verified'||!job.test(parent.childJobId||'')||child?.jobId!==parent.childJobId||child.phase!=='completed'||child.cycle!==false||child.session!==binding.standby.sessionId||child.serviceId!==binding.standby.serviceId||child.target!==binding.primary.sessionId||child.targetServiceId!==binding.primary.serviceId||old?.pid!==binding.primary.pid||old.procStart!==binding.primary.procStart||verified?.rolePreserved!==true||verified.settingsPreserved!==true||verified.anchorPreserved!==true||verified.noUnresolvedAttempts!==true||result?.coldRecoveryPerformed!==true||result.primarySession!==binding.primary.sessionId||result.coldRecoveryJobId!==parent.childJobId||result.targetDispatched!==false||result.standbyRebindRequired!==true||result.serviceId!==verified.serviceId||result.newEpoch?.pid!==verified.pid||result.newEpoch.procStart!==verified.procStart||!Number.isSafeInteger(verified.pid)||verified.pid<2||typeof verified.procStart!=='string'||!verified.procStart||verified.pid===binding.primary.pid||verified.procStart===binding.primary.procStart)throw Error('standby rebind requires verified original cold recovery')
 return {parentJobId,childJobId:parent.childJobId,primary:{...binding.primary,serviceId:verified.serviceId,pid:verified.pid,procStart:verified.procStart},standby:{...binding.standby}}
}
export function readStandbyRebindProof(binding,parentJobId){
 if(!job.test(parentJobId||''))throw Error('exact recovery parent required')
 const read=(dir,id)=>JSON.parse(readReceiverFile(join(STATE_DIR,dir,id+'.json'),1048576))
 const parent=read('enrolled-controller-recoveries',parentJobId)
 if(!job.test(parent.childJobId||''))throw Error('original recovery child missing')
 return validateStandbyRebindProof(binding,parent,read('independent-service-recoveries',parent.childJobId),parentJobId)
}
export function standbyRecoveryTransitionAllowed(before,after,proof){
 return same(before.standby,after.standby)&&same(before.standby,proof.standby)&&before.primary.sessionId===after.primary.sessionId&&before.primary.cwd===after.primary.cwd&&same(after.primary,proof.primary)&&after.primary.serviceId===proof.primary.serviceId&&before.primary.pid!==after.primary.pid&&before.primary.procStart!==after.primary.procStart&&before.familyRequestId!==after.familyRequestId
}
