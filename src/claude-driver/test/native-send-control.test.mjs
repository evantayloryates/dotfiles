import {test} from 'node:test'
import assert from 'node:assert/strict'
import {nativeSendArguments,nativeSendTargetMatches,nativeSendAcceptance} from '../lib/native-send-control.mjs'
const target={sessionId:'local_22222222-2222-4222-8222-222222222222',cwd:'/owned/probe/target',pid:42,procStart:'epoch'},messageId='12345678-1234-4234-8234-123456789abc',receipt=text=>({isError:false,content:[{type:'text',text}]})
test('send arguments never silently trim input or allow whitespace-only, oversized or null payloads',()=>{
 assert.deepEqual(nativeSendArguments(target,'exact body'),{session_id:target.sessionId,message:'exact body'})
 for(const m of ['', ' ', ' leading', 'trailing\n','nul\0body','x'.repeat(16001),null])assert.throws(()=>nativeSendArguments(target,m))
})
test('only exact reviewed target-bound delivered/queued acceptance settles publication, never application',()=>{
 const delivered=`Message delivered to session ${target.sessionId} (fixture); its turn has started on it. (delivery: delivered; message_id: ${messageId})`,queued=`Message queued for session ${target.sessionId}: recipient is busy. Don't wait on it; check back with list_events if the outcome matters. (delivery: queued; message_id: ${messageId})`
 assert.deepEqual(nativeSendAcceptance(receipt(delivered),target.sessionId),{delivery:'delivered',messageId,nativeAccepted:true,applied:false});assert.equal(nativeSendAcceptance(receipt(queued),target.sessionId).delivery,'queued')
 for(const text of ['Message will be delivered pending tool execution',delivered.replace(target.sessionId,'local_33333333-3333-4333-8333-333333333333'),delivered+' extra',delivered.replace('delivery: delivered','delivery: undelivered'),delivered.replace(messageId,'missing'), 'delivery: delivered; message_id: '+messageId])assert.equal(nativeSendAcceptance(receipt(text),target.sessionId),null)
 assert.equal(nativeSendAcceptance({...receipt(delivered),isError:true},target.sessionId),null)
})
test('send may target a known busy epoch without broadening metadata idle guards or accepting unknown states',()=>{
 const args={target,record:{sessionId:target.sessionId,cwd:target.cwd,isArchived:false,permissionMode:'bypassPermissions'},peer:{hostSessionId:target.sessionId,cwd:target.cwd,pid:42,procStart:'epoch',status:'working',entrypoint:'claude-desktop',version:'2.1.299'},registered:true,openPrCount:0}
 assert.equal(nativeSendTargetMatches(args),true)
 for(const patch of [{status:'waiting'},{status:'unknown'},{pid:43},{procStart:'different'}])assert.equal(nativeSendTargetMatches({...args,peer:{...args.peer,...patch}}),false)
})
test('recipient reply proof requires the native message ID and a complete tool-free causal reply path',async()=>{
 const {nativeSendReplyObserved}=await import('../lib/native-send-control.mjs'),events=[{id:'u',type:'user',peerMessageId:messageId},{id:'m',type:'metadata',parentId:'u'},{id:'a',type:'assistant',parentId:'m',text:'EXACT_OK',stopReason:'end_turn',tools:[]}]
 assert.equal(nativeSendReplyObserved(events,'EXACT_OK',messageId),true)
 for(const change of [x=>x[0].peerMessageId='foreign',x=>x[2].parentId='missing',x=>x[2].tools=['Bash'],x=>x[2].stopReason='tool_use',x=>x.push({id:'other',type:'user'})]){const x=structuredClone(events);change(x);assert.equal(nativeSendReplyObserved(x,'EXACT_OK',messageId),false)}
})
test('native effect admission permits busy send only under explicit policy grant, never busy metadata',async()=>{
 const {nativeMetadataTargetObservation}=await import('../lib/native-metadata-admission.mjs'),args={request:{expiresAt:1000,ops:[{op:'send_message',args:{session_id:target.sessionId,message:'exact'}}],nativeMetadataTargetBinding:{version:1,...target}},pointer:{pid:10,serviceStateBinding:{sessionId:'local_11111111-1111-4111-8111-111111111111',receiverCwd:'/owned/probe/controller'}},policy:{nativeMetadataTargetVersion:1,metadataTarget:target,metadataSendControl:true},peer:{pid:42,procStart:'epoch',hostSessionId:target.sessionId,sessionId:target.sessionId.slice(6),cwd:target.cwd,version:'2.1.299',entrypoint:'claude-desktop',status:'working'},process:{pid:42,procStart:'epoch'},now:100}
 assert.ok(nativeMetadataTargetObservation(args));assert.equal(nativeMetadataTargetObservation({...args,policy:{...args.policy,metadataSendControl:false}}),null)
 assert.equal(nativeMetadataTargetObservation({...args,request:{...args.request,ops:[{op:'set_pinned',args:{session_id:target.sessionId,pinned:true}}]}}),null)
})

test('host-native recipient proof uses exact sender/body and causal reply without claiming returned UUID linkage',async()=>{
 const {nativeHostPeerEvidence,nativeSendReplyObserved,nativeSendUserReceipt}=await import('../lib/native-send-control.mjs'),sender='local_11111111-1111-4111-8111-111111111111',message='Reply exactly EXACT_OK.',row={type:'user',origin:{kind:'peer',hostInjected:true,from:sender},turnOrigin:'peer',message:{content:`Another Claude session sent a message:\n<cross-session-message from="${sender}" name="owned scratch">\n${message}\n</cross-session-message>\n\nNative reminder`}},proof=nativeHostPeerEvidence(row),expected={sender,message},events=[{id:'refresh',type:'user'},{id:'u',type:'user',nativeHostPeer:proof},{id:'m',type:'metadata',parentId:'u'},{id:'a',type:'assistant',parentId:'m',text:'EXACT_OK',stopReason:'end_turn',tools:[]}]
 assert.equal(proof.messageIdAvailable,false);assert.equal(nativeSendReplyObserved(events,'EXACT_OK',expected),true)
 assert.equal(nativeSendReplyObserved(events,'EXACT_OK',messageId),false)
 assert.equal(nativeSendUserReceipt(events,{sender:target.sessionId,message}),null)
 assert.equal(nativeSendUserReceipt(events,{sender,message:message+'x'}),null)
 for(const mutate of [x=>x.push({...x[1],id:'duplicate'}),x=>x[3].parentId='missing',x=>x[2].type='user',x=>x[3].tools=['Bash']]){const copy=structuredClone(events);mutate(copy);assert.equal(nativeSendReplyObserved(copy,'EXACT_OK',expected),false)}
 assert.equal(nativeHostPeerEvidence({...row,origin:{...row.origin,hostInjected:false}}),null)
})
