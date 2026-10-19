import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {pairReadinessFixture} from './restored-pair-readiness-fixture.mjs'
import {validatePairReadinessCheckpoint,readPairReadinessCheckpoint,pairReadinessCheckpointDigest} from '../src/lib/restored-pair-readiness-checkpoint.mjs'
import {createRestoredPairReadinessLedger} from '../src/lib/restored-pair-ledger.mjs'
import {continueRestoredPairFromReadiness} from '../src/lib/restored-pair-reactivation.mjs'
import {readRestoredPairTransitionProof,restoredPairTransitionAllowed} from '../src/lib/restored-pair-proof.mjs'
const roots=[];test.after(()=>{for(const r of roots)rmSync(r,{recursive:true,force:true})})
const temp=()=>{const r=mkdtempSync(join(tmpdir(),'pair-readiness-checkpoint-'));roots.push(r);return r}
test('exact failed readiness prefix admits evidence only; ambiguous or later effects and altered receipt identities refuse',()=>{
 const f=pairReadinessFixture(),proof=validatePairReadinessCheckpoint(f.root,f.parent,f.claim,f.restoration,f.options)
 assert.equal(proof.qualified,true);assert.equal(proof.nativeReadinessAssessed,false);assert.equal(proof.servingQualified,false)
 for(const mutate of [r=>r.phase='after-activate-primary',r=>r.results['readiness-primary']={verified:true},r=>r.results['prepare-primary'].build='0'.repeat(64),r=>r.children['activate-primary'].observation.state='outcome_unknown',r=>r.children['prepare-primary'].submission.arguments.metadata_target='foreign',r=>r.results['retire-survivor'].ownedSettingsRetired=true,r=>r.steps.pop(),r=>r.continuation={originalJobId:'j'+'1'.repeat(32)}]){
  const r=structuredClone(f.root);mutate(r);assert.throws(()=>validatePairReadinessCheckpoint(r,f.parent,f.claim,f.restoration,{...f.options,expectedRootSha256:pairReadinessCheckpointDigest(r)}))
 }
 for(const state of ['running','outcome_unknown','cancelled'])assert.throws(()=>validatePairReadinessCheckpoint(f.root,{...f.parent,state},f.claim,f.restoration,f.options))
 assert.throws(()=>validatePairReadinessCheckpoint(f.root,f.parent,{...f.claim,reactivationJobId:'j'+'1'.repeat(32)},f.restoration,f.options))
})
test('checkpoint reader independently observes original restoration, actual child jobs and immutable claims across async reads',async()=>{
 const f=pairReadinessFixture(),dir=temp(),file=join(dir,'claims',f.root.plan.rootJobId+'.json');mkdirSync(join(dir,'claims'));writeFileSync(file,JSON.stringify(f.claim),{mode:0o600})
 const options={dir,read:()=>structuredClone(f.root),readRestoration:()=>structuredClone({root:f.original.root,claim:f.original.claim,rootSha256:f.original.options.expectedRootSha256}),inspect:async id=>structuredClone(f.jobs.get(id))}
 assert.equal((await readPairReadinessCheckpoint(f.root.jobId,f.options.expectedRootSha256,options)).proof.qualified,true)
 const changed=structuredClone(f.jobs.get(f.root.children['activate-primary'].jobId));changed.result.installed=false;f.jobs.set(changed.jobId,changed);await assert.rejects(readPairReadinessCheckpoint(f.root.jobId,f.options.expectedRootSha256,options));f.jobs.set(changed.jobId,f.root.children['activate-primary'].observation)
 let mutated=false;await assert.rejects(readPairReadinessCheckpoint(f.root.jobId,f.options.expectedRootSha256,{...options,inspect:async id=>{if(!mutated&&id===f.root.children['activate-primary'].jobId){mutated=true;writeFileSync(file,JSON.stringify({...f.claim,reactivationJobId:'j'+'1'.repeat(32)}))}return structuredClone(f.jobs.get(id))}}))
})
test('separate continuation ledger preserves failed origin bytes and claim; competing roots cannot acquire suffix',()=>{
 const f=pairReadinessFixture(),proof=validatePairReadinessCheckpoint(f.root,f.parent,f.claim,f.restoration,f.options),dir=temp(),original=join(dir,f.root.jobId+'.json');writeFileSync(original,JSON.stringify(f.root));const bytes=readFileSync(original),id='j'+'e'.repeat(32),c=createRestoredPairReadinessLedger({root:f.root,proof},id,{dir})
 assert.deepEqual(readFileSync(original),bytes);assert.equal(c.ledger.continuation.preparedBuild,f.root.runtimeBuild);assert.deepEqual(c.ledger.children,f.root.children)
 assert.throws(()=>createRestoredPairReadinessLedger({root:f.root,proof},'j'+'f'.repeat(32),{dir}),e=>e.category==='restored_pair_continuation_claimed'&&e.detail.originalJobId===id)
})
test('continuation tail never repeats preparation, retirement, import or primary activation',async()=>{
 const f=pairReadinessFixture(),proof=validatePairReadinessCheckpoint(f.root,f.parent,f.claim,f.restoration,f.options),calls=[],phases=[],p=f.root.plan,ids=proof.preparedServiceIds
 const d={guard:async()=>{},record:async phase=>phases.push(phase),prepare:()=>{throw Error('repeated prepare')},quiesce:()=>{throw Error('repeated quiesce')},retire:()=>{throw Error('repeated retire')},activate:async(role,id)=>{calls.push('activate-'+role);assert.equal(role,'standby');return {installed:true,sessionId:p.currentEpochs[role].sessionId,serviceId:id}},readiness:async(role,id)=>{calls.push('readiness-'+role);return {verified:true,sessionId:p.currentEpochs[role].sessionId,serviceId:id,readinessObserved:true}},policy:async role=>{calls.push('policy-'+role);return {terminalRefusalVerified:true,policyInvocationObserved:true}},read:async()=>({receiptVerified:true,state:'completed'}),verifyPair:async()=>({qualified:true,rolesPreserved:true,settingsPreserved:true,noUnresolvedAttempts:true,primary:{...p.currentEpochs.primary,serviceId:ids.primary},standby:{...p.currentEpochs.standby,serviceId:ids.standby}}),family:async()=>({receiptVerified:true,state:'completed',requestId:'rpeer'+'f'.repeat(32)}),enroll:async()=>({enrolled:true,verified:true}),metadataEnrollment:async()=>({qualified:true}),verifyEnrollment:async()=>({qualified:true})}
 const result=await continueRestoredPairFromReadiness({root:f.root,proof},d)
 assert.equal(result.verifyEnrollment.qualified,true);assert.equal(phases[0],'after-readiness-primary');assert.deepEqual(calls,['readiness-primary','policy-primary','activate-standby','readiness-standby','policy-standby'])
 for(const stop of ['after-readiness-primary','before-policy-primary','before-activate-standby']){let effects=0;await assert.rejects(continueRestoredPairFromReadiness({root:f.root,proof},{...d,record:async phase=>{if(phase===stop)throw Error('checkpoint unavailable')},activate:async(...args)=>{effects++;return d.activate(...args)}}));assert.equal(effects,0)}
})
test('enrollment reader proves both parent chains and old/new child ownership before accepting continuation transition',async()=>{
 const f=pairReadinessFixture(),proof=validatePairReadinessCheckpoint(f.root,f.parent,f.claim,f.restoration,f.options),checkpoint={root:f.root,parent:f.parent,claim:f.claim,proof},dir=temp(),id='j'+'e'.repeat(32),c=createRestoredPairReadinessLedger(checkpoint,id,{dir}),p=f.root.plan,ids=proof.preparedServiceIds
 mkdirSync(join(dir,'claims'),{recursive:true});writeFileSync(join(dir,'claims',p.rootJobId+'.json'),JSON.stringify(f.claim),{mode:0o600});writeFileSync(join(dir,f.root.jobId+'.json'),JSON.stringify(f.root),{mode:0o600})
 const parent={jobId:id,operation:'broker_service_continue_restored_pair',state:'running',runtimeBuild:c.ledger.runtimeBuild,args:{original_job_id:f.root.jobId,expected_original_root_sha256:proof.originalRootSha256,experimental:true}};f.jobs.set(id,parent)
 const child=(step,operation,args,result)=>{const jobId='j'+randomUUID().replaceAll('-',''),o={jobId,operation,args,state:'completed',result};c.ledger.children[step]={jobId,submission:{operation,arguments:args,idempotency_key:'restored-pair:'+id+':'+step},observation:o};f.jobs.set(jobId,o);c.save();return result}
 const read=jobId=>JSON.parse(readFileSync(join(dir,jobId+'.json'))),options={dir,read,readRestoration:()=>structuredClone({root:f.original.root,claim:f.original.claim,rootSha256:f.original.options.expectedRootSha256}),inspect:async jobId=>structuredClone(f.jobs.get(jobId))}
 const epoch=role=>({sessionId:p.currentEpochs[role].sessionId,serviceId:ids[role]}),before=f.original.root.originalSnapshot.binding
 const d={guard:async()=>{},record:c.record,readiness:async role=>({...epoch(role),verified:true,readinessObserved:true}),policy:async role=>child('policy-'+role,'broker_service_policy_probe',{session:p.currentEpochs[role].sessionId,service_id:ids[role],experimental:true,timeout_sec:20},{terminalRefusalVerified:true,policyInvocationObserved:true}),activate:async(role,serviceId)=>child('activate-'+role,'broker_service_activate',{session:p.currentEpochs[role].sessionId,service_id:serviceId,experimental:true,stable_hook:true},{...epoch(role),installed:true,settingsInstalled:true}),read:async()=>({receiptVerified:true,state:'completed'}),verifyPair:async()=>({qualified:true,rolesPreserved:true,settingsPreserved:true,noUnresolvedAttempts:true,primary:{...p.currentEpochs.primary,serviceId:ids.primary},standby:{...p.currentEpochs.standby,serviceId:ids.standby}}),family:async()=>({receiptVerified:true,state:'completed',requestId:'rpeer'+'f'.repeat(32)}),enroll:async results=>{
  const observed=await readRestoredPairTransitionProof(id,options),after={...before,enrolledAt:2,familyRequestId:results.family.requestId,primary:{...p.currentEpochs.primary,serviceId:ids.primary},standby:{...p.currentEpochs.standby,serviceId:ids.standby}}
  assert.equal(restoredPairTransitionAllowed(before,after,observed.root,id,observed.restoration,observed.checkpoint),true)
  assert.equal(restoredPairTransitionAllowed(before,after,observed.root,id,observed.restoration),false)
  const changed=structuredClone(f.jobs.get(f.root.children['activate-primary'].jobId));changed.state='outcome_unknown';f.jobs.set(changed.jobId,changed);await assert.rejects(readRestoredPairTransitionProof(id,options));throw Error('stop after enrollment proof test')
 }}
 await assert.rejects(continueRestoredPairFromReadiness(checkpoint,d),/stop after enrollment proof test/)
})
