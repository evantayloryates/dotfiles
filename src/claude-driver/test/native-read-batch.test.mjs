import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
const state=mkdtempSync(join(tmpdir(),'native-read-test-'));process.env.CLAUDE_DRIVER_STATE_DIR=state
const {normalizeReadTargets,matchMetadataReceipt,nativeReadBatch}=await import('../lib/native-read-batch.mjs')
const {validateOp,runOp}=await import('../lib/driver.mjs')
after(()=>rmSync(state,{recursive:true,force:true}))
const a='local_00000000-0000-4000-8000-000000000001',b='local_00000000-0000-4000-8000-000000000002'
test('metadata batch coalesces duplicate exact IDs and excludes generic tools/arguments',()=>{
 assert.deepEqual(normalizeReadTargets([a,b,a]),[a,b])
 for(const x of [[],null,[{op:'archive_session'}],['title'],Array(9).fill(a),[a,'local_ffffffff-ffff-ffff-ffff-fffffffffffX']])assert.throws(()=>normalizeReadTargets(x),e=>e.category==='bad_args')
 const op=validateOp('broker_read_batch',{sessions:[a],experimental:true});assert.equal(op.readOnly,false)
 for(const args of [{sessions:[a]},{sessions:[a],experimental:false},{sessions:[a],experimental:true,operation:'archive_session'},{sessions:[a],experimental:true,timeout_sec:4},{sessions:[a],experimental:true,timeout_sec:61}])assert.throws(()=>validateOp('broker_read_batch',args),e=>e.category==='bad_args')
})
test('native metadata receipts map by target, retain distinct attachment IDs and exclude unknown private fields',()=>{
 const r={ok:true,command:'ccd_session_mgmt/get_session',uuid:'attachment',hookEventId:'event',at:new Date().toISOString(),stdout:JSON.stringify({sessionId:a,isArchived:true,pinned:false,isRunning:false,title:'owned',unknown:{message:'PRIVATE_CONTENT'}}),stderr:''}
 const first=matchMetadataReceipt(r,[a,b]);assert.equal(first.metadata.sessionId,a);assert.equal(first.receipt.uuid,'attachment');assert.equal(JSON.stringify(first).includes('PRIVATE_CONTENT'),false)
 const second=matchMetadataReceipt({...r,uuid:'other'},[a]);assert.equal(second.receipt.eventId,first.receipt.eventId);assert.notEqual(second.receipt.uuid,first.receipt.uuid)
 const omitted=matchMetadataReceipt({...r,stdout:JSON.stringify({sessionId:a,isArchived:true,isRunning:false})},[a]);assert.equal(omitted.metadata.pinned,null)
 for(const changed of [{ok:false},{command:'ccd_session_mgmt/archive_session'},{stdout:'invalid'},{stdout:JSON.stringify({sessionId:b,isArchived:true,pinned:false,isRunning:false})},{stdout:JSON.stringify({sessionId:a,isArchived:true,pinned:false,isRunning:'false'})},{stdout:'x'.repeat(65537)}])assert.equal(matchMetadataReceipt({...r,...changed},[a]),null)
})
test('batch preflight and cancellation fail without enrolling settings in an unavailable broker',async()=>{
 const c=new AbortController();c.abort();await assert.rejects(nativeReadBatch([a],{signal:c.signal}),e=>e.category==='cancelled')
 await assert.rejects(runOp('broker_read_batch',{sessions:[a],experimental:true,timeout_sec:5}),e=>e.category==='native_read_refused')
})
