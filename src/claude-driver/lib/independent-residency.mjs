// Read-only qualification of an already live exact independent controller.
// Idle survival is distinct from Cron protection, recovery and pressure proof.
export function independentResidencySample(status,initial,{now=Date.now(),remainingMs=0}={}){
 if(!status?.verified||status.verificationMode!=='live-native'||status.nativeEpochAssessed!==true||status.sourceDisposition!=='installed'||status.admissionStopped!==false||status.nativeInputRequired!==false||status.nativeEpoch?.status!=='idle'||status.readinessObserved!==true||status.nativePolicyObserved!==true||status.terminalAttemptReviewComplete!==true||!Array.isArray(status.unresolvedRequestIds)||status.unresolvedRequestIds.length||!Number.isSafeInteger(status.deadline)||status.deadline-now<remainingMs+30000)throw Error('exact live idle controller observation unqualified')
 if(initial&&(status.serviceId!==initial.serviceId||status.build!==initial.build||status.nativeEpoch.pid!==initial.pid||status.nativeEpoch.procStart!==initial.procStart||status.reservedSlots!==initial.reservedSlots))throw Error('controller identity or traffic changed during idle observation')
 return {at:now,serviceId:status.serviceId,build:status.build,pid:status.nativeEpoch.pid,procStart:status.nativeEpoch.procStart,reservedSlots:status.reservedSlots,status:'idle',readinessObserved:true,nativePolicyObserved:true}
}
