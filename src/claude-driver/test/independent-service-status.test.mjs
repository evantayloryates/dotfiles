import test from 'node:test'
import assert from 'node:assert/strict'
import {summarizeIndependentBudget} from '../lib/independent-service-status.mjs'
const config={id:'a'.repeat(32),maxRequests:2},row={schemaVersion:1,serviceId:config.id,slot:0,maxRequests:2,requestId:'rpeer'+'b'.repeat(32)}
test('status reports reservations without treating free slots as serving proof',()=>{
 assert.deepEqual(summarizeIndependentBudget(config,[row,null]),{configuredMaxRequests:2,reservedSlots:1,unreservedSlots:1,reservedRequestIds:[row.requestId]})
 for(const slots of [[{...row,serviceId:'foreign'},null],[row,{...row,slot:1}],[{...row,extra:true},null],[{...row,slot:1},null],[row]])assert.throws(()=>summarizeIndependentBudget(config,slots))
})
