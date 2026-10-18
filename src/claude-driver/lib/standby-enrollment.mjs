import {pairBootstrapTransitionAllowed,readPairBootstrapRoot} from './pair-bootstrap-proof.mjs'
import {readHumanAssistedRebindProof} from './human-assisted-rebind-proof.mjs'
import {readStandbyRebindProof,standbyRecoveryTransitionAllowed} from './standby-rebind-proof.mjs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {mkdirSync,lstatSync,writeFileSync,readdirSync} from 'node:fs'
import {STATE_DIR,withLock,writeJsonAtomic} from './state.mjs'
import {readReceiverFile,loadReceiverSelection} from './receiver-runtime-selection.mjs'
import {getRecord} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {inspectStandbyRecovery} from './standby-plan.mjs'
const sid=/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,id=/^[a-f0-9]{32}$/,hex=/^[a-f0-9]{64}$/,root=join(STATE_DIR,'standby-enrollments')
const sameEpoch=(a,b)=>['sessionId','cwd','pid','procStart'].every(k=>a?.[k]===b?.[k])
function owned(dir){const s=lstatSync(dir);if(s.isSymbolicLink()||!s.isDirectory()||s.uid!==process.getuid()||s.mode&0o022)throw Error('standby enrollment directory unqualified')}
export function validateStandbyEnrollment(row,primary){
 if(!row||Object.keys(row).sort().join(',')!==(row.schemaVersion===2?'automaticRecovery,enrolledAt,familyRequestId,primary,schemaVersion,standby':'enrolledAt,familyRequestId,primary,schemaVersion,standby')||![1,2].includes(row.schemaVersion)||row.schemaVersion===2&&typeof row.automaticRecovery!=='boolean'||!Number.isSafeInteger(row.enrolledAt)||row.enrolledAt<0||!/^rpeer[a-f0-9]{32}$/.test(row.familyRequestId||'')||row.primary?.sessionId!==primary||row.primary?.sessionId===row.standby?.sessionId)throw Error('standby enrollment unqualified')
 for(const e of [row.primary,row.standby])if(!e||Object.keys(e).sort().join(',')!=='cwd,pid,procStart,serviceId,sessionId'||!sid.test(e.sessionId)||!id.test(e.serviceId)||typeof e.cwd!=='string'||!e.cwd.startsWith('/')||!Number.isSafeInteger(e.pid)||e.pid<2||typeof e.procStart!=='string'||!e.procStart)throw Error('standby epoch unqualified')
 return row
}
export const standbyEnrollmentDigest=row=>createHash('sha256').update(JSON.stringify(validateStandbyEnrollment(row,row?.primary?.sessionId))).digest('hex')
export function readStandbyEnrollment(primary,{dir=root}={}){
 if(!sid.test(primary||''))throw Error('exact primary required')
 try{owned(dir);return validateStandbyEnrollment(JSON.parse(readReceiverFile(join(dir,primary+'.json'),8192)),primary)}catch(e){if(e.code==='ENOENT')return null;throw e}
}
export function standbyBindingsForSession(standby,{dir=root}={}){
 if(!sid.test(standby||''))throw Error('exact standby required')
 try{owned(dir)}catch(error){if(error.code==='ENOENT')return [];throw error}
 const names=readdirSync(dir)
 if(names.length>128||names.some(name=>!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.json$/.test(name)))throw Error('standby binding inventory unqualified')
 return names.map(name=>readStandbyEnrollment(name.slice(0,-5),{dir})).filter(row=>row?.standby.sessionId===standby)
}
export function standbyRefreshAllowed(before,after,expected){
 return hex.test(expected||'')&&standbyEnrollmentDigest(before)===expected&&sameEpoch(before.primary,after.primary)&&sameEpoch(before.standby,after.standby)
}
async function qualified(args,{signal,allowAbsentPrimary=false,primaryEpoch}={}){
 const plan=await inspectStandbyRecovery(args.session,args.service_id,args.session_id,args.target_service_id,args.family_request_id,{signal})
 if(!(plan.action==='wait'&&plan.reason==='primary-live')&&!(allowAbsentPrimary===true&&plan.action==='recover'&&plan.coldRecoveryEligible===true))throw Error('standby enrollment requires qualified live primary and standby')
 const epoch=(session,service)=>{const r=getRecord(session),native=peerRecord(session),p=native??(allowAbsentPrimary&&session===args.session_id?primaryEpoch:null),selected=loadReceiverSelection(r.cwd);if(!p||selected.selector.sessionId!==session||selected.selector.serviceId!==service||p.pid!==selected.selector.pid||p.procStart!==selected.selector.procStart)throw Error('enrollment selection changed');return {sessionId:session,serviceId:service,cwd:r.cwd,pid:p.pid,procStart:p.procStart}}
 return validateStandbyEnrollment({schemaVersion:1,primary:epoch(args.session_id,args.target_service_id),standby:epoch(args.session,args.service_id),familyRequestId:args.family_request_id,enrolledAt:Date.now()},args.session_id)
}
export async function enrollStandby(args,{signal,dir=root,expectedSha256,qualify=qualified,historyRoot=join(STATE_DIR,'standby-enrollment-history'),automaticRecovery,recoveryParentJobId,allowAbsentPrimary=false,humanAssistedPrimaryServiceId,pairBootstrapJobId}={}){
 if(!sid.test(args.session_id||''))throw Error('exact primary required')
 return withLock('standby-enrollment-'+args.session_id,async()=>{
  const before=readStandbyEnrollment(args.session_id,{dir});if(allowAbsentPrimary===true&&(!before||expectedSha256!==standbyEnrollmentDigest(before)))throw Error('absent primary refresh requires exact existing binding')
  let after=validateStandbyEnrollment(await qualify(args,{signal,allowAbsentPrimary,primaryEpoch:allowAbsentPrimary?before.primary:undefined}),args.session_id)
  if(automaticRecovery!==undefined&&typeof automaticRecovery!=='boolean')throw Error('automatic recovery must be explicit boolean')
  if(automaticRecovery!==undefined||before?.schemaVersion===2)after=validateStandbyEnrollment({...after,schemaVersion:2,automaticRecovery:automaticRecovery??before.automaticRecovery},args.session_id)
  mkdirSync(dir,{recursive:true,mode:0o700});owned(dir);const file=join(dir,args.session_id+'.json')
  if(!before){if(expectedSha256!==undefined)throw Error('expected standby binding missing');writeFileSync(file,JSON.stringify(after)+'\n',{flag:'wx',mode:0o600})}
  else if(expectedSha256===undefined){if(JSON.stringify({...before,enrolledAt:after.enrolledAt})!==JSON.stringify(after))throw Error('standby binding already exists; exact digest required')}
  else{const recoveryProof=recoveryParentJobId===undefined?null:humanAssistedPrimaryServiceId?await readHumanAssistedRebindProof(before,recoveryParentJobId,humanAssistedPrimaryServiceId,{signal}):readStandbyRebindProof(before,recoveryParentJobId);const pairProof=pairBootstrapJobId===undefined?null:readPairBootstrapRoot(pairBootstrapJobId);if(pairProof&&recoveryProof)throw Error('ambiguous recovery proof');if(!standbyRefreshAllowed(before,after,expectedSha256)&&!(recoveryProof&&standbyEnrollmentDigest(before)===expectedSha256&&standbyRecoveryTransitionAllowed(before,after,recoveryProof))&&!(pairProof&&standbyEnrollmentDigest(before)===expectedSha256&&pairBootstrapTransitionAllowed(before,after,pairProof,pairBootstrapJobId)))throw Error('standby compare-and-swap or epoch changed');const history=join(historyRoot,args.session_id);mkdirSync(history,{recursive:true,mode:0o700});owned(history);const prior=join(history,expectedSha256+'.json'),bytes=JSON.stringify(before)+'\n';try{writeFileSync(prior,bytes,{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST'||readReceiverFile(prior,8192).toString()!==bytes)throw e}if(standbyEnrollmentDigest(readStandbyEnrollment(args.session_id,{dir}))!==expectedSha256)throw Error('standby binding changed');writeJsonAtomic(file,after)}
  const row=readStandbyEnrollment(args.session_id,{dir});return {enrolled:true,verified:true,reused:!!before&&expectedSha256===undefined,enrollmentSha256:standbyEnrollmentDigest(row),primarySession:row.primary.sessionId,primaryServiceId:row.primary.serviceId,standbySession:row.standby.sessionId,standbyServiceId:row.standby.serviceId,familyRequestId:row.familyRequestId,enrollmentFile:file,automaticRecoveryEnabled:row.schemaVersion===2&&row.automaticRecovery===true,nativeEffectsPerformed:false}
 },{signal,timeoutMs:30000})
}
export async function inspectEnrolledStandby(primary,{signal,allowStandbyMaintenance=false}={}){
 const row=readStandbyEnrollment(primary);if(!row)return {enrolled:false,effectsPerformed:false}
 const r=getRecord(primary),c=getRecord(row.standby.sessionId),unqualified=reason=>({enrolled:true,action:'inspect',reason,coldRecoveryEligible:false,effectsPerformed:false,recoveryAttempted:false,enrollmentSha256:standbyEnrollmentDigest(row)})
 if(!r||!c||r.cwd!==row.primary.cwd||c.cwd!==row.standby.cwd)return unqualified('enrolled-record-changed')
 const selected=loadReceiverSelection(r.cwd),standby=loadReceiverSelection(c.cwd)
 if(selected.selector.serviceId!==row.primary.serviceId||standby.selector.serviceId!==row.standby.serviceId)return unqualified('enrolled-generation-changed')
 const plan=await inspectStandbyRecovery(row.standby.sessionId,row.standby.serviceId,row.primary.sessionId,row.primary.serviceId,row.familyRequestId,{signal,allowStandbyMaintenance})
 return {...plan,enrolled:true,automaticRecoveryEnabled:row.schemaVersion===2&&row.automaticRecovery===true,enrollmentSha256:standbyEnrollmentDigest(row)}
}
