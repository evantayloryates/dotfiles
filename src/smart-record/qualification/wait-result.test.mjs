import test from 'node:test';
import assert from 'node:assert/strict';
import {withWaitResult} from '../lib/wait-result.mjs';
const running={state:'recording',clock:{wall:'2026-10-11T03:00:00Z'},end_at:'2026-10-11T03:00:05Z'};
test('start-wait on an already terminal take cannot authorize UI input',()=>{
 for(const state of ['done','failed','canceled','missed','interrupted']){
  const reply={...running,state,timed_out:false};const r=withWaitResult(reply,'recording');
  assert.equal(r.wait_result.may_begin_actions,false);assert.equal(r.wait_result.requested_state_observed,false);
  assert.equal(r.wait_result.reason,'terminal_before_observation');assert.equal(r.timed_out,false);
  assert.equal(reply.wait_result,undefined);
 }
});
test('remaining time uses the engine snapshot, with no client wall-clock substitution',()=>{
 const r=withWaitResult(running,'recording').wait_result;assert.equal(r.remaining_s,5);assert.equal(r.may_begin_actions,true);
 for(const patch of [{clock:undefined},{end_at:undefined},{clock:{wall:'invalid'}}]){
  const r=withWaitResult({...running,...patch},'recording').wait_result;assert.equal(r.remaining_s,null);assert.equal(r.may_begin_actions,false);
 }
 for(const patch of [{clock:{wall:running.end_at}},{capture_quarantined:true},{production_queue:{held:true}},{state:'arming'},{state:'finalizing'}])assert.equal(withWaitResult({...running,...patch},'recording').wait_result.may_begin_actions,false);
});
test('finish-wait distinguishes terminal observation from capture success',()=>{
 const r=withWaitResult({...running,state:'failed',error:'encoder failure'}).wait_result;
 assert.equal(r.requested_state_observed,true);assert.equal(r.reason,'terminal_observed');assert.equal(r.may_begin_actions,false);
 assert.match(r.qualification,/not.*successful finalization/);
});
