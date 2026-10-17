import {test} from 'node:test'
import assert from 'node:assert/strict'
import {runIndependentRenewal,renewIndependentService} from '../lib/independent-service-renew.mjs'
const phases=['prepare','quiesce','retire','activate','verify']
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
