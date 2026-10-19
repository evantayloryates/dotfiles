// Record restoration is maintenance, never a target operation or consent bypass.
// A generation claim survives every failure; a subsequent caller inspects it
// rather than starting another import/seed with a different request identity.
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {writeFileSync,lstatSync} from 'node:fs'
import {STATE_DIR,ensureDir,withLock,writeJsonAtomic} from './state.mjs'
import {RUNTIME_BUILD,runtimeFingerprint} from './build.mjs'
import {DriverError,versions,activeStore} from './paths.mjs'
import {getRecord,callerHostSession,liveProcesses} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {readMetadataControllerEnrollment} from './metadata-controller-index.mjs'
import {ordinaryActionKind,validateOrdinaryActionIntent,assertOrdinaryActionRecipient} from './ordinary-action-intent.mjs'
import {readSessionManagementEnrollment} from './session-management-controller.mjs'
import {readStandbyEnrollment,standbyEnrollmentDigest} from './standby-enrollment.mjs'
import {readServiceRecoveryIdentity,validateServiceRecoveryIdentity} from './service-recovery-identity.mjs'
import {ordinarySessionBinding} from './ordinary-session-control.mjs'
import {loadReceiverSelection,readReceiverFile} from './receiver-runtime-selection.mjs'
import {inspectMissingServiceImport} from './missing-service-plan.mjs'
import {missingServicePlanDigest} from './missing-service-restoration.mjs'
import {inspectServiceSeedPlan} from './service-seed-plan.mjs'
import {serviceSeedPlanDigest} from './seeded-record-restoration.mjs'
import {readRestoredRecordRoot,observeRecoveryRecordProof} from './restored-record-proof.mjs'
import {inspectRestoredPair} from './restored-pair-plan.mjs'
import {restoredPairPlanDigest,runRestoredPairChild} from './restored-pair-ledger.mjs'
import {inspectIndependentService} from './independent-service-result.mjs'
import {inspectJob} from './jobs.mjs'
import {readOrdinaryRecordRecovery,observeOrdinaryRecordCheckpoint,assertOrdinaryRecordCheckpointStable} from './ordinary-record-checkpoint.mjs'
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex'),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
const job=/^j[a-f0-9]{32}$/,hex=/^[a-f0-9]{64}$/
export const ordinaryRecoveryFailure=(error,fallback)=>({category:typeof error?.category==='string'&&/^[a-z][-a-z0-9_]{0,79}$/.test(error.category)?error.category:fallback,name:['Error','TypeError','ReferenceError','RangeError','SyntaxError'].includes(error?.name)?error.name:'Error',at:Date.now()})

export async function runOrdinaryRecordRecovery(d){
 await d.guard();let kind='record',plan=await d.importPlan()
 if(plan?.importPreparationEligible!==true){kind='seeded';await d.guard();plan=await d.seedPlan()}
 if(!(kind==='record'?plan?.importPreparationEligible:plan?.seedPreparationEligible))throw Object.assign(Error('record restoration preparation unqualified'),{category:'ordinary_record_recovery_unqualified'})
 await d.guard();await d.claim(kind,plan);await d.record('before-record-restoration')
 await d.guard();const restored=await d.restore(kind,plan);await d.record('after-record-restoration')
 if(restored?.recordRestored!==true||restored.originalIdentityVerified!==true||restored.servingQualified!==false||restored.replayAuthorized!==false)throw Error('restored record receipt unqualified')
 return finishOrdinaryRecordRecovery(kind,d)
}
// Continuation calls only this suffix after independently observing the original
// terminal parent and restoration child. It cannot repeat claim/restore/seed.
export async function finishOrdinaryRecordRecovery(kind,d){
 await d.guard();const proof=await d.proveRestoration(kind);await d.record('record-proof-verified',proof)
 if(proof?.qualified!==true||!job.test(proof.rootJobId||'')||!hex.test(proof.rootSha256||''))throw Error('restoration origin unqualified')
 const pair=await d.pairPlan(kind,proof);await d.guard()
 if(pair?.pairPreparationEligible!==true){
  const result={recovered:false,targetDispatched:false,restorationKind:kind,restorationJobId:proof.rootJobId,restorationRootSha256:proof.rootSha256,reason:pair?.reason??'restored-pair-unqualified',nativeInputRequired:pair?.action==='wait',replayAuthorized:false}
  await d.record('record-restored-pair-pending',result);return result
 }
 await d.record('before-pair-reactivation');await d.guard()
 const activated=await d.reactivate(kind,proof,pair);await d.record('after-pair-reactivation')
 if(activated?.qualified!==true||activated.importRepeated!==false||activated.replayAuthorized!==false)throw Error('pair reactivation receipt unqualified')
 const verified=await d.verify(activated,pair);if(verified?.qualified!==true)throw Error('reactivated pair not independently verified')
 const result={...verified,recovered:true,targetDispatched:false,restorationKind:kind,restorationJobId:proof.rootJobId,restorationRootSha256:proof.rootSha256,reactivationJobId:activated.reactivationJobId,replayAuthorized:false}
 await d.record('recovered',result);return result
}


