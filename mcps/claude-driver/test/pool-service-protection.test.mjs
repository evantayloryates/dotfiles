import {test,after} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const root=mkdtempSync(join(tmpdir(),'claude-pool-service-'))
process.env.CLAUDE_DRIVER_STATE_DIR=join(root,'state');process.env.CLAUDE_DRIVER_APP_SUPPORT=join(root,'app');process.env.CLAUDE_DRIVER_PEER_SESSIONS_DIR=join(root,'peers')
const pool=await import('../src/lib/pool.mjs'),{runOp}=await import('../src/lib/driver.mjs')
const primary='local_11111111-1111-4111-8111-111111111111',standby='local_22222222-2222-4222-8222-222222222222',ordinary='local_33333333-3333-4333-8333-333333333333'
const state=join(root,'state'),store=join(root,'app','claude-code-sessions','account','org'),enrollment=join(state,'session-management-controller.json')
mkdirSync(store,{recursive:true,mode:0o700});mkdirSync(join(state,'standby-enrollments'),{recursive:true,mode:0o700})
const controller={schemaVersion:1,controllerSession:primary,receiverCwd:root,enrolledAt:1}
writeFileSync(enrollment,JSON.stringify(controller),{mode:0o600})
writeFileSync(join(state,'standby-enrollments',primary+'.json'),JSON.stringify({schemaVersion:2,automaticRecovery:true,enrolledAt:1,familyRequestId:'rpeer'+'f'.repeat(32),primary:{sessionId:primary,serviceId:'a'.repeat(32),cwd:root,pid:100,procStart:'old primary'},standby:{sessionId:standby,serviceId:'b'.repeat(32),cwd:root,pid:101,procStart:'old standby'}}),{mode:0o600})
for(const id of [primary,standby,ordinary])writeFileSync(join(store,id+'.json'),JSON.stringify({sessionId:id,cwd:root,title:'pool member',permissionMode:'bypassPermissions',cliSessionId:null,isArchived:true,prs:[{url:'https://example.invalid/closed',state:'MERGED'}]}))
after(()=>rmSync(root,{recursive:true,force:true}))
test('retained primary and standby cannot be suggested or recycled, including override',async()=>{
 for(const id of [primary,standby]){assert.ok(pool.poolGate({sessionId:id,permissionMode:'bypassPermissions'},{override:true}).includes('is a retained independent service actor'));await assert.rejects(runOp('pool_release',{session:id,override:true}),e=>e.category==='gate_pool'&&e.message.includes('retained independent service actor'))}
 const suggestions=await runOp('pool_status',{suggest:true});assert.equal(suggestions.candidates.some(r=>[primary,standby].includes(r.sessionId)),false);assert.equal(suggestions.candidates.some(r=>r.sessionId===ordinary),true)
 assert.deepEqual(pool.poolOf(),{})
})
test('stale claimed and clean archived service actors remain retained and never claimed',async()=>{
 await pool.setEntry(primary,{state:'parked',folder:root,parkedAt:0});await pool.setEntry(standby,{state:'claimed',folder:root,claimedAt:0});await pool.setEntry(ordinary,{state:'parked',folder:root,parkedAt:1})
 const rows=await pool.reconcile();for(const id of [primary,standby])assert.equal(rows.find(r=>r.sessionId===id).status,'service_protected')
 const pick=await pool.claim(root,{title:'ordinary only'});assert.equal(pick.sessionId,ordinary);assert.equal(pool.poolOf()[primary].state,'parked');assert.equal(pool.poolOf()[standby].state,'claimed');assert.equal(await pool.claim(root,{title:'must not consume services'}),null)
})
test('malformed retained enrollment fails closed without changing pool inventory',async()=>{
 const before=JSON.stringify(pool.poolOf()),bytes=readFileSync(enrollment);writeFileSync(enrollment,'{}')
 try{await assert.rejects(pool.claim(root,{title:'must refuse'}));assert.equal(JSON.stringify(pool.poolOf()),before)}finally{writeFileSync(enrollment,bytes)}
})
