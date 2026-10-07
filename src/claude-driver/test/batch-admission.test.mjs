import test from 'node:test'
import assert from 'node:assert/strict'
import {indexedCheckpointEvidence,validateBatchAdmission} from '../lib/batch-admission.mjs'
test('legacy native duplicate slots refuse before effects; distinct slots and qualified indexing remain usable',()=>{
 const a={op:'get_session',args:{session_id:'owned',extra:{a:1,b:2}}},same={op:a.op,args:{extra:{b:2,a:1},session_id:'owned'}}
 assert.throws(()=>validateBatchAdmission([a,same],{native:true}),e=>e.category==='broker_ambiguous_batch'&&e.detail.retrySafe===true&&e.detail.dispatched===false&&e.detail.duplicates[0].second===1)
 validateBatchAdmission([a,{...a,args:{session_id:'different'}}],{native:true})
 validateBatchAdmission([a,same],{native:true,indexed:true})
 validateBatchAdmission([a,same],{native:false})
 assert.throws(()=>validateBatchAdmission([{op:'send_message',args:{message:'PRIVATE'}},{op:'send_message',args:{message:'PRIVATE'}}],{native:true}),e=>!JSON.stringify(e).includes('PRIVATE'))
})
test('index capability belongs to completed deployed native entries, not staged code or foreign metadata',()=>{
 const at=Date.now(),runtime={integrity:true,dependencyEvidence:{verified:true},build:'b'.repeat(64),bootstrapHash:'c'.repeat(64),generation:6},live={entrypoint:'claude-desktop',pid:123,procStart:'epoch'},sessionId='local_fixture',entry={phase:'completed',index:1,requestId:'rfixture',at,build:runtime.build,bootstrapHash:runtime.bootstrapHash,generation:6,nativeBinding:{ancestorVerified:true,brokerPid:live.pid,brokerProcStart:live.procStart,brokerSessionId:sessionId}},x={runtime,live,sessionId,entry,now:at}
 assert.equal(indexedCheckpointEvidence(x).verified,true)
 for(const patch of [{index:undefined},{index:-1},{index:'1'},{phase:'selected'},{generation:5},{build:'foreign'},{bootstrapHash:'foreign'},{requestId:'../escape'},{at:at+1},{at:NaN},{nativeBinding:{...entry.nativeBinding,brokerPid:124}},{nativeBinding:{...entry.nativeBinding,brokerProcStart:'old'}},{nativeBinding:{...entry.nativeBinding,ancestorVerified:false}}])assert.equal(indexedCheckpointEvidence({...x,entry:{...entry,...patch}}).verified,false)
 for(const patch of [{integrity:false},{dependencyEvidence:{verified:false}},{build:undefined},{bootstrapHash:undefined},{generation:undefined}])assert.equal(indexedCheckpointEvidence({...x,runtime:{...runtime,...patch}}).verified,false)
 assert.equal(indexedCheckpointEvidence({...x,live:{...live,entrypoint:'cli'}}).verified,false)
})
