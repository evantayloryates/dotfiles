import test from 'node:test';
import assert from 'node:assert/strict';
import {inputReadAdmission} from '../src/lib/input-read-admission.mjs';

test('read admission preserves FIFO, bounds waiting and makes release idempotent',async()=>{
 const gate=inputReadAdmission({maxPending:2,waitMs:1000});
 const first=await gate.acquire(),order=[];
 const second=gate.acquire().then(release=>{order.push(2);return release;});
 const third=gate.acquire().then(release=>{order.push(3);return release;});
 assert.equal(gate.health().queued,2);
 await assert.rejects(gate.acquire(),e=>e.code==='input_query_busy');
 first();first();const releaseSecond=await second;
 assert.deepEqual(order,[2]);assert.equal(gate.health().active,true);
 releaseSecond();const releaseThird=await third;assert.deepEqual(order,[2,3]);
 releaseThird();assert.equal(gate.health().active,false);assert.equal(gate.health().queued,0);
});
test('expired queued read is removed and cannot take a later slot',async()=>{
 const gate=inputReadAdmission({maxPending:1,waitMs:15}),release=await gate.acquire();
 await assert.rejects(gate.acquire(),e=>e.code==='input_query_queue_timeout');
 assert.equal(gate.health().queued,0);assert.equal(gate.health().active,true);
 release();const next=await gate.acquire();next();assert.equal(gate.health().active,false);
});
