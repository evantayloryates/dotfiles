import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,statSync,rmSync,symlinkSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {auditNativeEffects} from '../lib/native-effect-evidence.mjs'
test('historical exact effects remain unknown even after a denied helper or successful native result',()=>{
 const dir=mkdtempSync(join(tmpdir(),'effect-evidence-')),file=join(dir,'journal')
 try{
  const use={type:'assistant',uuid:'a',message:{content:[{type:'tool_use',id:'native',name:'native_archive',input:{session_id:'owned'}}]}},result={type:'user',uuid:'b',message:{content:[{type:'tool_result',tool_use_id:'native',content:'private result'}]}}
  writeFileSync(file,[{type:'user',message:{content:[{type:'tool_result',tool_use_id:'denied-check',content:'{"dispatch":false}'}]}},use,result].map(r=>JSON.stringify(r)+'\n').join(''))
  const st=statSync(file),req={id:'rone',nativeObservation:{dev:st.dev,ino:st.ino,offset:0,brokerSessionId:'broker',cliSessionId:'cli'},ops:[{op:'archive',args:{session_id:'owned'}}]},tools={archive:'native_archive'}
  const audit=auditNativeEffects(file,[req,{...req,id:'rtwo'}],tools)
  assert.equal(audit.requests[0].slots[0].matchingNativeCalls[0].result.ok,true)
  assert.equal(audit.requests[0].slots[0].pendingMatchingCalls,0)
  assert.ok(audit.requests.every(r=>r.causalOutcome==='unknown'&&r.retrySafe===false),'identical historical operations cannot settle either request')
  assert.ok(!JSON.stringify(audit).includes('private result'))
  const absent=auditNativeEffects(file,[{...req,ops:[{op:'archive',args:{session_id:'different'}}]}],tools);assert.equal(absent.requests[0].slots[0].matchingNativeCalls.length,0);assert.equal(absent.requests[0].retrySafe,false)
  const pendingFile=join(dir,'pending');writeFileSync(pendingFile,JSON.stringify(use)+'\n');const pendingStat=statSync(pendingFile)
  assert.equal(auditNativeEffects(pendingFile,[{...req,nativeObservation:{...req.nativeObservation,dev:pendingStat.dev,ino:pendingStat.ino}}],tools).requests[0].slots[0].pendingMatchingCalls,1)
  for(const patch of [{ino:0},{offset:st.size+1},{offset:-1},{cliSessionId:'different'}]){const wrong={...req,id:'rwrong',nativeObservation:{...req.nativeObservation,...patch}};assert.throws(()=>auditNativeEffects(file,[req,wrong],tools),e=>e.category==='native_evidence_incomplete')}
  assert.throws(()=>auditNativeEffects(file,[req],tools,{maxBytes:1}))
  assert.throws(()=>auditNativeEffects(file,[req],tools,{maxLineBytes:1}))
  const link=join(dir,'link');symlinkSync(file,link);assert.throws(()=>auditNativeEffects(link,[req],tools))
  for(const body of ['{"type":"assistant"}','bad\n']){writeFileSync(file,body);assert.throws(()=>auditNativeEffects(file,[req],tools),e=>e.category==='native_evidence_incomplete')}
 }finally{rmSync(dir,{recursive:true,force:true})}
})
