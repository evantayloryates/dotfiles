import {archiveTargetValid} from './native-archive-control.mjs'
const same=(a,b)=>!!(a&&b&&['sessionId','cwd','pid','procStart'].every(k=>a[k]===b[k]))
const flags=[['metadataModelControl','metadata_model_control'],['metadataSendControl','metadata_send_control'],['metadataStopControl','metadata_stop_control']]
// Authority comes only from independently verified old generation evidence.
// A fresh process identity never implies permission to add or drop a role.
export function recoveryRoleFromHistory(status,policy,{sessionId,receiverCwd,admitTarget}={}){
 if(!status?.verified||status.sessionId!==sessionId||!['live-native','offline-installed','offline-retired','historical-retired'].includes(status.verificationMode)||!['installed','files-retired'].includes(status.sourceDisposition)||status.terminalAttemptReviewComplete!==true||!Array.isArray(status.unresolvedRequestIds)||status.unresolvedRequestIds.length||policy?.sessionId!==sessionId||policy.build!==status.build||policy.pid!==status.nativeEpoch?.pid||policy.procStart!==status.nativeEpoch.procStart)throw Error('historical recovery role unqualified')
 const metadata=status.metadataTarget,archive=status.archiveTarget,grants=Object.fromEntries(flags.map(([k])=>[k,status[k]===true])),prepareArguments={},bindings={}
 if(metadata&&archive||metadata&&!same(metadata,policy.metadataTarget)||!metadata&&policy.metadataTarget||flags.some(([k])=>(status[k]===true)!==(policy[k]===true))||!metadata&&Object.values(grants).some(Boolean))throw Error('historical role authority mismatch')
 for(const [key,binding,arg]of [['metadataTarget',metadata,'metadata_target'],['archiveTarget',archive,'archive_target']])if(binding){if(!archiveTargetValid(binding,{sessionId,receiverCwd})||typeof admitTarget!=='function'||admitTarget(binding)!==true)throw Error('historical role target epoch unqualified');bindings[key]={...binding};prepareArguments[arg]=binding.sessionId}
 for(const [key,arg]of flags)if(grants[key])prepareArguments[arg]=true
 return {version:1,bindings,grants,prepareArguments}
}
export function recoveredRoleMatches(role,status){
 return !!(role?.version===1&&status?.verified&&['metadataTarget','archiveTarget'].every(k=>role.bindings[k]?same(role.bindings[k],status[k]):status[k]===undefined)&&flags.every(([k])=>(status[k]===true)===role.grants[k]))
}
