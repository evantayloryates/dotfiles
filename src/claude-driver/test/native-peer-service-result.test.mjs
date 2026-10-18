import test from 'node:test'
import assert from 'node:assert/strict'
import {screenNativeServiceResult} from '../lib/native-peer-service-evidence.mjs'
import {createHash} from 'node:crypto'
const rid='rpeer'+'1'.repeat(32),owner='local_11111111-1111-4111-8111-111111111111',target='local_22222222-2222-4222-8222-222222222222',build='a'.repeat(64),iso=n=>new Date(n).toISOString()
function fixture(){return {
 config:{id:'b'.repeat(32),brokerSession:owner,brokerCwd:'/owned',build,notBefore:500,deadline:3000,maxRequests:4},
 ready:{schemaVersion:1,scope:'owned-native-service-ready',serviceId:'b'.repeat(32),brokerSession:owner,brokerCwd:'/owned',build,registeredAt:iso(600),deadline:3000,maxRequests:4,nativeCallsRequested:0,modelCallsRequested:0},
 intent:{schemaVersion:1,scope:'owned-native-service-intent',serviceId:'b'.repeat(32),requestId:rid,brokerSession:owner,startedAt:iso(1000)},
 receipt:{schemaVersion:1,scope:'owned-native-service-result',serviceId:'b'.repeat(32),requestId:rid,brokerSession:owner,targetSession:target,startedAt:iso(1000),receivedAt:iso(1100),isError:false,content:[{type:'text',text:JSON.stringify({sessionId:target,isArchived:false,isRunning:false})}]},
 request:{id:rid,protocol:7,ops:[{op:'get_session',args:{session_id:target}}],createdAt:iso(900),expiresAt:2000},
 epoch:{build,pid:42,procStart:'synthetic'},pointer:{build,pid:42,procStart:'synthetic',sessionId:owner,generation:6,bootstrapHash:'c'.repeat(64),activatedAt:iso(400)},
 entry:{phase:'completed',requestId:rid,index:0,build,generation:6,bootstrapHash:'c'.repeat(64),at:1050,nativeBinding:{ancestorVerified:true,brokerPid:42,brokerProcStart:'synthetic',brokerSessionId:owner}},
 admission:{requestId:rid,index:0,pid:42,procStart:'synthetic',build,generation:6,toolUseId:'toolu_plugin_'+'d'.repeat(30),at:1060},control:{id:rid,dispatched:[0],state:'outcome_unknown'},now:4000
}}
test('historical service result verifies exact read admission without rewriting evidence or claiming settlement',()=>{
 const input=fixture(),before=structuredClone(input),result=screenNativeServiceResult(input)
 assert.equal(result.receiptVerified,true);assert.equal(result.result.ok,true);assert.equal(result.standardLifecycleSettlementAssessed,false);assert.equal(result.releaseAuthorized,false);assert.deepEqual(input,before)
 // Reconciliation may happen after service expiry; dispatch cannot use expired readiness.
 assert.equal(input.now>input.config.deadline,true)
 const failed=fixture();failed.receipt.isError=true;failed.receipt.content=[{type:'text',text:'synthetic native failure'}]
 assert.equal(screenNativeServiceResult(failed).result.ok,false)
})
test('foreign, ambiguous, late or unadmitted results remain unresolved',()=>{
 for(const change of [x=>x.ready.serviceId='foreign',x=>x.intent.extra=true,x=>x.intent.requestId='foreign',x=>x.receipt.targetSession=owner,x=>x.receipt.startedAt=iso(999),x=>x.receipt.receivedAt=iso(2001),x=>x.request.expiresAt=3001,x=>x.request.ops.push(x.request.ops[0]),x=>x.entry.requestId='foreign',x=>x.admission.generation=7,x=>x.control.dispatched=[],x=>x.receipt.content[0].text='{}',x=>x.now=1099]){const x=fixture();change(x);assert.equal(screenNativeServiceResult(x).receiptVerified,false)}
 assert.equal(screenNativeServiceResult().receiptVerified,false)
})
test('family receipt requires independent binding, fixed scope and exact native admission',()=>{
 const make=()=>{const x=fixture();x.config.serviceStateBinding={version:1};x.request.ops=[{op:'list_sessions',args:{include_archived:true,limit:100,linked:true}}];x.receipt.targetSession=owner;x.receipt.content=[{type:'text',text:JSON.stringify([{sessionId:target}])}];return x}
 const good=make();assert.equal(screenNativeServiceResult(good).receiptVerified,true)
 assert.equal(screenNativeServiceResult(good).releaseAuthorized,false)
 const empty=make();empty.receipt.content[0].text='No other sessions found.';assert.equal(screenNativeServiceResult(empty).receiptVerified,true)
 for(const change of [x=>delete x.config.serviceStateBinding,x=>x.request.ops[0].args.linked=false,x=>x.request.ops[0].args.limit=101,x=>x.request.ops[0].args.group='scratch',x=>x.receipt.targetSession=target,x=>x.receipt.content[0].text=JSON.stringify([{sessionId:owner}]),x=>x.receipt.content[0].text=JSON.stringify([{sessionId:target},{sessionId:target}]),x=>x.receipt.content[0].text='{}',x=>x.admission.toolUseId='foreign']){const x=make();change(x);assert.equal(screenNativeServiceResult(x).receiptVerified,false)}
})
test('archive transport success stays unresolved without exact independent postcondition evidence',()=>{
 const make=()=>{const x=fixture();x.config.serviceStateBinding={version:1};x.config.archiveTarget={sessionId:target,cwd:'/owned/target',pid:50,procStart:'target epoch'};x.request.ops=[{op:'archive_session',args:{session_id:target,reason:'claude-driver scoped recovery test'}}];x.receipt.content=[{type:'text',text:'synthetic archive result'}];x.archiveObservation={schemaVersion:1,serviceId:x.config.id,requestId:rid,sessionId:target,cwd:'/owned/target',pid:50,procStart:'target epoch',archived:true,pidAbsent:true,observedAt:1200,nativeTextSha256:createHash('sha256').update(x.receipt.content[0].text).digest('hex')};return x}
 assert.equal(screenNativeServiceResult(make()).receiptVerified,true)
 for(const change of [x=>delete x.archiveObservation,x=>x.archiveObservation.pidAbsent=false,x=>x.archiveObservation.archived=false,x=>x.receipt.isError=true,x=>x.request.ops[0].args.session_id=owner,x=>x.request.ops[0].args._consent=true,x=>x.config.archiveTarget.sessionId=owner,x=>delete x.config.archiveTarget]){const x=make();change(x);assert.equal(screenNativeServiceResult(x).receiptVerified,false)}
})

