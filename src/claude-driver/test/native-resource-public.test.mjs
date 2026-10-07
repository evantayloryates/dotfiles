import test from 'node:test'
import assert from 'node:assert/strict'
import {OPS,validateOp} from '../lib/driver.mjs'
import {nativeServiceResourceReview} from '../lib/native-service-ownership.mjs'
test('resource review public contract requires scoped identity and report and is read only',()=>{
 const op=OPS.find(o=>o.name==='broker_service_resource_review')
 assert.equal(op.readOnly,true)
 assert.equal(validateOp(op.name,{service_id:'a'.repeat(32),evidence_report:'native-resource-trial-1791393093450.json'}).name,op.name)
 assert.throws(()=>validateOp(op.name,{service_id:'a'.repeat(32)}))
 for(const path of ['../outside.json','/tmp/private.json','native-resource-trial-1.json'])assert.throws(()=>nativeServiceResourceReview('a'.repeat(32),path),/disposition refused/)
})
