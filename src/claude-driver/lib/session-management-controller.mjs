import {join} from 'node:path'
import {writeFileSync} from 'node:fs'
import {STATE_DIR,ensureDir,withLock} from './state.mjs'
import {getRecord} from './sessions.mjs'
import {readReceiverFile,loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {inspectIndependentService} from './independent-service-result.mjs'
import {DriverError} from './paths.mjs'
const sid=/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const file=()=>join(STATE_DIR,'session-management-controller.json')
const refuse=()=>{throw new DriverError('ordinary session controller unqualified; no legacy fallback',{category:'session_management_controller_unqualified',detail:{dispatched:false,retrySafe:true}})}
export function validateSessionManagementEnrollment(row){
 if(!row||Object.keys(row).sort().join(',')!=='controllerSession,enrolledAt,receiverCwd,schemaVersion'||row.schemaVersion!==1||!sid.test(row.controllerSession||'')||typeof row.receiverCwd!=='string'||!row.receiverCwd.startsWith('/')||!Number.isSafeInteger(row.enrolledAt)||row.enrolledAt<0)refuse()
 return row
}
export function readSessionManagementEnrollment(){
 try{return validateSessionManagementEnrollment(JSON.parse(readReceiverFile(file(),4096)))}catch(error){if(error.code==='ENOENT')return null;refuse()}
}
export function sessionManagementController(target){
 const row=readSessionManagementEnrollment();if(!row)return null
 if(!sid.test(target||'')||target===row.controllerSession||getRecord(row.controllerSession)?.cwd!==row.receiverCwd)refuse()
 return row.controllerSession
}
export async function enrollSessionManagementController(session,{signal}={}){
 if(!sid.test(session||''))refuse()
 return withLock('session-management-enrollment',async()=>{
  const record=getRecord(session);if(!record)refuse()
  const selected=loadReceiverSelection(record.cwd),status=await inspectIndependentService(session,selected.selector.serviceId,{signal})
  if(signal?.aborted||selected.selector.sessionId!==session||!status.verified||status.verificationMode!=='live-native'||!status.readinessObserved||!status.nativePolicyObserved||status.admissionStopped||status.expired||status.nativeInputRequired||status.nativeEpoch?.status!=='idle'||status.unresolvedRequestIds?.length||status.terminalAttemptReviewComplete!==true||status.unreservedSlots<1||[status,selected.pointer,selected.policy].some(x=>x.sessionManagementControl!==true))refuse()
  const prior=readSessionManagementEnrollment();if(prior&&(prior.controllerSession!==session||prior.receiverCwd!==record.cwd))refuse()
  const row=prior??{schemaVersion:1,controllerSession:session,receiverCwd:record.cwd,enrolledAt:Date.now()};ensureDir(STATE_DIR)
  if(!prior)writeFileSync(file(),JSON.stringify(row)+'\n',{flag:'wx',mode:0o600})
  if(JSON.stringify(readSessionManagementEnrollment())!==JSON.stringify(row))refuse()
  return {enrolled:true,controllerSession:session,serviceId:status.serviceId,verified:true,nativeEffectsRequested:0}
 },{signal,timeoutMs:5000})
}
