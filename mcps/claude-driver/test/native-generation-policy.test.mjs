import test from 'node:test'
import assert from 'node:assert/strict'
import {nativeRequestPolicyMatches} from '../src/lib/native-request-binding.mjs'
test('generation-bound request requires matching hook capability, build and live identity',()=>{
 const info={runtime:{nativeRequestBindingVersion:1,build:'a'.repeat(64)},sessionId:'local_owned',live:{pid:123,procStart:'epoch'}}
 const policy={nativeRequestBindingVersion:1,nativeEffectAdmissionVersion:1,build:info.runtime.build,sessionId:info.sessionId,pid:123,procStart:'epoch'}
 assert.equal(nativeRequestPolicyMatches(info,policy),true)
 assert.equal(nativeRequestPolicyMatches(info,null),false)
 for(const key of Object.keys(policy)){
  const missing={...policy};delete missing[key];assert.equal(nativeRequestPolicyMatches(info,missing),false,key)
  assert.equal(nativeRequestPolicyMatches(info,{...policy,[key]:'foreign'}),false,key)
 }
 for(const v of [0,2,'1'])assert.equal(nativeRequestPolicyMatches({...info,runtime:{...info.runtime,nativeRequestBindingVersion:v}},policy),false)
 assert.equal(nativeRequestPolicyMatches({...info,runtime:{}},null),true) // legacy compatibility only
})
