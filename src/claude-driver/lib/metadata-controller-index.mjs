import {join} from 'node:path'
import {mkdirSync,lstatSync,readdirSync,writeFileSync} from 'node:fs'
import {STATE_DIR} from './state.mjs'
import {readReceiverFile,loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {getRecord,openPrs} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {inspectIndependentService} from './independent-service-result.mjs'
import {metadataTargetValid,metadataTargetRegistered,metadataTargetPreflightMatches} from './native-metadata-control.mjs'
import {DriverError} from './paths.mjs'
const uuid=/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const refuse=()=>{throw new DriverError('metadata controller enrollment is ambiguous, stale or unqualified; no fallback or dispatch',{category:'metadata_controller_unqualified',detail:{dispatched:false,retrySafe:true}})}
const root=join(STATE_DIR,'metadata-controller-targets')
function owned(dir){const s=lstatSync(dir);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||s.mode&0o022)refuse()}
export function validateMetadataControllerEnrollment(row,target){
 if(!row||Object.keys(row).sort().join(',')!=='controllerSession,enrolledAt,receiverCwd,schemaVersion,target'||row.schemaVersion!==1||!uuid.test(row.controllerSession||'')||!Number.isSafeInteger(row.enrolledAt)||row.enrolledAt<0||row.target?.sessionId!==target||!metadataTargetValid(row.target,{sessionId:row.controllerSession,receiverCwd:row.receiverCwd}))refuse()
 return row
}
export function readMetadataControllerEnrollment(target,{dir=root}={}){
 if(!uuid.test(target||''))refuse()
 try{owned(dir)}catch(e){if(e.code==='ENOENT')return null;throw e}
 const targetDir=join(dir,target);try{owned(targetDir)}catch(e){if(e.code==='ENOENT')return null;throw e}
 const names=readdirSync(targetDir);if(names.length!==1||!/^local_[a-f0-9-]{36}\.json$/.test(names[0]||''))refuse()
 try{const row=validateMetadataControllerEnrollment(JSON.parse(readReceiverFile(join(targetDir,names[0]),4096)),target);if(names[0]!==row.controllerSession+'.json')refuse();return row}catch{refuse()}
}
export function retainMetadataControllerEnrollment(row,{dir=root}={}){
 validateMetadataControllerEnrollment(row,row?.target?.sessionId);mkdirSync(dir,{recursive:true,mode:0o700});owned(dir);const d=join(dir,row.target.sessionId);mkdirSync(d,{recursive:true,mode:0o700});owned(d)
 const file=join(d,row.controllerSession+'.json')
 try{writeFileSync(file,JSON.stringify(row)+'\n',{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST')throw e;const old=validateMetadataControllerEnrollment(JSON.parse(readReceiverFile(file,4096)),row.target.sessionId);if(JSON.stringify({...old,enrolledAt:row.enrolledAt})!==JSON.stringify(row))refuse()}
 return {file}
}
export function enrolledMetadataController(target,args,{read=readMetadataControllerEnrollment,record=getRecord,peer=peerRecord}={}){
 if(args.metadata_controller!==undefined)return args.metadata_controller
 const row=read(target);if(!row)return null
 const r=record(target),p=peer(target),c=record(row.controllerSession)
 if(!r||!p||!c||r.cwd!==row.target.cwd||p.pid!==row.target.pid||p.procStart!==row.target.procStart||p.hostSessionId!==target||c.cwd!==row.receiverCwd)refuse()
 return row.controllerSession
}
export async function enrollMetadataController(session,target,{signal}={}){
 if(!uuid.test(session||'')||!uuid.test(target||'')||session===target)refuse()
 const c=getRecord(session),selected=loadReceiverSelection(c.cwd),s=await inspectIndependentService(session,selected.selector.serviceId,{signal}),t=s.metadataTarget,r=getRecord(target)
 if(selected.selector.sessionId!==session||!s.verified||!s.readinessObserved||!s.nativePolicyObserved||s.admissionStopped||s.expired||s.unresolvedRequestIds?.length||s.unreservedSlots<1||selected.pointer.nativeMetadataTargetVersion!==1||selected.policy.nativeMetadataTargetVersion!==1||t?.sessionId!==target||!['sessionId','cwd','pid','procStart'].every(k=>selected.policy.metadataTarget?.[k]===t[k])||!metadataTargetPreflightMatches({target:t,record:r,peer:peerRecord(target),registered:t&&metadataTargetRegistered(t,{controlStateDir:STATE_DIR}),openPrCount:r?openPrs(r).length:null}))refuse()
 const row={schemaVersion:1,controllerSession:session,receiverCwd:c.cwd,target:t,enrolledAt:Date.now()},prior=readMetadataControllerEnrollment(target)
 if(prior&&(prior.controllerSession!==session||JSON.stringify(prior.target)!==JSON.stringify(t)))refuse()
 const retained=retainMetadataControllerEnrollment(prior??row),after=readMetadataControllerEnrollment(target)
 if(!after||after.controllerSession!==session)refuse()
 return {sessionId:target,controllerSession:session,serviceId:s.serviceId,target:t,enrolled:true,verified:true,reused:!!prior,enrollmentFile:retained.file,nativeEffectsRequested:0}
}
