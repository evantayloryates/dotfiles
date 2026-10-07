import test from 'node:test'
import assert from 'node:assert/strict'
import {runNativeServiceReadTransaction} from '../lib/native-service-read.mjs'
function fixture(){const events=[];let now=0,response=true;const d={prepare:async()=>{events.push('prepare');return {request:{id:'rfixture',expiresAt:100}}},enqueue:()=>events.push('enqueue'),claim:async id=>{events.push('claim');return {id}},revalidate:async()=>events.push('revalidate'),send:async()=>events.push('send'),now:()=>now,responsePresent:()=>response,wait:async()=>{now=101},reconcile:async()=>{events.push('reconcile');return {receiptVerified:true}},cancel:async()=>events.push('cancel')};return {d,events,noResponse:()=>response=false}}
test('native service transaction claims only named request, sends once and reconciles before cleanup',async()=>{const s=fixture();assert.equal((await runNativeServiceReadTransaction({requestId:'rfixture'},s.d)).receiptVerified,true);assert.deepEqual(s.events,['prepare','enqueue','claim','revalidate','send','reconcile','cancel'])})
test('abort and uncertain transport never retry; every published request gets cancellation',async()=>{
 for(const stage of ['prepare','claim','revalidate','send']){const s=fixture(),controller=new AbortController(),original=s.d[stage];s.d[stage]=async(...args)=>{const result=await original(...args);controller.abort();if(stage==='send')throw Error('PRIVATE uncertain transport');return result};await assert.rejects(runNativeServiceReadTransaction({requestId:'rfixture',signal:controller.signal},s.d),e=>e.category==='native_service_read_unresolved'&&!e.message.includes('PRIVATE'));assert.ok(s.events.filter(x=>x==='send').length<=1);assert.equal(s.events.includes('cancel'),stage!=='prepare')}
 const s=fixture();s.noResponse();await assert.rejects(runNativeServiceReadTransaction({requestId:'rfixture'},s.d),e=>e.requestId==='rfixture'&&e.retrySafe===false);assert.deepEqual(s.events.slice(-2),['send','cancel'])
})

test('cleanup failure preserves verified result or original uncertain phase without exposing private errors',async()=>{
 const successful=fixture();successful.d.cancel=async()=>{throw Error('PRIVATE cleanup')}
 const result=await runNativeServiceReadTransaction({requestId:'rfixture'},successful.d)
 assert.equal(result.receiptVerified,true);assert.equal(result.cleanupPending,true)
 const uncertain=fixture();uncertain.d.send=async()=>{throw Error('PRIVATE transport')};uncertain.d.cancel=successful.d.cancel
 await assert.rejects(runNativeServiceReadTransaction({requestId:'rfixture'},uncertain.d),e=>e.phase==='send'&&e.requestId==='rfixture'&&e.cleanupPending===true&&e.detail.cleanupPending===true&&e.retrySafe===false&&!e.message.includes('PRIVATE'))
})
test('partial publication failure is conservative and attempts cleanup without delivery',async()=>{
 const s=fixture();s.d.enqueue=()=>{s.events.push('enqueue');throw Error('partial publication')}
 await assert.rejects(runNativeServiceReadTransaction({requestId:'rfixture'},s.d),e=>e.phase==='enqueue'&&e.requestId==='rfixture'&&e.retrySafe===false)
 assert.deepEqual(s.events,['prepare','enqueue','cancel'])
})
