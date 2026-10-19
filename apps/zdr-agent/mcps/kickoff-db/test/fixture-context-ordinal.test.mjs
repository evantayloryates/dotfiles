import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fixtureContext, fixtureAssetsDir } from '../fixture-context.mjs'
import { ordinalFromRows } from '../fixture-ordinal.mjs'
const hasPrivateReferences=existsSync(fixtureAssetsDir+'/generated-pins.json')
const at='2026-01-30T00:00:00Z'
const row=(id,start,minutes,coachId=1,serviceId=null)=>({id,coachId,serviceId,startedAt:start,scheduledAt:start,completedAt:new Date(+new Date(start)+minutes*60000).toISOString(),durationMinutes:minutes})
const ordinal=(rows,call=null,coach_id=1)=>ordinalFromRows(rows,call,{coach_id,at})
test('fixed context pages preserve exact pinned hashes and forbid arbitrary paths',{skip:!hasPrivateReferences},()=>{
 const x=JSON.parse(fixtureContext({document:'contract',max_chars:50}))
 assert.equal(x.content.length,50); assert.equal(x.nextOffset,50)
 const bytes=readFileSync(fixtureAssetsDir+'/contract.txt')
 assert.equal(createHash('sha256').update(bytes).digest('hex'),x.sha256)
 assert.equal(JSON.parse(fixtureContext({document:'contract',offset:50,max_chars:50})).content,bytes.toString().slice(50,100))
 assert.throws(()=>fixtureContext({document:'../../.env'}),/arguments_invalid/)
 assert.throws(()=>fixtureContext({document:'contract',offset:-1}),/arguments_invalid/)
})
test('empty, short floor, summed rejoins, cross-coach and shared services match shipped semantics',{skip:!hasPrivateReferences},()=>{
 assert.equal(ordinal([]).overall,1)
 assert.equal(ordinal([row(1,'2026-01-01T00:00:00Z',7)]).overall,1)
 assert.equal(ordinal([row(1,'2026-01-01T00:00:00Z',8)]).overall,2)
 const rejoined=[row(1,'2026-01-01T00:00:00Z',3),row(2,'2026-01-01T00:08:00Z',5)]
 assert.equal(ordinal(rejoined).overall,2);assert.equal(ordinal(rejoined).groupedSessions,1)
 const shared=[row(1,'2026-01-01T00:00:00Z',5,1,8),row(2,'2026-01-01T03:00:00Z',6,1,8)]
 assert.equal(ordinal(shared).overall,2)
 const changed=[row(1,'2026-01-01T00:00:00Z',30),row(2,'2026-01-10T00:00:00Z',30,2)]
 assert.equal(ordinal(changed,null,2).overall,3);assert.equal(ordinal(changed,null,2).withCoach,2)
})
test('booked target remains separate; unscheduled target rejoins; own completed row retains number',{skip:!hasPrivateReferences},()=>{
 const rows=[row(1,'2026-01-01T00:00:00Z',30)]
 const booked={id:2,coachId:1,serviceId:null,startedAt:'2026-01-01T00:35:00Z',scheduledAt:'2026-01-01T00:35:00Z',scheduledEndAt:'2026-01-01T01:00:00Z'}
 assert.equal(ordinal(rows,booked).overall,2)
 assert.equal(ordinal(rows,{...booked,scheduledEndAt:null}).overall,1)
 assert.equal(ordinal(rows,{...booked,id:1}).overall,1)
})
test('history overflow, unsafe ids and invalid anchor fail without computing partial numbers',{skip:!hasPrivateReferences},()=>{
 assert.throws(()=>ordinal(Array(10001).fill({})),/history_limit/)
 assert.throws(()=>ordinal([{...row(1,'2026-01-01T00:00:00Z',30),id:'9007199254740993'}]),/id_invalid/)
 assert.throws(()=>ordinalFromRows([],null,{coach_id:1,at:'not-a-date'}),/date_invalid/)
 const mysql=[{...row(1,'2026-01-01T00:00:00Z',30),startedAt:'2026-01-01 00:00:00',completedAt:'2026-01-01 00:30:00'}]
 assert.equal(ordinal(mysql).overall,2)
})

import { fixtureFacts } from '../fixture-facts.mjs'
test('local day excludes both boundaries, respects DST and numeric-offset fallback',{skip:!hasPrivateReferences},()=>{
 const value=JSON.parse(fixtureFacts({operation:'day_window',from:'2026-03-07T23:30:00Z',to:'2026-03-11T01:00:00Z',timeZone:'America/New_York'}))
 assert.deepEqual(value.wholeDays,['2026-03-08','2026-03-09'])
 assert.equal(value.fromDay,'2026-03-07');assert.equal(value.toDay,'2026-03-10')
 const offset=JSON.parse(fixtureFacts({operation:'day_window',from:'2026-01-01T23:30:00Z',to:'2026-01-04T00:30:00Z',utcOffset:2}))
 assert.deepEqual(offset.wholeDays,['2026-01-03'])
 assert.throws(()=>fixtureFacts({operation:'day_window',from:'2026-01-05T00:00:00Z',to:'2026-01-01T00:00:00Z'}),/arguments_invalid/)
})
test('device-local sleep dates and manual nullable nutrition precedence match source helpers',{skip:!hasPrivateReferences},()=>{
 const days=JSON.parse(fixtureFacts({operation:'terra_days',rows:[{referenceDate:'2026-01-01',metadata:{start_time:'2026-01-02T01:00:00+02:00'}},{referenceDate:'2026-01-03',metadata:{}}]}))
 assert.deepEqual(days.days,['2026-01-02','2026-01-03'])
 const macros=JSON.parse(fixtureFacts({operation:'macro_merge',rows:[{isAuto:true,calories:100,fat:4,protein:5,carbs:6,fiber:2,sugar:3},{isAuto:false,calories:0,fat:null,protein:null,carbs:null,fiber:null,sugar:null}]})).macros
 assert.equal(macros.calories,0);assert.equal(macros.fat,4)
 assert.equal(JSON.parse(fixtureFacts({operation:'macro_merge',rows:[]})).macros,null)
})
