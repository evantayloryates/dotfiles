import test from 'node:test'
import assert from 'node:assert/strict'
import {screenNativeServiceResult} from '../lib/native-peer-service-evidence.mjs'
const rid='rpeer'+'1'.repeat(32),owner='local_11111111-1111-4111-8111-111111111111',target='local_22222222-2222-4222-8222-222222222222',build='a'.repeat(64),iso=n=>new Date(n).toISOString()
function fixture(){return {
 config:{id:'b'.repeat(32),brokerSession:owner,brokerCwd:'/owned',build,notBefore:500,deadline:3000,maxRequests:4},
 ready:{schemaVersion:1,scope:'owned-native-service-ready',serviceId:'b'.repeat(32),brokerSession:owner,brokerCwd:'/owned',build,registeredAt:iso(600),deadline:3000,maxRequests:4,nativeCallsRequested:0,modelCallsRequested:0},
 intent:{schemaVersion:1,scope:'owned-native-service-intent',serviceId:'b'.repeat(32),requestId:rid,brokerSession:owner,startedAt:iso(1000)},
 receipt:{schemaVersion:1,scope:'owned-native-service-result',serviceId:'b'.repeat(32),requestId:rid,brokerSession:owner,targetSession:target,startedAt:iso(1000),receivedAt:iso(1100),isError:false,content:[{type:'text',text:JSON.stringify({sessionId:target,isArchived:false,isRunning:false})}]},
 request:{id:rid,protocol:7,ops:[{op:'get_session',args:{session_id:target}}],createdAt:iso(900),expiresAt:2000},
 epoch:{build,pid:42,procStart:'synthetic'},pointer:{build,pid:42,procStart:'synthetic',sessionId:owner,generation:6,bootstrapHash:'c'.repeat(64),activatedAt:iso(400)},
 entry:{phase:'completed',requestId:rid,index:0,build,generation:6,bootstrapHash:'c'.repeat(64),at:1050,nativeBinding:{ancestorVerified:true,brokerPid:42,brokerProcStart:'synthetic',brokerSessionId:owner}},
 admission:{requestId:rid,index:0,pid:42,procStart:'synthetic',build,generation:6,toolUseId:'toolu_plugin_'+'d'.repeat(30),at:1060},control:{id:rid,dispatched:[0],state:'outcome_unknown'},now:4000
}}
test('historical service result verifies exact read admission without rewriting evidence or claiming settlement',()=>{
 const input=fixture(),before=structuredClone(input),result=screenNativeServiceResult(input)
 assert.equal(result.receiptVerified,true);assert.equal(result.result.ok,true);assert.equal(result.standardLifecycleSettlementAssessed,false);assert.equal(result.releaseAuthorized,false);assert.deepEqual(input,before)
 // Reconciliation may happen after service expiry; dispatch cannot use expired readiness.
 assert.equal(input.now>input.config.deadline,true)
 const failed=fixture();failed.receipt.isError=true;failed.receipt.content=[{type:'text',text:'synthetic native failure'}]
 assert.equal(screenNativeServiceResult(failed).result.ok,false)
})
test('foreign, ambiguous, late or unadmitted results remain unresolved',()=>{
 for(const change of [x=>x.ready.serviceId='foreign',x=>x.intent.extra=true,x=>x.intent.requestId='foreign',x=>x.receipt.targetSession=owner,x=>x.receipt.startedAt=iso(999),x=>x.receipt.receivedAt=iso(2001),x=>x.request.expiresAt=3001,x=>x.request.ops.push(x.request.ops[0]),x=>x.entry.requestId='foreign',x=>x.admission.generation=7,x=>x.control.dispatched=[],x=>x.receipt.content[0].text='{}',x=>x.now=1099]){const x=fixture();change(x);assert.equal(screenNativeServiceResult(x).receiptVerified,false)}
 assert.equal(screenNativeServiceResult().receiptVerified,false)
})

test('shared host reconciliation refuses missing enrollment and malformed identity without leaking parse details',async()=>{
 const {reconcileNativeServiceResult}=await import('../lib/native-peer-service-result.mjs')
 const {OPS}=await import('../lib/driver.mjs'),op=OPS.find(x=>x.name==='broker_service_result_reconcile')
 assert.equal(op.readOnly,false)
 await assert.rejects(op.run({service_id:'invalid',request_id:'invalid'}),/experimental opt-in/)
 for(const [service,request] of [['invalid',rid],['f'.repeat(32),'invalid'],['f'.repeat(32),rid]]){
  await assert.rejects(reconcileNativeServiceResult(service,request),error=>error.category==='native_service_result_refused'&&error.message==='native service result evidence refused; no replay')
 }
})
