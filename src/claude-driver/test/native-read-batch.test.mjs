import test,{after} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,mkdirSync,writeFileSync,symlinkSync,readFileSync,existsSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
const state=mkdtempSync(join(tmpdir(),'native-read-test-'));process.env.CLAUDE_DRIVER_STATE_DIR=state
const {normalizeReadTargets,matchMetadataReceipt,nativeReadBatch,nativeReadStatus,recoverNativeReadBatch,reconcileMetadataRows,canRefreshConsumedIdle}=await import('../lib/native-read-batch.mjs')
const {BROKER_DIR}=await import('../lib/state.mjs')
const {installTemporaryHookProbe,bytesHash}=await import('../lib/temporary-hooks.mjs')
const {validateOp,runOp}=await import('../lib/driver.mjs')
after(()=>rmSync(state,{recursive:true,force:true}))
const a='local_00000000-0000-4000-8000-000000000001',b='local_00000000-0000-4000-8000-000000000002'
test('metadata batch coalesces duplicate exact IDs and excludes generic tools/arguments',()=>{
 assert.deepEqual(normalizeReadTargets([a,b,a]),[a,b])
 for(const x of [[],null,[{op:'archive_session'}],['title'],Array(9).fill(a),[a,'local_ffffffff-ffff-ffff-ffff-fffffffffffX']])assert.throws(()=>normalizeReadTargets(x),e=>e.category==='bad_args')
 const op=validateOp('broker_read_batch',{sessions:[a],experimental:true});assert.equal(op.readOnly,false)
 for(const args of [{sessions:[a]},{sessions:[a],experimental:false},{sessions:[a],experimental:true,operation:'archive_session'},{sessions:[a],experimental:true,timeout_sec:4},{sessions:[a],experimental:true,timeout_sec:61}])assert.throws(()=>validateOp('broker_read_batch',args),e=>e.category==='bad_args')
})
test('native metadata receipts map by target, retain distinct attachment IDs and exclude unknown private fields',()=>{
 const r={ok:true,command:'ccd_session_mgmt/get_session',uuid:'attachment',hookEventId:'event',at:new Date().toISOString(),stdout:JSON.stringify({sessionId:a,isArchived:true,pinned:false,isRunning:false,title:'owned',unknown:{message:'PRIVATE_CONTENT'}}),stderr:''}
 const first=matchMetadataReceipt(r,[a,b]);assert.equal(first.metadata.sessionId,a);assert.equal(first.receipt.uuid,'attachment');assert.equal(JSON.stringify(first).includes('PRIVATE_CONTENT'),false)
 const second=matchMetadataReceipt({...r,uuid:'other'},[a]);assert.equal(second.receipt.eventId,first.receipt.eventId);assert.notEqual(second.receipt.uuid,first.receipt.uuid)
 const omitted=matchMetadataReceipt({...r,stdout:JSON.stringify({sessionId:a,isArchived:true,isRunning:false})},[a]);assert.equal(omitted.metadata.pinned,null)
 for(const changed of [{ok:false},{command:'ccd_session_mgmt/archive_session'},{stdout:'invalid'},{stdout:JSON.stringify({sessionId:b,isArchived:true,pinned:false,isRunning:false})},{stdout:JSON.stringify({sessionId:a,isArchived:true,pinned:false,isRunning:'false'})},{stdout:'x'.repeat(65537)}])assert.equal(matchMetadataReceipt({...r,...changed},[a]),null)
})
test('batch preflight and cancellation fail without enrolling settings in an unavailable broker',async()=>{
 const c=new AbortController();c.abort();await assert.rejects(nativeReadBatch([a],{signal:c.signal}),e=>e.category==='cancelled')
 await assert.rejects(runOp('broker_read_batch',{sessions:[a],experimental:true,timeout_sec:5}),e=>e.category==='native_read_refused')
})
test('status exposes bounded phases without private fields, linked files or invented live readiness',()=>{
 const id=a.slice(6),dir=join(state,'native-reads'),path=join(dir,id+'.json');mkdirSync(dir,{recursive:true})
 const p={schemaVersion:1,id,runtimeBuild:'a'.repeat(64),phase:'published',createdAt:1000,expiresAt:5000,peer:{private:'PRIVATE_CONTENT'},settingsBefore:'PRIVATE_SETTINGS',restoration:{restored:true},restorePending:false}
 writeFileSync(path,JSON.stringify(p));const r=nativeReadStatus(id);assert.equal(r.publicationAttempted,true);assert.equal(r.restorationRecorded,true);assert.equal(r.releaseAuthorized,false);assert.equal(JSON.stringify(r).includes('PRIVATE'),false)
 assert.throws(()=>nativeReadStatus('../escape'),e=>e.category==='bad_args')
 writeFileSync(path,JSON.stringify({...p,phase:'PRIVATE_PHASE'}));assert.throws(()=>nativeReadStatus(id),e=>e.category==='native_read_status_invalid')
 rmSync(path);symlinkSync(join(dir,'other'),path);assert.throws(()=>nativeReadStatus(id),e=>e.category==='native_read_status_unavailable')
})
test('expired metadata cleanup preserves unknown original outcome and requires exact idle ownership',async()=>{
 const id=b.slice(6),dir=join(state,'broker'),path=join(state,'native-reads',id+'.json'),epoch={sessionId:a,pid:1234,procStart:'synthetic start'}
 mkdirSync(join(dir,'.claude'),{recursive:true});const settings=Buffer.from('{"hooks":{"Stop":[],"PreToolUse":[]}}\n'),policy=Buffer.from(JSON.stringify({schemaVersion:1,...epoch,settingsHash:bytesHash(settings),nativeEffectAdmissionVersion:1}))
 writeFileSync(join(dir,'.claude/settings.json'),settings);writeFileSync(join(dir,'stop-rescue-policy.json'),policy);writeFileSync(join(dir,'observer.mjs'),'synthetic')
 const expiresAt=Date.now()+5000,p={schemaVersion:1,id,runtimeBuild:'a'.repeat(64),phase:'published',createdAt:Date.now(),expiresAt,targets:[a],epoch,peer:{msgId:'unknown-publication'}}
 writeFileSync(path,JSON.stringify(p));installTemporaryHookProbe(dir,{token:'a'.repeat(32),epoch,operation:'get_session',readTargets:[a],observerScript:join(dir,'observer.mjs'),receiptPath:join(state,'native-reads',id+'.stop.json'),expiresAt})
 const info={sessionId:a,live:{pid:1234,procStart:epoch.procStart,entrypoint:'claude-desktop',status:'idle'},runtime:{integrity:true}}
 assert.equal(nativeReadStatus(id).cleanupPending,true)
 await assert.rejects(recoverNativeReadBatch(id,{info:()=>info,now:expiresAt-1}),e=>e.category==='native_read_cleanup_pending')
 for(const bad of [{...info,live:{...info.live,status:'busy'}},{...info,live:{...info.live,procStart:'other'}},{...info,runtime:{integrity:false}}])await assert.rejects(recoverNativeReadBatch(id,{info:()=>bad,now:expiresAt+1}),e=>e.category==='native_read_cleanup_pending')
 writeFileSync(join(dir,'STOP'),'synthetic');await assert.rejects(recoverNativeReadBatch(id,{info:()=>info,now:expiresAt+1}),e=>e.category==='native_read_cleanup_pending');rmSync(join(dir,'STOP'))
 writeFileSync(path,JSON.stringify({...p,targets:[b]}));await assert.rejects(recoverNativeReadBatch(id,{info:()=>info,now:expiresAt+1}),e=>e.category==='native_read_cleanup_pending');writeFileSync(path,JSON.stringify(p))
 const r=await recoverNativeReadBatch(id,{info:()=>info,now:expiresAt+1});assert.equal(r.originalOutcomeUnchanged,true);assert.equal(r.phase,'published');assert.equal(r.restorationRecorded,true);assert.equal(r.cleanupPending,false);assert.equal(r.releaseAuthorized,false)
 assert.deepEqual(readFileSync(join(dir,'.claude/settings.json')),settings);assert.deepEqual(readFileSync(join(dir,'stop-rescue-policy.json')),policy);assert.equal(existsSync(join(dir,'mechanical-probe.json')),false)
 assert.equal(JSON.parse(readFileSync(path)).phase,'published');assert.equal((await recoverNativeReadBatch(id)).alreadySettled,true)
})
test('receipt reconciliation requires complete causal native evidence and preserves privacy',()=>{
 const epoch={sessionId:a,pid:1234,procStart:'synthetic start'},p={epoch,targets:[a,b],peer:{msgId:'peer'},startedAt:1000,expiresAt:5000,versions:{cli:'2.1.289'},settingsHash:'b'.repeat(64)}
 const root={type:'user',uuid:'root',sessionId:a.slice(6),cwd:BROKER_DIR,version:'2.1.289',origin:{kind:'peer',msg_id:'peer'},timestamp:new Date(1100).toISOString()},assistant={type:'assistant',uuid:'reply',parentUuid:'root',timestamp:new Date(1200).toISOString(),message:{content:[{type:'text',text:'PRIVATE'}]}}
 const receipt=(target,uuid)=>({type:'attachment',uuid,parentUuid:'reply',sessionId:a.slice(6),cwd:BROKER_DIR,version:'2.1.289',timestamp:new Date(1400).toISOString(),attachment:{type:'hook_success',hookEvent:'Stop',hookName:'Stop',toolUseID:'event',command:'ccd_session_mgmt/get_session',stdout:JSON.stringify({sessionId:target,isArchived:true,isRunning:false,private:'PRIVATE'}),stderr:''}})
 const w={scope:'native-stop-hook-witness',token:'a'.repeat(32),observerHash:'c'.repeat(64),msgId:'peer',userUuid:'root',settingsHash:p.settingsHash,epoch,at:1300},rows=[root,assistant,receipt(a,'r1'),receipt(b,'r2')]
 const result=reconcileMetadataRows(p,w,rows);assert.equal(result.length,2);assert.ok(result.every(x=>x.verified&&x.metadataCurrent===false));assert.equal(JSON.stringify(result).includes('PRIVATE'),false)
 for(const invalid of [rows.slice(0,-1),[...rows,receipt(a,'r3')],[...rows,{...root,uuid:'foreign',origin:{kind:'peer',msg_id:'other'}}],[root,{...assistant,message:{content:[{type:'tool_use',name:'mutation'}]}},...rows.slice(2)],[{...root,cwd:'/foreign'},...rows.slice(1)],[root,{...assistant,isSidechain:true},...rows.slice(2)],[...rows,{type:'system',subtype:'compact_boundary',timestamp:new Date(1500).toISOString()}]])assert.throws(()=>reconcileMetadataRows(p,w,invalid),e=>e.category==='native_read_reconciliation_refused')
 assert.throws(()=>reconcileMetadataRows(p,{...w,userUuid:'other'},rows),e=>e.category==='native_read_reconciliation_refused')
})
test('only a consumed older-source idle notice admits one fresh observation',()=>{
 const epoch={sessionId:a,pid:1234,procStart:'synthetic'},idle={verified:false,state:'idle',pendingRemoteSubscription:false,runtimeBuild:'older',epoch}
 assert.equal(canRefreshConsumedIdle(idle,epoch),true)
 for(const bad of [{...idle,pendingRemoteSubscription:true},{...idle,state:'pending'},{...idle,state:'exited'},{...idle,epoch:{...epoch,procStart:'other'}},{...idle,verified:true}])assert.equal(canRefreshConsumedIdle(bad,epoch),false)
})
