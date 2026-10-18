// Health may suggest an exact read-only inspection; it never authorizes a
// restoration, declares a process absent, or scans for replacement actors.
import {createHash} from 'node:crypto'
import {readStandbyEnrollment,standbyEnrollmentDigest} from './standby-enrollment.mjs'
import {readServiceRecoveryIdentity,validateServiceRecoveryIdentity} from './service-recovery-identity.mjs'
import {activeStore} from './paths.mjs'
export async function inspectMissingControllerRecovery(row,{signal}={},d={}){
 const no=reason=>({scope:'missing-controller-record',action:'inspect',reason,recordRestorationAttempted:false,nativeEpochAssessed:false,servingQualified:false,replayAuthorized:false,nativeEffectsRequested:0})
 const readPair=d.readPair??readStandbyEnrollment,readIdentity=d.readIdentity??readServiceRecoveryIdentity,accountHash=d.accountHash??(()=>createHash('sha256').update(activeStore().dir).digest('hex'))
 try{
  const pair=readPair(row.controllerSession)
  if(!pair)return no('retained-pair-unavailable')
  const digest=standbyEnrollmentDigest(pair)
  if(pair.schemaVersion!==2||pair.automaticRecovery!==true||pair.primary.sessionId!==row.controllerSession||pair.primary.cwd!==row.receiverCwd)return no('retained-automatic-pair-unqualified')
  const identity=readIdentity(pair.primary.sessionId,pair.primary.serviceId)
  if(!identity)return no('retained-recovery-identity-missing')
  validateServiceRecoveryIdentity(identity,{session:pair.primary.sessionId,serviceId:pair.primary.serviceId,...d.probeRoot?{probeRoot:d.probeRoot}:{}})
  const account=accountHash()
  if(identity.cwd!==row.receiverCwd||identity.storeHash!==account)return no('retained-account-identity-unqualified')
  if(signal?.aborted||d.record(row.controllerSession)||JSON.stringify(d.read())!==JSON.stringify(row)||standbyEnrollmentDigest(readPair(row.controllerSession))!==digest||JSON.stringify(readIdentity(pair.primary.sessionId,pair.primary.serviceId))!==JSON.stringify(identity)||accountHash()!==account)return no('recovery-inspection-evidence-changed')
  return {...no('exact-record-recovery-inspection-available'),inspection:{operation:'broker_service_missing_record_plan',arguments:{session:row.controllerSession,role:'primary',expected_enrollment_sha256:digest}},requiresIndependentAbsenceAndHistoryReview:true,mayRequireHumanConsent:true}
 }catch{return no('retained-recovery-evidence-unqualified')}
}
