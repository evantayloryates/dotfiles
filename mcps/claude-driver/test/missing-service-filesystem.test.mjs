import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,unlinkSync,symlinkSync,utimesSync} from 'node:fs'
import {join,dirname} from 'node:path'
import {tmpdir} from 'node:os'
import {randomUUID} from 'node:crypto'
const root=mkdtempSync(join(tmpdir(),'missing-service-fs-'))
process.env.CLAUDE_DRIVER_STATE_DIR=join(root,'state')
process.env.CLAUDE_DRIVER_APP_SUPPORT=join(root,'app')
process.env.CLAUDE_DRIVER_PROJECTS_DIR=join(root,'projects')
process.env.CLAUDE_DRIVER_PEER_SESSIONS_DIR=join(root,'peers')
const {STATE_DIR,PROBE_DIR}=await import('../src/lib/state.mjs')
const {getRecord}=await import('../src/lib/sessions.mjs')
const {standbyEnrollmentDigest}=await import('../src/lib/standby-enrollment.mjs')
const {retainServiceRecoveryIdentity}=await import('../src/lib/service-recovery-identity.mjs')
const {inspectMissingServiceImport}=await import('../src/lib/missing-service-plan.mjs')
const {restoreMissingServiceRecord,missingServicePlanDigest}=await import('../src/lib/missing-service-restoration.mjs')
const {transcriptPath}=await import('../src/lib/peer-direct.mjs')
const write=(file,value)=>{mkdirSync(dirname(file),{recursive:true,mode:0o700});writeFileSync(file,JSON.stringify(value),{mode:0o600})}
let seq=0
function fixture(){
 const n=++seq,primary='local_'+randomUUID(),standby='local_'+randomUUID(),serviceId=n.toString(16).padStart(32,'0'),store=join(process.env.CLAUDE_DRIVER_APP_SUPPORT,'claude-code-sessions','account'+n,'org'),cwd=join(PROBE_DIR,'owned'+n)
 mkdirSync(cwd,{recursive:true,mode:0o700})
 const actor={sessionId:primary,serviceId,cwd,pid:42,procStart:'old-primary'},other={sessionId:standby,serviceId:'f'.repeat(32),cwd:join(PROBE_DIR,'standby'+n),pid:43,procStart:'old-standby'},record={sessionId:primary,cliSessionId:primary.slice(6),cwd,isArchived:false,permissionMode:'bypassPermissions'},file=join(store,primary+'.json')
 write(file,record);retainServiceRecoveryIdentity(getRecord(primary),{serviceId,jobId:'j'+serviceId});unlinkSync(file) // This test created the synthetic record.
 const standbyFile=join(store,standby+'.json');write(standbyFile,{sessionId:standby,cwd:other.cwd,isArchived:false});const date=new Date(Date.now()+n*1000);utimesSync(standbyFile,date,date)
 const binding={schemaVersion:2,automaticRecovery:true,enrolledAt:10,familyRequestId:'rpeer'+'f'.repeat(32),primary:actor,standby:other},bindingHash=standbyEnrollmentDigest(binding);write(join(STATE_DIR,'standby-enrollments',primary+'.json'),binding)
 const transcript=transcriptPath({cwd,sessionId:record.cliSessionId});write(transcript,{type:'synthetic-only'})
 const selected={selector:{...actor,build:'d'.repeat(64)}},status={verified:true,verificationMode:'offline-installed',sourceDisposition:'installed',sessionId:primary,serviceId,nativeEpoch:{pid:42,procStart:actor.procStart},admissionStopped:false,terminalAttemptReviewComplete:true,unresolvedRequestIds:[],build:selected.selector.build,metadataTarget:other}
 const common={select:()=>selected,absent:()=>({previousPidObservedAbsent:true,previousPid:42,previousProcStart:actor.procStart}),inspect:async()=>status,version:()=>({app:'2.42304.0',cli:'2.1.299'})}
 const inspector=()=>inspectMissingServiceImport(primary,'primary',bindingHash,{},common),retiredInspector=()=>inspectMissingServiceImport(primary,'primary',bindingHash,{}, {...common,retiredByRoot:true})
 let stage='installed'
 const lifecycle={quiesce:async()=>{assert.equal(stage,'installed');stage='quiesced';return {quiescent:true,offline:true,terminalAttemptReviewComplete:true,sessionId:primary,serviceId}},retire:async()=>{assert.equal(stage,'quiesced');stage='retired';Object.assign(status,{verificationMode:'offline-retired',sourceDisposition:'files-retired',admissionStopped:true,stopMarkerMatchesGeneration:true});write(join(cwd,'synthetic-retirement.json'),{stage});return {filesRetired:true,terminalAttemptReviewComplete:true,sessionId:primary,serviceId}}}
 return {primary,serviceId,record,file,store,transcript,bindingHash,selected,inspector,retiredInspector,lifecycle,assertRetired:()=>assert.equal(stage,'retired')}
}
test('filesystem restoration uses real enrollment/snapshot/account/transcript/claim/ledger and reports mode clamp',async()=>{
 for(const mode of ['bypassPermissions','acceptEdits']){const f=fixture(),plan=await f.inspector();assert.equal(plan.importPreparationEligible,true);let imports=0;const jobId='j'+randomUUID().replaceAll('-',''),result=await restoreMissingServiceRecord(f.primary,'primary',f.bindingHash,missingServicePlanDigest(plan),{jobId},{inspectPlan:f.inspector,inspectRetiredPlan:f.retiredInspector,...f.lifecycle,select:()=>f.selected,importRecord:async()=>{f.assertRetired();imports++;write(f.file,{...f.record,permissionMode:mode});return {result:{ok:true},focus:{synthetic:true}}}});assert.equal(imports,1);assert.equal(result.recordRestored,true);assert.equal(result.serviceRestored,false);assert.equal(result.humanPermissionRequired,mode!=='bypassPermissions');const ledger=JSON.parse(readFileSync(join(STATE_DIR,'missing-service-restorations',jobId+'.json')));assert.equal(ledger.phase,'record-restored');assert.equal(ledger.originalSnapshot.identity.sessionId,f.primary);assert.equal(ledger.importAttempted,true);assert.equal(ledger.retirement.filesRetired,true);assert.equal(ledger.result.permissionMode,mode);assert.equal(getRecord(f.primary)._file,f.file)}
})
test('actual transcript missing/linked metadata fails inspection without reading its content',async()=>{
 for(const kind of ['missing','linked']){const f=fixture();unlinkSync(f.transcript);if(kind==='linked'){const target=join(root,'synthetic-transcript-'+seq);write(target,{synthetic:true});symlinkSync(target,f.transcript)}const plan=await f.inspector();assert.equal(plan.importPreparationEligible,false);assert.equal(plan.inspectionPhase,'transcript');assert.equal(plan.effectsPerformed,false)}
})
test('wrong-account recreation remains unresolved with import intent and original exclusive claim retained',async()=>{
 const f=fixture(),plan=await f.inspector(),jobId='j'+randomUUID().replaceAll('-','');let imports=0;const foreign=join(process.env.CLAUDE_DRIVER_APP_SUPPORT,'claude-code-sessions','foreign'+seq,'org',f.primary+'.json');await assert.rejects(restoreMissingServiceRecord(f.primary,'primary',f.bindingHash,missingServicePlanDigest(plan),{jobId},{inspectPlan:f.inspector,inspectRetiredPlan:f.retiredInspector,...f.lifecycle,select:()=>f.selected,importRecord:async()=>{f.assertRetired();imports++;write(foreign,f.record);return {result:{ok:true}}}}),e=>e.detail.importAttempted===true);assert.equal(imports,1);const ledger=JSON.parse(readFileSync(join(STATE_DIR,'missing-service-restorations',jobId+'.json')));assert.equal(ledger.importAttempted,true);assert.equal(ledger.phase,'after-import');assert.ok(ledger.failure);const claim=JSON.parse(readFileSync(join(STATE_DIR,'missing-service-restorations','claims',f.serviceId+'.json')));assert.equal(claim.jobId,jobId)
})
