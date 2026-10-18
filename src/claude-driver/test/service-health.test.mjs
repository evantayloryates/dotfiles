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

test('independent health reports bounded current evidence without equating process or quota with authority',async()=>{
 const {independentServiceHealth:health}=await import('../lib/service-health.mjs'),session='local_11111111-1111-4111-8111-111111111111',serviceId='a'.repeat(32),s={sessionId:session,serviceId,verified:true,verificationMode:'live-native',nativeEpochAssessed:true,nativeEpoch:{pid:42,procStart:'owned epoch',status:'idle'},sourceDisposition:'installed',admissionStopped:false,nativeInputRequired:false,terminalAttemptReviewComplete:true,unresolvedRequestIds:[],unreservedSlots:4,deadline:100000,readinessObserved:true,nativePolicyObserved:true,build:'b'.repeat(64),prompt:'PRIVATE',result:'PRIVATE',cwd:'PRIVATE'},opts={session,serviceId,now:1000},r=health(s,opts);assert.equal(r.nativeReadAdmission,'observed');assert.equal(r.processAlive,true);assert.equal(r.inference,'unknown');assert.equal(r.sidecarActionAuthorized,false);assert.equal(r.modelCallsRequested,0);assert.ok(!JSON.stringify(r).includes('PRIVATE'));
 for(const change of [x=>delete x.nativeEpoch.pid,x=>delete x.nativeEpoch.procStart,x=>delete x.build,x=>x.verified=false,x=>x.sessionId='foreign',x=>x.serviceId='foreign',x=>x.verificationMode='offline-installed',x=>x.readinessObserved=false,x=>x.nativePolicyObserved=false,x=>delete x.unresolvedRequestIds,x=>x.unresolvedRequestIds=['unknown'],x=>x.unreservedSlots=0,x=>x.deadline=900,x=>x.admissionStopped=true,x=>x.nativeEpoch.status='busy']){const x=structuredClone(s);change(x);assert.equal(health(x,opts).nativeReadAdmission,'unverified')}
})
test('explicit health inspects only the named generation and retains sanitized observation',async()=>{
 const {captureIndependentServiceDiagnostics:capture}=await import('../lib/service-diagnostics.mjs'),session='local_11111111-1111-4111-8111-111111111111',serviceId='c'.repeat(32);let calls=0,saved;
 const r=await capture(session,serviceId,{inspect:async(a,b)=>{calls++;assert.equal(a,session);assert.equal(b,serviceId);return {sessionId:session,serviceId,verified:false,prompt:'PRIVATE'}},retain:(snapshot,trigger)=>{saved={snapshot,trigger};return snapshot}});assert.equal(calls,1);assert.equal(r.nativeReadAdmission,'unverified');assert.equal(saved.trigger,'manual');assert.ok(!JSON.stringify(saved).includes('PRIVATE'));await assert.rejects(capture('bad',serviceId,{inspect:()=>{throw Error('must not inspect')}}),/identity/)
})
