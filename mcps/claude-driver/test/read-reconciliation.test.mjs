import {test,after} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,statSync} from 'node:fs'
import {join} from 'node:path'
const root=mkdtempSync('/tmp/driver-read-reconcile-'),state=join(root,'state'),broker=join(state,'broker'),app=join(root,'app'),projects=join(root,'projects'),sid='local_00000000-0000-4000-8000-000000000001',cli=sid.slice(6)
Object.assign(process.env,{CLAUDE_DRIVER_STATE_DIR:state,CLAUDE_DRIVER_APP_SUPPORT:app,CLAUDE_DRIVER_PROJECTS_DIR:projects})
const store=join(app,'claude-code-sessions','a','o'),project=join(projects,broker.replace(/[^A-Za-z0-9]/g,'-'))
for(const p of [store,project])mkdirSync(p,{recursive:true})
writeFileSync(join(store,sid+'.json'),JSON.stringify({sessionId:sid,cliSessionId:cli,cwd:broker}))
const journal=join(project,cli+'.jsonl');writeFileSync(journal,'');const stat=statSync(journal)
const {enqueue,inspectRequest}=await import('../src/lib/requests.mjs');const {writeJsonAtomic}=await import('../src/lib/state.mjs')
after(()=>rmSync(root,{recursive:true,force:true}))
test('receipt-source drift preserves pure-read retry safety only after cancellation without dispatch',()=>{
 for(const [id,op,stateName,dispatched] of [['read','get_session','expired',[]],['effect','archive_session','expired',[]],['pending','get_session','pending',[]],['dispatched','get_session','expired',[0]]]){
  enqueue({id,protocol:7,createdAt:new Date().toISOString(),expiresAt:Date.now()-1,ops:[{op,args:{session_id:sid}}],nativeObservation:{brokerSessionId:sid,cliSessionId:cli,dev:stat.dev+1,ino:stat.ino,offset:0}})
  writeJsonAtomic(join(broker,'controls',id+'.json'),{id,state:stateName,dispatched})
  if(id==='read'){const r=inspectRequest(id);assert.equal(r.retrySafe,true);assert.equal(r.receiptVerified,false);assert.equal(r.receiptObservation.available,false);assert.equal(r.receiptObservation.category,'outcome_unknown')}
  else {
   assert.throws(()=>inspectRequest(id),e=>e.category==='outcome_unknown')
   const diagnostic=inspectRequest(id,{allowUnavailableReceipt:true})
   assert.equal(diagnostic.state,'outcome_unknown');assert.equal(diagnostic.controlState,stateName)
   assert.equal(diagnostic.retrySafe,false);assert.equal(diagnostic.receiptVerified,false);assert.equal(diagnostic.receiptObservation.available,false)
  }
 }
})
