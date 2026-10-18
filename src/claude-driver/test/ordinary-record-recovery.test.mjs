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
const {observeOrdinaryRecordCheckpoint,inspectOrdinaryRecordRecovery}=await import('../lib/ordinary-record-checkpoint.mjs')
const {pairReadinessFixture}=await import('./restored-pair-readiness-fixture.mjs')
const {readPairReadinessCheckpoint,pairReadinessCheckpointDigest}=await import('../lib/restored-pair-readiness-checkpoint.mjs')
const {restoredPairPlanDigest,restoredPairChildSubmission}=await import('../lib/restored-pair-ledger.mjs')
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
   else{assert.equal(args.operation,'broker_service_reactivate_restored_pair');current={...current,primary:{...current.primary,...epochs.primary,serviceId:'7'.repeat(32)},standby:{...current.standby,serviceId:'8'.repeat(32)}};for(const role of ['primary','standby']){const a=current[role];selected[a.cwd]={selector:{...a,build:RUNTIME_BUILD},pointer:root.originalSnapshot.selection.pointer,policy:root.originalSnapshot.selection.policy}}jobs.set(id,{jobId:id,operation:args.operation,args:structuredClone(args.arguments),state:'completed',result:{qualified:true,primarySession:primary.sessionId,standbySession:standby.sessionId,serviceId:current.primary.serviceId,standbyServiceId:current.standby.serviceId,enrollmentSha256:standbyEnrollmentDigest(current),reactivationJobId:id,importRepeated:false,replayAuthorized:false}})}
   return {jobId:id}
  }
  if(loseObservation)throw Error('observation lost after scheduler accepted effect')
  return structuredClone(jobs.get(args.job_id))
 }
 return {d,root,identity,pair,primary,standby,target,records,selected,submissions,jobs,epochs,args:{session:target,pinned:true},ctx:{jobId:jid()},file:id=>join(d.base,id+'.json')}
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
 const status=await runOp('broker_service_controller_record_status',{session:f.primary.sessionId});assert.equal(status.configured,false);assert.equal(status.nativeEffectsRequested,0)
})

