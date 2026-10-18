import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,rmSync,mkdirSync,writeFileSync,existsSync} from 'node:fs'
import {join,dirname} from 'node:path'
import {tmpdir} from 'node:os'
import {createHash,randomUUID} from 'node:crypto'
const base=mkdtempSync(join(tmpdir(),'ordinary-record-recovery-'))
process.env.CLAUDE_DRIVER_STATE_DIR=join(base,'state')
process.env.CLAUDE_DRIVER_APP_SUPPORT=join(base,'app')
process.env.CLAUDE_DRIVER_PROJECTS_DIR=join(base,'projects')
process.env.CLAUDE_DRIVER_PEER_SESSIONS_DIR=join(base,'peers')
const {runOrdinaryRecordRecovery,maybeRecoverOrdinaryControllerRecord,ordinaryRecordRecoveryCapabilities}=await import('../lib/ordinary-record-recovery.mjs')
const {restorationFixture}=await import('./restored-record-fixture.mjs')
const {missingServicePlanDigest}=await import('../lib/missing-service-restoration.mjs')
const {standbyEnrollmentDigest}=await import('../lib/standby-enrollment.mjs')
const {RUNTIME_BUILD}=await import('../lib/build.mjs')
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex'),jid=()=> 'j'+randomUUID().replaceAll('-','')
test.after(()=>rmSync(base,{recursive:true,force:true}))

function sequence(){
 const calls=[],proof={qualified:true,rootJobId:jid(),rootSha256:'a'.repeat(64)},d={guard:async()=>calls.push('guard'),importPlan:async()=>({importPreparationEligible:true}),seedPlan:async()=>({seedPreparationEligible:true}),claim:async kind=>calls.push('claim-'+kind),record:async phase=>calls.push(phase),restore:async kind=>{calls.push('restore-'+kind);return {recordRestored:true,originalIdentityVerified:true,servingQualified:false,replayAuthorized:false}},proveRestoration:async()=>proof,pairPlan:async()=>({pairPreparationEligible:true}),reactivate:async()=>{calls.push('reactivate');return {qualified:true,importRepeated:false,replayAuthorized:false,reactivationJobId:jid()}},verify:async()=>({qualified:true})}
 return {d,calls}
}
test('record and seed selection happens before one claim/effect and target remains undispatched',async()=>{
 for(const kind of ['record','seeded']){const f=sequence();if(kind==='seeded')f.d.importPlan=async()=>({importPreparationEligible:false});const r=await runOrdinaryRecordRecovery(f.d);assert.equal(r.recovered,true);assert.equal(r.targetDispatched,false);assert.equal(r.restorationKind,kind);assert.deepEqual(f.calls.filter(x=>x.startsWith('claim-')||x.startsWith('restore-')),['claim-'+kind,'restore-'+kind]);assert.ok(f.calls.indexOf('record-proof-verified')<f.calls.indexOf('reactivate'))}
})
test('native permission/readiness gate returns preserved restoration identity without pair or target effects',async()=>{
 const f=sequence();f.d.pairPlan=async()=>({action:'wait',reason:'person-permission-required'});const r=await runOrdinaryRecordRecovery(f.d)
 assert.equal(r.recovered,false);assert.equal(r.nativeInputRequired,true);assert.equal(r.reason,'person-permission-required');assert.match(r.restorationRootSha256,/^[a-f0-9]{64}$/);assert.equal(f.calls.includes('reactivate'),false)
})
test('unqualified plans, uncertain restoration and independent proof failures never fall back or activate',async()=>{
 for(const mode of ['no-plan','restore-unknown','receipt','proof','guard']){const f=sequence();let seeded=0;f.d.seedPlan=async()=>{seeded++;return {seedPreparationEligible:false}};if(mode==='no-plan')f.d.importPlan=async()=>({importPreparationEligible:false});if(mode==='restore-unknown')f.d.restore=async()=>{throw Error('uncertain import')};if(mode==='receipt')f.d.restore=async()=>({recordRestored:true,servingQualified:true});if(mode==='proof')f.d.proveRestoration=async()=>({qualified:false});if(mode==='guard'){let calls=0;f.d.guard=async()=>{if(++calls===3)throw Error('changed account')}}await assert.rejects(runOrdinaryRecordRecovery(f.d));assert.equal(f.calls.includes('reactivate'),false);assert.equal(seeded,mode==='no-plan'?1:0)}
})

