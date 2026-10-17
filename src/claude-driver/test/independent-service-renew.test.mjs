import {test} from 'node:test'
import assert from 'node:assert/strict'
import {runIndependentRenewal,renewIndependentService,waitIndependentReadiness} from '../lib/independent-service-renew.mjs'
const phases=['prepare','quiesce','retire','activate','readiness','policyProbe','verify']
function fixture(fail){
 const effects=[],records=[],guards=[]
 const d={guard:async phase=>{guards.push(phase)},record:async phase=>{records.push(phase)},...Object.fromEntries(phases.map(p=>[p,async()=>{effects.push(p);if(fail===p)throw Error('injected '+p);return {phase:p}}]))}
 return {d,effects,records,guards}
}
test('renewal prepares before admission stop and checkpoints each step once',async()=>{
 const f=fixture(),r=await runIndependentRenewal(f.d)
 assert.deepEqual(f.effects,phases);assert.deepEqual(f.guards,phases)
 assert.deepEqual(f.records,phases.flatMap(p=>['before-'+p,'after-'+p]))
 assert.deepEqual(Object.keys(r),phases)
})
test('readiness waits for actual observation and refuses timeout or invalid context',async()=>{
 let time=0,calls=0
 const d={now:()=>time,guard:async()=>{},inspect:async()=>({verified:true,sourceDisposition:'installed',admissionStopped:false,readinessObserved:++calls===3,unresolvedRequestIds:[]}),wait:async()=>{time+=100}}
 const r=await waitIndependentReadiness({timeoutMs:1000},d);assert.equal(r.readinessWaitMs,200);assert.equal(calls,3)
 d.inspect=async()=>({verified:true,sourceDisposition:'installed',readinessObserved:false});await assert.rejects(waitIndependentReadiness({timeoutMs:100},d),/deadline/)
 d.inspect=async()=>({verified:false});await assert.rejects(waitIndependentReadiness({},d),/unqualified/)
 const controller=new AbortController();controller.abort();await assert.rejects(waitIndependentReadiness({signal:controller.signal},d),/cancelled/)
})
test('observed 18.59-second native readiness delay fits bounded default; shorter deadline stays a failure',async()=>{
 const fixture=()=>{let time=0;return {now:()=>time,guard:async()=>{},inspect:async()=>({verified:true,sourceDisposition:'installed',readinessObserved:time>=18590}),wait:async()=>{time+=100}}}
 assert.equal((await waitIndependentReadiness({},fixture())).readinessWaitMs,18600)
 await assert.rejects(waitIndependentReadiness({timeoutMs:15000},fixture()),e=>e.category==='independent_service_readiness_timeout')
})
test('every renewal effect failure stops at its original identity without replay or rollback',async()=>{
 for(const phase of phases){const f=fixture(phase);await assert.rejects(runIndependentRenewal(f.d),/injected/);assert.equal(f.effects.at(-1),phase);assert.equal(f.effects.filter(x=>x===phase).length,1);assert.equal(f.records.at(-1),'before-'+phase)}
})
test('checkpoint failure after effect preserves uncertainty and prevents later work',async()=>{
 const f=fixture();f.d.record=async p=>{f.records.push(p);if(p==='after-quiesce')throw Error('disk failed')}
 await assert.rejects(runIndependentRenewal(f.d),/disk failed/);assert.deepEqual(f.effects,['prepare','quiesce'])
 const g=fixture();g.d.guard=()=>{throw Error('epoch')};await assert.rejects(runIndependentRenewal(g.d),/epoch/);assert.deepEqual(g.effects,[]);assert.deepEqual(g.records,[])
})
test('renewal refuses missing durable identity before any ledger or native state access',async()=>{
 await assert.rejects(renewIndependentService('invalid','a'.repeat(32)),/durable job/)
 await assert.rejects(renewIndependentService('local_11111111-1111-4111-8111-111111111111','a'.repeat(32),{jobId:'j'+'a'.repeat(32)}),/durable job/)
})