async function pendingFixture(options={}){
 const f=adapterFixture(options);let error
 await assert.rejects(maybeRecoverOrdinaryControllerRecord('pin_session',f.args,f.ctx,f.d),e=>{error=e;return e.category==='ordinary_controller_record_recovery_pending'})
 f.jobs.set(f.ctx.jobId,{jobId:f.ctx.jobId,operation:'pin_session',state:'failed',args:structuredClone(f.args),error:{category:error.category,detail:structuredClone(error.detail)}})
 f.error=error;f.originalBytes=readFileSync(f.file(f.ctx.jobId))
 f.checkpointOptions={base:f.d.base,inspect:f.d.job};f.digest=standbyEnrollmentDigest(f.pair)
 f.clearGate=()=>{f.records[f.primary.sessionId].permissionMode='bypassPermissions';f.d.pairPlan=async()=>({pairPreparationEligible:true,currentEpochs:f.epochs})}
 return f
}
test('exact failed ordinary parent and completed actual child qualify only suffix inspection, without effects or private snapshots',async()=>{
 const f=await pendingFixture(),s=await inspectOrdinaryRecordRecovery(f.primary.sessionId,f.primary.serviceId,f.digest,f.checkpointOptions)
 assert.equal(s.checkpointVerified,true);assert.equal(s.suffixInspectionEligible,true);assert.equal(s.children.restore.jobId,f.root.jobId);assert.equal(s.parentState,'failed');assert.equal(s.nativeEpochAssessed,false);assert.equal(s.nativeEffectsRequested,0);assert.equal(JSON.stringify(s).includes(f.primary.cwd),false);assert.deepEqual(readFileSync(f.file(f.ctx.jobId)),f.originalBytes);assert.equal(f.submissions.length,1)
})
test('after native gate clears, a separately claimed suffix reuses import and leaves original failed root untouched',async()=>{
 const f=await pendingFixture();f.clearGate();const ctx={jobId:jid()},result=await maybeRecoverOrdinaryControllerRecord('pin_session',f.args,ctx,f.d)
 assert.equal(result.recovered,true);assert.equal(result.originalRecoveryParentJobId,f.ctx.jobId);assert.equal(result.restorationJobId,f.root.jobId);assert.equal(f.submissions.length,2);assert.equal(f.submissions.filter(x=>x.operation==='broker_service_restore_missing_record').length,1)
 const next=JSON.parse(readFileSync(f.file(ctx.jobId)));assert.equal(next.origin.jobId,f.ctx.jobId);assert.equal(next.children.restore,undefined);assert.equal(next.children.reactivate.jobId,result.reactivationJobId);assert.equal(next.targetDispatched,false);assert.deepEqual(readFileSync(f.file(f.ctx.jobId)),f.originalBytes)
})
test('closed native gate creates no suffix claim, and active/uncertain parent or tampered actual child cannot continue',async()=>{
 for(const mode of ['closed','running','unknown','intent','child']){
  const f=await pendingFixture();if(mode!=='closed')f.clearGate();const p=f.jobs.get(f.ctx.jobId)
  if(mode==='running')p.state='running';if(mode==='unknown')p.error.category='outcome_unknown';if(mode==='intent')p.args.pinned=false;if(mode==='child')f.jobs.get(f.root.children.retire.jobId).result.filesRetired=false
  await assert.rejects(maybeRecoverOrdinaryControllerRecord('pin_session',f.args,{jobId:jid()},f.d));assert.equal(f.submissions.length,1);assert.equal(existsSync(join(f.d.base,'continuation-claims')),false);assert.deepEqual(readFileSync(f.file(f.ctx.jobId)),f.originalBytes)
 }
})
test('concurrent metadata callers claim one suffix; a waiter observes the new generation without replaying the old prefix',async()=>{
 const f=await pendingFixture();f.clearGate();const results=await Promise.allSettled([maybeRecoverOrdinaryControllerRecord('pin_session',f.args,{jobId:jid()},f.d),maybeRecoverOrdinaryControllerRecord('pin_session',f.args,{jobId:jid()},f.d)])
 assert.equal(results.filter(r=>r.status==='fulfilled'&&r.value?.recovered).length,1);assert.equal(f.submissions.length,2);assert.equal(f.submissions.filter(s=>s.operation==='broker_service_restore_missing_record').length,1);assert.deepEqual(readFileSync(f.file(f.ctx.jobId)),f.originalBytes)
 for(const r of results)if(r.status==='rejected')assert.equal(r.reason.category,'ordinary_controller_record_recovery_pending')
})
test('a now-completed original restoration can be independently adopted after observation loss, without another import',async()=>{
 const f=await pendingFixture({loseObservation:true});f.clearGate();const run=f.d.run;f.d.run=async(op,args)=>op==='driver_wait'?structuredClone(f.jobs.get(args.job_id)):run(op,args)
 const r=await maybeRecoverOrdinaryControllerRecord('pin_session',f.args,{jobId:jid()},f.d);assert.equal(r.recovered,true);assert.equal(f.submissions.length,2);assert.deepEqual(readFileSync(f.file(f.ctx.jobId)),f.originalBytes)
})
test('read-only checkpoint refuses changed original parent, false child arguments and an origin race',async()=>{
 for(const mode of ['parent','child','race']){
  const f=await pendingFixture();if(mode==='parent')f.jobs.get(f.ctx.jobId).operation='send_message';if(mode==='child')f.jobs.get(f.root.jobId).args.role='standby'
  const options={...f.checkpointOptions};if(mode==='race'){const inspect=options.inspect;options.inspect=async id=>{const r=await inspect(id);if(id===f.root.jobId)f.jobs.get(f.ctx.jobId).state='running';return r}}
  const r=await inspectOrdinaryRecordRecovery(f.primary.sessionId,f.primary.serviceId,f.digest,options);assert.equal(r.checkpointVerified,false);assert.equal(r.suffixInspectionEligible,false);assert.equal(r.nativeEffectsRequested,0);assert.equal(f.submissions.length,1)
 }
})
test('a failed claimed suffix remains independently visible and is never submitted a second time',async()=>{
 const f=await pendingFixture();f.clearGate();const run=f.d.run,ctx={jobId:jid()}
 f.d.run=async(op,args)=>{const r=await run(op,args);if(op==='driver_submit'&&args.operation==='broker_service_reactivate_restored_pair'){const actual=f.jobs.get(r.jobId);actual.state='failed';actual.error={category:'restored_pair_unresolved'};delete actual.result}return r}
 // Keep the original enrollment for a simulated pre-CAS native loader failure.
 f.d.pair=()=>structuredClone(f.pair)
 let error;await assert.rejects(maybeRecoverOrdinaryControllerRecord('pin_session',f.args,ctx,f.d),e=>{error=e;return e.category==='ordinary_controller_record_recovery_pending'})
 f.jobs.set(ctx.jobId,{jobId:ctx.jobId,operation:'pin_session',state:'failed',args:f.args,error:{category:error.category,detail:error.detail}})
 await observeOrdinaryRecordCheckpoint(f.primary.sessionId,f.primary.serviceId,f.digest,f.checkpointOptions)
 const status=await inspectOrdinaryRecordRecovery(f.primary.sessionId,f.primary.serviceId,f.digest,f.checkpointOptions)
 assert.equal(status.checkpointVerified,true);assert.equal(status.recoveryParentJobId,ctx.jobId);assert.equal(status.originalRecoveryParentJobId,f.ctx.jobId);assert.equal(status.suffixInspectionEligible,false);assert.equal(status.children.leafPair.state,'failed')
 const bytes=readFileSync(f.file(ctx.jobId));await assert.rejects(maybeRecoverOrdinaryControllerRecord('pin_session',f.args,{jobId:jid()},f.d),e=>e.detail.recoveryParentJobId===ctx.jobId);assert.equal(f.submissions.length,2);assert.deepEqual(readFileSync(f.file(ctx.jobId)),bytes);assert.deepEqual(readFileSync(f.file(f.ctx.jobId)),f.originalBytes)
})

