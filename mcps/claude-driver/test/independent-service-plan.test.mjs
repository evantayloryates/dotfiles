import {test} from 'node:test'
import assert from 'node:assert/strict'
import {planIndependentService} from '../src/lib/independent-service-plan.mjs'
const fixture=()=>({serviceId:'a'.repeat(32),verified:true,verificationMode:'live-native',nativeEpochAssessed:true,sourceDisposition:'installed',admissionStopped:false,stopMarkerMatchesGeneration:false,terminalAttemptReviewComplete:true,unresolvedRequestIds:[],nativeInputRequired:false,nativeEpoch:{status:'idle'},deadline:300000,configuredMaxRequests:6,reservedSlots:2,unreservedSlots:4,readinessObserved:true,nativePolicyObserved:true})
const plan=s=>planIndependentService(s,{now:100000})
test('healthy current receiver routes read without authorizing any effect',()=>{const s=fixture(),before=JSON.stringify(s),r=plan(s);assert.equal(r.action,'read');assert.equal(r.readAdmissionQualified,true);assert.equal(r.effectsPerformed,false);assert.equal(r.renewalAuthorized,false);assert.equal(JSON.stringify(s),before)})
test('expiry/capacity recommend bounded renewal; missing policy recommends probe only with spare read capacity',()=>{
 for(const deadline of [0,100000,190000])assert.equal(plan({...fixture(),deadline}).action,'renew')
 assert.equal(plan({...fixture(),reservedSlots:6,unreservedSlots:0}).action,'renew')
 assert.equal(plan({...fixture(),nativePolicyObserved:false}).action,'probe')
 assert.equal(plan({...fixture(),nativePolicyObserved:false,reservedSlots:5,unreservedSlots:1}).action,'renew')
 assert.equal(plan({...fixture(),reservedSlots:5,unreservedSlots:1}).action,'read')
})
test('STOP and uncertainty take priority over exhaustion or expiry',()=>{
 assert.equal(plan({...fixture(),admissionStopped:true,stopMarkerMatchesGeneration:true,deadline:0}).action,'stop')
 const mutations=[s=>s.verified=false,s=>s.verificationMode='historical-retired',s=>s.nativeEpochAssessed=false,s=>s.sourceDisposition='files-retired',s=>s.admissionStopped=true,s=>delete s.admissionStopped,s=>s.terminalAttemptReviewComplete=false,s=>s.unresolvedRequestIds=['unknown'],s=>delete s.unresolvedRequestIds,s=>s.unreservedSlots=99,s=>s.deadline=NaN]
 for(const mutate of mutations){const s=fixture();mutate(s);assert.equal(plan(s).action,'inspect')}
})
test('native loading/input/busy wait without waking or renewing healthy state',()=>{
 assert.equal(plan({...fixture(),readinessObserved:false}).action,'wait')
 assert.equal(plan({...fixture(),nativeInputRequired:true}).reason,'native-input-required')
 assert.equal(plan({...fixture(),nativeEpoch:{status:'busy'}}).action,'wait')
 assert.equal(planIndependentService(fixture(),{now:NaN}).action,'inspect')
})
