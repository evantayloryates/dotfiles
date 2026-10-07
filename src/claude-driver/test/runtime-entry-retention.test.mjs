import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {retainCompletedCheck} from '../lib/runtime-entry.mjs'
test('completed helper retention survives subsequent requests and refuses conflicting or unsafe evidence',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'entry-retention-'))
 try{
  const first={phase:'completed',requestId:'rfirst',index:0,generation:6,at:1000},second={...first,requestId:'rsecond',at:2000}
  const file=retainCompletedCheck(dir,first);retainCompletedCheck(dir,second);assert.deepEqual(JSON.parse(fs.readFileSync(file)),first)
  assert.equal(retainCompletedCheck(dir,first),file)
  assert.equal(retainCompletedCheck(dir,{...first,at:3000}),file);assert.throws(()=>retainCompletedCheck(dir,{...first,build:'changed'}));assert.deepEqual(JSON.parse(fs.readFileSync(file)),first)
  for(const change of [{requestId:'../foreign'},{index:-1},{phase:'selected'}])assert.throws(()=>retainCompletedCheck(dir,{...first,...change}))
  const link=path.join(dir,'broker-check-rsymlink-0-g6.completed.json');fs.symlinkSync(file,link)
  assert.throws(()=>retainCompletedCheck(dir,{...first,requestId:'rsymlink'}))
  assert.equal(fs.readdirSync(dir).some(name=>name.endsWith('.tmp')),false)
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
