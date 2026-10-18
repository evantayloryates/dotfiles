// Compose the existing exact native checkpoint continuation. This adapter owns
// only a new maintenance suffix; it cannot seed/import, activate the primary a
// second time, or replay the original metadata target operation.
import {join} from 'node:path'
import {assertOrdinaryActionRecipient} from './ordinary-action-intent.mjs'
import {writeFileSync,lstatSync} from 'node:fs'
import {STATE_DIR,ensureDir,writeJsonAtomic} from './state.mjs'
import {RUNTIME_BUILD} from './build.mjs'
import {readReceiverFile} from './receiver-runtime-selection.mjs'
import {ordinarySessionBinding} from './ordinary-session-control.mjs'
import {validateServiceRecoveryIdentity} from './service-recovery-identity.mjs'
import {standbyEnrollmentDigest} from './standby-enrollment.mjs'
import {readRestoredPairRoot} from './restored-pair-proof.mjs'
import {readPairReadinessCheckpoint,pairReadinessCheckpointDigest} from './restored-pair-readiness-checkpoint.mjs'
import {inspectPairReadinessContinuation} from './restored-pair-readiness-continuation.mjs'
import {runRestoredPairChild} from './restored-pair-ledger.mjs'
import {ordinaryRecordCheckpointDigest,readOrdinaryRecordRecovery,assertOrdinaryRecordCheckpointStable} from './ordinary-record-checkpoint.mjs'
import {verifyOrdinaryRecoveredPair,ordinaryRecordPendingError,ordinaryRecoveryFailure} from './ordinary-record-recovery.mjs'
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),job=/^j[a-f0-9]{32}$/,hex=/^[a-f0-9]{64}$/
const owned=dir=>{const s=lstatSync(dir);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||s.mode&0o022)throw Error('ordinary readiness directory unqualified')}
const existingNativeClaim=id=>{try{return JSON.parse(readReceiverFile(join(STATE_DIR,'restored-pair-reactivations','continuation-claims',id+'.json'),4096))}catch(e){if(e.code==='ENOENT')return null;throw e}}

