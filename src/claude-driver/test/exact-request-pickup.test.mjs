import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const root=mkdtempSync(join(tmpdir(),'claude-exact-pickup-'))
process.env.CLAUDE_DRIVER_STATE_DIR=root
const req=await import('../lib/requests.mjs')
test('exact pickup does not claim or expire other callers work; concurrency claims its own request once',async()=>{
 try{
  const make=(id,expiresAt=Date.now()+60000)=>({id,createdAt:new Date().toISOString(),expiresAt,ops:[{op:'get_session',args:{}}]})
  const foreign=make('rforeign'),expired=make('rforeignexpired',Date.now()-1),own=make('rowner')
  for(const r of [foreign,expired,own])req.enqueue(r)
  assert.equal(await req.pickupPending({requestId:'rmissing'}),null)
  await assert.rejects(req.pickupPending({requestId:'../foreign'}),e=>e.category==='bad_args')
  const picks=await Promise.all(Array.from({length:6},()=>req.pickupPending({requestId:own.id})))
  assert.equal(picks.filter(Boolean).length,1);assert.equal(picks.find(Boolean).id,own.id)
  assert.equal(req.control(foreign.id).state,'pending');assert.equal(req.control(expired.id).state,'pending')
  assert.equal((await req.pickupPending()).id,foreign.id)
 }finally{rmSync(root,{recursive:true,force:true})}
})

test('real scoped waiter publishes only the named request and rejects invalid IDs before claim',()=>{
 const state=mkdtempSync(join(tmpdir(),'claude-exact-waiter-')),dir=join(state,'broker')
 try{
  for(const folder of ['requests','controls'])mkdirSync(join(dir,folder),{recursive:true})
  for(const id of ['rforeign','rowned']){
   writeFileSync(join(dir,'requests',id+'.json'),JSON.stringify({id,createdAt:new Date().toISOString(),expiresAt:Date.now()+60000,ops:[{op:'get_session',args:{session_id:id}}]}))
   writeFileSync(join(dir,'controls',id+'.json'),JSON.stringify({id,state:'pending',dispatched:[]}))
  }
  const run=id=>spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/broker-wait.mjs',import.meta.url)),'--dir',dir,'--request-id',id,'--max-sec','1'],{encoding:'utf8',env:{...process.env,CLAUDE_DRIVER_STATE_DIR:state},timeout:5000})
  const refused=run('../foreign');assert.equal(refused.status,2)
  const r=run('rowned');assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout.slice('REQUEST '.length)).id,'rowned')
  assert.equal(JSON.parse(readFileSync(join(dir,'controls','rforeign.json'))).state,'pending')
 }finally{rmSync(state,{recursive:true,force:true})}
})
