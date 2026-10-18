import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {restorationFixture} from './restored-record-fixture.mjs'
import {readRestoredPairTransitionProof} from '../lib/restored-pair-proof.mjs'
function fixture(mode='pass'){
 const original=restorationFixture(),rootJobId='j'+'9'.repeat(32),root={schemaVersion:1,jobId:rootJobId,runtimeBuild:'8'.repeat(64),expectedPlanSha256:'7'.repeat(64),phase:'before-enroll',plan:{rootJobId:original.root.jobId,rootSha256:original.options.expectedRootSha256},children:{}},owner={jobId:rootJobId,operation:'broker_service_reactivate_restored_pair',state:'running',runtimeBuild:root.runtimeBuild,args:{restoration_job_id:root.plan.rootJobId,expected_root_sha256:root.plan.rootSha256,expected_plan_sha256:root.expectedPlanSha256,experimental:true}},dir=mkdtempSync(join(tmpdir(),'restored-pair-proof-')),claim={reactivationJobId:rootJobId,restorationJobId:root.plan.rootJobId,restorationRootSha256:root.plan.rootSha256,expectedPlanSha256:root.expectedPlanSha256},file=join(dir,'claims',root.plan.rootJobId+'.json')
 mkdirSync(join(dir,'claims'),{mode:0o700});writeFileSync(file,JSON.stringify(claim),{mode:0o600})
 let ownerReads=0,childReads=0
 const options={dir,read:()=>structuredClone(root),readRestoration:()=>structuredClone({root:original.root,claim:original.claim,rootSha256:original.options.expectedRootSha256}),inspect:async id=>{
  if(id===rootJobId){ownerReads++;const o=structuredClone(owner);if(mode==='wrong-owner')o.operation='broker_service_bootstrap_pair';if(mode==='owner-terminal'&&ownerReads>1)o.state='failed';return o}
  if(id===original.root.jobId)return structuredClone(original.parent)
  childReads++;if(mode==='claim-drift'&&childReads===1)writeFileSync(file,JSON.stringify({...claim,reactivationJobId:'j'+'6'.repeat(32)}),{mode:0o600});const c=Object.values(original.root.children).find(c=>c.jobId===id),o=structuredClone(c.observation);if(mode==='child-drift')o.result={unverified:true};return o
 }}
 return {rootJobId,options}
}
test('transition reader independently verifies running parent, original restoration and child receipts',async()=>{const f=fixture(),r=await readRestoredPairTransitionProof(f.rootJobId,f.options);assert.equal(r.restoration.qualified,true);assert.equal(r.root.jobId,f.rootJobId)})
test('claim changes during async reads, wrong/terminal parent and divergent child fail closed',async()=>{for(const mode of ['claim-drift','wrong-owner','owner-terminal','child-drift']){const f=fixture(mode);await assert.rejects(readRestoredPairTransitionProof(f.rootJobId,f.options))}})
