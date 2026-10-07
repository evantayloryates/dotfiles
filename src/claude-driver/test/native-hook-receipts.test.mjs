import test from 'node:test'
import assert from 'node:assert/strict'
import {nativeHookResult,nativeHookEventError} from '../lib/native-hook-receipts.mjs'
const opts={command:'ccd_session_mgmt/get_session',cliSessionId:'synthetic',cwd:'/synthetic',chain:new Set(['terminal']),notBefore:1000,notAfter:2000}
const row={type:'attachment',uuid:'hook-result',parentUuid:'terminal',timestamp:new Date(1500).toISOString(),sessionId:'synthetic',cwd:'/synthetic',version:'2.1.289',attachment:{type:'hook_success',command:opts.command,hookEvent:'Stop',hookName:'Stop',toolUseID:'hook-run',stdout:'synthetic metadata',stderr:''}}
test('actual hook attachment distinguishes its private result and run identity from an assistant receipt',()=>{
 const r=nativeHookResult(row,opts);assert.equal(r.ok,true);assert.equal(r.source,'native-hook-result');assert.equal(r.stdout,'synthetic metadata');assert.equal(r.hookEventId,'hook-run')
 assert.equal(nativeHookResult({...row,attachment:{...row.attachment,type:'hook_non_blocking_error',stderr:'synthetic refused'}},opts).ok,false)
 const second=nativeHookResult({...row,uuid:'second-result'},opts);assert.equal(second.hookEventId,r.hookEventId);assert.notEqual(second.uuid,r.uuid)
})
test('hook attachment refuses stale, foreign, reset, sidechain, oversized or non-read evidence',()=>{
 for(const r of [{...row,parentUuid:'foreign'},{...row,sessionId:'other'},{...row,cwd:'/other'},{...row,version:'other'},{...row,isSidechain:true},{...row,type:'assistant'},{...row,timestamp:new Date(500).toISOString()},{...row,attachment:{...row.attachment,command:'ccd_session_mgmt/archive_session'}},{...row,attachment:{...row.attachment,stdout:'x'.repeat(65537)}},{...row,attachment:{...row.attachment,hookEvent:'FileChanged'}},{...row,attachment:{...row.attachment,toolUseID:{secret:'never returned'}}}])assert.equal(nativeHookResult(r,opts),null)
 assert.equal(nativeHookResult(row,{...opts,command:'ccd_session_mgmt/archive_session'}),null)
 assert.equal(nativeHookResult(row,{...opts,notAfter:NaN}),null)
})
test('commandless errors preserve event evidence without fabricating a tool or target receipt',()=>{
 const {command,...attachment}=row.attachment,e={...row,attachment:{...attachment,type:'hook_non_blocking_error',stdout:'',stderr:'synthetic disconnected'}}
 const r=nativeHookEventError(e,opts);assert.equal(r.source,'native-hook-event-error');assert.equal(r.commandBound,false);assert.equal(r.command,undefined);assert.equal(r.hookEventId,'hook-run')
 assert.equal(nativeHookResult(e,opts),null)
 for(const bad of [{...e,parentUuid:'foreign'},{...e,sessionId:'other'},{...e,isSidechain:true},{...e,attachment:{...e.attachment,command}},{...e,attachment:{...e.attachment,stdout:'payload'}},{...e,attachment:{...e.attachment,stderr:'x'.repeat(65537)}},{...e,attachment:{...e.attachment,hookEvent:'FileChanged'}},{...e,attachment:{...e.attachment,toolUseID:{private:'never returned'}}}])assert.equal(nativeHookEventError(bad,opts),null)
})
