import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {archiveTargetValid,archiveControlArguments,archiveObservationMatches,archiveTargetPreflightMatches} from '../lib/native-archive-control.mjs'
const session='local_11111111-1111-4111-8111-111111111111',target='local_22222222-2222-4222-8222-222222222222',binding={sessionId:session,receiverCwd:'/owned/probe/controller'},t={sessionId:target,cwd:'/owned/probe/target',pid:42,procStart:'synthetic'}
test('sealed archive capability accepts one distinct same-probe target epoch',()=>{
 assert.equal(archiveTargetValid(t,binding),true)
 for(const change of [{sessionId:session},{cwd:'/elsewhere/target'},{cwd:binding.receiverCwd},{pid:1},{procStart:''},{extra:true}])assert.equal(archiveTargetValid({...t,...change},binding),false)
 assert.deepEqual(archiveControlArguments(t),{session_id:target,reason:'claude-driver scoped recovery test'})
})
test('archive observation binds original epoch, receipt bytes and actual persisted postconditions',()=>{
 const config={id:'a'.repeat(32),archiveTarget:t},requestId='rpeer'+'b'.repeat(32),receipt={receivedAt:new Date(100).toISOString(),content:[{type:'text',text:'synthetic archive result'}]},o={schemaVersion:1,serviceId:config.id,requestId,sessionId:target,cwd:t.cwd,pid:42,procStart:t.procStart,archived:true,pidAbsent:true,observedAt:110,nativeTextSha256:createHash('sha256').update(receipt.content[0].text).digest('hex')},args={config,requestId,receipt,now:120}
 assert.equal(archiveObservationMatches(o,args),true)
 for(const change of [{pidAbsent:false},{archived:false},{pid:43},{procStart:'reused'},{observedAt:99},{observedAt:121},{nativeTextSha256:'foreign'},{extra:true}])assert.equal(archiveObservationMatches({...o,...change},args),false)
 assert.equal(archiveObservationMatches(o,{...args,receipt:{...receipt,content:null}}),false)
})
test('retired history cannot authorize archive after a same-process successor or target mode change',()=>{
 const build='a'.repeat(64),service='b'.repeat(32),request='rpeer'+'c'.repeat(32),make=()=>({target:t,record:{sessionId:target,cwd:t.cwd,isArchived:false,permissionMode:'bypassPermissions'},peer:{pid:t.pid,procStart:t.procStart,status:'idle',hostSessionId:target,cwd:t.cwd},history:{serviceId:service,sessionId:target,verified:true,verificationMode:'historical-retired',sourceDisposition:'files-retired',admissionStopped:true,stopMarkerMatchesGeneration:true,terminalAttemptReviewComplete:true,unresolvedRequestIds:[],nativeEpoch:{pid:t.pid,procStart:t.procStart},settledRequestIds:[request],build,generation:1},selection:{selector:{serviceId:service,sessionId:target,pid:t.pid,procStart:t.procStart,build,generation:1},pointer:{build,generation:1}},targetServiceId:service,familyRequestId:request,pinned:false,openPrCount:0})
 assert.equal(archiveTargetPreflightMatches(make()),true)
 for(const change of [x=>x.selection.selector.serviceId='d'.repeat(32),x=>x.selection.pointer.generation=2,x=>x.selection.selector.pid=43,x=>x.record.permissionMode='acceptEdits',x=>x.peer.status='working',x=>x.history.unresolvedRequestIds=['original'],x=>x.pinned=true,x=>x.openPrCount=1,x=>x.history.settledRequestIds=[]]){const x=make();change(x);assert.equal(archiveTargetPreflightMatches(x),false)}
 assert.equal(archiveTargetPreflightMatches(),false)
})
