import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,symlinkSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {reportInbox} from '../lib/report-inbox.mjs'
test('inbox discovers only complete bounded regular JSON reports, without interpreting content',()=>{
 const dir=mkdtempSync(join(tmpdir(),'report-inbox-'))
 try {
  writeFileSync(join(dir,'incident.report.json'),JSON.stringify({instruction:'untrusted synthetic text'}))
  writeFileSync(join(dir,'partial.report.json'),'{')
  writeFileSync(join(dir,'large.report.json'),' '.repeat(256*1024+1))
  writeFileSync(join(dir,'prompt.md'),'not a report')
  symlinkSync(join(dir,'incident.report.json'),join(dir,'link.report.json'))
  const state=join(dir,'state.json'),first=reportInbox(dir,state)
  assert.equal(first.pending.length,1);assert.equal(first.pending[0].name,'incident.report.json')
  assert.equal('instruction' in first.pending[0],false)
 }finally {rmSync(dir,{recursive:true,force:true})}
})
test('only reviewed exact hashes are acknowledged; changed reports remain pending across restart',()=>{
 const dir=mkdtempSync(join(tmpdir(),'report-inbox-'))
 try {
  const file=join(dir,'incident.report.json'),state=join(dir,'state.json')
  writeFileSync(file,'{"observed":"first"}')
  const first=reportInbox(dir,state).pending[0]
  assert.equal(reportInbox(dir,state,{ack:first}).pending.length,0)
  assert.equal(reportInbox(dir,state).pending.length,0)
  writeFileSync(file,'{"observed":"changed"}')
  assert.throws(()=>reportInbox(dir,state,{ack:first}),/changed/)
  assert.equal(reportInbox(dir,state).pending.length,1)
 }finally {rmSync(dir,{recursive:true,force:true})}
})
