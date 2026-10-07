import test from 'node:test'
import assert from 'node:assert/strict'
import {screenNativePeerEvidence} from '../lib/native-peer-evidence.mjs'
const time=new Date(10).toISOString(),config={id:'fixed',brokerSession:'local_owned',brokerCwd:'/synthetic',targetSession:'local_fixture',notBefore:1,deadline:100},flags={schemaVersion:1,probeId:config.id,brokerSession:config.brokerSession,gateQualified:false,releaseAuthorized:false,modelCallsRequested:0}
const ready={...flags,scope:'owned-native-peer-read-ready',brokerCwd:config.brokerCwd,registeredAt:time,nativeCallsRequested:0},intent={...flags,scope:'owned-native-peer-read',targetSession:config.targetSession,startedAt:time,complete:false},report={...intent,complete:true,nativeCallReturned:false,resultWasError:null,failureCategory:'broker-dispatch-gate-refusal',completedAt:time}
test('peer evidence preserves false qualification and refuses identity, chronology, schema and result drift',()=>{
 const input={config,ready,intent,report,now:100}
 assert.equal(screenNativePeerEvidence(input).consistent,true);assert.equal(screenNativePeerEvidence(input).nativeGateQualified,false)
 for(const change of [{probeId:'foreign'},{targetSession:'foreign'},{gateQualified:true},{extra:'private'},{failureCategory:'invented'},{nativeCallReturned:true},{resultWasError:false},{completedAt:new Date(1).toISOString()}])assert.equal(screenNativePeerEvidence({...input,report:{...report,...change}}).consistent,false)
 assert.equal(screenNativePeerEvidence({...input,ready:{...ready,registeredAt:new Date(101).toISOString()}}).consistent,false)
})
import {screenNativePeerState} from '../lib/native-peer-evidence.mjs'
test('peer state screen requires exact epoch, sealed runtime, versions, copied bytes and unarmed controls',()=>{
 const hash='a'.repeat(64),baseline={'.claude/settings.json':hash,'stop-rescue-policy.json':hash},hashes={'.claude-plugin/plugin.json':hash,'hooks/hooks.json':hash,'hooks/register.js':hash},epoch={pid:1,procStart:'fixed-start',build:'fixed-build'},versions={app:'fixed-app',cli:'fixed-cli'},broker={sessionId:config.brokerSession,live:{pid:1,procStart:epoch.procStart,entrypoint:'claude-desktop'},runtime:{pinned:true,integrity:true,build:epoch.build}}
 const input={evidence:{consistent:true},config,epoch,broker,baseline,currentBaseline:baseline,hashes,installedHashes:hashes,versions,expectedVersions:versions,stopped:false,armed:false,diagnostic:false}
 assert.equal(screenNativePeerState(input).eligibleForIndependentNativeReview,true)
 for(const change of [{armed:true},{stopped:undefined},{currentBaseline:{}},{installedHashes:{}},{versions:{app:'drift',cli:'fixed-cli'}},{evidence:{consistent:false}},{broker:{...broker,live:{...broker.live,pid:2}}}])assert.equal(screenNativePeerState({...input,...change}).eligibleForIndependentNativeReview,false)
})