// Historical prepared packages are allowed only with an independently qualified
// readiness checkpoint. Normal target maintenance still requires current source.
export async function verifyOrdinaryRecoveredPair({activated,qualifiedPlan,dep,row,pair,binding,identity,version,capabilities,ctx,checkpoint,expectedBuild=RUNTIME_BUILD}){
 if(!hex.test(expectedBuild||''))throw Error('exact verified native source required')
     assertOrdinaryActionRecipient(ctx.ordinaryActionIntent,{},dep)
     if(checkpoint)await assertOrdinaryRecordCheckpointStable(checkpoint,{inspect:dep.job,signal:ctx.signal})
     if(ctx.signal?.aborted||dep.fingerprint()!==RUNTIME_BUILD||!equal(dep.version(),version)||dep.account()!==identity.storeHash||!equal(dep.enrollment(),row)||!equal(ordinarySessionBinding(dep.record(binding.sessionId),row.controllerSession),binding))throw Error('ordinary intent changed after reactivation')
     const next=dep.pair(row.controllerSession)
     if(next?.schemaVersion!==2||next.automaticRecovery!==true||activated.primarySession!==row.controllerSession||activated.standbySession!==pair.standby.sessionId||next.primary.sessionId!==row.controllerSession||next.standby.sessionId!==pair.standby.sessionId||next.primary.serviceId!==activated.serviceId||next.standby.serviceId!==activated.standbyServiceId||standbyEnrollmentDigest(next)!==activated.enrollmentSha256||['primary','standby'].some(role=>!['sessionId','cwd','pid','procStart'].every(k=>next[role][k]===qualifiedPlan.currentEpochs?.[role]?.[k])))throw Error('reactivated enrollment differs')
     const selections={},actors={}
     const savedActor=role=>{const actor=next[role],r=dep.record(actor.sessionId),b=ordinarySessionBinding(r,next[role==='primary'?'standby':'primary'].sessionId);if(b.storeHash!==identity.storeHash||r.cwd!==actor.cwd||r.cliSessionId!==actor.sessionId.slice(6)||r.permissionMode!=='bypassPermissions'||r.isArchived!==false)throw Error('reactivated account or native permissions changed');return b}
     for(const role of ['primary','standby']){const actor=next[role],selected=dep.select(actor.cwd),s=await dep.status(actor.sessionId,actor.serviceId,{signal:ctx.signal});actors[role]=savedActor(role);selections[role]=selected;if(selected.selector.sessionId!==actor.sessionId||selected.selector.serviceId!==actor.serviceId||selected.selector.pid!==actor.pid||selected.selector.procStart!==actor.procStart||selected.selector.build!==expectedBuild||s.sessionId!==actor.sessionId||s.serviceId!==actor.serviceId||s.build!==expectedBuild||s.verified!==true||s.verificationMode!=='live-native'||s.sourceDisposition!=='installed'||s.nativeEpochAssessed!==true||s.nativeEpoch?.pid!==actor.pid||s.nativeEpoch.procStart!==actor.procStart||s.nativeEpoch.status!=='idle'||s.readinessObserved!==true||s.nativePolicyObserved!==true||s.expired!==false||s.admissionStopped!==false||s.nativeInputRequired!==false||s.terminalAttemptReviewComplete!==true||!Array.isArray(s.unresolvedRequestIds)||s.unresolvedRequestIds.length||role==='primary'&&[s,selected.pointer,selected.policy].some(x=>capabilities.some(k=>x[k]!==true)))throw Error('reactivated service admission unqualified')}
     if(ctx.signal?.aborted||dep.fingerprint()!==RUNTIME_BUILD||!equal(dep.version(),version)||dep.account()!==identity.storeHash||!equal(dep.enrollment(),row)||!equal(dep.pair(row.controllerSession),next)||['primary','standby'].some(role=>!equal(dep.select(next[role].cwd),selections[role])||!equal(savedActor(role),actors[role]))||!equal(ordinarySessionBinding(dep.record(binding.sessionId),row.controllerSession),binding))throw Error('reactivated evidence changed')
     if(checkpoint)await assertOrdinaryRecordCheckpointStable(checkpoint,{inspect:dep.job,signal:ctx.signal})
     assertOrdinaryActionRecipient(ctx.ordinaryActionIntent,{},dep)
     return {qualified:true,controllerSession:row.controllerSession,serviceId:activated.serviceId,enrollmentSha256:activated.enrollmentSha256,nativeBuild:expectedBuild,currentSourceMatches:expectedBuild===RUNTIME_BUILD,sourceMaintenanceRequired:expectedBuild!==RUNTIME_BUILD}
}

