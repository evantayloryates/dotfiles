import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {waitDeadline,MAINTENANCE_INTERVAL_MS} from '../lib/wait-budget.mjs'
const listedAt='2026-10-07T03:43:17.202Z', start=Date.parse(listedAt)
test('successive requests cannot postpone maintenance from its native list epoch',()=>{
 for(const minutes of [0,2,5,8,9,12]) {
  const now=start+minutes*60000
  assert.equal(waitDeadline({now,maxMs:540000,listedAt}),start+MAINTENANCE_INTERVAL_MS)
 }
})
test('already-due maintenance and a shorter local bound remain authoritative',()=>{
 const now=start+MAINTENANCE_INTERVAL_MS
 assert.ok(waitDeadline({now,maxMs:540000,listedAt})<=now)
 assert.equal(waitDeadline({now:start,maxMs:60000,listedAt}),start+60000)
})
test('absent malformed or future evidence never extends the local wait',()=>{
 for(const value of [undefined,null,'not-a-date','2026-10-07T04:00:00Z'])
  assert.equal(waitDeadline({now:start,maxMs:540000,listedAt:value}),start+540000)
})
test('the actual waiter yields before claiming queued work at an expired bound; STOP still wins',()=>{
 const root=mkdtempSync(join(tmpdir(),'claude-wait-budget-')),dir=join(root,'broker')
 const script=fileURLToPath(new URL('../scripts/broker-wait.mjs',import.meta.url))
 try{
  for(const name of ['requests','controls','results'])mkdirSync(join(dir,name),{recursive:true})
  writeFileSync(join(dir,'requests','synthetic.json'),JSON.stringify({id:'synthetic',ops:[{op:'get_session',args:{session_id:'local_fixture'}}],expiresAt:Date.now()+60000}))
  const control=join(dir,'controls','synthetic.json');writeFileSync(control,JSON.stringify({id:'synthetic',state:'pending',dispatched:[]}))
  const run=()=>spawnSync(process.execPath,[script,'--dir',dir,'--max-sec','0'],{encoding:'utf8',timeout:5000})
  const idle=run();assert.equal(idle.status,0,idle.stderr);assert.equal(idle.stdout.trim(),'IDLE')
  assert.equal(JSON.parse(readFileSync(control)).state,'pending','maintenance must not claim the request')
  writeFileSync(join(dir,'STOP'),'synthetic stop')
  const stop=run();assert.equal(stop.status,0,stop.stderr);assert.equal(stop.stdout.trim(),'STOP')
  assert.equal(JSON.parse(readFileSync(control)).state,'pending')
 }finally{rmSync(root,{recursive:true,force:true})}
})
