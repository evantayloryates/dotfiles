import test from 'node:test'
import assert from 'node:assert/strict'
import {auditRequests} from '../src/lib/request-audit.mjs'
test('receipt inspection failures remain exact unresolved IDs without raw errors or payloads',()=>{
 const r=auditRequests({list:()=>['settled.json','unknown.json','safe.json'],inspect:id=>{if(id==='unknown')throw Object.assign(Error('PRIVATE'),{category:'outcome_unknown'});return {state:id==='safe'?'cancelled':'completed',receiptVerified:id==='settled',retrySafe:id==='safe',args:'PRIVATE'}}})
 assert.equal(r.complete,true);assert.equal(r.settledForHandoff,false);assert.deepEqual(r.unresolved.map(x=>x.requestId),['unknown']);assert.equal(r.unresolved[0].category,'outcome_unknown');assert.equal(JSON.stringify(r).includes('PRIVATE'),false)
})
test('budget and unavailable inventory never masquerade as settled work',()=>{
 let calls=0
 const r=auditRequests({limit:1,list:()=>['a.json','b.json'],inspect:()=>{calls++;return {state:'completed',receiptVerified:true}}})
 assert.equal(calls,1);assert.equal(r.complete,false);assert.equal(r.settledForHandoff,false);assert.equal(r.total,2)
 assert.equal(auditRequests({list:()=>{throw Error('private')}}).settledForHandoff,false)
 assert.equal(auditRequests({list:()=>[]}).settledForHandoff,true)
})