// The adapter uses real ordinary/native checkpoint readers and private claims.
// Current native package readiness and effects are simulated; the existing
// native qualifier/continuation suites exercise those separate adapters.
async function nativeReadinessFixture({build='8'.repeat(64),loseObservation=false}={}){
 const f=await pendingFixture();f.clearGate()
 const n=pairReadinessFixture(),r=n.root,p=r.plan,readinessOwner={jobId:jid()},nativeDir=join(f.d.base,'native-pair'),write=(path,value)=>{mkdirSync(dirname(path),{recursive:true,mode:0o700});writeFileSync(path,JSON.stringify(value),{mode:0o600})}
 Object.assign(p,{rootJobId:f.root.jobId,rootSha256:hash(f.root),enrollmentSha256:f.digest,currentEpochs:structuredClone(f.epochs),originalServiceIds:{primary:f.primary.serviceId,standby:f.standby.serviceId},restorationKind:'record'})
 p.roles.primary.bindings.metadataTarget=structuredClone(f.epochs.standby);p.roles.standby.bindings.archiveTarget=structuredClone(f.epochs.primary)
 p.roles.primary.grants={sessionManagementControl:true,sessionMetadataControl:true,sessionArchiveControl:true};Object.assign(p.roles.primary.prepareArguments,{session_management_control:true,session_metadata_control:true,session_archive_control:true});p.rolesSha256=restoredPairPlanDigest(p.roles)
 r.runtimeBuild=build;r.expectedPlanSha256=restoredPairPlanDigest(p);r.results.preflight=p
 f.selected[f.standby.cwd]={selector:{...f.standby,build:RUNTIME_BUILD},pointer:{},policy:{}}
 for(const role of ['primary','standby']){const actor=f.pair[role];r.snapshots[role].selection=structuredClone(f.selected[actor.cwd]);r.snapshots[role].identity={version:1,sessionId:actor.sessionId,cwd:actor.cwd,cliSessionId:actor.sessionId.slice(6),storeHash:f.identity.storeHash}}
 for(const [step,c]of Object.entries(r.children)){
  const role=step==='prepare-primary'||step==='activate-primary'?'primary':'standby'
  c.submission=step==='activate-primary'?{operation:'broker_service_activate',arguments:{session:f.primary.sessionId,service_id:r.results['prepare-primary'].serviceId,experimental:true,stable_hook:true,cold_rebind:true},idempotency_key:'restored-pair:'+r.jobId+':'+step}:restoredPairChildSubmission(p,r.jobId,step)
  if(step.startsWith('prepare-'))r.results[step].build=build
  r.results[step].sessionId=f.pair[role].sessionId;c.observation={jobId:c.jobId,operation:c.submission.operation,args:c.submission.arguments,state:'completed',result:structuredClone(r.results[step])};f.jobs.set(c.jobId,structuredClone(c.observation))
 }
 Object.assign(n.claim,{restorationRootSha256:p.rootSha256,expectedPlanSha256:r.expectedPlanSha256});write(join(nativeDir,'claims',p.rootJobId+'.json'),n.claim)
 f.d.pairPlan=async()=>structuredClone(p)
 const previous=f.d.run
 f.d.run=async(op,args)=>{
  if(op==='driver_submit'&&args.operation==='broker_service_reactivate_restored_pair'){
   f.submissions.push(structuredClone(args));const parent=structuredClone(n.parent);parent.runtimeBuild=build;parent.args=structuredClone(args.arguments);f.jobs.set(r.jobId,parent)
   f.selected[f.primary.cwd]={selector:{...f.epochs.primary,serviceId:r.results['prepare-primary'].serviceId,build},pointer:r.plan.roles.primary.grants,policy:r.plan.roles.primary.grants}
   return {jobId:r.jobId}
  }
  return previous(op,args)
 }
 let error;await assert.rejects(maybeRecoverOrdinaryControllerRecord('pin_session',f.args,readinessOwner,f.d),e=>{error=e;return e.category==='ordinary_controller_record_recovery_pending'})
 f.jobs.set(readinessOwner.jobId,{jobId:readinessOwner.jobId,operation:'pin_session',args:structuredClone(f.args),state:'failed',error:{category:error.category,detail:error.detail}})
 const ownerBytes=readFileSync(f.file(readinessOwner.jobId)),nativeBytes=Buffer.from(JSON.stringify(r)),nativeSha=pairReadinessCheckpointDigest(r)
 f.d.readinessRoot=()=>structuredClone(r)
 f.d.readinessCheckpoint=(id,sha)=>readPairReadinessCheckpoint(id,sha,{dir:nativeDir,read:()=>structuredClone(r),readRestoration:()=>f.d.readRoot(),inspect:f.d.job})
 f.d.readinessPlan=async(id,sha)=>({continuationEligible:true,originalJobId:id,originalRootSha256:sha,restorationJobId:p.rootJobId,restorationKind:'record',preparedServiceIds:{primary:r.results['prepare-primary'].serviceId,standby:r.results['prepare-standby'].serviceId},prefixEffectsRepeated:false,replayAuthorized:false})
 f.d.readinessContinuationClaim=()=>null
 let binding=structuredClone(f.pair);f.d.pair=()=>structuredClone(binding)
 f.d.status=async(session,id)=>{const a=session===f.primary.sessionId?binding.primary:binding.standby;return {sessionId:session,serviceId:id,build,verified:true,verificationMode:'live-native',sourceDisposition:'installed',nativeEpochAssessed:true,nativeEpoch:{pid:a.pid,procStart:a.procStart,status:'idle'},readinessObserved:true,nativePolicyObserved:true,expired:false,admissionStopped:false,nativeInputRequired:false,terminalAttemptReviewComplete:true,unresolvedRequestIds:[],...p.roles.primary.grants}}
 f.d.run=async(op,args)=>{
  if(op==='driver_submit'){
   assert.equal(args.operation,'broker_service_continue_restored_pair');f.submissions.push(structuredClone(args));const id=jid()
   binding={...binding,primary:{...binding.primary,...f.epochs.primary,serviceId:r.results['prepare-primary'].serviceId},standby:{...binding.standby,serviceId:r.results['prepare-standby'].serviceId}}
   for(const role of ['primary','standby']){const a=binding[role];f.selected[a.cwd]={selector:{...a,build},pointer:p.roles.primary.grants,policy:p.roles.primary.grants}}
   f.jobs.set(id,{jobId:id,operation:args.operation,args:structuredClone(args.arguments),state:'completed',result:{qualified:true,restorationJobId:p.rootJobId,reactivationJobId:id,primarySession:f.primary.sessionId,standbySession:f.standby.sessionId,serviceId:binding.primary.serviceId,standbyServiceId:binding.standby.serviceId,enrollmentSha256:standbyEnrollmentDigest(binding),importRepeated:false,replayAuthorized:false}})
   return {jobId:id}
  }
  if(loseObservation)throw Error('simulated lost readiness suffix observation')
  return structuredClone(f.jobs.get(args.job_id))
 }
 return {...f,native:r,nativeSha,readinessOwner,ownerBytes,nativeBytes}
}
test('ordinary admission composes the exact failed readiness prefix once and preserves old prepared source identity',async()=>{
 for(const build of ['8'.repeat(64),RUNTIME_BUILD]){
 const f=await nativeReadinessFixture({build}),ctx={jobId:jid()},r=await maybeRecoverOrdinaryControllerRecord('pin_session',f.args,ctx,f.d)
 assert.equal(r.recovered,true);assert.equal(r.nativeBuild,build);assert.equal(r.currentSourceMatches,build===RUNTIME_BUILD);assert.equal(r.sourceMaintenanceRequired,build!==RUNTIME_BUILD);assert.equal(r.prefixEffectsRepeated,false);assert.equal(r.originalReactivationJobId,f.native.jobId)
 assert.deepEqual(f.submissions.map(x=>x.operation),['broker_service_restore_missing_record','broker_service_reactivate_restored_pair','broker_service_continue_restored_pair']);assert.deepEqual(readFileSync(f.file(f.ctx.jobId)),f.originalBytes);assert.deepEqual(readFileSync(f.file(f.readinessOwner.jobId)),f.ownerBytes);assert.deepEqual(Buffer.from(JSON.stringify(f.native)),f.nativeBytes)
 const root=JSON.parse(readFileSync(f.file(ctx.jobId)));assert.equal(root.children.restore,undefined);assert.equal(root.children.reactivate,undefined);assert.equal(root.pairReadinessOrigin.rootSha256,f.nativeSha);assert.equal(root.targetDispatched,false)
 }
})
test('readiness remains pending without a new claim on closed eligibility, changed grants, wrong actual child or existing native claim',async()=>{
 for(const mode of ['gate','grant','child','native-claim']){
  const f=await nativeReadinessFixture()
  if(mode==='gate')f.d.readinessPlan=async()=>({continuationEligible:false})
  if(mode==='grant')f.native.plan.roles.primary.grants.sessionManagementControl=false
  if(mode==='child')f.jobs.get(f.native.children['activate-primary'].jobId).result.installed=false
  if(mode==='native-claim'){const id=jid();f.d.readinessContinuationClaim=()=>({originalJobId:f.native.jobId,originalRootSha256:f.nativeSha,restorationJobId:f.root.jobId,restorationRootSha256:f.native.plan.rootSha256,expectedPlanSha256:f.native.expectedPlanSha256,continuationJobId:id});f.jobs.set(id,{jobId:id,operation:'broker_service_continue_restored_pair',args:{original_job_id:f.native.jobId,expected_original_root_sha256:f.nativeSha,experimental:true},state:'running'})}
  await assert.rejects(maybeRecoverOrdinaryControllerRecord('pin_session',f.args,{jobId:jid()},f.d),e=>e.category==='ordinary_controller_record_recovery_pending');assert.equal(f.submissions.length,2);assert.equal(existsSync(join(f.d.base,'pair-continuation-claims')),false)
 }
})
test('concurrent callers submit a single readiness suffix and do not repeat activation or import',async()=>{
 const f=await nativeReadinessFixture(),results=await Promise.allSettled([maybeRecoverOrdinaryControllerRecord('pin_session',f.args,{jobId:jid()},f.d),maybeRecoverOrdinaryControllerRecord('pin_session',f.args,{jobId:jid()},f.d)])
 assert.equal(results.filter(x=>x.status==='fulfilled'&&x.value?.recovered).length,1);assert.equal(f.submissions.length,3);assert.equal(f.submissions.filter(x=>x.operation==='broker_service_continue_restored_pair').length,1)
})
test('unknown readiness suffix observation retains original scheduler handle and prevents another continuation',async()=>{
 const f=await nativeReadinessFixture({loseObservation:true}),ctx={jobId:jid()};let error
 await assert.rejects(maybeRecoverOrdinaryControllerRecord('pin_session',f.args,ctx,f.d),e=>{error=e;return e.category==='ordinary_controller_record_recovery_pending'&&!!e.detail.pairContinuationJobId})
 f.jobs.set(ctx.jobId,{jobId:ctx.jobId,operation:'pin_session',args:f.args,state:'failed',error:{category:error.category,detail:error.detail}})
 assert.equal(JSON.parse(readFileSync(f.file(ctx.jobId))).failure.name,'Error')
 // Preserve pre-CAS enrollment to exercise pending lineage inspection rather
 // than normal admission after an independently completed CAS.
 f.d.pair=()=>structuredClone(f.pair)
 const s=await inspectOrdinaryRecordRecovery(f.primary.sessionId,f.primary.serviceId,f.digest,f.checkpointOptions)
 assert.equal(s.checkpointVerified,true);assert.equal(s.recoveryParentJobId,ctx.jobId);assert.equal(s.pairReadinessInspectionEligible,false);assert.equal(s.children.pairContinuation.jobId,error.detail.pairContinuationJobId)
 const bytes=readFileSync(f.file(ctx.jobId));await assert.rejects(maybeRecoverOrdinaryControllerRecord('pin_session',f.args,{jobId:jid()},f.d));assert.equal(f.submissions.length,3);assert.deepEqual(readFileSync(f.file(ctx.jobId)),bytes)
})
