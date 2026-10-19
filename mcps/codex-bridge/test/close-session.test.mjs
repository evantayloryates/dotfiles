import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const root=mkdtempSync(join(tmpdir(),'bridge-close-contract-'))
process.env.CODEX_BRIDGE_STATE_DIR=root
const {Bridge}=await import('../src/lib/bridge.mjs')
const {saveState,loadState}=await import('../src/lib/state.mjs')

// No backend, model, native client or helper is started. These assertions
// distinguish the existing public string contract from strict lease cleanup.
for(const strict of [false,true])for(const refused of [false,true])test(`close receipt strict=${strict} refused=${refused}`,async()=>{
 saveState({sessions:{owned:{threadId:'owned-thread'}},grants:{}})
 const bridge=new Bridge(),calls=[]
 bridge.app={connected:true,request:async(method,args)=>{
  calls.push({method,args})
  if(refused)throw Error('thread was not archived. synthetic refusal')
  return {}
 }}
 if(strict&&refused){
  await assert.rejects(bridge.closeSession('owned',{strict}),error=>{
   assert.deepEqual(error.cleanup,{threadId:'owned-thread',archiveAcknowledged:false,archiveOutcome:'unverified',mappingRetained:true,nativeInputReleaseAssessed:false})
   return true
  })
  assert.equal(loadState().sessions.owned.threadId,'owned-thread')
 }else{
  const result=await bridge.closeSession('owned',{strict})
  assert.deepEqual(loadState().sessions,{})
  if(strict)assert.deepEqual(result,{threadId:'owned-thread',archiveAcknowledged:true,mappingDropped:true,nativeInputReleaseAssessed:false})
  else{
   assert.equal(typeof result,'string')
   assert.match(result,refused?/archive failed .*mapping dropped anyway/:/owned-thread archived\./)
  }
 }
 assert.deepEqual(calls,[{method:'thread/archive',args:{threadId:'owned-thread'}}])
})
test.after(()=>rmSync(root,{recursive:true,force:true}))