// Target actions require the scheduler's original recipient snapshot in addition
// to these scoped capabilities. Recovery never dispatches or replays the target.
export async function ordinaryRecordRecoveryCapabilities(name,args,record){
 if(args.via_broker!==undefined||args.metadata_controller!==undefined||args.controller_session!==undefined||args.permission_mode!==undefined||args.transport!==undefined&&args.transport!=='native'||args.import_only===true)return null
 const action=ordinaryActionKind(name,args)
 if(action){if(record.isArchived)throw new DriverError('unarchive the ordinary target before requesting action recovery',{category:'session_archived',detail:{dispatched:false}});if(action!=='stop')(await import('./ordinary-session-control.mjs')).ordinarySessionArguments('send_message',{sessionId:record.sessionId},args.message);return ['sessionManagementControl',...action!=='send'?['sessionStopControl']:[],...action!=='stop'?['sessionSendControl']:[]]}
 const {ordinaryConfigOperations}=await import('./ordinary-session-route.mjs')
 if(name==='unarchive_session')return record.isArchived?['sessionManagementControl']:null
 if(!['pin_session','rename_session','set_session_config','archive_session'].includes(name))return null
 if(record.isArchived)throw new DriverError('unarchive the ordinary target before requesting configuration recovery',{category:'session_archived',detail:{dispatched:false,retrySafe:true}})
 if(name==='archive_session'){
  const {ordinarySessionArguments}=await import('./ordinary-session-control.mjs');ordinarySessionArguments('archive_session',{sessionId:record.sessionId},args.reason)
  return ['sessionManagementControl','sessionArchiveControl']
 }
 const ops=ordinaryConfigOperations(record.sessionId,args)
 return ['sessionManagementControl',...ops.some(o=>['set_session_title','set_session_model','set_session_effort'].includes(o.operation))?['sessionMetadataControl']:[]]
}
const owned=dir=>{const s=lstatSync(dir);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||s.mode&0o022)throw Error('record recovery directory unqualified')}
export function ordinaryRecordPendingError(controller,claim,root){
 const child=root?.children?.restore??root?.restorationOrigin,reactivation=root?.children?.reactivate,pairContinuation=root?.children?.['continue-pair']
 return new DriverError('controller record recovery is pending; inspect original children before another attempt',{category:'ordinary_controller_record_recovery_pending',detail:{controllerSession:controller,recoveryParentJobId:root?.jobId??claim.jobId,...root?.origin?{originalRecoveryParentJobId:root.generationOwnerJobId??root.origin.jobId}:{},...job.test(child?.jobId||'')?{restorationJobId:child.jobId,restorationKind:root.kind}:{},...job.test(reactivation?.jobId||'')?{reactivationJobId:reactivation.jobId}:{},...job.test(pairContinuation?.jobId||'')?{pairContinuationJobId:pairContinuation.jobId}:{},...root?.result?.restorationRootSha256?{restorationRootSha256:root.result.restorationRootSha256}:{},reason:root?.result?.reason??root?.failure?.category??'original-recovery-unresolved',targetDispatched:false,replayAuthorized:false,retrySafe:false}})
}

const pendingError=ordinaryRecordPendingError

