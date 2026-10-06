import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,mkdirSync,writeFileSync,existsSync,readFileSync,symlinkSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {candidates,reserve,settle,settled,write} from './autofix.mjs'
const c=iso=>candidates(new Date(iso))
test('Eastern time, floor first, half-hour cutoff, actual month and padded minutes',()=>{
 assert.deepEqual(c('2026-09-25T21:17:00Z'),['sept-25-5p','sept-25-5.17p'])
 assert.deepEqual(c('2026-09-25T21:30:00Z'),['sept-25-5p','sept-25-5.30p'])
 assert.deepEqual(c('2026-09-25T21:30:01Z'),['sept-25-5p','sept-25-6p','sept-25-5.30p'])
 assert.deepEqual(c('2026-10-06T21:05:00Z'),['oct-06-5p','oct-06-5.05p'])
 assert.deepEqual(c('2026-12-01T22:31:00Z'),['dec-01-5p','dec-01-6p','dec-01-5.31p'])
})
test('rounding across midnight, noon, DST gap and repeated fall hour',()=>{
 assert.deepEqual(c('2026-10-07T03:45:00Z'),['oct-06-11p','oct-07-12a','oct-06-11.45p'])
 assert.deepEqual(c('2026-10-06T15:45:00Z'),['oct-06-11a','oct-06-12p','oct-06-11.45a'])
 assert.deepEqual(c('2026-03-08T06:45:00Z'),['mar-08-1a','mar-08-3a','mar-08-1.45a'])
 assert.deepEqual(c('2026-11-01T05:45:00Z'),['nov-01-1a','nov-01-1.45a'])
 assert.deepEqual(c('2026-11-01T06:45:00Z'),['nov-01-1a','nov-01-2a','nov-01-1.45a'])
})
test('atomic reservation follows floor/round/minute and refuses overwrite',()=>{
 const base=mkdtempSync(join(tmpdir(),'autofix-')),date=new Date('2026-09-25T21:45:00Z')
 try{
  assert.equal(reserve({base,date}).slug,'sept-25-5p')
  assert.equal(reserve({base,date}).slug,'sept-25-6p')
  assert.equal(reserve({base,date}).slug,'sept-25-5.45p')
  assert.throws(()=>reserve({base,date}),/occupied/)
 }finally{rmSync(base,{recursive:true,force:true})}
})
test('existing chat title reserves a name even without a folder',()=>{
 const base=mkdtempSync(join(tmpdir(),'autofix-'))
 try{assert.equal(reserve({base,date:new Date('2026-09-25T21:17:00Z'),taken:['⚙️ fix-1p-broker/sept-25-5p']}).slug,'sept-25-5.17p')}
 finally{rmSync(base,{recursive:true,force:true})}
})
function fixture(){
 const base=mkdtempSync(join(tmpdir(),'autofix-')),incident=reserve({base}),dir=incident.dir
 const report={outcome:'no_change',headline:'A <script> is text',summary:'Healthy broker',cause:'Normal app lock',resolution:'No code change',verification:'Metadata readback',activation:'Original broker running',limitations:'Unlock requires Taylor',docs:'Contract reviewed',docsReviewed:true,verified:true,artifacts:['artifacts/evidence.json']}
 writeFileSync(join(dir,'artifacts/evidence.json'),'{}');write(join(dir,'report.json'),report)
 return {base,dir,report,cleanup:()=>rmSync(base,{recursive:true,force:true})}
}
test('settlement renders both reports and hashes evidence with escaped HTML',()=>{const f=fixture();try{
 assert.equal(settle(f.dir,{base:f.base}).settled,true)
 const html=readFileSync(join(f.dir,'summary.html'),'utf8')
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('Technical evidence'))
 assert.ok(existsSync(join(f.dir,'summary.md')));assert.ok(existsSync(join(f.dir,'settled.json')))
}finally{f.cleanup()}})
for(const [label,change] of [['unverified',{verified:false}],['docs skipped',{docsReviewed:false}],['not ready',{outcome:'staged'}],['unresolved',{outcome:'blocked'}],['empty evidence',{artifacts:[]}],['missing evidence',{artifacts:['artifacts/missing.json']}]])test('no settlement for '+label,()=>{const f=fixture();try{
 write(join(f.dir,'report.json'),{...f.report,...change});assert.throws(()=>settle(f.dir,{base:f.base}));assert.ok(!existsSync(join(f.dir,'settled.json')))
}finally{f.cleanup()}})
test('fully staged fix can settle; symlink evidence cannot escape',()=>{const f=fixture();try{
 write(join(f.dir,'report.json'),{...f.report,outcome:'staged',readyForNextLoad:true,releaseAuthorized:true});assert.equal(settle(f.dir,{base:f.base,released:()=>true}).outcome,'staged')
 symlinkSync(join(f.dir,'report.json'),join(f.dir,'artifacts/escape.json'))
 write(join(f.dir,'report.json'),{...f.report,artifacts:['artifacts/escape.json']});assert.throws(()=>settle(f.dir,{base:f.base}),/escapes/)
}finally{f.cleanup()}})

test('editing settled evidence invalidates settlement',()=>{const f=fixture();try{
 settle(f.dir,{base:f.base});assert.equal(settled(f.dir),true)
 writeFileSync(join(f.dir,'artifacts/evidence.json'),'changed');assert.equal(settled(f.dir),false)
}finally{f.cleanup()}})

test('declaring release without a real gate cannot settle a fix',()=>{const f=fixture();try{
 write(join(f.dir,'report.json'),{...f.report,outcome:'applied',releaseAuthorized:true})
 assert.throws(()=>settle(f.dir,{base:f.base,released:()=>false}),/first notification click/)
}finally{f.cleanup()}})
