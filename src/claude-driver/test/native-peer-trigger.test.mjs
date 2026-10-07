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
test('recognized trigger failures remain consumed and never retry or leak exceptions',async()=>{
 for(const failure of ['id','cwd','clock','run']){
  let handler,calls=0
  const token='claude-driver native-check '+'b'.repeat(32),fail=()=>{throw Error('private synthetic detail')}
  registerPeerTrigger((_event,fn)=>handler=fn,{token,brokerSession:'local_owned',brokerCwd:'/synthetic',deadline:100,run:async()=>{calls++;if(failure==='run')fail()}})
  const $={session:{id:async()=>failure==='id'?fail():'local_owned',cwd:async()=>failure==='cwd'?fail():'/synthetic'},clock:{now:async()=>failure==='clock'?fail():100}}
  const next=()=>assert.fail('recognized trigger reached model queue')
  const first=await handler($,{origin:{kind:'peer'},text:token},next)
  const second=await handler($,{origin:{kind:'peer'},text:token},next)
  assert.equal(first.consumed,'native-check-failed');assert.equal(second.consumed,'native-check-already-consumed')
  assert.equal(calls,failure==='run'?1:0);assert.ok(!JSON.stringify([first,second]).includes('private'))
 }
})
test('exact direct transport envelope is consumed; changed sender and surrounding text pass through',async()=>{
 const token='claude-driver native-check '+'c'.repeat(32),wire=`<cross-session-message from-name="claude-driver" from-mode="bypass">\n${token}\n</cross-session-message>`
 let handler,calls=0,passed=0
 registerPeerTrigger((_event,fn)=>handler=fn,{token,brokerSession:'local_owned',brokerCwd:'/synthetic',deadline:100,run:async()=>calls++})
 const $={session:{id:async()=> 'local_owned',cwd:async()=>'/synthetic'},clock:{now:async()=>100}},next=async()=>{passed++;return {text:'passed'}}
 for(const text of [wire.replace('from-name="claude-driver"','from-name="other"'),wire+' extra',wire.replace('bypass','prompting')])await handler($,{origin:{kind:'peer'},text},next)
 assert.equal(passed,3);assert.equal(calls,0)
 assert.equal((await handler($,{origin:{kind:'peer'},text:wire},next)).consumed,'native-check-completed');assert.equal(calls,1)
})
