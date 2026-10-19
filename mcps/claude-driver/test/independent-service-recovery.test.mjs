import {test} from 'node:test'
import assert from 'node:assert/strict'
import {runIndependentRecovery,recoveryReplyObserved,recoverIndependentTarget} from '../src/lib/independent-service-recovery.mjs'
const ref='rpeer'+'a'.repeat(32),service='b'.repeat(32)
const cyclePhases=['preflight','family','quiesce','retire','archive','unarchive','observeBeforeWake','wake','newEpoch','reply','prepare','activate','readiness','policy','read','verify']
function fixture({fail,retired=false,archived=false,wakeFailed=false}={}){
 const calls=[],records=[],args=[],values={preflight:{retired,archived},family:{receiptVerified:true,state:'completed',requestId:ref},quiesce:{quiescent:true,terminalAttemptReviewComplete:true},retire:{filesRetired:true,terminalAttemptReviewComplete:true},archive:{receiptVerified:true,archiveVerified:true,previousPidObservedAbsent:true,state:'completed'},unarchive:{unarchived:true},observeBeforeWake:{cursor:'synthetic'},wake:{receiptVerified:true,wakeNativeReceiptVerified:true,state:wakeFailed?'failed':'completed'},newEpoch:{pid:42},reply:{},prepare:{prepared:true,verified:true,serviceId:service},activate:{installed:true},readiness:{verified:true,readinessObserved:true},policy:{terminalRefusalVerified:true,policyInvocationObserved:true,scopedNoNativeMcpQualified:true},read:{receiptVerified:true,state:'completed'},verify:{settingsPreserved:true,anchorPreserved:true,noUnresolvedAttempts:true,rolePreserved:true}}
 const d={guard:async()=>{},record:async(phase)=>{records.push(phase)},...Object.fromEntries(cyclePhases.map(name=>[name,async(...a)=>{calls.push(name);args.push([name,a]);if(name===fail)throw Error('injected '+name);return values[name]}]))}
 return {d,calls,records,args,values}
}
test('one cycle checkpoints existing children in order and wakes only once',async()=>{
 const f=fixture(),r=await runIndependentRecovery(f.d,{cycle:true})
 assert.deepEqual(f.calls,cyclePhases);assert.deepEqual(f.records,cyclePhases.flatMap(x=>['before-'+x,'after-'+x]));assert.equal(r.serviceId,service);assert.equal(r.nativeColdRecoveryQualified,true);assert.equal(r.unattendedSupervisionQualified,false)
 assert.deepEqual(f.args.find(x=>x[0]==='wake')[1],[ref]);assert.deepEqual(f.args.find(x=>x[0]==='quiesce')[1],[false])
})
test('cold mode never archives or queries a dead target; retired history skips destructive preparation',async()=>{
 for(const retired of [false,true])for(const archived of [false,true]){
  const f=fixture({retired,archived});await runIndependentRecovery(f.d,{familyRequestId:ref})
  assert.equal(f.calls.includes('archive'),false);assert.equal(f.calls.includes('family'),false);assert.equal(f.calls.includes('unarchive'),archived);assert.equal(f.calls.includes('retire'),!retired)
  if(!retired)assert.deepEqual(f.args.find(x=>x[0]==='quiesce')[1],[true])
 }
 const missing=fixture();await assert.rejects(runIndependentRecovery(missing.d),/retained native family/);assert.deepEqual(missing.calls,['preflight'])
})
test('every failed effect or after-effect checkpoint stops without repeating it or advancing',async()=>{
 for(const phase of cyclePhases){
  const f=fixture({fail:phase});await assert.rejects(runIndependentRecovery(f.d,{cycle:true}),/injected/);assert.equal(f.calls.at(-1),phase);assert.equal(f.calls.filter(x=>x===phase).length,1)
  const g=fixture(),record=g.d.record;g.d.record=async name=>{await record(name);if(name==='after-'+phase)throw Error('checkpoint failed')}
  await assert.rejects(runIndependentRecovery(g.d,{cycle:true}),/checkpoint failed/);assert.equal(g.calls.at(-1),phase);assert.equal(g.calls.filter(x=>x===phase).length,1)
 }
})
test('native failed delivery, unverified archive and uncertain policy never become recovery',async()=>{
 const failed=fixture({wakeFailed:true});await assert.rejects(runIndependentRecovery(failed.d,{cycle:true}),/native wake failed/);assert.equal(failed.calls.at(-1),'wake')
 for(const [phase,key] of [['archive','archiveVerified'],['retire','terminalAttemptReviewComplete'],['readiness','readinessObserved'],['policy','scopedNoNativeMcpQualified'],['read','receiptVerified'],['verify','settingsPreserved'],['verify','rolePreserved']]){const f=fixture();f.values[phase][key]=false;await assert.rejects(runIndependentRecovery(f.d,{cycle:true}),/unqualified/);assert.equal(f.calls.at(-1),phase)}
 const cancelled=fixture();cancelled.d.guard=()=>{throw Error('cancelled')};await assert.rejects(runIndependentRecovery(cancelled.d,{cycle:true}),/cancelled/);assert.deepEqual(cancelled.calls,[])
})
test('wake reply requires bounded post-cursor lineage, exact final text and zero tools',()=>{
 const events=[{id:'u',type:'user',sidechain:false},{id:'m',type:'metadata',parentId:'u'},{id:'a',type:'assistant',parentId:'m',stopReason:'end_turn',text:'COLD_RECEIVER_READY',tools:[],sidechain:false}]
 assert.equal(recoveryReplyObserved(events),true)
 for(const change of [x=>x[2].parentId='foreign',x=>x[2].tools=['Bash'],x=>x[2].text='COLD_RECEIVER_READY extra',x=>x[2].sidechain=true,x=>x[2].textTruncated=true,x=>x[1].parentId='m',x=>x.push({id:'other',type:'user'}),x=>x.unshift({id:'tool',type:'assistant',tools:['Write']})]){const x=structuredClone(events);change(x);assert.equal(recoveryReplyObserved(x),false)}
})
test('public recovery requires durable distinct scope before filesystem or process work',async()=>{
 await assert.rejects(recoverIndependentTarget('invalid',service,'invalid',service),e=>e.category==='bad_args')
 const {OPS}=await import('../src/lib/driver.mjs'),op=OPS.find(x=>x.name==='broker_service_recover');assert.equal(op.readOnly,false);await assert.rejects(op.run({experimental:true},{}),/durable submission/)
})