function adapterFixture({ready=false,loseObservation=false}={}){
 const f=restorationFixture(),root=f.root,pair=root.originalSnapshot.binding,primary=pair.primary,standby=pair.standby,dir=join(base,randomUUID()),target='local_33333333-3333-4333-8333-333333333333',file=s=>join(dir,'account','org',s+'.json'),storeHash=createHash('sha256').update(dirname(file(target))).digest('hex')
 primary.cwd=join(dir,'probe','primary');standby.cwd=join(dir,'probe','standby')
 const identity={schemaVersion:1,sessionId:primary.sessionId,serviceId:primary.serviceId,jobId:null,cwd:primary.cwd,cliSessionId:primary.sessionId.slice(6),permissionMode:'bypassPermissions',storeHash,capturedAt:1}
 root.originalSnapshot.identity=identity;root.originalSnapshot.selection={selector:{...primary,build:RUNTIME_BUILD},pointer:{sessionManagementControl:true,sessionMetadataControl:true,sessionArchiveControl:true},policy:{sessionManagementControl:true,sessionMetadataControl:true,sessionArchiveControl:true}}
 Object.assign(root.plan,{identitySha256:hash(identity),enrollmentSha256:standbyEnrollmentDigest(pair)});root.expectedEnrollmentSha256=root.plan.enrollmentSha256;root.expectedPlanSha256=missingServicePlanDigest(root.plan);f.claim.expectedPlanSha256=root.expectedPlanSha256
 Object.assign(f.parent.args,{expected_enrollment_sha256:root.expectedEnrollmentSha256,expected_plan_sha256:root.expectedPlanSha256})
 const enrollment={schemaVersion:1,controllerSession:primary.sessionId,receiverCwd:primary.cwd,enrolledAt:1},records={[target]:{sessionId:target,cliSessionId:target.slice(6),cwd:join(dir,'ordinary'),_file:file(target),isArchived:false},[standby.sessionId]:{sessionId:standby.sessionId,cliSessionId:standby.sessionId.slice(6),cwd:standby.cwd,_file:file(standby.sessionId),isArchived:false,permissionMode:'bypassPermissions'}},selected={[primary.cwd]:root.originalSnapshot.selection},submissions=[],jobs=new Map(Object.values(root.children).map(c=>[c.jobId,structuredClone(c.observation)]));jobs.set(root.jobId,structuredClone(f.parent))
 let current=structuredClone(pair)
 const epochs={primary:{sessionId:primary.sessionId,cwd:primary.cwd,pid:999,procStart:'restored'},standby:{sessionId:standby.sessionId,cwd:standby.cwd,pid:standby.pid,procStart:standby.procStart}}
 const d={base:join(dir,'recoveries'),probeRoot:join(dir,'probe'),enrollment:()=>structuredClone(enrollment),pair:()=>structuredClone(current),identity:()=>structuredClone(identity),record:s=>structuredClone(records[s]),select:cwd=>structuredClone(selected[cwd]),account:()=>storeHash,caller:()=>null,fingerprint:()=>RUNTIME_BUILD,version:()=>({app:'2.42304.0',cli:'2.1.299'}),importPlan:async()=>structuredClone(root.plan),seedPlan:async()=>{throw Error('must not try seed after choosing import')},readRoot:()=>({root:structuredClone(root),rootSha256:hash(root),claim:structuredClone(f.claim)}),job:async id=>structuredClone(jobs.get(id)),pairPlan:async()=>ready?{pairPreparationEligible:true,currentEpochs:epochs}:{action:'wait',reason:'person-permission-required',pairPreparationEligible:false},status:async(session,id)=>{const a=session===primary.sessionId?current.primary:current.standby;return {sessionId:session,serviceId:id,build:RUNTIME_BUILD,verified:true,verificationMode:'live-native',sourceDisposition:'installed',nativeEpochAssessed:true,nativeEpoch:{pid:a.pid,procStart:a.procStart,status:'idle'},readinessObserved:true,nativePolicyObserved:true,expired:false,admissionStopped:false,nativeInputRequired:false,terminalAttemptReviewComplete:true,unresolvedRequestIds:[],sessionManagementControl:true,sessionMetadataControl:true,sessionArchiveControl:true}}}
 d.run=async(operation,args)=>{
  if(operation==='driver_submit'){
   submissions.push(structuredClone(args));const restore=args.operation==='broker_service_restore_missing_record',id=restore?root.jobId:jid()
   if(restore){records[primary.sessionId]={sessionId:primary.sessionId,cliSessionId:primary.sessionId.slice(6),cwd:primary.cwd,_file:file(primary.sessionId),isArchived:false,permissionMode:ready?'bypassPermissions':'dontAsk'}}
   else{assert.equal(args.operation,'broker_service_reactivate_restored_pair');current={...current,primary:{...current.primary,...epochs.primary,serviceId:'7'.repeat(32)},standby:{...current.standby,serviceId:'8'.repeat(32)}};for(const role of ['primary','standby']){const a=current[role];selected[a.cwd]={selector:{...a,build:RUNTIME_BUILD},pointer:root.originalSnapshot.selection.pointer,policy:root.originalSnapshot.selection.policy}}jobs.set(id,{jobId:id,operation:args.operation,state:'completed',result:{qualified:true,primarySession:primary.sessionId,standbySession:standby.sessionId,serviceId:current.primary.serviceId,standbyServiceId:current.standby.serviceId,enrollmentSha256:standbyEnrollmentDigest(current),reactivationJobId:id,importRepeated:false,replayAuthorized:false}})}
   return {jobId:id}
  }
  if(loseObservation)throw Error('observation lost after scheduler accepted effect')
  return structuredClone(jobs.get(args.job_id))
 }
 return {d,root,identity,pair,primary,standby,target,records,selected,submissions,jobs,args:{session:target,pinned:true},ctx:{jobId:jid()},file:id=>join(d.base,id+'.json')}
}
test('production adapter retains gated recovery and later callers inspect the same import rather than repeating it',async()=>{
 const f=adapterFixture();let error
 await assert.rejects(maybeRecoverOrdinaryControllerRecord('pin_session',f.args,f.ctx,f.d),e=>{error=e;return e.category==='ordinary_controller_record_recovery_pending'&&e.detail.restorationJobId===f.root.jobId&&e.detail.reason==='person-permission-required'&&e.detail.targetDispatched===false})
 const bytes=readFileSync(f.file(f.ctx.jobId)),ledger=JSON.parse(bytes);assert.equal(ledger.phase,'record-restored-pair-pending');assert.equal(ledger.targetDispatched,false);assert.equal(ledger.children.restore.jobId,f.root.jobId);assert.equal(f.submissions.length,1)
 await assert.rejects(maybeRecoverOrdinaryControllerRecord('pin_session',f.args,{jobId:jid()},f.d),e=>e.detail.recoveryParentJobId===error.detail.recoveryParentJobId)
 assert.equal(f.submissions.length,1);assert.deepEqual(readFileSync(f.file(f.ctx.jobId)),bytes)
})
test('production adapter admits target only after actual restoration children and both current pair epochs qualify',async()=>{
 const f=adapterFixture({ready:true}),r=await maybeRecoverOrdinaryControllerRecord('pin_session',f.args,f.ctx,f.d)
 assert.equal(r.recovered,true);assert.equal(r.targetDispatched,false);assert.equal(r.serviceId,'7'.repeat(32));assert.equal(f.submissions.length,2);assert.equal(JSON.parse(readFileSync(f.file(f.ctx.jobId))).phase,'recovered');assert.equal(f.records[f.target].pinned,undefined)
 // The qualified CAS selected a different generation; its old claim must not
 // block subsequent ordinary operations or create another child.
 assert.equal(await maybeRecoverOrdinaryControllerRecord('pin_session',f.args,{jobId:jid()},f.d),null);assert.equal(f.submissions.length,2)
})
test('post-submission uncertainty retains scheduler handle and generation claim without a second import',async()=>{
 const f=adapterFixture({loseObservation:true});await assert.rejects(maybeRecoverOrdinaryControllerRecord('pin_session',f.args,f.ctx,f.d),e=>e.detail.restorationJobId===f.root.jobId)
 const bytes=readFileSync(f.file(f.ctx.jobId));assert.equal(JSON.parse(bytes).children.restore.jobId,f.root.jobId)
 await assert.rejects(maybeRecoverOrdinaryControllerRecord('pin_session',f.args,{jobId:jid()},f.d));assert.equal(f.submissions.length,1);assert.deepEqual(readFileSync(f.file(f.ctx.jobId)),bytes)
})
test('foreign account, changed original grants, disabled enrollment and actual child tampering stop later effects',async()=>{
 for(const mode of ['account','grants','disabled','child']){const f=adapterFixture({ready:true});if(mode==='account')f.d.account=()=>'f'.repeat(64);if(mode==='grants')delete f.selected[f.primary.cwd].policy.sessionManagementControl;if(mode==='disabled')f.d.pair=()=>({...f.pair,automaticRecovery:false});if(mode==='child')f.jobs.get(f.root.children.retire.jobId).result.filesRetired=false
  await assert.rejects(maybeRecoverOrdinaryControllerRecord('pin_session',f.args,f.ctx,f.d));assert.equal(f.submissions.length,mode==='child'?1:0)
 }
})
test('invalid or explicitly selected alternate routes do not initiate automatic record recovery',async()=>{
 const f=adapterFixture()
 for(const [name,args]of [['send_message',{session:f.target,message:'test'}],['stop_session',{session:f.target}],['pin_session',{...f.args,metadata_controller:f.standby.sessionId}],['set_session_config',{session:f.target,permission_mode:'bypassPermissions'}]])assert.equal(await maybeRecoverOrdinaryControllerRecord(name,args,f.ctx,f.d),null)
 await assert.rejects(ordinaryRecordRecoveryCapabilities('rename_session',{title:''},f.records[f.target]));await assert.rejects(ordinaryRecordRecoveryCapabilities('set_session_config',{},f.records[f.target]));assert.equal(f.submissions.length,0)
})
test('final independent read rejects wrong service, lowered actual mode, unknown work and source/account/selection races',async()=>{
 for(const mode of ['service','permissions','unknown','source','account','selection']){
  const f=adapterFixture({ready:true}),status=f.d.status,select=f.d.select;let changed=false
  f.d.status=async(...args)=>{const s=await status(...args);if(mode==='service')s.serviceId='9'.repeat(32);if(mode==='permissions')f.records[f.primary.sessionId].permissionMode='dontAsk';if(mode==='unknown')s.unresolvedRequestIds=['unknown'];changed=true;return s}
  if(mode==='source')f.d.fingerprint=()=>changed?'f'.repeat(64):RUNTIME_BUILD
  if(mode==='account'){const account=f.d.account;f.d.account=()=>changed?'f'.repeat(64):account()}
  if(mode==='selection')f.d.select=cwd=>{const s=select(cwd);if(changed&&cwd===f.primary.cwd)s.selector.pid=400;return s}
  await assert.rejects(maybeRecoverOrdinaryControllerRecord('pin_session',f.args,f.ctx,f.d),e=>e.category==='ordinary_controller_record_recovery_pending')
  assert.equal(f.submissions.length,2);assert.equal(JSON.parse(readFileSync(f.file(f.ctx.jobId))).targetDispatched,false)
 }
})
test('actual durable public pin admission refuses missing owner evidence without legacy fallback or target writes',async()=>{
 const f=adapterFixture(),state=process.env.CLAUDE_DRIVER_STATE_DIR,store=join(process.env.CLAUDE_DRIVER_APP_SUPPORT,'claude-code-sessions','fixture','org'),record={sessionId:f.target,cliSessionId:f.target.slice(6),title:'ordinary fixture',cwd:join(base,'public-target'),isArchived:false}
 const write=(path,value)=>{mkdirSync(dirname(path),{recursive:true,mode:0o700});writeFileSync(path,JSON.stringify(value),{mode:0o600})}
 write(join(store,f.target+'.json'),record);write(join(state,'session-management-controller.json'),f.d.enrollment());write(join(state,'standby-enrollments',f.primary.sessionId+'.json'),f.pair)
 const {runOp}=await import('../lib/driver.mjs'),submission={operation:'pin_session',arguments:{session:f.target,pinned:true},idempotency_key:'public-missing-controller-owner',timeout_sec:10},submitted=await runOp('driver_submit',submission,{harness:'synthetic'})
 const observed=await runOp('driver_wait',{job_id:submitted.jobId,timeout_sec:20,include_result:true})
 assert.equal(observed.state,'failed');assert.equal(observed.error.category,'ordinary_controller_record_recovery_unqualified');assert.equal(observed.error.detail.targetDispatched,false);assert.deepEqual(JSON.parse(readFileSync(join(store,f.target+'.json'))),record);assert.equal(existsSync(join(state,'ordinary-record-recoveries')),false)
 assert.equal((await runOp('driver_submit',submission)).jobId,submitted.jobId)
})
