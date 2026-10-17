import {test} from 'node:test'
import assert from 'node:assert/strict'
import {runIndependentReadRoute,routeIndependentRead,admitIndependentReadRoute} from '../lib/independent-service-route.mjs'
function fixture(actions){let selected='old',i=0;const calls=[],records=[];return {calls,records,d:{select:async()=>selected,plan:async()=>({action:actions[i++]??'read'}),record:async phase=>records.push(phase),renew:async()=>{calls.push('renew');selected='new';return {serviceId:'new'}},probe:async()=>{calls.push('probe');return {terminalRefusalVerified:true}},read:async id=>{calls.push('read');return {serviceId:id,receiptVerified:true,state:'completed'}}}}}
test('healthy routing reads once; maintenance routes use distinct bounded steps',async()=>{
 for(const [actions,calls]of [[['read'],['read']],[['probe','read'],['probe','read']],[['renew','read'],['renew','read']],[['renew','probe','read'],['renew','probe','read']]]){const f=fixture(actions),r=await runIndependentReadRoute(f.d);assert.deepEqual(f.calls,calls);assert.equal(r.result.receiptVerified,true)}
})
test('STOP/wait/inspect never dispatch; repeated maintenance recommendation cannot loop',async()=>{
 for(const action of ['stop','wait','inspect']){const f=fixture([action]);await assert.rejects(runIndependentReadRoute(f.d),e=>e.action===action);assert.deepEqual(f.calls,[])}
 const f=fixture(['renew','renew']);await assert.rejects(runIndependentReadRoute(f.d));assert.deepEqual(f.calls,['renew'])
 const g=fixture(['probe','probe']);await assert.rejects(runIndependentReadRoute(g.d));assert.deepEqual(g.calls,['probe'])
})
test('uncertain child and changed selection stop without read replay',async()=>{
 for(const phase of ['renew','probe','read']){const f=fixture([phase]);f.d[phase]=async()=>{f.calls.push(phase);throw Error('outcome unknown')};await assert.rejects(runIndependentReadRoute(f.d),/unknown/);assert.deepEqual(f.calls,[phase])}
 const f=fixture(['renew','read']);f.d.renew=async()=>({serviceId:'foreign'});await assert.rejects(runIndependentReadRoute(f.d),/selection changed/);assert.deepEqual(f.calls,[])
})
test('invalid target or missing durable parent fails before route access',async()=>{
 await assert.rejects(routeIndependentRead('invalid','invalid'),/durable job/)
 const s='local_11111111-1111-4111-8111-111111111111';await assert.rejects(routeIndependentRead(s,s,{jobId:'j'+'a'.repeat(32)}),/distinct/)
})
test('completed child job with failed/unverified/foreign native result cannot qualify route success',async()=>{
 for(const patch of [{state:'failed'},{receiptVerified:false},{serviceId:'foreign'}]){const f=fixture(['read']);f.d.read=async()=>{f.calls.push('read');return {serviceId:'old',receiptVerified:true,state:'completed',...patch}};await assert.rejects(runIndependentReadRoute(f.d),/not successfully verified/);assert.deepEqual(f.calls,['read']);assert.equal(f.records.at(-1),'after-read')}
})
test('queue timeout/cancellation before admission is definitive; inner lock failures remain uncertain',async()=>{
 for(const category of ['lock_timeout','cancelled']){let effects=0;await assert.rejects(admitIndependentReadRoute(async()=>{throw Object.assign(Error('blocked'),{category})},async()=>{effects++}),e=>e.detail?.dispatched===false&&e.detail.retrySafe===true&&e.detail.admitted===false);assert.equal(effects,0)}
 const original=Object.assign(Error('inner timeout'),{category:'lock_timeout'});await assert.rejects(admitIndependentReadRoute(async work=>work(),async()=>{throw original}),e=>e===original)
})
