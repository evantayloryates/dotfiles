import {test} from 'node:test'
import assert from 'node:assert/strict'
import {runNativeInterrupt,steerPhaseIdentity} from '../lib/native-steer-route.mjs'
const job='j'+'1'.repeat(32)
test('steer phases have stable distinct native identities, never parent identity',()=>{
 const stop=steerPhaseIdentity(job,'stop'),send=steerPhaseIdentity(job,'send');assert.match(stop,/^j[a-f0-9]{32}$/);assert.notEqual(stop,send);assert.notEqual(stop,job);assert.equal(stop,steerPhaseIdentity(job,'stop'));assert.notEqual(stop,steerPhaseIdentity('j'+'2'.repeat(32),'stop'));assert.throws(()=>steerPhaseIdentity(job,'retry'))
})
function fixture(){const calls=[];return {calls,d:{preflight:async()=>calls.push('preflight'),guard:async idle=>calls.push(idle?'guard-idle':'guard-epoch'),record:async phase=>calls.push(phase),stop:async()=>{calls.push('stop');return {verified:true,status:'idle',stopReceipt:'stopped'}},send:async()=>{calls.push('send');return {nativeAccepted:true,receiptVerified:true,applied:false}}}}}
test('stop and idle proof precede a durably recorded replacement publication',async()=>{const f=fixture();await runNativeInterrupt(f.d);assert.deepEqual(f.calls,['preflight','guard-epoch','before-stop','stop','after-stop','guard-idle','before-send','send','after-send'])})
test('pending stop, changed epoch, cancellation and persistence failure cannot publish replacement',async()=>{
 for(const mutate of [d=>d.stop=async()=>({verified:true,status:'idle',stopReceipt:'requested'}),d=>d.stop=async()=>({verified:true,status:'busy',stopReceipt:'stopped'}),d=>d.guard=async idle=>{if(idle)throw Error('epoch changed or cancelled')},d=>d.record=async p=>{if(p==='before-send')throw Error('disk failure')},d=>d.preflight=async()=>{throw Error('missing second capability')}]){const f=fixture();mutate(f.d);await assert.rejects(runNativeInterrupt(f.d));assert.equal(f.calls.includes('send'),false)}
})
test('uncertain replacement remains failure even after known stop',async()=>{const f=fixture();f.d.send=async()=>({nativeAccepted:false,receiptVerified:false});await assert.rejects(runNativeInterrupt(f.d));assert.equal(f.calls.includes('after-stop'),true)})
