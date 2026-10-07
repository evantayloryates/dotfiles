import {test} from 'node:test'
import assert from 'node:assert/strict'
import {CronProtection,RESIDENCY_CRON,RESIDENCY_PROMPT} from '../lib/broker-residency.mjs'
const row=(type,b)=>({type,timestamp:'2026-10-07T00:00:00Z',message:{content:[b]}})
const call=(name,input={},id='call')=>row('assistant',{type:'tool_use',name,input,id})
const result=(content,is_error=false,id='call')=>row('user',{type:'tool_result',tool_use_id:id,content,is_error})
const input={cron:RESIDENCY_CRON,prompt:RESIDENCY_PROMPT,recurring:true}
const create='Scheduled recurring job abcdef12 (Every hour at :17). Session-only (not written to disk, dies when Claude exits). Auto-expires after 7 days.'
const list='abcdef12 — Every hour at :17 (recurring) [session-only]: '+RESIDENCY_PROMPT
test('exact native cron create and list receipts expose only owned metadata',()=>{
 const c=new CronProtection();c.feed(call('CronCreate',input));c.feed(result(create));c.feed(call('CronList'));c.feed(result(list))
 assert.equal(c.snapshot().jobs[0].id,'abcdef12');assert.equal(c.snapshot().uncertain,false)
 assert.equal(JSON.stringify(c.snapshot()).includes(RESIDENCY_PROMPT),false)
})
test('model claims, unmatched results and another schedule never establish protection',()=>{
 for(const rows of [[row('assistant',{type:'text',text:create})],[result(create)],[call('CronCreate',{...input,cron:'* * * * *'}),result(create)],[call('CronCreate',{...input,prompt:'user task'}),result(create)],[call('CronCreate',{...input,durable:true}),result(create)]]){
  const c=new CronProtection();rows.forEach(r=>c.feed(r));assert.equal(c.snapshot().jobs.length,0)
 }
})
test('failed and changed-format receipts are uncertain, never claimed successful',()=>{
 for(const output of [result(create,true),result('Created')]){const c=new CronProtection();c.feed(call('CronCreate',input));c.feed(output);assert.equal(c.snapshot().uncertain,true);assert.equal(c.snapshot().jobs.length,0)}
})
test('native list can reconcile an existing exact job without creating or deleting others',()=>{
 const c=new CronProtection();c.feed(call('CronList'));c.feed(result(list+'\n12345678 — Every minute (recurring) [session-only]: PRIVATE_OTHER_JOB'))
 assert.deepEqual(c.snapshot().jobs.map(j=>j.id),['abcdef12']);assert.equal(JSON.stringify(c.snapshot()).includes('PRIVATE_'),false)
})
test('owned deletion and empty native lists clear protection; unknown lists fail closed',()=>{
 const c=new CronProtection();c.feed(call('CronList'));c.feed(result(list));c.feed(call('CronDelete',{id:'abcdef12'}));c.feed(result('Cancelled job abcdef12.'));assert.equal(c.snapshot().jobs.length,0)
 c.feed(call('CronList'));c.feed(result(list));c.feed(call('CronList'));c.feed(result('Unknown format'));assert.equal(c.snapshot().uncertain,true)
 c.feed(call('CronList'));c.feed(result('No scheduled jobs.'));assert.equal(c.snapshot().uncertain,false);assert.equal(c.snapshot().jobs.length,0)
})
test('duplicate owned jobs are exposed, never silently collapsed into one',()=>{
 const c=new CronProtection();c.feed(call('CronList'));c.feed(result(list+'\n'+list.replace('abcdef12','12345678')));assert.equal(c.snapshot().jobs.length,2)
})

test('a list taken before creation cannot attest to the created job',()=>{
 const c=new CronProtection();c.feed(call('CronList'));c.feed(result('No scheduled jobs.'))
 c.feed(call('CronCreate',input));c.feed(result(create))
 assert.equal(c.snapshot().listedAt,null,'require a list after the changed job set')
 c.feed(call('CronList'));c.feed(result(list));assert.ok(c.snapshot().listedAt)
})
test('a create after an earlier nonempty list invalidates that list',()=>{
 const c=new CronProtection();c.feed(call('CronList'));c.feed(result(list))
 c.feed(call('CronCreate',input));c.feed(result(create.replace('abcdef12','12345678')))
 assert.equal(c.snapshot().listedAt,null);assert.equal(c.snapshot().jobs.length,2)
})

test('uncorrelated timestamps, stale or future lists and missing app acknowledgment fail closed',async()=>{
 const {verifyCronProtection}=await import('../lib/broker-residency.mjs')
 const now=Date.parse('2026-10-07T00:10:00Z'),since=now-600000
 const good={jobs:[{id:'abcdef12'}],listedAt:'2026-10-07T00:09:00Z',uncertain:false,pendingCalls:0}
 assert.equal(verifyCronProtection(good,{since,now,appAcknowledged:true}).verified,true)
 for(const state of [{...good,listedAt:undefined},{...good,listedAt:'bad-date'},{...good,listedAt:'2026-10-06T23:59:00Z'},{...good,listedAt:'2026-10-07T00:11:00Z'},{...good,pendingCalls:1},{...good,uncertain:true}])assert.equal(verifyCronProtection(state,{since,now,appAcknowledged:true}).verified,false)
 assert.equal(verifyCronProtection(good,{since,now,appAcknowledged:false}).verified,false)
 assert.equal(verifyCronProtection(good,{now,appAcknowledged:true}).verified,false)
})
test('an issued but unconfirmed owned deletion invalidates protection',()=>{
 const c=new CronProtection();c.feed(call('CronList'));c.feed(result(list));c.feed(call('CronDelete',{id:'abcdef12'}))
 assert.equal(c.snapshot().pendingCalls,1)
 assert.equal(c.snapshot().listedAt,null)
})

test('current-process correlation rejects historical calls and malformed relevant timestamps',()=>{
 const since=Date.parse('2026-10-07T00:00:00Z'),now=since+60000
 const c=new CronProtection({since,now});const historical=call('CronCreate',input);historical.timestamp='2026-10-06T23:59:00Z'
 c.feed(historical);c.feed(result(create));assert.equal(c.snapshot().jobs.length,0)
 c.feed(call('CronList'));c.feed(result(list))
 const unknownDelete=call('CronDelete',{id:'abcdef12'});delete unknownDelete.timestamp;c.feed(unknownDelete)
 assert.equal(c.snapshot().uncertain,true)
 const f=new CronProtection({since,now});const future=call('CronCreate',input);future.timestamp='2026-10-07T00:02:00Z';f.feed(future);assert.equal(f.snapshot().jobs.length,0);assert.equal(f.snapshot().uncertain,true)
})