export async function continueOrdinaryPairReadiness({name,args,ctx,dep,row,pair,digest,base,capabilities,checkpoint,dependencies={}}){
 const pending=()=>ordinaryRecordPendingError(row.controllerSession,checkpoint.claim,checkpoint.root)
 const readNative=dependencies.readinessRoot??readRestoredPairRoot,readCheckpoint=dependencies.readinessCheckpoint??readPairReadinessCheckpoint,planNative=dependencies.readinessPlan??inspectPairReadinessContinuation,nativeClaim=dependencies.readinessContinuationClaim??existingNativeClaim
 let context
 try{
  const candidate=checkpoint.pairReadinessCandidate,pairJobId=candidate?.jobId
  if(!checkpoint.pairReadinessInspectionEligible||!job.test(pairJobId||'')||candidate.state!=='failed'||checkpoint.pairContinuation)throw pending()
  const nativeRoot=readNative(pairJobId),nativeSha256=pairReadinessCheckpointDigest(nativeRoot),native=await readCheckpoint(pairJobId,nativeSha256),p=native.root.plan,expectedBuild=native.root.runtimeBuild
  if(!equal(native.root,nativeRoot)||!equal(native.parent,candidate)||native.proof?.qualified!==true||native.root.jobId!==pairJobId||native.proof.originalJobId!==pairJobId||native.proof.originalRootSha256!==nativeSha256||p.rootJobId!==checkpoint.restorationJobId||p.rootSha256!==candidate.args.expected_root_sha256||(p.restorationKind??'record')!==checkpoint.original.kind||p.enrollmentSha256!==digest||p.restoredRole!=='primary'||p.currentEpochs.primary.sessionId!==row.controllerSession||p.currentEpochs.standby.sessionId!==pair.standby.sessionId||p.originalServiceIds.primary!==pair.primary.serviceId||p.originalServiceIds.standby!==pair.standby.serviceId||!hex.test(expectedBuild||''))throw Error('ordinary native checkpoint belongs to another recovery')
  const identity=dep.identity(pair.primary.sessionId,pair.primary.serviceId),binding=ordinarySessionBinding(dep.record(args.session),row.controllerSession),version=dep.version()
  validateServiceRecoveryIdentity(identity,{session:pair.primary.sessionId,serviceId:pair.primary.serviceId,...dependencies.probeRoot?{probeRoot:dependencies.probeRoot}:{}})
  const guard=async()=>{
   assertOrdinaryActionRecipient(ctx.ordinaryActionIntent,{},dep)
   await assertOrdinaryRecordCheckpointStable(checkpoint,{inspect:dep.job,signal:ctx.signal})
   if(ctx.signal?.aborted||dep.fingerprint()!==RUNTIME_BUILD||!equal(dep.version(),version)||!equal(version,native.root.versions)||!equal(dep.enrollment(),row)||standbyEnrollmentDigest(dep.pair(row.controllerSession))!==digest||pair.schemaVersion!==2||pair.automaticRecovery!==true||pair.primary.cwd!==row.receiverCwd||identity.cwd!==row.receiverCwd||identity.storeHash!==binding.storeHash||dep.account()!==identity.storeHash||!equal(dep.identity(pair.primary.sessionId,pair.primary.serviceId),identity)||!equal(ordinarySessionBinding(dep.record(args.session),row.controllerSession),binding)||[row.controllerSession,pair.standby.sessionId].includes(args.session)||[args.session,row.controllerSession,pair.standby.sessionId].includes(dep.caller())||capabilities.some(k=>p.roles?.primary?.grants?.[k]!==true)||!equal(readNative(pairJobId),nativeRoot)||!equal(await readCheckpoint(pairJobId,nativeSha256),native))throw Error('ordinary readiness source/account/intent/prefix changed')
   assertOrdinaryActionRecipient(ctx.ordinaryActionIntent,{},dep)
   const claim=nativeClaim(pairJobId)
   if(claim){
    const error=pending()
    if(claim.originalJobId===pairJobId&&claim.originalRootSha256===nativeSha256&&claim.restorationJobId===p.rootJobId&&claim.restorationRootSha256===p.rootSha256&&claim.expectedPlanSha256===native.root.expectedPlanSha256&&job.test(claim.continuationJobId||'')){
     const actual=await dep.job(claim.continuationJobId),expected={original_job_id:pairJobId,expected_original_root_sha256:nativeSha256,experimental:true}
     if(actual.jobId===claim.continuationJobId&&actual.operation==='broker_service_continue_restored_pair'&&equal(actual.args,expected))error.detail.nativePairContinuationJobId=actual.jobId
    }
    throw error
   }
  }
  await guard();const eligibility=await planNative(pairJobId,nativeSha256,{signal:ctx.signal});await guard()
  if(eligibility.continuationEligible!==true||eligibility.originalJobId!==pairJobId||eligibility.originalRootSha256!==nativeSha256||eligibility.restorationJobId!==p.rootJobId||eligibility.restorationKind!==(p.restorationKind??'record')||!equal(eligibility.preparedServiceIds,native.proof.preparedServiceIds)||eligibility.prefixEffectsRepeated!==false||eligibility.replayAuthorized!==false)throw pending()
  const claims=ensureDir(join(base,'pair-continuation-claims'));owned(base);owned(claims)
  const owner=checkpoint.pairOwner,ownerSha256=ordinaryRecordCheckpointDigest(owner),claim={schemaVersion:1,jobId:ctx.jobId,originalJobId:owner.jobId,originalRootSha256:ownerSha256,pairJobId,pairRootSha256:nativeSha256,preparedBuild:expectedBuild,controllerSession:row.controllerSession,serviceId:pair.primary.serviceId,enrollmentSha256:digest,at:Date.now()},claimPath=join(claims,pairJobId+'.json')
  writeFileSync(claimPath,JSON.stringify(claim)+'\n',{flag:'wx',mode:0o600})
  const ledger={schemaVersion:1,jobId:ctx.jobId,runtimeBuild:RUNTIME_BUILD,controllerSession:row.controllerSession,serviceId:pair.primary.serviceId,enrollmentSha256:digest,target:args.session,binding,operation:name,intentSha256:ordinaryRecordCheckpointDigest({operation:name,arguments:args}),...ctx.ordinaryActionIntent?{actionIntent:structuredClone(ctx.ordinaryActionIntent)}:{},kind:checkpoint.original.kind,plan:structuredClone(checkpoint.original.plan),origin:{jobId:owner.jobId,rootSha256:ownerSha256},generationOwnerJobId:checkpoint.original.jobId,restorationOrigin:{kind:checkpoint.original.kind,jobId:p.rootJobId,rootSha256:p.rootSha256},pairReadinessOrigin:{jobId:pairJobId,rootSha256:nativeSha256,preparedBuild:expectedBuild},phase:'claimed',children:{},steps:[],at:Date.now(),targetDispatched:false,replayAuthorized:false}
  const file=join(base,ctx.jobId+'.json');writeFileSync(file,JSON.stringify(ledger)+'\n',{flag:'wx',mode:0o600})
  const save=()=>{const raw=readOrdinaryRecordRecovery(row.controllerSession,pair.primary.serviceId,digest,{base});if(!equal(JSON.parse(readReceiverFile(claimPath,4096)),claim)||!equal(raw?.original,checkpoint.original)||checkpoint.recordSuffix&&!equal(raw?.recordSuffix,checkpoint.recordSuffix)||!equal(readNative(pairJobId),nativeRoot))throw Error('ordinary readiness suffix ownership changed');writeJsonAtomic(file,ledger)}
  context={ledger,file,save};const record=(phase,result)=>{ledger.phase=phase;ledger.steps.push({phase,at:Date.now()});if(result)ledger.result=structuredClone(result);save()}
  record('before-pair-readiness-continuation');await guard()
  const activated=await runRestoredPairChild(context,'continue-pair',{operation:'broker_service_continue_restored_pair',arguments:{original_job_id:pairJobId,expected_original_root_sha256:nativeSha256,experimental:true},idempotency_key:'ordinary-record:'+ctx.jobId+':continue-pair',timeout_sec:240},{signal:ctx.signal,run:dependencies.run})
  record('after-pair-readiness-continuation')
  if(activated.qualified!==true||activated.importRepeated!==false||activated.replayAuthorized!==false||activated.restorationJobId!==p.rootJobId||activated.serviceId!==native.proof.preparedServiceIds.primary||activated.standbyServiceId!==native.proof.preparedServiceIds.standby||activated.reactivationJobId!==ledger.children['continue-pair'].jobId)throw Error('ordinary readiness continuation receipt differs')
  const verified=await verifyOrdinaryRecoveredPair({activated,qualifiedPlan:p,dep,row,pair,binding,identity,version,capabilities,ctx,checkpoint,expectedBuild})
  const result={...verified,recovered:true,targetDispatched:false,restorationKind:ledger.kind,restorationJobId:p.rootJobId,restorationRootSha256:p.rootSha256,reactivationJobId:activated.reactivationJobId,originalReactivationJobId:pairJobId,recoveryParentJobId:ctx.jobId,originalRecoveryParentJobId:checkpoint.original.jobId,prefixEffectsRepeated:false,replayAuthorized:false}
  record('recovered',result);return result
 }catch(error){
  if(context){context.ledger.failure=ordinaryRecoveryFailure(error,'ordinary-pair-readiness-unresolved');context.save();throw ordinaryRecordPendingError(row.controllerSession,{jobId:ctx.jobId},context.ledger)}
  if(error.category==='ordinary_controller_record_recovery_pending')throw error
  throw pending()
 }
}
