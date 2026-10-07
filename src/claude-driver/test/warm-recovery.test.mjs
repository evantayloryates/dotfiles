import {test} from 'node:test'
import assert from 'node:assert/strict'
import {validateWarmBroker,warmOnlyRecovery} from '../lib/warm-recovery.mjs'
const record={sessionId:'local_fixture',cwd:'/service/broker',title:'claude-driver-broker',permissionMode:'bypassPermissions',isArchived:false}
const info={configured:true,exists:true,sessionId:record.sessionId}
test('native recovery requires the exact approved service broker',()=>{
 validateWarmBroker(info,record,'/service/broker')
 for(const patch of [{cwd:'/user/project'},{title:'user chat'},{permissionMode:'acceptEdits'},{isArchived:true},{sessionId:'local_other'}])
  assert.throws(()=>validateWarmBroker(info,{...record,...patch},'/service/broker'),e=>e.category==='broker_recovery_refused')
 assert.throws(()=>validateWarmBroker({...info,exists:false},record,'/service/broker'),e=>e.category==='broker_missing')
})
function fixture(extra={}) {
 const calls=[]
 return {calls,deps:{audit:async phase=>calls.push(phase),snapshot:async()=>{calls.push('snapshot');return{mainSession:'user'}},
  open:async id=>calls.push(`open:${id}`),live:()=>({pid:42,entrypoint:'claude-desktop'}),capped:()=>false,
  restore:async(before,id)=>{calls.push(`restore:${before.mainSession}:${id}`);return'conditional restore'},...extra}}
}
test('native-only recovery audits and restores without any input fallback',async()=>{
 const {calls,deps}=fixture()
 const r=await warmOnlyRecovery({sessionId:'local_fixture'},deps)
 assert.equal(r.method,'native_warm_spawn');assert.equal(r.inputAutomation,false);assert.equal(r.focus,'conditional restore')
 assert.deepEqual(calls,['before-warm-recovery','snapshot','open:local_fixture','restore:user:local_fixture','after-warm-recovery'])
})
test('governor cap refuses promptly and never attempts a send',async()=>{
 const {calls,deps}=fixture({live:()=>null,capped:()=>true})
 await assert.rejects(warmOnlyRecovery({sessionId:'local_fixture'},deps),e=>e.category==='broker_wake_required'&&e.detail.governorCapped&&e.detail.inputAutomation===false)
 assert.ok(calls.includes('after-warm-recovery'));assert.equal(calls.filter(x=>x.startsWith('open:')).length,1)
})
test('navigation failure still restores conditionally and audits cleanup',async()=>{
 const {calls,deps}=fixture({open:async()=>{throw new Error('synthetic link failure')}})
 await assert.rejects(warmOnlyRecovery({sessionId:'local_fixture'},deps),/synthetic link failure/)
 assert.ok(calls.includes('restore:user:local_fixture'));assert.equal(calls.at(-1),'after-warm-recovery')
})
test('unsafe input audit stops recovery before navigation',async()=>{
 const {calls,deps}=fixture({audit:async()=>{throw new Error('unsafe input')}})
 await assert.rejects(warmOnlyRecovery({sessionId:'local_fixture'},deps),/unsafe input/)
 assert.deepEqual(calls,[])
})
test('cancelled native wait restores without starting another recovery',async()=>{
 const controller=new AbortController()
 const {calls,deps}=fixture({open:async()=>controller.abort(),live:()=>null})
 await assert.rejects(warmOnlyRecovery({sessionId:'local_fixture',signal:controller.signal},deps),e=>e.category==='cancelled')
 assert.ok(calls.includes('after-warm-recovery'))
})
test('failed post-recovery audit cannot report a healthy recovery',async()=>{
 const {deps}=fixture({audit:async phase=>{if(phase==='after-warm-recovery')throw new Error('surviving input filter')}})
 await assert.rejects(warmOnlyRecovery({sessionId:'local_fixture'},deps),/surviving input filter/)
})


test('warm failure evidence distinguishes an owned exited query from cap and unrelated errors',async()=>{
 const {nativeWarmFailure}=await import('../lib/warm-recovery.mjs')
 const line='2026-10-06 22:41:37 [error] Session local_fixture query error: Claude Code process exited with code 143 { PRIVATE_STACK }'
 assert.deepEqual(nativeWarmFailure([line],'local_fixture'),{reason:'app_query_exited',exitCode:143})
 assert.deepEqual(nativeWarmFailure([line],'local_other',{capped:true}),{reason:'governor_cap'})
 assert.deepEqual(nativeWarmFailure([],'local_fixture'),{reason:'native_warm_spawn_unobserved'})
 assert.equal(JSON.stringify(nativeWarmFailure([line],'local_fixture')).includes('PRIVATE'),false)
})
test('exited native query is reported without claiming a cap or attempting input',async()=>{
 const {calls,deps}=fixture({live:()=>null,capped:()=>false,failure:()=>({reason:'app_query_exited',exitCode:143})})
 await assert.rejects(warmOnlyRecovery({sessionId:'local_fixture',timeoutMs:0},deps),e=>e.category==='broker_wake_required'&&e.detail.reason==='app_query_exited'&&e.detail.exitCode===143&&e.detail.governorCapped===false&&e.detail.inputAutomation===false)
 assert.ok(calls.includes('after-warm-recovery'));assert.equal(calls.filter(x=>x.startsWith('open:')).length,1)
})
