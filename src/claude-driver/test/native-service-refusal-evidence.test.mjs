import test from 'node:test'
import assert from 'node:assert/strict'
import {screenNativeServiceRefusal} from '../lib/native-service-refusal-evidence.mjs'
const iso=n=>new Date(n).toISOString()
function fixture(){const config={id:'a'.repeat(32),brokerSession:'local_11111111-1111-4111-8111-111111111111',brokerCwd:'/owned',build:'b'.repeat(64),notBefore:100,deadline:1000,maxRequests:2},requestId='rpeer'+'c'.repeat(32);return {config,ready:{schemaVersion:1,scope:'owned-native-service-ready',serviceId:config.id,brokerSession:config.brokerSession,brokerCwd:config.brokerCwd,build:config.build,registeredAt:iso(100),deadline:1000,maxRequests:2,nativeCallsRequested:0,modelCallsRequested:0},intent:{schemaVersion:1,scope:'owned-native-service-intent',serviceId:config.id,requestId,brokerSession:config.brokerSession,startedAt:iso(200)},marker:{schemaVersion:1,scope:'owned-native-service-no-dispatch',serviceId:config.id,requestId,brokerSession:config.brokerSession,observedAt:iso(300),reason:'cancelled',nativeMcpCallsRequested:0,modelCallsRequested:0},now:400}}
test('refusal is scoped callback evidence, never broad no-effect or settlement proof',()=>{
 const r=screenNativeServiceRefusal(fixture());assert.equal(r.callbackRefusalObserved,true);assert.equal(r.noEffectQualified,false);assert.equal(r.standardLifecycleSettlementAssessed,false);assert.equal(r.releaseAuthorized,false)
 for(const change of [x=>x.marker.extra=true,x=>x.marker.reason='private-text',x=>x.marker.serviceId='foreign',x=>x.marker.nativeMcpCallsRequested=1,x=>x.intent.requestId='foreign',x=>x.marker.observedAt=iso(100),x=>x.marker.observedAt=iso(500),x=>x.ready.build='foreign']){const x=fixture();change(x);assert.equal(screenNativeServiceRefusal(x).callbackRefusalObserved,false)}
})
