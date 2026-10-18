import {archiveTargetValid} from './native-archive-control.mjs'
const same=(a,b)=>!!(a&&b&&['sessionId','cwd','pid','procStart'].every(k=>a[k]===b[k]))
const flags=[['metadataModelControl','metadata_model_control'],['metadataSendControl','metadata_send_control'],['metadataStopControl','metadata_stop_control'],['sessionManagementControl','session_management_control'],['sessionMetadataControl','session_metadata_control']]
// Authority comes only from independently verified old generation evidence.
// A fresh process identity never implies permission to add or drop a role.
export function recoveryRoleFromHistory(status,policy,{sessionId,receiverCwd,admitTarget}={}){
 if(!status?.verified||status.sessionId!==sessionId||!['live-native','offline-installed','offline-retired','historical-retired'].includes(status.verificationMode)||!['installed','files-retired'].includes(status.sourceDisposition)||status.terminalAttemptReviewComplete!==true||!Array.isArray(status.unresolvedRequestIds)||status.unresolvedRequestIds.length||policy?.sessionId!==sessionId||policy.build!==status.build||policy.pid!==status.nativeEpoch?.pid||policy.procStart!==status.nativeEpoch.procStart)throw Error('historical recovery role unqualified')
 if(status.sessionMetadataControl===true&&status.sessionManagementControl!==true)throw Error('ordinary metadata role requires management')
 const metadata=status.metadataTarget,archive=status.archiveTarget,grants=Object.fromEntries(flags.map(([k])=>[k,status[k]===true])),prepareArguments={},bindings={}
 if(metadata&&archive||metadata&&!same(metadata,policy.metadataTarget)||!metadata&&policy.metadataTarget||flags.some(([k])=>(status[k]===true)!==(policy[k]===true))||!metadata&&flags.some(([k])=>!['sessionManagementControl','sessionMetadataControl'].includes(k)&&grants[k]))throw Error('historical role authority mismatch')
 for(const [key,binding,arg]of [['metadataTarget',metadata,'metadata_target'],['archiveTarget',archive,'archive_target']])if(binding){if(!archiveTargetValid(binding,{sessionId,receiverCwd})||typeof admitTarget!=='function'||admitTarget(binding)!==true)throw Error('historical role target epoch unqualified');bindings[key]={...binding};prepareArguments[arg]=binding.sessionId}
 for(const [key,arg]of flags)if(grants[key])prepareArguments[arg]=true
 return {version:1,bindings,grants,prepareArguments}
}
export function recoveredRoleMatches(role,status){
 return !!(role?.version===1&&status?.verified&&['metadataTarget','archiveTarget'].every(k=>role.bindings[k]?same(role.bindings[k],status[k]):status[k]===undefined)&&flags.every(([k])=>(status[k]===true)===(role.grants[k]===true)))
}

// Host upgrades may add a new explicit grant. Omitted historical grants mean
// false, never authority; compare true grants and exact original target scope.
export function recoveryRoleProofMatches(current,retained){
 if(current?.version!==1||retained?.version!==1||!current.bindings||!retained.bindings||!current.grants||!retained.grants||!current.prepareArguments||!retained.prepareArguments)return false
 const bindingKeys=Object.keys(current.bindings).sort();if(JSON.stringify(bindingKeys)!==JSON.stringify(Object.keys(retained.bindings).sort())||bindingKeys.some(k=>!same(current.bindings[k],retained.bindings[k])))return false
 const known=new Set(flags.map(([k])=>k));if(Object.keys(retained.grants).some(k=>!known.has(k)))return false
 const ordered=x=>JSON.stringify(Object.entries(x).sort())
 return flags.every(([k])=>(current.grants[k]===true)===(retained.grants[k]===true))&&ordered(current.prepareArguments)===ordered(retained.prepareArguments)
}