test('shared host reconciliation refuses missing enrollment and malformed identity without leaking parse details',async()=>{
 const {reconcileNativeServiceResult}=await import('../lib/native-peer-service-result.mjs')
 const {OPS}=await import('../lib/driver.mjs'),op=OPS.find(x=>x.name==='broker_service_result_reconcile')
 assert.equal(op.readOnly,false)
 await assert.rejects(op.run({service_id:'invalid',request_id:'invalid'}),/experimental opt-in/)
 for(const [service,request] of [['invalid',rid],['f'.repeat(32),'invalid'],['f'.repeat(32),rid]]){
  await assert.rejects(reconcileNativeServiceResult(service,request),error=>error.category==='native_service_result_refused'&&error.message==='native service result evidence refused; no replay')
 }
})

test('fixed wake receipt proves native call only, and rejects arbitrary text or consent',()=>{
 const make=()=>{const x=fixture();x.config.serviceStateBinding={version:1};x.config.archiveTarget={sessionId:target,cwd:'/owned/target',pid:50,procStart:'old'};x.request.ops=[{op:'send_message',args:{session_id:target,message:'Reply exactly COLD_RECEIVER_READY. Do not invoke tools or change files, settings or permissions.'}}];x.receipt.content=[{type:'text',text:'synthetic native wake acknowledgement'}];return x}
 const failed=make();failed.receipt.isError=true;failed.receipt.content=[{type:'text',text:'Workspace requires trust approval; undelivered'}];const failure=screenNativeServiceResult(failed);assert.equal(failure.receiptVerified,true);assert.equal(failure.result.ok,false)
 const r=screenNativeServiceResult(make());assert.equal(r.receiptVerified,true);assert.equal(r.releaseAuthorized,false);assert.equal(r.servingQualified,undefined)
 for(const change of [x=>x.request.ops[0].args.message='run arbitrary tools',x=>x.request.ops[0].args._consent=true,x=>x.request.ops[0].args.session_id=owner,x=>delete x.config.archiveTarget,x=>delete x.config.serviceStateBinding,x=>x.control.dispatched=[]]){const x=make();change(x);assert.equal(screenNativeServiceResult(x).receiptVerified,false)}
})

