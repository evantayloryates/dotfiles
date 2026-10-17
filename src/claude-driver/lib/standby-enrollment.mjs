import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {mkdirSync,lstatSync,writeFileSync} from 'node:fs'
import {STATE_DIR,withLock,writeJsonAtomic} from './state.mjs'
import {readReceiverFile,loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {getRecord} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {inspectStandbyRecovery} from './standby-plan.mjs'
const sid=/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,id=/^[a-f0-9]{32}$/,hex=/^[a-f0-9]{64}$/,root=join(STATE_DIR,'standby-enrollments')
const sameEpoch=(a,b)=>['sessionId','cwd','pid','procStart'].every(k=>a?.[k]===b?.[k])
function owned(dir){const s=lstatSync(dir);if(s.isSymbolicLink()||!s.isDirectory()||s.uid!==process.getuid()||s.mode&0o022)throw Error('standby enrollment directory unqualified')}
export function validateStandbyEnrollment(row,primary){
 if(!row||Object.keys(row).sort().join(',')!=='enrolledAt,familyRequestId,primary,schemaVersion,standby'||row.schemaVersion!==1||!Number.isSafeInteger(row.enrolledAt)||row.enrolledAt<0||!/^rpeer[a-f0-9]{32}$/.test(row.familyRequestId||'')||row.primary?.sessionId!==primary||row.primary?.sessionId===row.standby?.sessionId)throw Error('standby enrollment unqualified')
 for(const e of [row.primary,row.standby])if(!e||Object.keys(e).sort().join(',')!=='cwd,pid,procStart,serviceId,sessionId'||!sid.test(e.sessionId)||!id.test(e.serviceId)||typeof e.cwd!=='string'||!e.cwd.startsWith('/')||!Number.isSafeInteger(e.pid)||e.pid<2||typeof e.procStart!=='string'||!e.procStart)throw Error('standby epoch unqualified')
 return row
}
export const standbyEnrollmentDigest=row=>createHash('sha256').update(JSON.stringify(validateStandbyEnrollment(row,row?.primary?.sessionId))).digest('hex')
export function readStandbyEnrollment(primary,{dir=root}={}){
 if(!sid.test(primary||''))throw Error('exact primary required')
 try{owned(dir);return validateStandbyEnrollment(JSON.parse(readReceiverFile(join(dir,primary+'.json'),8192)),primary)}catch(e){if(e.code==='ENOENT')return null;throw e}
}
export function standbyRefreshAllowed(before,after,expected){
 return hex.test(expected||'')&&standbyEnrollmentDigest(before)===expected&&sameEpoch(before.primary,after.primary)&&sameEpoch(before.standby,after.standby)
}
async function qualified(args,{signal}={}){
 const plan=await inspectStandbyRecovery(args.session,args.service_id,args.session_id,args.target_service_id,args.family_request_id,{signal})
 if(plan.action!=='wait'||plan.reason!=='primary-live')throw Error('standby enrollment requires qualified live primary and standby')
 const epoch=(session,service)=>{const r=getRecord(session),p=peerRecord(session),selected=loadReceiverSelection(r.cwd);if(!p||selected.selector.sessionId!==session||selected.selector.serviceId!==service||p.pid!==selected.selector.pid||p.procStart!==selected.selector.procStart)throw Error('enrollment selection changed');return {sessionId:session,serviceId:service,cwd:r.cwd,pid:p.pid,procStart:p.procStart}}
 return validateStandbyEnrollment({schemaVersion:1,primary:epoch(args.session_id,args.target_service_id),standby:epoch(args.session,args.service_id),familyRequestId:args.family_request_id,enrolledAt:Date.now()},args.session_id)
}
export async function enrollStandby(args,{signal,dir=root,expectedSha256,qualify=qualified,historyRoot=join(STATE_DIR,'standby-enrollment-history')}={}){
 if(!sid.test(args.session_id||''))throw Error('exact primary required')
 return withLock('standby-enrollment-'+args.session_id,async()=>{
  const after=validateStandbyEnrollment(await qualify(args,{signal}),args.session_id),before=readStandbyEnrollment(args.session_id,{dir})
  mkdirSync(dir,{recursive:true,mode:0o700});owned(dir);const file=join(dir,args.session_id+'.json')
  if(!before){if(expectedSha256!==undefined)throw Error('expected standby binding missing');writeFileSync(file,JSON.stringify(after)+'\n',{flag:'wx',mode:0o600})}
  else if(expectedSha256===undefined){if(JSON.stringify({...before,enrolledAt:after.enrolledAt})!==JSON.stringify(after))throw Error('standby binding already exists; exact digest required')}
  else{if(!standbyRefreshAllowed(before,after,expectedSha256))throw Error('standby compare-and-swap or epoch changed');const history=join(historyRoot,args.session_id);mkdirSync(history,{recursive:true,mode:0o700});owned(history);const prior=join(history,expectedSha256+'.json'),bytes=JSON.stringify(before)+'\n';try{writeFileSync(prior,bytes,{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST'||readReceiverFile(prior,8192).toString()!==bytes)throw e}if(standbyEnrollmentDigest(readStandbyEnrollment(args.session_id,{dir}))!==expectedSha256)throw Error('standby binding changed');writeJsonAtomic(file,after)}
  const row=readStandbyEnrollment(args.session_id,{dir});return {enrolled:true,verified:true,reused:!!before&&expectedSha256===undefined,enrollmentSha256:standbyEnrollmentDigest(row),primarySession:row.primary.sessionId,primaryServiceId:row.primary.serviceId,standbySession:row.standby.sessionId,standbyServiceId:row.standby.serviceId,familyRequestId:row.familyRequestId,enrollmentFile:file,nativeEffectsPerformed:false}
 },{signal,timeoutMs:30000})
}
export async function inspectEnrolledStandby(primary,{signal}={}){
 const row=readStandbyEnrollment(primary);if(!row)return {enrolled:false,effectsPerformed:false}
 const r=getRecord(primary),c=getRecord(row.standby.sessionId),unqualified=reason=>({enrolled:true,action:'inspect',reason,coldRecoveryEligible:false,effectsPerformed:false,recoveryAttempted:false,enrollmentSha256:standbyEnrollmentDigest(row)})
 if(!r||!c||r.cwd!==row.primary.cwd||c.cwd!==row.standby.cwd)return unqualified('enrolled-record-changed')
 const selected=loadReceiverSelection(r.cwd),standby=loadReceiverSelection(c.cwd)
 if(selected.selector.serviceId!==row.primary.serviceId||standby.selector.serviceId!==row.standby.serviceId)return unqualified('enrolled-generation-changed')
 const plan=await inspectStandbyRecovery(row.standby.sessionId,row.standby.serviceId,row.primary.sessionId,row.primary.serviceId,row.familyRequestId,{signal})
 return {...plan,enrolled:true,enrollmentSha256:standbyEnrollmentDigest(row)}
}
