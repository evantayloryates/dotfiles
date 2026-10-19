import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { storeSourcePage, readSourcePage } from '../fixture-source-page.mjs'
test('full cells persist with explicit row pagination and resumable character pages',t=>{
 const root=mkdtempSync(join(realpathSync(tmpdir()),'zdr-source-test-'))
 t.after(()=>rmSync(root,{recursive:true,force:true}))
 const text='wholly-invented-'.repeat(1000)
 const capture=JSON.parse(storeSourcePage([{id:1,text},{id:2,text}],1,root))
 assert.equal(capture.rowCount,1);assert.equal(capture.hasMore,true);assert.equal(capture.cellsTruncated,false)
 let offset=0,serialized=''
 for(;;){const page=JSON.parse(readSourcePage({page_id:capture.page_id,offset,max_chars:1000},root));serialized+=page.content;if(page.nextOffset===null)break;offset=page.nextOffset}
 assert.equal(JSON.parse(serialized).rows[0].text,text)
 assert.throws(()=>readSourcePage({page_id:'../../.env'},root),/arguments_invalid/)
 assert.throws(()=>storeSourcePage([{data:Buffer.from('invented')}],1,root),/binary_refused/)
 assert.throws(()=>storeSourcePage([{text:'x'.repeat(2000001)}],1,root),/too_large_narrow_query/)
})

test('metadata-only capture supports500 structured rows under unchanged byte cap',t=>{const root=mkdtempSync(join(realpathSync(tmpdir()),'zdr-source-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const rows=Array.from({length:501},(_,id)=>({id,n:id*2}));const result=JSON.parse(storeSourcePage(rows,500,root));assert.equal(result.rowCount,500);assert.equal(result.hasMore,true);assert.ok(!Object.hasOwn(result,'rows'));assert.throws(()=>storeSourcePage(rows,501,root),/arguments_invalid/)})
