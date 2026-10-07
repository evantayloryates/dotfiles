import test from 'node:test'
import assert from 'node:assert/strict'
import {nativeHookResult} from '../lib/native-hook-receipts.mjs'
const opts={command:'ccd_session_mgmt/get_session',cliSessionId:'synthetic',cwd:'/synthetic',chain:new Set(['terminal']),notBefore:1000,notAfter:2000}
const row={type:'attachment',uuid:'hook-result',parentUuid:'terminal',timestamp:new Date(1500).toISOString(),sessionId:'synthetic',cwd:'/synthetic',version:'2.1.289',attachment:{type:'hook_success',command:opts.command,hookEvent:'Stop',hookName:'Stop',toolUseID:'hook-run',stdout:'synthetic metadata',stderr:''}}
test('actual hook attachment distinguishes its private result and run identity from an assistant receipt',()=>{
 const r=nativeHookResult(row,opts);assert.equal(r.ok,true);assert.equal(r.source,'native-hook-result');assert.equal(r.stdout,'synthetic metadata');assert.equal(r.hookRunId,'hook-run')
 assert.equal(nativeHookResult({...row,attachment:{...row.attachment,type:'hook_non_blocking_error',stderr:'synthetic refused'}},opts).ok,false)
})
test('hook attachment refuses stale, foreign, reset, sidechain, oversized or non-read evidence',()=>{
 for(const r of [{...row,parentUuid:'foreign'},{...row,sessionId:'other'},{...row,cwd:'/other'},{...row,version:'other'},{...row,isSidechain:true},{...row,type:'assistant'},{...row,timestamp:new Date(500).toISOString()},{...row,attachment:{...row.attachment,command:'ccd_session_mgmt/archive_session'}},{...row,attachment:{...row.attachment,stdout:'x'.repeat(65537)}},{...row,attachment:{...row.attachment,hookEvent:'FileChanged'}},{...row,attachment:{...row.attachment,toolUseID:{secret:'never returned'}}}])assert.equal(nativeHookResult(r,opts),null)
 assert.equal(nativeHookResult(row,{...opts,command:'ccd_session_mgmt/archive_session'}),null)
 assert.equal(nativeHookResult(row,{...opts,notAfter:NaN}),null)
})
