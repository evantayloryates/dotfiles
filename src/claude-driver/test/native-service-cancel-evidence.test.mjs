import test from 'node:test'
import assert from 'node:assert/strict'
import {screenNativeServiceCancellation as screen} from '../lib/native-service-cancel-evidence.mjs'
const iso=n=>new Date(n).toISOString(),id='rpeer'+'d'.repeat(32)
function fixture(){
 const config={id:'a'.repeat(32),controlCheck:true,brokerSession:'local_11111111-1111-4111-8111-111111111111',brokerCwd:'/Users/taylor/.local/state/claude-driver/broker',build:'b'.repeat(64),notBefore:1000,deadline:5000,maxRequests:1}
 return {config,now:4000,ready:{schemaVersion:1,scope:'owned-native-service-ready',serviceId:config.id,brokerSession:config.brokerSession,brokerCwd:config.brokerCwd,build:config.build,registeredAt:iso(1000),deadline:5000,maxRequests:1,nativeCallsRequested:0,modelCallsRequested:0},intent:{schemaVersion:1,scope:'owned-native-service-intent',serviceId:config.id,requestId:id,brokerSession:config.brokerSession,startedAt:iso(2000)},marker:{schemaVersion:1,scope:'owned-native-service-cancel-before-call',serviceId:config.id,requestId:id,brokerSession:config.brokerSession,observedAt:iso(3000),nativeMcpCallsRequested:0,modelCallsRequested:0},request:{id,protocol:7,createdAt:iso(1500),expiresAt:4500,ops:[{op:'get_session',args:{session_id:'local_22222222-2222-4222-8222-222222222222'}}]},control:{id,cancelRequested:true,dispatched:[0],at:2500}}
}
test('bound cancellation marker qualifies observation only, never no-effect settlement',()=>{
 const r=screen(fixture());assert.equal(r.cancellationObserved,true);assert.equal(r.noEffectQualified,false);assert.equal(r.standardLifecycleSettlementAssessed,false);assert.equal(r.releaseAuthorized,false)
})
test('foreign, malformed, post-expiry or uncorrelated cancellation evidence refuses',()=>{
 for(const mutate of [f=>f.marker.requestId='foreign',f=>f.marker.extra=true,f=>f.marker.nativeMcpCallsRequested=1,f=>f.control.cancelRequested=false,f=>f.control.at=3100,f=>f.control.dispatched=[],f=>f.marker.observedAt=iso(4900),f=>f.request.ops[0].op='send_message',f=>f.config.controlCheck=false]){const f=fixture();mutate(f);assert.equal(screen(f).cancellationObserved,false)}
})
