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
