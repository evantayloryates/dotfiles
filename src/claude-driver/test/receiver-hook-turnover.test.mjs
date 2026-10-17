import {test} from 'node:test'
import assert from 'node:assert/strict'
import {qualifyReceiverTurnover} from '../lib/receiver-hook-turnover.mjs'
const fixture=()=>{
 const session='local_11111111-1111-4111-8111-111111111111',id='a'.repeat(32),build='b'.repeat(64),cwd='/owned/receiver',anchorSha256='c'.repeat(64),settingsSha256='d'.repeat(64),epoch={pid:42,procStart:'exact epoch'},anchorPath=cwd+'/.claude-driver-services/receiver-stop-entry.mjs'
 return {session,epoch,nextServiceId:'e'.repeat(32),artifact:{anchorSha256,settingsSha256,anchorPath},selected:{selector:{sessionId:session,serviceId:id,build,generation:1,receiverCwd:cwd,...epoch,anchorSha256,settingsSha256},stateDir:cwd+'/.claude-driver-services/'+id,policy:{receiverHook:{anchorSha256,anchorPath}}},history:{serviceId:id,sessionId:session,build,generation:1,nativeEpoch:{...epoch},verified:true,verificationMode:'historical-retired',sourceDisposition:'files-retired',admissionStopped:true,stopMarkerMatchesGeneration:true,terminalAttemptReviewComplete:true,unresolvedRequestIds:[]}}
}
test('turnover requires retired stopped terminal predecessor on identical anchor/settings and epoch',()=>{
 const f=fixture(),r=qualifyReceiverTurnover(f)
 assert.equal(r.retainedSelectorPath,f.selected.stateDir+'/retired-receiver-selector.json')
 assert.equal(r.selectorPath,'/owned/receiver/.claude-driver-services/receiver-runtime.json')
})
test('live/uncertain/foreign predecessor and changed anchor/settings fail before selector retention',()=>{
 const mutations=[f=>f.history.verificationMode='live-native',f=>f.history.sourceDisposition='installed',f=>f.history.admissionStopped=false,f=>f.history.stopMarkerMatchesGeneration=false,f=>f.history.terminalAttemptReviewComplete=false,f=>f.history.unresolvedRequestIds=['unknown'],f=>delete f.history.unresolvedRequestIds,f=>f.history.build='f'.repeat(64),f=>f.history.generation++,f=>f.history.serviceId='f'.repeat(32),f=>f.epoch.pid++,f=>f.epoch.procStart='next',f=>f.artifact.anchorSha256='f'.repeat(64),f=>f.artifact.settingsSha256='f'.repeat(64),f=>f.nextServiceId=f.selected.selector.serviceId]
 for(const mutate of mutations){const f=fixture();mutate(f);assert.throws(()=>qualifyReceiverTurnover(f),/predecessor/)}
})
