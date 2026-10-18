import {test} from 'node:test'
import assert from 'node:assert/strict'
import {reconcileTierAImport} from '../lib/tiera.mjs'
const identity={sessionId:'local_12345678-1234-1234-1234-123456789abc',cliSessionId:'12345678-1234-1234-1234-123456789abc',cwd:'/owned',title:'Owned fork',forkedFrom:'local_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}
test('import intent precedes one native import and saved identity verification',async()=>{
 const calls=[];const result=await reconcileTierAImport(identity,{navigationIntent:id=>calls.push(['intent',id])},{import:async id=>calls.push(['import',id]),wait:async(id,p)=>{calls.push(['wait',id]);assert.equal(p(identity),true);for(const patch of [{cwd:'/foreign'},{cliSessionId:'foreign'},{title:'other'}])assert.equal(p({...identity,...patch}),false);return {ok:true,record:{...identity,permissionMode:'acceptEdits'}}}})
 assert.deepEqual(calls,[['intent',identity.sessionId],['import',identity.cliSessionId],['wait',identity.sessionId]]);assert.equal(result.permissionMode,'acceptEdits')
})
test('uncertain import never repeats and retains original created fork identity',async()=>{
 let imports=0,waits=0;const original=Object.assign(Error('transport failed'),{category:'outcome_unknown',detail:{requestId:'original'}})
 await assert.rejects(reconcileTierAImport(identity,{}, {import:async()=>{imports++;throw original},wait:async()=>{waits++},diagnostics:async()=>{throw Error('log unavailable')}}),e=>e===original&&e.detail.requestId==='original'&&e.detail.sessionId===identity.sessionId&&e.detail.forkedFrom===identity.forkedFrom&&e.detail.importAttempted===true&&e.detail.retrySafe===false)
 assert.equal(imports,1);assert.equal(waits,0)
})
test('missing or mismatched saved record retains diagnostics and cannot verify',async()=>{
 for(const record of [null,{...identity,cwd:'/other'}]){let imports=0;await assert.rejects(reconcileTierAImport(identity,{}, {import:async()=>{imports++},wait:async()=>({ok:false,record}),diagnostics:async()=> 'owned import signal'}),e=>e.category===(record?'verify_mismatch':'import_missing')&&e.detail.created===true&&e.detail.retrySafe===false&&e.detail.importLog==='owned import signal');assert.equal(imports,1)}
})
test('navigation registration failure records bootstrap identity without claiming import attempted',async()=>{
 let imports=0;await assert.rejects(reconcileTierAImport(identity,{navigationIntent:()=>{throw Error('registration')}},{import:async()=>{imports++}}),e=>e.detail.created===true&&e.detail.importAttempted===false&&e.detail.retrySafe===false);assert.equal(imports,0)
})
