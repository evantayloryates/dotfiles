import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {sealedScriptPathMatches} from '../src/lib/stop-rescue.mjs'

test('migrated parent alias selects the exact release script, not a same-byte replacement',()=>{
 const root=mkdtempSync(join(tmpdir(),'claude-rescue-path-'))
 try{
  const canonical=join(root,'canonical'),alias=join(root,'legacy'),script=join(canonical,'rescue.mjs')
  mkdirSync(canonical);writeFileSync(script,'sealed script');symlinkSync(canonical,alias,'dir')
  assert.equal(sealedScriptPathMatches(script,script),true)
  assert.equal(sealedScriptPathMatches(join(alias,'rescue.mjs'),script),true)
  const copy=join(root,'copy.mjs');writeFileSync(copy,'sealed script')
  assert.equal(sealedScriptPathMatches(copy,script),false)
  const leaf=join(root,'leaf.mjs');symlinkSync(script,leaf)
  assert.equal(sealedScriptPathMatches(leaf,script),false)
  for(const path of [join(root,'missing'),canonical,null,{}])assert.equal(sealedScriptPathMatches(path,script),false)
  assert.equal(sealedScriptPathMatches(script,join(root,'missing')),false)
 }finally{rmSync(root,{recursive:true,force:true})}
})