test('desktop caller cannot archive or retire itself through recovery composition',async()=>{
 const target='local_22222222-2222-4222-8222-222222222222',controller='local_11111111-1111-4111-8111-111111111111',prior=process.env.CLAUDE_DRIVER_CALLER_SESSION
 process.env.CLAUDE_DRIVER_CALLER_SESSION=target
 try{await assert.rejects(recoverIndependentTarget(controller,service,target,'c'.repeat(32),{jobId:'j'+'d'.repeat(32),cycle:true}),e=>e.category==='gate_self')}
 finally{if(prior===undefined)delete process.env.CLAUDE_DRIVER_CALLER_SESSION;else process.env.CLAUDE_DRIVER_CALLER_SESSION=prior}
})
test('native workspace trust refusal is retained and prevents new-epoch or preparation work',async()=>{const f=fixture({wakeFailed:true});f.values.wake.nativeFailure={category:'workspace_trust_required',delivery:'undelivered',humanActionRequired:true,retrySafe:false};await assert.rejects(runIndependentRecovery(f.d,{cycle:true}),e=>e.category==='native_workspace_trust_required'&&e.detail.nativeFailure.delivery==='undelivered'&&e.detail.retrySafe===false);assert.equal(f.calls.at(-1),'wake');assert.ok(!f.calls.includes('newEpoch'));assert.ok(!f.calls.includes('prepare'))})

test('verified import-started epoch skips redundant wake and reply but still qualifies the restored service',async()=>{
 const f=fixture({archived:true});f.d.importedEpoch=async()=>({started:true,verified:true,oldPidAbsent:true,pid:42,procStart:'new'});
 const r=await runIndependentRecovery(f.d,{familyRequestId:ref});assert.equal(r.recoveryPath,'verified-import-started-epoch');for(const name of ['wake','observeBeforeWake','reply'])assert.ok(!f.calls.includes(name));for(const name of ['newEpoch','prepare','activate','readiness','policy','read','verify'])assert.ok(f.calls.includes(name));
 for(const name of ['newEpoch','prepare','readiness','policy','read','verify']){const x=fixture({archived:true,fail:name});x.d.importedEpoch=f.d.importedEpoch;await assert.rejects(runIndependentRecovery(x.d,{familyRequestId:ref}),/injected/)}
 const absent=fixture({archived:true});absent.d.importedEpoch=async()=>({started:false});assert.equal((await runIndependentRecovery(absent.d,{familyRequestId:ref})).recoveryPath,'fixed-native-wake');assert.equal(absent.calls.filter(n=>n==='wake').length,1);
 for(const flag of ['verified','oldPidAbsent']){const x=fixture({archived:true});x.d.importedEpoch=async()=>({started:true,verified:true,oldPidAbsent:true,pid:42,procStart:'new',[flag]:false});await assert.rejects(runIndependentRecovery(x.d,{familyRequestId:ref}),/unqualified/);assert.ok(!x.calls.includes('prepare'))}
})
test('import-started proof requires exact completed import, owned new idle epoch and start inside original job window',async()=>{
 const {importStartedEpochQualified:valid}=await import('../src/lib/independent-service-recovery.mjs'),target='local_11111111-1111-4111-8111-111111111111',f={target,oldEpoch:{pid:7,procStart:'old',cwd:'/owned'},oldPidAbsent:true,record:{sessionId:target,cwd:'/owned',isArchived:false,permissionMode:'bypassPermissions'},peer:{pid:8,procStart:'new',hostSessionId:target,cwd:'/owned',version:'2.1.299',entrypoint:'claude-desktop',status:'idle',startedAt:150},unarchive:{jobId:'j'+'c'.repeat(32),operation:'unarchive_session',state:'completed',args:{session:target,import_only:true},result:{sessionId:target,unarchived:true},startedAt:100,finishedAt:200}};assert.equal(valid(f),true);
 for(const change of [x=>x.oldPidAbsent=false,x=>x.record.isArchived=true,x=>x.record.permissionMode='acceptEdits',x=>x.peer.pid=7,x=>x.peer.procStart='old',x=>x.peer.hostSessionId='foreign',x=>x.peer.cwd='/other',x=>x.peer.status='busy',x=>x.peer.version='other',x=>x.peer.startedAt=99,x=>x.peer.startedAt=201,x=>delete x.peer.startedAt,x=>x.unarchive.state='running',x=>x.unarchive.args.import_only=false,x=>x.unarchive.result.unarchived=false,x=>x.unarchive.result.sessionId='foreign',x=>x.unarchive.finishedAt=90]){const x=structuredClone(f);change(x);assert.equal(valid(x),false)}
})
