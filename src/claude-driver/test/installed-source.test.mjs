import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {installedModuleContaining,installedWindowContaining,cutInstalledFunction} from '../lib/installed-source.mjs'

test('installed source extraction handles chunk boundaries and refuses missing or ambiguous windows',()=>{
 const dir=mkdtempSync(join(tmpdir(),'driver-source-')),file=join(dir,'binary'),marker='function exact_marker()'
 try{
  const prefix=Buffer.alloc(2*1024*1024-8,0),module=Buffer.from(marker+'{return 1;}function next(){}\0')
  writeFileSync(file,Buffer.concat([prefix,module]))
  const s=installedModuleContaining(file,marker);assert.equal(s.offset,prefix.length);assert.ok(s.text.startsWith(marker))
  const w=installedWindowContaining(file,marker,{before:2,after:80});assert.equal(w.markerOffset,2);assert.equal(w.offset,prefix.length-2)
  assert.equal(cutInstalledFunction(s.text,marker,'function next()'),marker+'{return 1;}')
  assert.throws(()=>installedWindowContaining(file,'missing'),/missing/)
  writeFileSync(file,marker+'\0'+marker+'\0')
  assert.throws(()=>installedWindowContaining(file,marker),/ambiguous/)
  assert.throws(()=>cutInstalledFunction(marker+marker+'end',marker,'end'),/schema/)
  assert.throws(()=>installedWindowContaining(file,marker,{after:100000}),/invalid/)
  writeFileSync(file,'x'.repeat(600000)+marker+'\0')
  assert.throws(()=>installedModuleContaining(file,marker),/boundary/)
  assert.ok(installedWindowContaining(file,marker,{after:100}).text.startsWith(marker))
 }finally{rmSync(dir,{recursive:true,force:true})}
})
