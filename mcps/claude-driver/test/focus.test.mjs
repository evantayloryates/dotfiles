import {test} from 'node:test'
import assert from 'node:assert/strict'
import {restoreFocusPolicy} from '../src/lib/focus.mjs'
const claude='com.anthropic.claudefordesktop',before={mainSession:'original',frontApp:'com.openai.codex'}
function fixture({main='target',front=claude,failMain=false,failFront=false}={}){const calls=[];return {calls,d:{waitMain:async target=>target==='target'?main:failMain?'wrong':target,navigate:async target=>calls.push(['navigate',target]),frontApp:async()=>front,activate:async app=>calls.push(['activate',app]),waitFront:async app=>failFront?claude:app}}}
test('focus restoration requires independent main and front application readback',async()=>{const f=fixture(),r=await restoreFocusPolicy(before,'target',f.d);assert.equal(r.verified,true);assert.deepEqual(f.calls,[['navigate','original'],['activate',before.frontApp]])})
test('failed main or front restoration cannot be reported confirmed',async()=>{for(const patch of [{failMain:true},{failFront:true}]){const f=fixture(patch),r=await restoreFocusPolicy(before,'target',f.d);assert.equal(r.verified,false);assert.match(r.action,/not confirmed/)}})
test('intervening main-window or foreground-app choices are preserved',async()=>{const f=fixture({main:'human-choice'}),r=await restoreFocusPolicy(before,'target',f.d);assert.equal(r.disposition,'user-moved');assert.deepEqual(f.calls,[]);const other=fixture({front:'human-app'});await restoreFocusPolicy(before,'target',other.d);assert.deepEqual(other.calls,[['navigate','original']])})
test('unknown focus and activation errors remain unconfirmed',async()=>{const f=fixture({main:null}),r=await restoreFocusPolicy(before,'target',f.d);assert.equal(r.verified,false);assert.deepEqual(f.calls,[]);const broken=fixture();broken.d.activate=async()=>{throw Error('activation refused')};assert.equal((await restoreFocusPolicy(before,'target',broken.d)).verified,false)})

test('missing original snapshot cannot claim full restoration even when activation succeeds',async()=>{for(const patch of [{mainSession:null},{frontApp:null}]){const f=fixture(),r=await restoreFocusPolicy({...before,...patch},'target',f.d);assert.equal(r.verified,false);assert.match(r.action,/snapshot unavailable.*not confirmed/)}})

test('unattributed metadata effects compare fresh focus endpoints without restoring user choices',async()=>{
 const {runObservedFocusOperation}=await import('../src/lib/focus.mjs'),initial={at:1000,mainSession:'ordinary',frontApp:'com.openai.codex',source:'main.log'}
 for(const patch of [{},{mainSession:'human-choice'},{frontApp:'human-app'},{frontApp:null},{mainSession:null},{source:'unverified'},{at:999}]){
  const calls=[],after={...initial,at:2000,...patch},snapshots=[initial,after]
  const r=await runObservedFocusOperation(async()=>{calls.push('effect');return {receiptVerified:true}},{snapshot:async()=>{calls.push('snapshot');return snapshots.shift()}})
  assert.deepEqual(calls,['snapshot','effect','snapshot']);assert.equal(r.result.receiptVerified,true);assert.equal(r.focus.verified,Object.keys(patch).length===0);assert.equal(r.focus.observationScope,'before-after-endpoints');assert.deepEqual(r.focus.after,after)
 }
})
test('failed metadata effects retain fresh focus evidence without hiding original uncertainty',async()=>{
 const {runObservedFocusOperation}=await import('../src/lib/focus.mjs'),snapshots=[{at:1,mainSession:'original',frontApp:'codex',source:'disk'},{at:2,mainSession:'other',frontApp:'codex',source:'disk'}],error=Object.assign(Error('native outcome unknown'),{category:'outcome_unknown',detail:{retrySafe:false,requestId:'original'}})
 await assert.rejects(runObservedFocusOperation(async()=>{throw error},{snapshot:async()=>snapshots.shift()}),actual=>actual===error&&actual.category==='outcome_unknown'&&actual.focusObservation.disposition==='changed-unattributed'&&actual.focusObservation.verified===false&&actual.detail.retrySafe===false&&actual.detail.requestId==='original'&&actual.detail.focusObservation===actual.focusObservation)
})

const created='local_12345678-1234-1234-1234-123456789abc'
test('failed import restores only its explicitly registered target and preserves reconciliation identity',async()=>{
 const {runNavigatingFocusOperation}=await import('../src/lib/focus.mjs'),calls=[]
 const error=Object.assign(Error('import missing'),{category:'import_missing',detail:{sessionId:created,created:true,retrySafe:false}})
 await assert.rejects(runNavigatingFocusOperation('restore',async({navigationIntent})=>{navigationIntent(created);throw error},{},{snapshot:async()=>before,restore:async(b,target)=>{calls.push([b,target]);return {verified:true,disposition:'restore-observed'}}}),e=>e===error&&e.detail.sessionId===created&&e.detail.retrySafe===false&&e.detail.focusRestoration.verified===true)
 assert.deepEqual(calls,[[before,created]])
})
test('failure without navigation intent, or in show/leave mode, never restores',async()=>{
 const {runNavigatingFocusOperation}=await import('../src/lib/focus.mjs')
 for(const mode of ['restore','show','leave']){let restores=0;const error=Error('failed');await assert.rejects(runNavigatingFocusOperation(mode,async({navigationIntent})=>{if(mode!=='restore')navigationIntent(created);throw error},{},{snapshot:async()=>before,restore:async()=>{restores++}}),e=>e===error);assert.equal(restores,0)}
})
test('focus restoration failure never replaces an uncertain import error',async()=>{
 const {runNavigatingFocusOperation}=await import('../src/lib/focus.mjs'),error=Object.assign(Error('uncertain'),{category:'outcome_unknown'})
 await assert.rejects(runNavigatingFocusOperation('restore',async({navigationIntent})=>{navigationIntent(created);throw error},{},{snapshot:async()=>before,restore:async()=>{throw Error('observation failed')}}),e=>e===error&&e.focusRestoration.verified===false)
})
test('successful creation reports observed focus evidence from exact returned target',async()=>{
 const {runNavigatingFocusOperation}=await import('../src/lib/focus.mjs'),calls=[]
 const r=await runNavigatingFocusOperation('restore',async({navigationIntent})=>{navigationIntent(created);return {navigatedTo:created,sessionId:created}},{},{snapshot:async()=>before,restore:async(b,t)=>{calls.push(t);return {verified:false,navigationObserved:true,action:'not confirmed'}}})
 assert.equal(r.focus.verified,false);assert.equal(r.focus.navigationObserved,true);assert.deepEqual(calls,[created])
})
