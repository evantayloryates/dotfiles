import test from 'node:test'
import assert from 'node:assert/strict'
import {registerPeerTrigger} from '../candidates/native-peer-trigger/receive.js'
test('staged peer trigger is exact, passive, one-use, owner-bound and deadline-bound',async()=>{
 for(const scenario of ['valid','foreign','expired']){
  let handler,calls=0,passed=0
  const token='claude-driver native-check '+'a'.repeat(32)
  registerPeerTrigger((_event,fn)=>handler=fn,{token,brokerSession:'local_owned',brokerCwd:'/synthetic',deadline:100,run:async()=>calls++})
  assert.equal(calls,0)
  const $={session:{id:async()=>scenario==='foreign'?'other':'local_owned',cwd:async()=>'/synthetic'},clock:{now:async()=>scenario==='expired'?101:100}}
  const next=async()=>{passed++;return {text:'passed'}}
  await handler($,{origin:{kind:'human'},text:token},next)
  await handler($,{origin:{kind:'peer'},text:token+' extra'},next)
  assert.equal(passed,2);assert.equal(calls,0)
  const results=await Promise.all([handler($,{origin:{kind:'peer'},text:token},next),handler($,{origin:{kind:'peer'},text:token},next)])
  assert.ok(results.every(x=>typeof x.consumed==='string'));assert.equal(passed,2)
  assert.equal(calls,scenario==='valid'?1:0)
 }
})
