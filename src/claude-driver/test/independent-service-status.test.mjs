import test from 'node:test'
import assert from 'node:assert/strict'
import {summarizeIndependentBudget} from '../lib/independent-service-status.mjs'
const config={id:'a'.repeat(32),maxRequests:2},row={schemaVersion:1,serviceId:config.id,slot:0,maxRequests:2,requestId:'rpeer'+'b'.repeat(32)}
test('status reports reservations without treating free slots as serving proof',()=>{
 assert.deepEqual(summarizeIndependentBudget(config,[row,null]),{configuredMaxRequests:2,reservedSlots:1,unreservedSlots:1,reservedRequestIds:[row.requestId]})
 for(const slots of [[{...row,serviceId:'foreign'},null],[row,{...row,slot:1}],[{...row,extra:true},null],[{...row,slot:1},null],[row]])assert.throws(()=>summarizeIndependentBudget(config,slots))
})

test('activation checkpoints expose phase only, never imply an effect or native consent',async()=>{
 const {summarizeIndependentActivationLedger}=await import('../lib/independent-service-status.mjs'),serviceId='a'.repeat(32),session='local_11111111-1111-4111-8111-111111111111',ledger={schemaVersion:1,kind:'independent-service-activation',serviceId,sessionId:session,build:'b'.repeat(64),phase:'before-publish',at:100,servingQualified:false,scopedUnloadQualified:false}
 assert.deepEqual(summarizeIndependentActivationLedger(ledger,{serviceId,session}),{activationPhaseObserved:'before-publish',activationEffectsAssessed:false})
 assert.equal(summarizeIndependentActivationLedger(null,{serviceId,session}).activationPhaseObserved,null)
 for(const change of [x=>x.serviceId='foreign',x=>x.phase='ready',x=>x.servingQualified=true,x=>x.at=NaN,x=>x.build='foreign']){const x=structuredClone(ledger);change(x);assert.throws(()=>summarizeIndependentActivationLedger(x,{serviceId,session}))}
})
