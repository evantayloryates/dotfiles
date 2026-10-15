import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,appendFileSync,renameSync,symlinkSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {capturePeerReceiptCursor,readPeerReceipt} from '../lib/peer-receipt.mjs'
import {transcriptPath} from '../lib/peer-direct.mjs'
const msg='00000000-0000-4000-8000-000000000002',cli='00000000-0000-4000-8000-000000000001',now=Date.now()
function fixture(fn){const root=mkdtempSync('/tmp/peer-receipt-');process.env.CLAUDE_DRIVER_PROJECTS_DIR=join(root,'projects');const rec={sessionId:cli,hostSessionId:'local_'+cli,cwd:root,pid:process.pid,procStart:'synthetic-epoch'},file=transcriptPath(rec);mkdirSync(join(file,'..'),{recursive:true});writeFileSync(file,'');try{return fn(rec,file)}finally{rmSync(root,{recursive:true,force:true})}}
const row=changes=>({type:'user',uuid:'native-user-id',sessionId:cli,timestamp:new Date(now).toISOString(),origin:{kind:'peer',msg_id:msg},message:{content:'PRIVATE'},...changes})
test('exact future native peer user receipt is metadata-only and partial records remain pending',()=>fixture((rec,file)=>{
 appendFileSync(file,JSON.stringify(row())+'\n');const cursor=capturePeerReceiptCursor(rec,{now:now-1})
 assert.equal(readPeerReceipt(rec,cursor,msg,{now}).receipt,null)
 const bytes=JSON.stringify(row());appendFileSync(file,bytes.slice(0,20));let out=readPeerReceipt(rec,cursor,msg,{now});assert.equal(out.receipt,null);assert.equal(out.cursor.offset,cursor.offset)
 appendFileSync(file,bytes.slice(20)+'\n');out=readPeerReceipt(rec,out.cursor,msg,{now});assert.equal(out.receipt.messageId,msg);assert.equal(out.receipt.applied,false);assert.equal(JSON.stringify(out).includes('PRIVATE'),false)
}))
test('wrong message, session, origin, sidechain, record type and timestamps never prove receipt',()=>fixture((rec,file)=>{
 const cursor=capturePeerReceiptCursor(rec,{now:now-1})
 const variants=[{origin:{kind:'peer',msg_id:cli}},{sessionId:msg},{origin:{kind:'human',msg_id:msg}},{isSidechain:true},{type:'assistant'},{timestamp:'invalid'},{timestamp:new Date(now+1000).toISOString()},{timestamp:new Date(now-1000).toISOString()}]
 for(const change of variants)appendFileSync(file,JSON.stringify(row(change))+'\n')
 assert.equal(readPeerReceipt(rec,cursor,msg,{now}).receipt,null)
 assert.throws(()=>readPeerReceipt({...rec,procStart:'different'},cursor,msg,{now}),e=>e.category==='outcome_unknown')
}))
test('rotation, truncation, symlink and oversized partial record refuse without retry authority',()=>fixture((rec,file)=>{
 appendFileSync(file,'old\n');const cursor=capturePeerReceiptCursor(rec,{now:now-1})
 writeFileSync(file,'');assert.throws(()=>readPeerReceipt(rec,cursor,msg,{now}),e=>e.category==='outcome_unknown'&&e.detail.retrySafe===false)
 renameSync(file,file+'.old');writeFileSync(file,'new\n');assert.throws(()=>readPeerReceipt(rec,cursor,msg,{now}),e=>e.category==='outcome_unknown')
 rmSync(file);symlinkSync(file+'.old',file);assert.throws(()=>capturePeerReceiptCursor(rec),e=>e.category==='outcome_unknown')
 rmSync(file);writeFileSync(file,'');const fresh=capturePeerReceiptCursor(rec,{now:now-1});appendFileSync(file,'x'.repeat(256*1024));assert.throws(()=>readPeerReceipt(rec,fresh,msg,{now}),e=>e.category==='outcome_unknown')
}))
