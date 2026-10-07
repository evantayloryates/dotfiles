import test from 'node:test'
import assert from 'node:assert/strict'
import {summarizeNativeSnapshot} from '../lib/native-export-snapshot.mjs'
import {SNAPSHOT_SOURCE_SHA} from '../lib/installed-desktop-source.mjs'
const opts={sessionId:'owned',cliSessionId:'owned-cli',notBefore:1000,notAfter:2000}
const idle={capturedAt:new Date(1500).toISOString(),sessionId:'owned',cliSessionId:'owned-cli',isRunning:false,hasPendingPermission:false,hasLiveWorkflows:false,hasBackgroundWork:false,hasBackgroundActivity:false,activeBackgroundTasks:0,pendingEchoUuids:[],awaitingTurnResult:false,cliLastTurnMessageWasResult:true,cliAtTurnBoundaryHint:true,interruptResultPendingSince:null,interruptResultPendingCycleArmed:false,cliProvablyIdle:true,inputStreamHasPending:false,nextCycleUuid:null,hasPendingCycle:false,pendingCycleUserMessageUuid:null,deferredSendUuids:[],heldSteersUuids:[],toolMayBeRunning:false}
test('exact exporter projection handles absent queues and background-task maps without exposing content',()=>{
 const raw={...idle,activeBackgroundTasks:null,pendingEchoUuids:null,deferredSendUuids:null,heldSteersUuids:null,awaitingTurnResult:null,inputStreamHasPending:null,interruptResultPendingCycleArmed:null},projection={...opts,projectionSourceSha:SNAPSHOT_SOURCE_SHA}
 const r=summarizeNativeSnapshot(raw,projection);assert.equal(r.queueStateComplete,true);assert.equal(r.idleCandidate,true);assert.equal(r.releaseAuthorized,false)
 assert.equal(summarizeNativeSnapshot({...raw,cliLastTurnMessageWasResult:null},projection).idleCandidate,false)
 assert.equal(summarizeNativeSnapshot({...raw,activeBackgroundTasks:0},projection).queueStateComplete,false)
 const missing={...raw};delete missing.heldSteersUuids;assert.equal(summarizeNativeSnapshot(missing,projection).queueStateComplete,false)
 assert.throws(()=>summarizeNativeSnapshot(raw,{...opts,projectionSourceSha:'foreign'}),/source refused/)
 const active=summarizeNativeSnapshot({...raw,activeBackgroundTasks:{PRIVATE_ID:{prompt:'PRIVATE_CONTENT'}}},projection)
 assert.equal(active.activeBackgroundTasks,1);assert.equal(active.idleCandidate,false);assert.equal(JSON.stringify(active).includes('PRIVATE'),false)
})
test('complete native queue metadata can be an idle candidate, never release authorization',()=>{
 const r=summarizeNativeSnapshot(idle,opts);assert.equal(r.queueStateComplete,true);assert.equal(r.idleCandidate,true);assert.equal(r.releaseAuthorized,false)
 for(const change of [{isRunning:true},{awaitingTurnResult:true},{cliProvablyIdle:false},{inputStreamHasPending:true},{toolMayBeRunning:true},{heldSteersUuids:['private-uuid']},{nextCycleUuid:'private-uuid'}])assert.equal(summarizeNativeSnapshot({...idle,...change},opts).idleCandidate,false)
})
test('offline/null, malformed and missing queue fields cannot establish idle',()=>{
 for(const change of [{awaitingTurnResult:null},{activeBackgroundTasks:null},{activeBackgroundTasks:-1},{pendingEchoUuids:null},{cliAtTurnBoundaryHint:'false'},{hasPendingCycle:{private:'value'}}]){const r=summarizeNativeSnapshot({...idle,...change},opts);assert.equal(r.queueStateComplete,false);assert.equal(r.idleCandidate,false)}
 const incomplete={...idle};delete incomplete.nextCycleUuid;assert.equal(summarizeNativeSnapshot(incomplete,opts).idleCandidate,false)
})
test('snapshot identity/freshness fail closed; private queue content never leaves the summary',()=>{
 for(const change of [{sessionId:'foreign'},{cliSessionId:'foreign'},{capturedAt:new Date(500).toISOString()},{capturedAt:new Date(2500).toISOString()},{capturedAt:{private:'value'}}])assert.throws(()=>summarizeNativeSnapshot({...idle,...change},opts),/refused/)
 const r=summarizeNativeSnapshot({...idle,pendingEchoUuids:['PRIVATE_ECHO'],heldSteersUuids:[{message:'PRIVATE_STEER'}],nextCycleUuid:'PRIVATE_NEXT',unknown:{prompt:'PRIVATE_CONTENT'}},opts)
 assert.equal(r.pendingEchoCount,1);assert.equal(r.heldSteerCount,1);assert.equal(r.nextCycleUuidPresent,true);assert.equal(JSON.stringify(r).includes('PRIVATE'),false)
})