test('metadata receipt requires independently persisted exact postcondition; native success alone stays unknown',()=>{
 const make=()=>{const x=fixture();x.config.serviceStateBinding={version:1};x.config.metadataTarget={sessionId:target,cwd:'/owned/target',pid:50,procStart:'target epoch'};x.request.ops=[{op:'set_session_title',args:{session_id:target,title:'new title'}}];x.receipt.content=[{type:'text',text:'native title acknowledgement'}];x.metadataObservation={schemaVersion:1,serviceId:x.config.id,requestId:rid,sessionId:target,cwd:'/owned/target',pid:50,procStart:'target epoch',operation:'set_session_title',postcondition:{title:'new title',titleSource:'tool'},observedAt:1200,nativeTextSha256:createHash('sha256').update(x.receipt.content[0].text).digest('hex')};return x}
 const good=make(),before=structuredClone(good);assert.equal(screenNativeServiceResult(good).receiptVerified,true);assert.deepEqual(good,before)
 const current=make();current.pointer.nativeMetadataTargetVersion=1
 assert.equal(screenNativeServiceResult(current).receiptVerified,false)
 current.request.nativeMetadataTargetBinding={version:1,...current.config.metadataTarget}
 assert.equal(screenNativeServiceResult(current).receiptVerified,false)
 current.admission.metadataTarget={...current.request.nativeMetadataTargetBinding,observedAt:1059}
 assert.equal(screenNativeServiceResult(current).receiptVerified,true)
 for(const change of [x=>delete x.request.nativeMetadataTargetBinding,x=>delete x.admission.metadataTarget,x=>x.admission.metadataTarget.pid=51,x=>x.request.nativeMetadataTargetBinding.pid=51,x=>x.admission.metadataTarget.observedAt=1061,x=>x.admission.metadataTarget.observedAt=899]){const x=structuredClone(current);change(x);assert.equal(screenNativeServiceResult(x).receiptVerified,false)}

 for(const change of [x=>delete x.metadataObservation,x=>delete x.config.metadataTarget,x=>x.metadataObservation.postcondition.titleSource='auto',x=>x.metadataObservation.pid=51,x=>x.request.ops[0].args._consent=true,x=>x.request.ops[0].args.title='other',x=>x.receipt.isError=true,x=>x.admission.toolUseId='foreign']){const x=make();change(x);assert.equal(screenNativeServiceResult(x).receiptVerified,false)}
})

test('generic send acceptance needs its separate capability and exact epoch admission, never proves application',()=>{
 const x=fixture(),t={sessionId:target,cwd:'/owned/target',pid:50,procStart:'target epoch'};x.config.serviceStateBinding={version:1};x.config.metadataTarget=t;x.config.metadataSendControl=true;x.request.nativeMetadataTargetBinding={version:1,...t};x.admission.metadataTarget={...x.request.nativeMetadataTargetBinding,observedAt:1059};x.request.ops=[{op:'send_message',args:{session_id:target,message:'Reply exactly OK.'}}];x.receipt.content=[{type:'text',text:`Message delivered to session ${target}; its turn has started on it. (delivery: delivered; message_id: 12345678-1234-4234-8234-123456789abc)`}]
 const r=screenNativeServiceResult(x);assert.equal(r.receiptVerified,true);assert.equal(r.sendReceipt.nativeAccepted,true);assert.equal(r.sendReceipt.applied,false)
 for(const change of [v=>delete v.config.metadataSendControl,v=>delete v.admission.metadataTarget,v=>v.request.nativeMetadataTargetBinding.pid=51,v=>v.receipt.targetSession=owner,v=>v.receipt.content[0].text='Message will be delivered pending tool execution',v=>v.request.ops[0].args.message=' bad ']){const v=structuredClone(x);change(v);assert.equal(screenNativeServiceResult(v).receiptVerified,false)}
})

