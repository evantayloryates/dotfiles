import test from 'node:test'
import assert from 'node:assert/strict'
import {independentStopMatches,runIndependentQuiescence} from '../src/lib/independent-service-quiesce.mjs'
test('STOP ownership is exact generation and epoch; broad legacy stops do not acquire ownership',()=>{
 const pointer={build:'a'.repeat(64),generation:1,pid:42,procStart:'synthetic',sessionId:'local_11111111-1111-4111-8111-111111111111',activatedAt:new Date(100).toISOString()},serviceId='b'.repeat(32),marker={schemaVersion:1,kind:'independent-service-quiesce',serviceId,...Object.fromEntries(['build','generation','pid','procStart','sessionId'].map(k=>[k,pointer[k]])),at:200,nonce:'22222222-2222-4222-8222-222222222222'}
 assert.equal(independentStopMatches(marker,{serviceId,pointer}),true)
 for(const change of [x=>x.serviceId='foreign',x=>x.generation=2,x=>x.pid=43,x=>x.procStart='other',x=>x.extra=true,x=>x.at=99,x=>x.nonce='------------------------------------']){const x=structuredClone(marker);change(x);assert.equal(independentStopMatches(x,{serviceId,pointer}),false)}
 assert.equal(independentStopMatches(null,{serviceId,pointer}),false)
})
test('quiescence holds lifecycle lock through stop and final context/attempt review',async()=>{
 const calls=[];let held=false,stopped=false,contexts=0
 const result=await runIndependentQuiescence({lock:async fn=>{calls.push('lock');held=true;try{return await fn()}finally{held=false;calls.push('unlock')}},context:async()=>{assert.equal(held,true);contexts++;calls.push('context');return {contexts}},installStop:async()=>{assert.equal(held,true);stopped=true;calls.push('stop')},review:async c=>{assert.equal(held,true);assert.equal(stopped,true);assert.equal(c.contexts,2);calls.push('review');return {quiescent:false,unresolved:['original']}}})
 assert.deepEqual(calls,['lock','context','stop','context','review','unlock']);assert.equal(result.quiescent,false)
})
test('failed epoch before STOP leaves admission alone; failed review never clears installed STOP',async()=>{
 let stopped=false;await assert.rejects(runIndependentQuiescence({lock:fn=>fn(),context:()=>{throw Error('epoch')},installStop:()=>{stopped=true}}),/epoch/);assert.equal(stopped,false)
 await assert.rejects(runIndependentQuiescence({lock:fn=>fn(),context:()=>({}),installStop:()=>{stopped=true},review:()=>{throw Error('uncertain')}}),/uncertain/);assert.equal(stopped,true)
})
test('fresh STOP mode is explicitly offline-only and validates before filesystem/native work',async()=>{const {quiesceIndependentService}=await import('../src/lib/independent-service-quiesce.mjs');for(const options of [{requireNewStop:true},{offline:true,requireNewStop:'true'}])await assert.rejects(quiesceIndependentService('invalid','invalid',options),e=>e.category==='bad_args');const {OPS}=await import('../src/lib/driver.mjs'),op=OPS.find(o=>o.name==='broker_service_quiesce');assert.equal(op.schema.properties.require_new_stop.type,'boolean')})
