import {inspectNativeResourcePid} from './native-resource-process.mjs'
import {liveProcesses} from './sessions.mjs'
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
// Mutations additionally refuse any observed peer for the same host, including
// a new epoch or ambiguous duplicate peers. Never stop that successor for repair.
export function requireIndependentOfflineMutation(pointer,session,{inspect=inspectNativeResourcePid,processes=liveProcesses}={}){
 const observation=requireIndependentEpochAbsent(pointer,inspect)
 if(pointer.sessionId!==session)throw Error('offline mutation owner changed')
 const peers=processes()
 if(!Array.isArray(peers)||peers.some(p=>p?.hostSessionId===session))throw Error('offline mutation session has a live peer')
 requireIndependentEpochAbsent(pointer,inspect)
 return observation
}
