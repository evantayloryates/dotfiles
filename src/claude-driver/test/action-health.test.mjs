import test from 'node:test'
import assert from 'node:assert/strict'
import {assessActionHealth as check} from '../lib/action-health.mjs'
test('requirements are route specific: unavailable app and quota do not constrain local work',()=>{
 const down={appRunning:false,processAlive:false,runtimeIntegrity:false,inference:'quota-exhausted'}
 assert.equal(check('local',down).eligible,true)
 assert.deepEqual(check('desktop',down).unavailable,['app'])
 assert.equal(check('inference',down).eligible,false)
 const native={appRunning:true,processAlive:true,runtimeIntegrity:true,servingChannel:'observed',inference:'quota-exhausted'}
 assert.equal(check('native-sidecar',native).eligible,true)
 assert.equal(check('desktop',native).eligible,true)
 assert.equal(check('inference',native).eligible,false)
 assert.deepEqual(check('native-sidecar',{...native,servingChannel:'unverified'}).unknown,['serving'])
 assert.equal(check('inference',{appRunning:true,inference:'unknown'}).eligible,false)
})
