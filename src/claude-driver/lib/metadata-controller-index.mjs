import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {inspectNativeResourcePid} from './native-resource-process.mjs'
import {mkdirSync,lstatSync,readdirSync,writeFileSync} from 'node:fs'
import {STATE_DIR,withLock,writeJsonAtomic} from './state.mjs'
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
async function qualifiedMetadataEnrollment(session,target,{signal}={}){
 if(!uuid.test(session||'')||!uuid.test(target||'')||session===target)refuse()
 const c=getRecord(session),selected=loadReceiverSelection(c.cwd),s=await inspectIndependentService(session,selected.selector.serviceId,{signal}),t=s.metadataTarget,r=getRecord(target)
 if(selected.selector.sessionId!==session||!s.verified||!s.readinessObserved||!s.nativePolicyObserved||s.admissionStopped||s.expired||s.unresolvedRequestIds?.length||s.unreservedSlots<1||selected.pointer.nativeMetadataTargetVersion!==1||selected.policy.nativeMetadataTargetVersion!==1||t?.sessionId!==target||!['sessionId','cwd','pid','procStart'].every(k=>selected.policy.metadataTarget?.[k]===t[k])||!metadataTargetPreflightMatches({target:t,record:r,peer:peerRecord(target),registered:t&&metadataTargetRegistered(t,{controlStateDir:STATE_DIR}),openPrCount:r?openPrs(r).length:null}))refuse()
 return {row:{schemaVersion:1,controllerSession:session,receiverCwd:c.cwd,target:t,enrolledAt:Date.now()},serviceId:s.serviceId}
}
export async function enrollMetadataController(session,target,{signal}={}){
 if(!uuid.test(target||''))refuse()
 return withLock('metadata-enrollment-'+target,async()=>{
 const {row,serviceId}=await qualifiedMetadataEnrollment(session,target,{signal}),t=row.target,prior=readMetadataControllerEnrollment(target)
 if(prior&&(prior.controllerSession!==session||JSON.stringify(prior.target)!==JSON.stringify(t)))refuse()
 const retained=retainMetadataControllerEnrollment(prior??row),after=readMetadataControllerEnrollment(target)
 if(!after||after.controllerSession!==session)refuse()
 return {sessionId:target,controllerSession:session,serviceId,target:t,enrollmentSha256:metadataEnrollmentDigest(after),enrolled:true,verified:true,reused:!!prior,enrollmentFile:retained.file,nativeEffectsRequested:0}
 },{signal,timeoutMs:5000})
}

const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x
export const metadataEnrollmentDigest=row=>createHash('sha256').update(JSON.stringify(canonical(row))).digest('hex')
export function inspectMetadataEnrollment(target){const row=readMetadataControllerEnrollment(target);return {sessionId:target,enrolled:!!row,...row?{enrollment:row,enrollmentSha256:metadataEnrollmentDigest(row)}:{},servingAssessed:false}}
export function metadataRebindAllowed({prior,next,expectedSha256,oldProcess}={}){
 try{validateMetadataControllerEnrollment(prior,prior?.target?.sessionId);validateMetadataControllerEnrollment(next,prior.target.sessionId)}catch{return false}
 return /^[a-f0-9]{64}$/.test(expectedSha256||'')&&metadataEnrollmentDigest(prior)===expectedSha256&&oldProcess===null&&prior.controllerSession===next.controllerSession&&prior.receiverCwd===next.receiverCwd&&prior.target.cwd===next.target.cwd&&prior.target.pid!==next.target.pid&&prior.target.procStart!==next.target.procStart
}
// The caller serializes writers. History is retained before atomic publication;
// an interrupted publication is inspected, never inferred from history alone.
export async function publishMetadataRebind({target,expectedSha256,next,dir=root,historyDir=join(STATE_DIR,'metadata-controller-history'),guard,inspect=inspectNativeResourcePid}={}){
 const prior=readMetadataControllerEnrollment(target,{dir});if(!prior)refuse()
 if(!metadataRebindAllowed({prior,next,expectedSha256,oldProcess:inspect(prior?.target?.pid)}))refuse()
 mkdirSync(historyDir,{recursive:true,mode:0o700});owned(historyDir);const history=join(historyDir,target);mkdirSync(history,{recursive:true,mode:0o700});owned(history)
 const retained=join(history,expectedSha256+'.json'),body=JSON.stringify(prior)+'\n'
 try{writeFileSync(retained,body,{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST'||!readReceiverFile(retained,4096).equals(Buffer.from(body)))throw e}
 await guard()
 const current=readMetadataControllerEnrollment(target,{dir});if(!current||metadataEnrollmentDigest(current)!==expectedSha256||inspect(prior.target.pid)!==null)refuse()
 const file=join(dir,target,prior.controllerSession+'.json');writeJsonAtomic(file,next)
 const observed=readMetadataControllerEnrollment(target,{dir});if(!observed||metadataEnrollmentDigest(observed)!==metadataEnrollmentDigest(next))refuse()
 return {priorEnrollmentSha256:expectedSha256,enrollmentSha256:metadataEnrollmentDigest(observed),historyFile:retained,enrollmentFile:file,oldPidObservedAbsent:true}
}
export async function rebindMetadataController(session,target,expectedSha256,{signal}={}){
 if(!uuid.test(target||'')||!uuid.test(session||'')||!/^[a-f0-9]{64}$/.test(expectedSha256||''))refuse()
 return withLock('metadata-enrollment-'+target,async()=>{
  const {row,serviceId}=await qualifiedMetadataEnrollment(session,target,{signal})
  const result=await publishMetadataRebind({target,expectedSha256,next:row,guard:async()=>{if(signal?.aborted)refuse();const fresh=await qualifiedMetadataEnrollment(session,target,{signal});if(fresh.serviceId!==serviceId||metadataEnrollmentDigest({...fresh.row,enrolledAt:row.enrolledAt})!==metadataEnrollmentDigest(row))refuse()}})
  return {sessionId:target,controllerSession:session,serviceId,rebound:true,verified:true,nativeEffectsRequested:0,...result}
 },{signal,timeoutMs:5000})
}
