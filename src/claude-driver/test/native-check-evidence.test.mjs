import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {retainCompletedCheck} from '../lib/runtime-entry.mjs'
import {readNativeCompletedCheck} from '../lib/native-check-evidence.mjs'
test('scoped completed evidence survives newer shared entry; legacy fallback is exact and absence-only',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'check-evidence-')),first={phase:'completed',requestId:'rfirst',index:0,generation:6,at:1000},second={...first,requestId:'rsecond',at:2000},shared=path.join(dir,'broker-check-entry.json')
 try{
  const scoped=retainCompletedCheck(dir,first);fs.writeFileSync(shared,JSON.stringify(second))
  assert.deepEqual(readNativeCompletedCheck(dir,'rfirst',6),{entry:first,source:'request-scoped'})
  assert.deepEqual(readNativeCompletedCheck(dir,'rsecond',6),{entry:second,source:'legacy-shared'})
  assert.throws(()=>readNativeCompletedCheck(dir,'rfirst',7));assert.throws(()=>readNativeCompletedCheck(dir,'../foreign',6))
  fs.unlinkSync(scoped);fs.writeFileSync(shared,JSON.stringify(first));assert.equal(readNativeCompletedCheck(dir,'rfirst',6).source,'legacy-shared')
  for(const content of ['{',JSON.stringify(second),'x'.repeat(16385)]){fs.writeFileSync(scoped,content);assert.throws(()=>readNativeCompletedCheck(dir,'rfirst',6))}
  fs.unlinkSync(scoped);fs.symlinkSync(shared,scoped);assert.throws(()=>readNativeCompletedCheck(dir,'rfirst',6))
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
