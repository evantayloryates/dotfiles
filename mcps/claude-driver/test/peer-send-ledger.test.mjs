import {test,after} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,appendFileSync,readFileSync,rmSync,symlinkSync,renameSync} from 'node:fs'
import {join} from 'node:path'
const root=mkdtempSync('/tmp/peer-send-');Object.assign(process.env,{CLAUDE_DRIVER_STATE_DIR:join(root,'state'),CLAUDE_DRIVER_PROJECTS_DIR:join(root,'projects')})
const {armPeerSend,reconcilePeerSend}=await import('../src/lib/peer-send-ledger.mjs'),{transcriptPath}=await import('../src/lib/peer-direct.mjs')
const cli='00000000-0000-4000-8000-000000000001',msg='00000000-0000-4000-8000-000000000002',rec={sessionId:cli,hostSessionId:'local_'+cli,cwd:root,pid:process.pid,procStart:'fixture-epoch'},file=transcriptPath(rec),dir=join(root,'state','peer-sends')
mkdirSync(join(file,'..'),{recursive:true});writeFileSync(file,'');after(()=>rmSync(root,{recursive:true,force:true}))
test('concurrent arms grant one publication and reattachment can only reconcile an exact receipt',async()=>{
 const results=await Promise.all(Array.from({length:3},()=>armPeerSend({operationId:'same',rec,payloadDigest:'a'.repeat(64),messageId:msg})))
 assert.equal(results.filter(r=>r.canPublish).length,1);assert.equal(results[0].record.phase,'outcome_unknown')
 assert.equal((await reconcilePeerSend('same')).record.phase,'outcome_unknown')
 appendFileSync(file,JSON.stringify({type:'user',uuid:'receipt-id',sessionId:cli,origin:{kind:'peer',msg_id:msg},timestamp:new Date().toISOString(),message:{content:'PRIVATE_PROMPT'}})+'\n')
 const done=await reconcilePeerSend('same');assert.equal(done.record.phase,'received');assert.equal(done.canPublish,false);assert.equal(done.record.receipt.applied,false)
 await assert.rejects(armPeerSend({operationId:'same',rec,payloadDigest:'a'.repeat(64),messageId:cli}),e=>e.category==='outcome_unknown')
 assert.equal((await armPeerSend({operationId:'same',rec,payloadDigest:'a'.repeat(64),messageId:msg})).canPublish,false)
 assert.equal(readFileSync(join(dir,'same.json'),'utf8').includes('PRIVATE'),false)
})
test('cancelled reattachment and journal rotation retain uncertainty without publication',async()=>{
 await armPeerSend({operationId:'lost',rec,payloadDigest:'a'.repeat(64),messageId:msg})
 const controller=new AbortController();controller.abort()
 await assert.rejects(reconcilePeerSend('lost',{signal:controller.signal}))
 renameSync(file,file+'.old');writeFileSync(file,'')
 await assert.rejects(reconcilePeerSend('lost'),e=>e.category==='outcome_unknown'&&e.detail.retrySafe===false)
 assert.equal((await armPeerSend({operationId:'lost',rec,payloadDigest:'a'.repeat(64),messageId:msg})).canPublish,false)
})
test('malformed or symlinked ledger state cannot be mistaken for an absent send',async()=>{
 writeFileSync(join(dir,'corrupt.json'),'invalid',{mode:0o600})
 await assert.rejects(armPeerSend({operationId:'corrupt',rec,payloadDigest:'a'.repeat(64),messageId:msg}),e=>e.category==='outcome_unknown')
 symlinkSync(join(dir,'same.json'),join(dir,'linked.json'))
 await assert.rejects(armPeerSend({operationId:'linked',rec,payloadDigest:'a'.repeat(64),messageId:msg}),e=>e.category==='outcome_unknown')
})