test('stop receipt settlement preserves pending versus idle and requires its separate exact epoch admission',()=>{
 const x=fixture(),t={sessionId:target,cwd:'/owned/target',pid:50,procStart:'target epoch'};x.config.serviceStateBinding={version:1};x.config.metadataTarget=t;x.config.metadataStopControl=true;x.request.nativeMetadataTargetBinding={version:1,...t};x.admission.metadataTarget={...x.request.nativeMetadataTargetBinding,observedAt:1059};x.request.ops=[{op:'stop_session',args:{session_id:target}}];x.receipt.content=[{type:'text',text:`Session ${target} is idle; nothing to stop.`}]
 const r=screenNativeServiceResult(x);assert.equal(r.receiptVerified,true);assert.equal(r.stopReceipt.stopState,'already_idle');assert.equal(r.stopReceipt.applied,false)
 const pending=structuredClone(x);pending.receipt.content[0].text=`Asked session ${target} to stop; its host is reconnecting (or it runs in the cloud), so the interrupt lands when the link is back. Check get_session before assuming it stopped.`;assert.equal(screenNativeServiceResult(pending).stopReceipt.stopState,'requested')
 for(const change of [v=>delete v.config.metadataStopControl,v=>delete v.admission.metadataTarget,v=>v.request.nativeMetadataTargetBinding.pid=51,v=>v.receipt.isError=true,v=>v.request.ops[0].args._consent=true,v=>v.receipt.content[0].text='Stopped eventually']){const v=structuredClone(x);change(v);assert.equal(screenNativeServiceResult(v).receiptVerified,false)}
})

test('ordinary result needs exact native admission, receiver grant and receipt-bound persisted postcondition',()=>{
 const make=(pin=false)=>{const x=fixture(),binding={version:1,sessionId:target,cwd:'/ordinary/project',cliSessionId:null,storeHash:'e'.repeat(64)};x.config.serviceStateBinding={version:1};x.config.sessionManagementControl=true;x.pointer.sessionManagementControl=true;x.request.nativeSessionTargetBinding=binding;x.request.ops=[pin?{op:'set_pinned',args:{session_id:target,pinned:true}}:{op:'unarchive_session',args:{session_id:target}}];x.admission.sessionTarget={...binding,observedAt:1055};x.receipt.content=[{type:'text',text:'synthetic native acknowledgement'}];x.ordinaryObservation={schemaVersion:1,serviceId:x.config.id,requestId:rid,binding:{...binding},operation:x.request.ops[0].op,postcondition:{archived:false,...pin?{pinned:true}:{}},observedAt:1200,nativeTextSha256:createHash('sha256').update(x.receipt.content[0].text).digest('hex')};return x}
 for(const pin of [false,true]){
  assert.equal(screenNativeServiceResult(make(pin)).receiptVerified,true)
  for(const mutate of [x=>delete x.config.sessionManagementControl,x=>delete x.pointer.sessionManagementControl,x=>delete x.ordinaryObservation,x=>delete x.admission.sessionTarget,x=>x.admission.sessionTarget.storeHash='f'.repeat(64),x=>x.ordinaryObservation.binding.cwd='/other',x=>x.ordinaryObservation.postcondition.archived=true,x=>x.ordinaryObservation.nativeTextSha256='f'.repeat(64),x=>x.ordinaryObservation.observedAt=1099,x=>x.receipt.isError=true,x=>x.request.ops[0].args.extra=true,x=>x.request.ops[0].op='delete_session']){const x=make(pin);mutate(x);assert.equal(screenNativeServiceResult(x).receiptVerified,false)}
 }
 const x=make(true);x.ordinaryObservation.postcondition.pinned=false;assert.equal(screenNativeServiceResult(x).receiptVerified,false)
})
test('ordinary configuration receipts require separate config/pointer grants and exact saved title/model/effort',()=>{for(const [op,field,value]of [['set_session_title','title','Owned title'],['set_session_model','model','claude-haiku-5-5'],['set_session_effort','effort','low']]){const make=()=>{const x=fixture(),binding={version:1,sessionId:target,cwd:'/ordinary/project',cliSessionId:null,storeHash:'e'.repeat(64)};Object.assign(x.config,{serviceStateBinding:{version:1},sessionManagementControl:true,sessionMetadataControl:true});Object.assign(x.pointer,{sessionManagementControl:true,sessionMetadataControl:true});x.request.nativeSessionTargetBinding=binding;x.request.ops=[{op,args:{session_id:target,[field]:value}}];x.admission.sessionTarget={...binding,observedAt:1055};x.receipt.content=[{type:'text',text:'native acknowledgement'}];x.ordinaryObservation={schemaVersion:1,serviceId:x.config.id,requestId:rid,binding:{...binding},operation:op,postcondition:{archived:false,[field]:value,...field==='title'?{titleSource:'tool'}:{}},observedAt:1200,nativeTextSha256:createHash('sha256').update(x.receipt.content[0].text).digest('hex')};return x};assert.equal(screenNativeServiceResult(make()).receiptVerified,true);for(const mutate of [x=>delete x.config.sessionMetadataControl,x=>delete x.pointer.sessionMetadataControl,x=>x.ordinaryObservation.postcondition[field]='wrong',x=>x.receipt.isError=true,x=>x.request.ops[0].args.extra=true]){const x=make();mutate(x);assert.equal(screenNativeServiceResult(x).receiptVerified,false)}}})
test('ordinary native send acceptance is separate from target epoch, mutation postconditions and application',()=>{const make=()=>{const x=fixture(),binding={version:1,sessionId:target,cwd:'/ordinary/project',cliSessionId:null,storeHash:'e'.repeat(64)};Object.assign(x.config,{serviceStateBinding:{version:1},sessionManagementControl:true,sessionSendControl:true,metadataTarget:{sessionId:'local_33333333-3333-4333-8333-333333333333'},metadataSendControl:true});Object.assign(x.pointer,{sessionManagementControl:true,sessionSendControl:true});x.request.nativeSessionTargetBinding=binding;x.request.ops=[{op:'send_message',args:{session_id:target,message:'Reply exactly ready'}}];x.admission.sessionTarget={...binding,observedAt:1055};x.receipt.content=[{type:'text',text:'Message delivered to session '+target+'; its turn has started on it. (delivery: delivered; message_id: 44444444-4444-4444-8444-444444444444)'}];return x};const r=screenNativeServiceResult(make());assert.equal(r.receiptVerified,true);assert.equal(r.sendReceipt.delivery,'delivered');assert.equal(r.sendReceipt.applied,false);for(const mutate of [x=>delete x.config.sessionSendControl,x=>delete x.pointer.sessionSendControl,x=>delete x.admission.sessionTarget,x=>x.request.ops[0].args.message=' ',x=>x.request.ops[0].args.extra=true,x=>x.receipt.content[0].text='ok',x=>x.request.nativeSessionTargetBinding.sessionId=owner]){const x=make();mutate(x);assert.equal(screenNativeServiceResult(x).receiptVerified,false)}const failed=make();failed.receipt.isError=true;failed.receipt.content=[{type:'text',text:'native refusal'}];const f=screenNativeServiceResult(failed);assert.equal(f.receiptVerified,true);assert.equal(f.result.ok,false);assert.equal(f.sendReceipt,undefined)})

