import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {withRecordedAction} from '../lib/recorded-action.mjs'
import {EvidenceStore,validateRecordedAction} from '../../codex-bridge/lib/capability-evidence.mjs'
const declaration={session_id:'test',caller:'agent',provider:'native-cua',action_id:'one',intent:'owned fixture',target:{bundle_id:'com.test.fixture'}}
const receipt={...declaration,schema:'record-screen-action/v1',action_token:'act_12345678-1234-1234-1234-123456789abc',
  context:{verification_plan:'read persisted app state'},clock_domain:'CLOCK_UPTIME_RAW',start_ns:'9007199254740999',end_ns:'9007199254741010',deadline_ns:'9007200254740999',
  state:'closed',result:'delivered',clock_provenance:'recorder_service_stamped',engine_instance:'synthetic-engine',engine_build:'synthetic-build',engine_pid:100,end_kind:'service_observed_end_request'}
function fake({capable=true,endError,beginError}={}) { const calls=[];return {calls,async call(method,args){calls.push({method,args});if(method==='status')return {capabilities:capable?{action_scopes:1}:{}};if(method==='action.begin'){if(beginError)throw beginError;return receipt;}if(endError)throw endError;return {...receipt,result:args.result}}} }
test('unsupported engine and uncertain begin never run callback',async()=>{
  let count=0
  for(const c of [fake({capable:false}),fake({beginError:new Error('uncertain response')})]) {
    await assert.rejects(withRecordedAction(c,declaration,async()=>count++));assert.equal(count,0);assert.ok(c.calls.filter(x=>x.method==='action.begin').length<=1)
  }
})
test('operation runs once and failed receipt never retries it',async()=>{
  let count=0;const c=fake({endError:new Error('lost end reply')});const out=await withRecordedAction(c,declaration,async()=>++count)
  assert.equal(count,1);assert.equal(out.value,1);assert.match(out.receiptError.message,/lost end/);assert.equal(out.actionToken,receipt.action_token)
})
test('operation error is preserved along with receipt gap',async()=>{
  const original=new Error('app refused action'),gap=new Error('receipt unavailable'),c=fake({endError:gap})
  await assert.rejects(withRecordedAction(c,declaration,async()=>{throw original}),e=>e===original && e.actionReceiptError===gap)
  assert.equal(c.calls.at(-1).args.result,'failed')
})
test('shared contextual receipt keeps imported provenance and exact clock',async()=>{
  const root=mkdtempSync(join(tmpdir(),'recorded-action-'));try {
    const store=new EvidenceStore(root),c=fake();const out=await withRecordedAction(c,declaration,async()=>42,{evidenceStore:store})
    assert.equal(out.value,42);assert.equal(out.receiptError,undefined)
    const saved=store.receipts('test')[0].value
    assert.equal(saved.start_ns,'9007199254740999');assert.equal(saved.provenance,'recorder_reply_imported')
    assert.equal(saved.context.verification_plan,'read persisted app state');assert.match(saved.ownership,/unverified/)
    const unknown={...receipt,state:'interrupted',result:'interrupted',end_ns:null,end_kind:'unknown_after_engine_restart'}
    const recovered=store.putRecordedAction(unknown);assert.equal(recovered.value.end_ns,null)
  } finally {rmSync(root,{recursive:true,force:true})}
})
test('import cannot manufacture terminal stamps or erase clock uncertainty',()=>{
  for(const bad of [{...receipt,end_ns:null},{...receipt,state:'active'},{...receipt,start_ns:123},{...receipt,end_ns:'9007199254740000'},
    {...receipt,end_ns:'9007300254740999'},{...receipt,context:{unsupported:'field'}},{...receipt,extra:true}]) assert.throws(()=>validateRecordedAction(bad))
})

test('pre-launch declaration requires native capability and retains uncertainty through shared storage',async()=>{
  const request={...declaration,target_resolution:'declared'}
  let operations=0;const old=fake()
  await assert.rejects(withRecordedAction(old,request,async()=>operations++),e=>e.code==='unsupported_declared_action_targets')
  assert.equal(operations,0);assert.deepEqual(old.calls.map(x=>x.method),['status'])
  const root=mkdtempSync(join(tmpdir(),'declared-action-'));try {
    const c={async call(method,args){if(method==='status')return {capabilities:{action_scopes:1,declared_action_targets:1}};return {...receipt,target_resolution:'declared'}}}
    const store=new EvidenceStore(root),out=await withRecordedAction(c,request,async()=>++operations,{evidenceStore:store})
    assert.equal(operations,1);assert.equal(out.receiptError,undefined)
    const saved=store.receipts('test')[0].value
    assert.equal(saved.target_resolution,'declared');assert.deepEqual(saved.target,{bundle_id:'com.test.fixture'})
    const outcome=store.putOutcome({session_id:'test',receipt_id:out.sharedReceipt.id,observed_at:new Date().toISOString(),verification:{state:'not_checked',method:'none',summary:'No app evidence supplied',evidence_refs:[]},cleanup:{state:'unknown',summary:'No app cleanup supplied',evidence_refs:[]}})
    assert.equal(outcome.value.target_resolution,'declared');assert.equal(store.workflowAudit('test').coverage.stored_outcomes,1)
    assert.equal(Object.hasOwn(validateRecordedAction(receipt),'target_resolution'),false,'legacy normalization and immutable ID remain unchanged; missing resolution is unspecified')
    for(const bad of [{...receipt,target_resolution:'unknown'},{...receipt,target_resolution:null},
      {...receipt,target_resolution:'declared',target:{...receipt.target,pid:123}},
      {...receipt,target_resolution:'declared',target:{...receipt.target,window_id:123}}]) assert.throws(()=>validateRecordedAction(bad))
  } finally {rmSync(root,{recursive:true,force:true})}
})
