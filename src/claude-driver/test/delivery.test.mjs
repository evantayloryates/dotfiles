import {test} from 'node:test'
import assert from 'node:assert/strict'
import {deliveryReceipt} from '../lib/delivery.mjs'
test('observed native delivery variants preserve queued versus delivered',()=>{
  assert.equal(deliveryReceipt('delivery: delivered\nmessage_id: abc-123').delivery,'delivered')
  assert.equal(deliveryReceipt('delivery: queued').delivery,'queued')
  assert.equal(deliveryReceipt({delivery:'queued',message_id:'abc'}).messageId,'abc')
  assert.equal(deliveryReceipt('Message will be delivered pending tool execution').delivery,'queued')
  for(const v of [null,{},'SENT','error: Message will be delivered pending tool execution','delivery: failed'])assert.equal(deliveryReceipt(v).delivery,'unknown')
})
