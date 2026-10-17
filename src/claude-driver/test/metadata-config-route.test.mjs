import {test} from 'node:test'
import assert from 'node:assert/strict'
import {metadataConfigOperations,runMetadataConfigBatch} from '../lib/metadata-config-route.mjs'
const target='local_22222222-2222-4222-8222-222222222222',good={metadataVerified:true,receiptVerified:true,state:'completed'}
test('whole metadata batch is validated before any field, and rejects permission/legacy mixing and invalid model aliases',()=>{
 assert.deepEqual(metadataConfigOperations(target,{title:'locked',pinned:false,effort:'high'}).map(x=>x.field),['title','pinned','effort'])
 for(const args of [{title:'valid',effort:'bad'},{title:'valid',model:'opus'},{title:'valid',permission_mode:'bypassPermissions'},{pinned:true,via_broker:true},{title:' '},{}])assert.throws(()=>metadataConfigOperations(target,args))
})
test('batch stops after uncertain child, retains preceding success, and never invokes later fields',async()=>{
 const ops=metadataConfigOperations(target,{title:'locked',pinned:true,effort:'low'}),calls=[],records=[]
 await assert.rejects(runMetadataConfigBatch(ops,{preflight:async count=>assert.equal(count,3),guard:async()=>{},record:async(phase,results)=>records.push([phase,structuredClone(results)]),apply:async op=>{calls.push(op.field);if(op.field==='pinned')throw Error('unknown native effect');return good},verify:async()=>assert.fail('not reached')}),/unknown/)
 assert.deepEqual(calls,['title','pinned']);assert.deepEqual(records.at(-1),['before-pinned',{title:good}])
})
test('failed full-batch admission and changed selection cannot apply a field',async()=>{
 let applied=0;const ops=metadataConfigOperations(target,{pinned:false}),base={preflight:async()=>{},guard:async()=>{},record:async()=>{},apply:async()=>{applied++;return good},verify:async()=>{}}
 await assert.rejects(runMetadataConfigBatch(ops,{...base,preflight:async()=>{throw Error('capacity')}}),/capacity/)
 await assert.rejects(runMetadataConfigBatch(ops,{...base,guard:async()=>{throw Error('epoch changed')}}),/epoch changed/);assert.equal(applied,0)
})
test('successful batch verifies aggregate final state after its ordered independently verified children',async()=>{
 const events=[],ops=metadataConfigOperations(target,{pinned:false,effort:'high'});const r=await runMetadataConfigBatch(ops,{preflight:async()=>events.push('preflight'),guard:async()=>{},record:async()=>{},apply:async op=>{events.push(op.field);return good},verify:async expected=>{assert.deepEqual(expected,ops);events.push('verify')}});assert.deepEqual(events,['preflight','pinned','effort','verify']);assert.deepEqual(Object.keys(r),['pinned','effort'])
})
