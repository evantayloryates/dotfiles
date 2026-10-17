import test from 'node:test'
import assert from 'node:assert/strict'
import {independentServiceState} from '../lib/independent-service-result.mjs'
import {OPS,validateOp} from '../lib/driver.mjs'
const session='local_11111111-1111-4111-8111-111111111111',service='a'.repeat(32)
test('explicit receiver derives only its private generation namespace',()=>{
 assert.equal(independentServiceState(session,service,{sessionId:session,cwd:'/owned/receiver'}),'/owned/receiver/.claude-driver-services/'+service)
 for(const [s,id,record]of [[session,'../foreign',{sessionId:session,cwd:'/owned'}],['title',service,{sessionId:session,cwd:'/owned'}],[session,service,{sessionId:'foreign',cwd:'/owned'}],[session,service,{sessionId:session,cwd:'relative'}],[session,service,{sessionId:session,cwd:'/owned/../foreign'}],[session,service,{sessionId:session,cwd:'/'}],[session,service,null]])assert.throws(()=>independentServiceState(s,id,record),e=>e.category==='bad_args')
})
test('durable reconciliation retains explicit opt-in and legacy arguments',()=>{
 const op=OPS.find(x=>x.name==='broker_service_result_reconcile');assert.equal(op.readOnly,false);assert.equal(op.schema.properties.session.type,'string')
 const legacy={service_id:service,request_id:'rpeer'+'b'.repeat(32),experimental:true};assert.doesNotThrow(()=>validateOp(op.name,legacy));assert.doesNotThrow(()=>validateOp(op.name,{...legacy,session}))
 assert.throws(()=>validateOp(op.name,{...legacy,experimental:false}))
})

test('native request identity is recoverable from durable job without launching another worker',async()=>{
 const {independentServiceRequestId,readIndependentService}=await import('../lib/independent-service-result.mjs'),job='j'+'c'.repeat(32)
 assert.equal(independentServiceRequestId(job),'rpeer'+'c'.repeat(32));assert.equal(independentServiceRequestId(job),independentServiceRequestId(job));assert.match(independentServiceRequestId(),/^rpeer[a-f0-9]{32}$/)
 for(const id of ['title','../other','jBAD',null])assert.throws(()=>independentServiceRequestId(id),e=>e.category==='bad_args')
 const controller=new AbortController();controller.abort();await assert.rejects(readIndependentService(session,service,session,{signal:controller.signal}),e=>e.category==='cancelled'&&e.detail.dispatched===false)
 const op=OPS.find(x=>x.name==='broker_service_read');assert.equal(op.schema.properties.session.type,'string');assert.doesNotThrow(()=>validateOp(op.name,{service_id:service,session_id:session,session,experimental:true}))
})
