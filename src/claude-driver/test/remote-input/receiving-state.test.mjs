import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {settleReceivingState} from './receiving-state.mjs'
const state=(text,pid=7)=>({pid,characters:text.length,utf8Bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex')})
const run=async(read,options={})=>{let clock=0;return settleReceivingState({pid:7,text:'abc',timeoutMs:500,stableMs:100,intervalMs:25,...options},{read:()=>read(clock),now:()=>clock,sleep:async ms=>{clock+=ms}})}
test('waits for delayed receiving delivery and a stable exact interval',async()=>{
 const result=await run(t=>state(t<150?'a':'abc'));assert.equal(result.verified,true);assert.equal(result.elapsedMs,250);assert.equal(result.stableMs,100);assert.equal(result.inputAttempts,1)
})
test('a briefly exact state followed by duplicate text never qualifies',async()=>{
 const result=await run(t=>state(t<50?'abc':'abcc'));assert.equal(result.verified,false);assert.equal(result.reason,'receiving-state-not-settled')
})
test('refuses a changed target process instead of accepting its matching text',async()=>{
 const result=await run(()=>state('abc',8));assert.equal(result.verified,false);assert.equal(result.reason,'fixture-process-changed');assert.equal(result.elapsedMs,0)
})
test('a transient observation error resets the stable interval',async()=>{
 const result=await run(t=>{if(t===50)throw Object.assign(Error('atomic snapshot temporarily unavailable'),{code:'EAGAIN'});return state('abc')});assert.equal(result.verified,true);assert.equal(result.elapsedMs,175)
})
test('matching counts without matching bytes and hash do not qualify',async()=>{
 const result=await run(()=>({...state('abc'),utf8Bytes:4}));assert.equal(result.verified,false)
})
