import {inspectNativeResourcePid} from './native-resource-process.mjs'
// Observation only. A missing PID is never a crash cause or replay permission.
export function requireIndependentEpochAbsent(pointer,inspect=inspectNativeResourcePid){
 const refuse=(category,message)=>{throw Object.assign(Error(message),{category})}
 if(!pointer||!Number.isSafeInteger(pointer.pid)||pointer.pid<2||typeof pointer.procStart!=='string'||!pointer.procStart.trim())refuse('offline_epoch_identity_unavailable','offline epoch identity unavailable')
 let observed;try{observed=inspect(pointer.pid)}catch{refuse('offline_process_observation_unavailable','offline process observation unavailable')}
 if(observed===undefined)refuse('offline_process_observation_unavailable','offline process observation unavailable')
 if(observed!==null)refuse('offline_predecessor_pid_present','offline predecessor PID present or reused')
 return {previousPid:pointer.pid,previousProcStart:pointer.procStart,previousPidObservedAbsent:true}
}
export async function reviewIndependentOfflineContext(pointer,review,inspect=inspectNativeResourcePid){
 const before=requireIndependentEpochAbsent(pointer,inspect),result=await review()
 requireIndependentEpochAbsent(pointer,inspect)
 return {result,observation:before}
}
