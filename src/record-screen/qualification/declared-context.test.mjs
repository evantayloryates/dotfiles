import assert from 'node:assert/strict'
import { test } from 'node:test'
import { retainedActionContext } from '../lib/action-context.mjs'
const action = { schema:'record-screen-action/v1',clock_domain:'CLOCK_UPTIME_RAW',
  action_token:'act_12345678-1234-1234-1234-123456789abc',action_id:'launch',session_id:'authored',
  caller:'test',provider:'native-cua',intent:'launch an owned fixture',context:{},
  target:{bundle_id:'com.test.Unstarted'},start_ns:'9007199254740999',deadline_ns:'9007199254741099',
  end_ns:'9007199254741010',state:'closed',result:'dispatched' }
const context = a => retainedActionContext({action:a,relative_ns:'11'},9007199254740999n,0,0n,100n).value

test('source snapshot preserves declaration instead of borrowing a subsequently observed PID',()=>{
  const original = {...action,target_resolution:'declared'}
  const out=context(original)
  assert.equal(out.target_resolution,'declared');assert.deepEqual(out.target,{bundle_id:'com.test.Unstarted'})
  assert.ok(out.limits.some(x=>x.includes('no observed identity or passive input attribution')))
  assert.equal(out.claimed_result,'dispatched');assert.equal(out.ownership,'unknown')
  assert.deepEqual(original,{...action,target_resolution:'declared'})
  assert.equal(context(action).target_resolution,'legacy_unspecified')
  assert.equal(context({...action,target_resolution:'observed',target:{...action.target,pid:42}}).target.pid,42)
})
test('contradictory identity and unknown resolution fail closed before returning context',()=>{
  for(const bad of [{...action,target_resolution:'declared',target:{...action.target,pid:42}},
    {...action,target_resolution:'declared',target:{...action.target,window_id:10}},
    {...action,target_resolution:'anything'},{...action,target_resolution:null}]) assert.throws(()=>context(bad),e=>e.code==='input_query')
})
