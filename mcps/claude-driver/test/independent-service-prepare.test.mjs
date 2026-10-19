import test from 'node:test'
import assert from 'node:assert/strict'
import {independentPreparationAllowed,inheritedArchiveTarget,inheritedMetadataTarget} from '../src/lib/independent-service-prepare.mjs'
const session='local_11111111-1111-4111-8111-111111111111'
function fixture(){return {record:{sessionId:session,cwd:'/private/state/probe/service',permissionMode:'bypassPermissions',isArchived:false},registered:true,peer:{hostSessionId:session,sessionId:session.slice(6),cwd:'/private/state/probe/service',entrypoint:'claude-desktop',status:'idle',version:'2.1.299',pid:42,procStart:'epoch'},version:{app:'2.42304.0',cli:'2.1.299'},probeRoot:'/private/state/probe',lifetimeSec:300,maxRequests:8}}
test('preparation is limited to the owned idle bypass scratch receiver and bounded lifetime',()=>{
 assert.equal(independentPreparationAllowed(fixture()),true)
 for(const change of [x=>x.registered=false,x=>x.record.permissionMode='acceptEdits',x=>x.record.isArchived=true,x=>x.record.cwd='/work/repo',x=>x.peer.cwd='/other',x=>x.peer.status='busy',x=>x.peer.procStart='',x=>x.peer.spare=true,x=>x.peer.parkedJobId='work',x=>x.peer.version='future',x=>x.peer.hostSessionId='foreign',x=>x.version.app='future',x=>x.lifetimeSec=3601,x=>x.lifetimeSec=59,x=>x.maxRequests=0,x=>x.maxRequests=129]){const x=fixture();change(x);assert.equal(independentPreparationAllowed(x),false)}
})

test('renewal preserves only the verified predecessor capability, including a now-cold target',()=>{
 const peer={pid:42,procStart:'epoch'},id='a'.repeat(32),cwd='/private/state/probe/controller'
 const target={sessionId:'local_22222222-2222-4222-8222-222222222222',cwd:'/private/state/probe/target',pid:99,procStart:'old target epoch'}
 const status={serviceId:id,sessionId:session,verified:true,verificationMode:'live-native',sourceDisposition:'installed',nativeEpoch:peer,terminalAttemptReviewComplete:true,unresolvedRequestIds:[],archiveTarget:target}
 const read=x=>inheritedArchiveTarget(x,session,cwd,id,peer)
 assert.deepEqual(read(status),target);assert.notEqual(read(status),target)
 for(const change of [x=>x.verified=false,x=>x.serviceId='b'.repeat(32),x=>x.sessionId=target.sessionId,x=>x.verificationMode='historical-retired',x=>x.sourceDisposition='files-retired',x=>x.nativeEpoch={...peer,pid:43},x=>x.terminalAttemptReviewComplete=false,x=>x.unresolvedRequestIds=['unknown'],x=>delete x.unresolvedRequestIds,x=>x.archiveTarget.cwd='/other/target',x=>x.archiveTarget.sessionId=session,x=>x.archiveTarget.extra=true]){const x=structuredClone(status);change(x);assert.throws(()=>read(x),/unqualified/)}
 const ordinary={...status};delete ordinary.archiveTarget;assert.equal(read(ordinary),undefined)
})

test('renewal preserves explicit metadata capability without granting archive capability',()=>{
 const peer={pid:42,procStart:'epoch'},id='a'.repeat(32),cwd='/private/state/probe/controller',metadataTarget={sessionId:'local_22222222-2222-4222-8222-222222222222',cwd:'/private/state/probe/target',pid:99,procStart:'target epoch'},status={serviceId:id,sessionId:session,verified:true,verificationMode:'live-native',sourceDisposition:'installed',nativeEpoch:peer,terminalAttemptReviewComplete:true,unresolvedRequestIds:[],metadataTarget}
 assert.deepEqual(inheritedMetadataTarget(status,session,cwd,id,peer),metadataTarget);assert.equal(inheritedArchiveTarget(status,session,cwd,id,peer),undefined)
 assert.throws(()=>inheritedMetadataTarget({...status,metadataTarget:{...metadataTarget,sessionId:session}},session,cwd,id,peer),/unqualified/)
})