test('ordinary archive settles only its explicit grant and retained archived observation',()=>{const make=()=>{const x=fixture(),binding={version:1,sessionId:target,cwd:'/ordinary/project',cliSessionId:null,storeHash:'e'.repeat(64)};Object.assign(x.config,{serviceStateBinding:{version:1},sessionManagementControl:true,sessionArchiveControl:true});Object.assign(x.pointer,{sessionManagementControl:true,sessionArchiveControl:true});x.request.nativeSessionTargetBinding=binding;x.request.ops=[{op:'archive_session',args:{session_id:target,reason:'claude-driver ordinary archive_session'}}];x.admission.sessionTarget={...binding,observedAt:1055};x.ordinaryObservation={schemaVersion:1,serviceId:x.config.id,requestId:rid,binding,operation:'archive_session',postcondition:{archived:true},observedAt:1200,nativeTextSha256:createHash('sha256').update(x.receipt.content[0].text).digest('hex')};return x};assert.equal(screenNativeServiceResult(make()).receiptVerified,true);for(const mutate of [x=>delete x.config.sessionArchiveControl,x=>delete x.pointer.sessionArchiveControl,x=>x.ordinaryObservation.postcondition.archived=false,x=>delete x.ordinaryObservation,x=>x.request.ops[0].args.reason=' ',x=>x.receipt.isError=true]){const x=make();mutate(x);assert.equal(screenNativeServiceResult(x).receiptVerified,false)}})