export async function maybeRecoverOrdinaryControllerRecord(name,args,ctx={},dependencies={}){
 if(!job.test(ctx.jobId||''))return null
 if(!['pin_session','rename_session','set_session_config','archive_session','unarchive_session','send_message','stop_session','steer_session'].includes(name)||args.via_broker!==undefined||args.metadata_controller!==undefined||args.controller_session!==undefined||args.permission_mode!==undefined||args.transport!==undefined&&args.transport!=='native'||args.import_only===true)return null
 const dep={enrollment:readSessionManagementEnrollment,metadata:readMetadataControllerEnrollment,peer:peerRecord,processes:liveProcesses,pair:readStandbyEnrollment,identity:readServiceRecoveryIdentity,record:getRecord,select:loadReceiverSelection,account:()=>createHash('sha256').update(activeStore().dir).digest('hex'),caller:callerHostSession,fingerprint:runtimeFingerprint,version:versions,importPlan:inspectMissingServiceImport,seedPlan:inspectServiceSeedPlan,readRoot:readRestoredRecordRoot,job:id=>inspectJob(id,{includeResult:true}),pairPlan:inspectRestoredPair,status:inspectIndependentService,...dependencies}
 const row=dep.enrollment();if(!row||args.session===row.controllerSession)return null
 if(ordinaryActionKind(name,args)){validateOrdinaryActionIntent(ctx.ordinaryActionIntent,name,args);assertOrdinaryActionRecipient(ctx.ordinaryActionIntent,{},dep)}
 const pair=dep.pair(row.controllerSession)
 if(!pair)return null
 const digest=standbyEnrollmentDigest(pair),primary=pair.primary,base=dependencies.base??join(STATE_DIR,'ordinary-record-recoveries'),claimFile=join(base,'claims',primary.serviceId+'.json')
 const prior=()=>readOrdinaryRecordRecovery(row.controllerSession,primary.serviceId,digest,{base})
 // Even after import restores the record, the original generation claim remains
 // authoritative until a verified pair transition changes the enrollment.
 const saved=dep.record(row.controllerSession),existing=prior()
 if(saved&&!existing)return null
 const target=dep.record(args.session)
 if(!target)return null
 const capabilities=await ordinaryRecordRecoveryCapabilities(name,args,target);if(!capabilities)return null
 return withLock('ordinary-record-recovery-'+row.controllerSession,async()=>{
  assertOrdinaryActionRecipient(ctx.ordinaryActionIntent,{},dep)
  // A caller waiting on this lock may observe another caller's completed CAS.
  // It may enter normal admission against that new generation, never the old
  // recovery prefix or somebody else's target request.
  const latest=dep.pair(row.controllerSession)
  if(standbyEnrollmentDigest(latest)!==digest){if(dep.record(row.controllerSession)&&latest.primary.sessionId===row.controllerSession&&latest.primary.cwd===row.receiverCwd)return null;throw Error('ordinary pair changed during recovery admission')}
  const collision=prior();let checkpoint
  if(collision){
   try{checkpoint=await observeOrdinaryRecordCheckpoint(row.controllerSession,primary.serviceId,digest,{base,inspect:dep.job,signal:ctx.signal})}catch{throw pendingError(row.controllerSession,collision.claim,collision.root)}
   if(!(checkpoint?.suffixInspectionEligible||checkpoint?.pairReadinessInspectionEligible)||checkpoint.root.jobId===ctx.jobId)throw pendingError(row.controllerSession,collision.claim,collision.root)
  }
  if(checkpoint?.pairReadinessInspectionEligible)return (await import('./ordinary-pair-readiness.mjs')).continueOrdinaryPairReadiness({name,args,ctx,dep,row,pair,digest,base,capabilities,checkpoint,dependencies})
  if(dep.record(row.controllerSession)&&!checkpoint)return null
  let identity,binding,selection,version
  try{identity=dep.identity(primary.sessionId,primary.serviceId);binding=ordinarySessionBinding(target,row.controllerSession);selection=dep.select(primary.cwd);version=dep.version();validateServiceRecoveryIdentity(identity,{session:primary.sessionId,serviceId:primary.serviceId,...dependencies.probeRoot?{probeRoot:dependencies.probeRoot}:{}})}
  catch{throw new DriverError('ordinary controller record recovery lacks retained owner evidence; no restoration attempted',{category:'ordinary_controller_record_recovery_unqualified',detail:{controllerSession:row.controllerSession,targetDispatched:false,recordRestorationAttempted:false,replayAuthorized:false,retrySafe:true}})}
  const guard=async()=>{
   assertOrdinaryActionRecipient(ctx.ordinaryActionIntent,{},dep)
   if(checkpoint)await assertOrdinaryRecordCheckpointStable(checkpoint,{inspect:dep.job,signal:ctx.signal})
   if(ctx.signal?.aborted||dep.fingerprint()!==RUNTIME_BUILD||!equal(dep.version(),version)||!equal(dep.enrollment(),row)||standbyEnrollmentDigest(dep.pair(row.controllerSession))!==digest||pair.schemaVersion!==2||pair.automaticRecovery!==true||primary.sessionId!==row.controllerSession||primary.cwd!==row.receiverCwd||identity.cwd!==primary.cwd||identity.storeHash!==binding.storeHash||dep.account()!==identity.storeHash||!equal(dep.identity(primary.sessionId,primary.serviceId),identity)||!equal(dep.select(primary.cwd),selection)||!equal(ordinarySessionBinding(dep.record(args.session),row.controllerSession),binding)||[args.session,row.controllerSession,pair.standby.sessionId].includes(dep.caller())||[row.controllerSession,pair.standby.sessionId].includes(args.session)||[selection.pointer,selection.policy].some(p=>capabilities.some(k=>p[k]!==true)))throw Error('ordinary recovery source/account/intent/grants changed')
   assertOrdinaryActionRecipient(ctx.ordinaryActionIntent,{},dep)
  }
  let context
  const record=async(phase,result)=>{context.ledger.phase=phase;context.ledger.steps.push({phase,at:Date.now()});if(result)context.ledger.result=structuredClone(result);context.save()}
  const child=(step,submission)=>runRestoredPairChild(context,step,submission,{signal:ctx.signal,run:dependencies.run})
  try{
   const callbacks={guard,
    importPlan:()=>dep.importPlan(row.controllerSession,'primary',digest,{signal:ctx.signal}),seedPlan:()=>dep.seedPlan(row.controllerSession,'primary',digest,{signal:ctx.signal}),
    claim:async(kind,plan)=>{
     if(plan.sessionId!==primary.sessionId||plan.serviceId!==primary.serviceId||plan.enrollmentSha256!==digest||plan.identitySha256!==hash(identity))throw Error('restoration plan differs from ordinary owner')
     const claims=ensureDir(join(base,'claims'));owned(base);owned(claims)
     const claim={schemaVersion:1,jobId:ctx.jobId,controllerSession:row.controllerSession,serviceId:primary.serviceId,enrollmentSha256:digest,at:Date.now()}
     writeFileSync(claimFile,JSON.stringify(claim)+'\n',{flag:'wx',mode:0o600})
     const ledger={schemaVersion:1,jobId:ctx.jobId,runtimeBuild:RUNTIME_BUILD,controllerSession:row.controllerSession,serviceId:primary.serviceId,enrollmentSha256:digest,target:args.session,binding,operation:name,intentSha256:hash({operation:name,arguments:args}),...ctx.ordinaryActionIntent?{actionIntent:structuredClone(ctx.ordinaryActionIntent)}:{},kind,plan:structuredClone(plan),phase:'claimed',children:{},steps:[],at:Date.now(),targetDispatched:false,replayAuthorized:false}
     const file=join(base,ctx.jobId+'.json');writeFileSync(file,JSON.stringify(ledger)+'\n',{flag:'wx',mode:0o600})
     context={ledger,file,save:()=>{if(!equal(JSON.parse(readReceiverFile(claimFile,4096)),claim))throw Error('ordinary recovery claim changed');writeJsonAtomic(file,ledger)}}
    },record,
    restore:(kind,plan)=>child('restore',{operation:kind==='seeded'?'broker_service_rebuild_missing_record':'broker_service_restore_missing_record',arguments:{session:row.controllerSession,role:'primary',expected_enrollment_sha256:digest,expected_plan_sha256:kind==='seeded'?serviceSeedPlanDigest(plan):missingServicePlanDigest(plan),experimental:true},idempotency_key:'ordinary-record:'+ctx.jobId+':restore',timeout_sec:180}),
    proveRestoration:async kind=>{
     const rootJobId=checkpoint?.restorationJobId??context.ledger.children.restore.jobId,read=id=>dep.readRoot(id,{kind}),r=read(rootJobId),parent=await dep.job(rootJobId),proof=await observeRecoveryRecordProof(r.root,parent,r.claim,{rootJobId,expectedRootSha256:r.rootSha256,restorationKind:kind},{read,inspect:dep.job})
     if(r.root.primary!==row.controllerSession||r.root.role!=='primary'||r.root.expectedEnrollmentSha256!==digest||!equal(r.root.originalSnapshot.identity,identity))throw Error('restoration proof belongs to another owner')
     for(const c of Object.values(r.root.children)){const actual=await dep.job(c.jobId);if(!['jobId','operation','state','args','result'].every(k=>equal(actual[k],c.observation[k])))throw Error('actual restoration child differs')}
     const after=read(rootJobId);if(after.rootSha256!==r.rootSha256||!equal(after.claim,r.claim)||!equal(await dep.job(rootJobId),parent))throw Error('restoration origin changed')
     return proof
    },
    pairPlan:(kind,proof)=>dep.pairPlan(proof.rootJobId,proof.rootSha256,{signal:ctx.signal,restorationKind:kind}),
    reactivate:(kind,proof,plan)=>child('reactivate',{operation:'broker_service_reactivate_restored_pair',arguments:{restoration_job_id:proof.rootJobId,expected_root_sha256:proof.rootSha256,expected_plan_sha256:restoredPairPlanDigest(plan),restoration_kind:kind,experimental:true},idempotency_key:'ordinary-record:'+ctx.jobId+':reactivate',timeout_sec:240}),
    verify:(activated,qualifiedPlan)=>verifyOrdinaryRecoveredPair({activated,qualifiedPlan,dep,row,pair,binding,identity,version,capabilities,ctx,checkpoint})
   }
   let result
   if(checkpoint){
    // Inspect the never-attempted suffix before claiming it. Repeated calls
    // while the same human gate is closed do not accumulate journals/claims.
    await guard();const proof=await callbacks.proveRestoration(checkpoint.root.kind),plan=await callbacks.pairPlan(checkpoint.root.kind,proof);await guard()
    if(plan.pairPreparationEligible!==true)throw pendingError(row.controllerSession,checkpoint.claim,checkpoint.root)
    const claims=ensureDir(join(base,'continuation-claims'));owned(base);owned(claims)
    const claim={schemaVersion:1,jobId:ctx.jobId,originalJobId:checkpoint.original.jobId,originalRootSha256:checkpoint.originalRootSha256,controllerSession:row.controllerSession,serviceId:primary.serviceId,enrollmentSha256:digest,at:Date.now()},path=join(claims,checkpoint.original.jobId+'.json')
    writeFileSync(path,JSON.stringify(claim)+'\n',{flag:'wx',mode:0o600})
    const ledger={schemaVersion:1,jobId:ctx.jobId,runtimeBuild:RUNTIME_BUILD,controllerSession:row.controllerSession,serviceId:primary.serviceId,enrollmentSha256:digest,target:args.session,binding,operation:name,intentSha256:hash({operation:name,arguments:args}),...ctx.ordinaryActionIntent?{actionIntent:structuredClone(ctx.ordinaryActionIntent)}:{},kind:checkpoint.root.kind,plan:structuredClone(checkpoint.root.plan),origin:{jobId:checkpoint.original.jobId,rootSha256:checkpoint.originalRootSha256},restorationOrigin:{kind:checkpoint.root.kind,jobId:proof.rootJobId,rootSha256:proof.rootSha256},phase:'claimed',children:{},steps:[],at:Date.now(),targetDispatched:false,replayAuthorized:false}
    const file=join(base,ctx.jobId+'.json');writeFileSync(file,JSON.stringify(ledger)+'\n',{flag:'wx',mode:0o600})
    context={ledger,file,save:()=>{if(!equal(JSON.parse(readReceiverFile(path,4096)),claim)||!equal(prior()?.original,checkpoint.original))throw Error('ordinary continuation ownership changed');writeJsonAtomic(file,ledger)}}
    result=await finishOrdinaryRecordRecovery(ledger.kind,callbacks)
   }else result=await runOrdinaryRecordRecovery(callbacks)
   if(!result.recovered)throw pendingError(row.controllerSession,{jobId:ctx.jobId},context.ledger)
   return {...result,recoveryParentJobId:ctx.jobId,...checkpoint?{originalRecoveryParentJobId:checkpoint.original.jobId}:{}}
  }catch(error){
   if(context){context.ledger.failure=ordinaryRecoveryFailure(error,'ordinary-record-recovery-unresolved');context.save();if(error.category==='ordinary_controller_record_recovery_pending')throw error;throw pendingError(row.controllerSession,{jobId:ctx.jobId},context.ledger)}
   if(error.category==='ordinary_controller_record_recovery_pending')throw error
   if(error.code==='EEXIST'){const collision=prior();if(collision)throw pendingError(row.controllerSession,collision.claim,collision.root)}
   throw new DriverError('ordinary controller record recovery not admitted; inspect retained evidence',{category:'ordinary_controller_record_recovery_unqualified',detail:{controllerSession:row.controllerSession,targetDispatched:false,recordRestorationAttempted:false,replayAuthorized:false,retrySafe:false}})
  }
 },{signal:ctx.signal,timeoutMs:60000})
}
