import test from 'node:test'
import assert from 'node:assert/strict'
import {screenNativeResourceEvidence as screen} from '../lib/native-resource-evidence.mjs'
const config={id:'a'.repeat(32),marker:true,resourceProbe:true,notBefore:1000,deadline:61000}
const intent={schemaVersion:1,serviceId:config.id,attemptedAt:new Date(1000).toISOString(),selfDeadline:91000,modelCallsRequested:0}
const ready={schemaVersion:1,scope:'owned-native-resource',serviceId:config.id,pid:123,ppid:456,startedAt:new Date(1250).toISOString(),selfDeadline:91000}
test('resource evidence distinguishes bounded self-exit from intentional signal without disposal qualification',()=>{
 for(const [reason,code,ended]of [['deadline',0,91000],['SIGTERM',143,62000],['SIGINT',130,62000]]){
  const exit={...ready,reason,code,exitedAt:new Date(ended).toISOString()}
  const r=screen({config,intent,ready,exit,now:92000});assert.equal(r.valid,true);assert.equal(r.resourceDisposalQualified,false);assert.equal(r.endedBeforeDeadline,reason!=='deadline')
 }
})
test('foreign, impossible and changed identities refuse',()=>{
 const exit={...ready,reason:'SIGTERM',code:143,exitedAt:new Date(62000).toISOString()}
 for(const change of [{pid:999},{serviceId:'b'.repeat(32)},{code:0},{reason:'governor'},{exitedAt:new Date(500).toISOString()},{extra:true}])assert.equal(screen({config,intent,ready,exit:{...exit,...change},now:92000}).valid,false)
 assert.equal(screen({config,intent,ready:{...ready,startedAt:new Date(62000).toISOString()},now:92000}).valid,false)
})
