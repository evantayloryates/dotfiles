import test from 'node:test'
import assert from 'node:assert/strict'
import {serviceHealth} from '../lib/service-health.mjs'
test('alive and intact is not serving or inference availability',()=>{
 const info={configured:true,live:{pid:123},runtime:{pinned:true,integrity:true,build:'fixture'},resident:{resident:false}}
 const h=serviceHealth(info,{inference:'quota-exhausted',now:1000})
 assert.equal(h.processAlive,true);assert.equal(h.servingChannel,'unverified');assert.equal(h.inference,'quota-exhausted');assert.equal(h.sidecarActionAuthorized,false)
 info.resident.resident=true
 const serving=serviceHealth(info,{now:1000});assert.equal(serving.servingChannel,'observed');assert.equal(serving.inference,'unknown');assert.equal(serving.releaseAuthorized,false)
 info.runtime.integrity=false;assert.equal(serviceHealth(info,{now:1000}).servingChannel,'unverified')
 assert.equal(serviceHealth({}, {now:1000}).processAlive,false)
})
