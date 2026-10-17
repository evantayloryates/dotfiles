import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,readFileSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const root=mkdtempSync(join(tmpdir(),'claude-generation-pickup-'))
process.env.CLAUDE_DRIVER_STATE_DIR=root
const req=await import('../lib/requests.mjs'),state=await import('../lib/state.mjs')
test.after(()=>rmSync(root,{recursive:true,force:true}))
test('helper leaves retired native requests untouched and refuses rollover after pickup',async()=>{
 const pointer={nativeRequestBindingVersion:1,build:'b'.repeat(64),bootstrapHash:'c'.repeat(64),generation:7,sessionId:'local_00000000-0000-4000-8000-000000000001',pid:123,procStart:'epoch'}
 const binding={version:1,...Object.fromEntries(['build','bootstrapHash','generation','sessionId','pid','procStart'].map(k=>[k,pointer[k]]))}
 const pointerFile=join(state.BROKER_DIR,'runtime.json');state.writeJsonAtomic(pointerFile,pointer)
 const make=(id,b)=>({id,createdAt:new Date().toISOString(),expiresAt:Date.now()+60000,nativeObservation:{brokerSessionId:pointer.sessionId},...(b?{nativeRuntimeBinding:b}:{}),ops:[{op:'get_session',args:{}}]})
 const old=make('rold',{...binding,generation:6}),legacy=make('rlegacy'),current=make('rcurrent',binding)
 old.expiresAt=Date.now()-1
 for(const r of [old,legacy,current])req.enqueue(r)
 const bytes=id=>readFileSync(join(state.BROKER_DIR,'controls',id+'.json'),'utf8')
 const oldBytes=bytes(old.id),legacyBytes=bytes(legacy.id)
 assert.equal(await req.pickupPending({requestId:old.id}),null)
 assert.equal(await req.pickupPending({requestId:legacy.id}),null)
 assert.deepEqual(await req.authorizeDispatch(old.id,0),{dispatch:false,reason:'request_generation_mismatch'})
 assert.equal(bytes(old.id),oldBytes);assert.equal(bytes(legacy.id),legacyBytes)
 assert.equal(existsSync(req.resultFile(old.id)),false)
 assert.equal((await req.pickupPending()).id,current.id)
 const pickedBytes=bytes(current.id)
 state.writeJsonAtomic(pointerFile,{...pointer,generation:8})
 assert.deepEqual(await req.authorizeDispatch(current.id,0),{dispatch:false,reason:'request_generation_mismatch'})
 assert.equal(bytes(current.id),pickedBytes)
 state.writeJsonAtomic(pointerFile,pointer)
 assert.equal((await req.authorizeDispatch(current.id,0)).dispatch,true)
 const dispatchedBytes=bytes(current.id)
 state.writeJsonAtomic(pointerFile,{...pointer,generation:8})
 assert.equal((await req.authorizeDispatch(current.id,0)).dispatch,false)
 assert.equal(bytes(current.id),dispatchedBytes)
})
