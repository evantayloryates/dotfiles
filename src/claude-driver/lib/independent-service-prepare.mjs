import {promisify} from 'node:util'
import {execFile} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {resolve,sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {getRecord} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {PROBE_DIR,loadRegistry} from './state.mjs'
import {independentServiceState,inspectIndependentService} from './independent-service-result.mjs'
import {metadataTargetValid} from './native-metadata-control.mjs'
import {archiveTargetValid} from './native-archive-control.mjs'
import {DriverError,versions} from './paths.mjs'
import {retainIndependentGenerationLocator} from './independent-service-index.mjs'
const exec=promisify(execFile)
export function independentPreparationAllowed({record,registered,peer,version,probeRoot,lifetimeSec,maxRequests}){
 return !!(record&&record.isArchived===false&&registered===true&&/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(record.sessionId||'')&&record.permissionMode==='bypassPermissions'&&typeof record.cwd==='string'&&record.cwd===resolve(record.cwd)&&record.cwd.startsWith(resolve(probeRoot)+sep)&&peer?.hostSessionId===record.sessionId&&peer.sessionId===record.sessionId?.replace(/^local_/,'')&&peer.cwd===record.cwd&&peer.entrypoint==='claude-desktop'&&!peer.spare&&!peer.parkedJobId&&peer.status==='idle'&&peer.version==='2.1.299'&&Number.isInteger(peer.pid)&&peer.pid>1&&typeof peer.procStart==='string'&&peer.procStart&&version?.app==='2.42304.0'&&version.cli==='2.1.299'&&Number.isInteger(lifetimeSec)&&lifetimeSec>=60&&lifetimeSec<=3600&&Number.isInteger(maxRequests)&&maxRequests>=1&&maxRequests<=128)
}
function inheritedTarget(status,session,receiverCwd,serviceId,peer,key,valid){
 if(!/^[a-f0-9]{32}$/.test(serviceId||'')||status?.serviceId!==serviceId||status.sessionId!==session||status.verified!==true||status.verificationMode!=='live-native'||status.sourceDisposition!=='installed'||!peer||status.nativeEpoch?.pid!==peer.pid||status.nativeEpoch?.procStart!==peer.procStart||status.terminalAttemptReviewComplete!==true||!Array.isArray(status.unresolvedRequestIds)||status.unresolvedRequestIds.length)throw Error('archive capability predecessor unqualified')
 if(status[key]===undefined)return undefined
 if(!valid(status[key],{sessionId:session,receiverCwd}))throw Error('archive capability binding unqualified')
 return {...status[key]}
}
export const inheritedArchiveTarget=(...args)=>inheritedTarget(...args,'archiveTarget',archiveTargetValid)
export const inheritedMetadataTarget=(...args)=>inheritedTarget(...args,'metadataTarget',metadataTargetValid)
export async function prepareIndependentService(session,{lifetimeSec=300,maxRequests=8,signal,jobId,archiveTargetSession,metadataTargetSession,metadataModelControl,inheritArchiveFrom}={}){
 const record=getRecord(session),peer=peerRecord(session)
 if(!independentPreparationAllowed({record,peer,registered:!!loadRegistry().sessions[session],version:versions(),probeRoot:PROBE_DIR,lifetimeSec,maxRequests})||jobId!==undefined&&!/^j[a-f0-9]{32}$/.test(jobId))throw new DriverError('independent preparation requires an idle driver-owned bypass scratch receiver',{category:'independent_service_prepare_refused',detail:{dispatched:false,retrySafe:true}})
 if(metadataModelControl!==undefined&&metadataModelControl!==true)throw new DriverError('model capability must be explicit true',{category:'bad_args'})
 let modelControl=metadataModelControl===true,archiveTarget,metadataTarget
 if(archiveTargetSession!==undefined&&metadataTargetSession!==undefined)throw new DriverError('archive and metadata capabilities require distinct generations',{category:'bad_args'})
 if(inheritArchiveFrom!==undefined){if(archiveTargetSession!==undefined||metadataTargetSession!==undefined||metadataModelControl!==undefined)throw new DriverError('cannot combine new and inherited targets',{category:'bad_args'});const status=await inspectIndependentService(session,inheritArchiveFrom,{signal});archiveTarget=inheritedArchiveTarget(status,session,record.cwd,inheritArchiveFrom,peer);metadataTarget=inheritedMetadataTarget(status,session,record.cwd,inheritArchiveFrom,peer);modelControl=status.metadataModelControl===true}
 if(archiveTargetSession!==undefined){const r=getRecord(archiveTargetSession),p=peerRecord(archiveTargetSession);if(!independentPreparationAllowed({record:r,peer:p,registered:!!loadRegistry().sessions[archiveTargetSession],version:versions(),probeRoot:PROBE_DIR,lifetimeSec,maxRequests})||archiveTargetSession===session)throw new DriverError('archive target requires a distinct owned idle bypass scratch',{category:'bad_args'});archiveTarget={sessionId:r.sessionId,cwd:r.cwd,pid:p.pid,procStart:p.procStart}}
 if(metadataTargetSession!==undefined){const r=getRecord(metadataTargetSession),p=peerRecord(metadataTargetSession);if(!independentPreparationAllowed({record:r,peer:p,registered:!!loadRegistry().sessions[metadataTargetSession],version:versions(),probeRoot:PROBE_DIR,lifetimeSec,maxRequests})||metadataTargetSession===session)throw new DriverError('metadata target requires a distinct owned idle bypass scratch',{category:'bad_args'});metadataTarget={sessionId:r.sessionId,cwd:r.cwd,pid:p.pid,procStart:p.procStart}}
 if(modelControl&&!metadataTarget)throw new DriverError('model capability requires metadata target',{category:'bad_args'})
 const serviceId=jobId?jobId.slice(1):randomUUID().replaceAll('-',''),state=independentServiceState(session,serviceId,record)
 retainIndependentGenerationLocator({session,serviceId,receiverCwd:record.cwd,origin:'preparation-intent',jobId:jobId??null})
 try{const {stdout}=await exec(process.execPath,[fileURLToPath(new URL('../scripts/independent-service-prepare.mjs',import.meta.url)),session,serviceId,String(lifetimeSec),String(maxRequests),String(peer.pid),peer.procStart,...metadataTarget?[JSON.stringify(null),JSON.stringify(metadataTarget),...modelControl?['model']:[]]:archiveTarget?[JSON.stringify(archiveTarget)]:[]],{env:{...process.env,CLAUDE_DRIVER_STATE_DIR:state},signal,timeout:30000,maxBuffer:65536});return JSON.parse(stdout)}
 catch{throw new DriverError('independent preparation failed or was interrupted; inspect the original service namespace',{category:'independent_service_prepare_unresolved',detail:{serviceId,installed:false,settingsChanged:false,retrySafe:false}})}
}
