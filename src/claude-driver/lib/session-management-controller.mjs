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
export function sessionManagementController(target,dependencies={}){
 const row=(dependencies.read??readSessionManagementEnrollment)();if(!row)return null
 validateSessionManagementEnrollment(row)
 if(!sid.test(target||'')||target===row.controllerSession)refuse()
 const record=(dependencies.record??getRecord)(row.controllerSession)
 if(!record)throw new DriverError('ordinary controller saved chat record is missing; inspect recovery before retrying the target',{category:'session_management_controller_record_missing',detail:{controllerSession:row.controllerSession,targetSession:target,reason:'controller-saved-record-missing',nextInspection:'driver_status',dispatched:false,targetDispatched:false,recordRestorationAttempted:false,nativeEpochAssessed:false,replayAuthorized:false,retrySafe:true}})
 if(record.cwd!==row.receiverCwd)refuse()
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

// Read exactly one retained enrollment and selected generation; never discover
// actors, renew a lease, reconcile an effect or wake a process from health.
export async function inspectSessionManagementController({signal}={},dependencies={}){
 const read=dependencies.read??readSessionManagementEnrollment,record=dependencies.record??getRecord,select=dependencies.select??loadReceiverSelection,inspect=dependencies.inspect??inspectIndependentService
 let row
 try{
  row=read();if(!row)return {configured:false,operations:[],nativeEffectsRequested:0,recoveryAttempted:false}
  validateSessionManagementEnrollment(row)
  const r=record(row.controllerSession)
  if(!r){
   const {inspectMissingControllerRecovery}=await import('./missing-controller-recovery.mjs')
   const recoveryReadiness=await inspectMissingControllerRecovery(row,{signal},{...dependencies,read,record})
   return {configured:true,controllerSession:row.controllerSession,operations:[],health:{nativeReadAdmission:'unverified'},reason:'controller-saved-record-missing',routeReadiness:{scope:'ordinary-controller-preconditions',admission:'record-restoration-required',operationAuthorized:false,targetAssessed:false,recoveryAttempted:false},recoveryReadiness,nativeEffectsRequested:0,recoveryAttempted:false}
  }
  if(r.cwd!==row.receiverCwd)throw Error('identity')
  const selected=select(r.cwd);if(selected.selector.sessionId!==row.controllerSession)throw Error('selection')
  const readPair=dependencies.readPair??(await import('./standby-enrollment.mjs')).readStandbyEnrollment,pair=readPair(row.controllerSession)
  const status=await inspect(row.controllerSession,selected.selector.serviceId,{signal}),after=select(r.cwd)
  if(JSON.stringify(pair)!==JSON.stringify(readPair(row.controllerSession)))throw Error('pair binding changed')
  if(JSON.stringify(selected)!==JSON.stringify(after)||status.sessionId!==row.controllerSession||status.serviceId!==selected.selector.serviceId||[status,selected.policy,selected.pointer].some(x=>x.sessionManagementControl!==true)||status.nativeEpoch?.pid!==selected.selector.pid||status.nativeEpoch?.procStart!==selected.selector.procStart||status.build!==selected.selector.build)throw Error('generation')
  const {independentServiceHealth}=await import('./service-health.mjs'),health=independentServiceHealth(status,{session:row.controllerSession,serviceId:status.serviceId,now:dependencies.now?.()??Date.now()})
  const requiredBuild=dependencies.requiredBuild??(await import('./build.mjs')).runtimeFingerprint(),sourceMatches=status.build===requiredBuild
  const pairMatches=!pair||pair.primary?.sessionId===row.controllerSession&&pair.primary.serviceId===status.serviceId
  const routeReadiness={scope:'ordinary-controller-preconditions',currentSourceMatches:sourceMatches,pairConfigured:!!pair,pairGenerationMatches:pairMatches,admission:!pairMatches?'pair-reconciliation-required':!sourceMatches?'source-maintenance-required':health.nativeReadAdmission==='observed'?'observed':'unverified',operationAuthorized:false,targetAssessed:false,recoveryAttempted:false}
  return {configured:true,controllerSession:row.controllerSession,serviceId:status.serviceId,routeReadiness,operations:['unarchive_session','pin_session',...[status,selected.policy,selected.pointer].every(x=>x.sessionStopControl===true&&x.sessionSendControl===true)?['steer_session']:[],...[status,selected.policy,selected.pointer].every(x=>x.sessionStopControl===true)?['stop_session']:[],...[status,selected.policy,selected.pointer].every(x=>x.sessionArchiveControl===true)?['archive_session']:[],...[status,selected.policy,selected.pointer].every(x=>x.sessionSendControl===true)?['send_message']:[],...[status,selected.policy,selected.pointer].every(x=>x.sessionMetadataControl===true)?['rename_session','set_session_config']:[]],health,nativeEffectsRequested:0,recoveryAttempted:false}
 }catch{return {configured:true,...sid.test(row?.controllerSession||'')?{controllerSession:row.controllerSession}:{},operations:[],health:{nativeReadAdmission:'unverified'},reason:'enrollment-or-selected-generation-unqualified',nativeEffectsRequested:0,recoveryAttempted:false}}
}
