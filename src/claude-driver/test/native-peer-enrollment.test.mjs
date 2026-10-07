import test from 'node:test'
import assert from 'node:assert/strict'
import {enrollPeerReadProbe} from '../candidates/native-peer-trigger/enroll.js'
test('peer enrollment writes owned readiness without native execution, then durable exact read once',async()=>{
 const config={id:'22222222-2222-4222-8222-222222222222',token:'claude-driver native-check '+'c'.repeat(32),brokerSession:'local_owned',brokerCwd:'/synthetic',targetSession:'local_fixture',ready:'/synthetic/ready',intent:'/synthetic/intent',report:'/synthetic/report',notBefore:1,deadline:100}
 for(const foreign of [false,true]){
  const handlers={},files=new Map(),calls=[]
  enrollPeerReadProbe((event,fn)=>handlers[event]=fn,config)
  const $={session:{id:async()=>foreign?'local_other':'local_owned',cwd:async()=>'/synthetic'},clock:{now:async()=>10},fs:{exists:async p=>files.has(p),write:async(p,t)=>files.set(p,JSON.parse(t))},mcp:{call:async(...args)=>{calls.push(args);return {isError:false,content:'private result'}}}}
  let forwarded=0
  await handlers['session.start']($,{},async()=>forwarded++)
  assert.equal(forwarded,1);assert.equal(calls.length,0);assert.equal(files.size,foreign?0:1)
  if(!foreign){assert.equal(files.get(config.ready).nativeCallsRequested,0);await handlers['session.start']($,{},async()=>{});assert.equal(files.size,1)}
  await handlers['session.receive']($,{origin:{kind:'peer'},text:config.token},()=>assert.fail('trigger queued'))
  assert.equal(calls.length,foreign?0:1)
  if(!foreign){assert.equal(files.get(config.intent).complete,false);assert.equal(files.get(config.report).complete,true);assert.equal(files.get(config.report).gateQualified,false)}
  assert.ok(!JSON.stringify([...files.values()]).includes('private'))
 }
})
