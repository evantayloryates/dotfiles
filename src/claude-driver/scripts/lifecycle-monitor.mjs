#!/usr/bin/env node
// Passive launchd tick. No inference, navigation, sends, recovery or termination.
import {execFileSync} from 'node:child_process'
import {join} from 'node:path'
import {captureNativeLifecycle} from '../lib/native-lifecycle-capture.mjs'
import {sampleBroker,eventKey} from '../lib/broker-detector.mjs'
import {lifecycleEvent} from '../lib/lifecycle-log.mjs'
import {BROKER_DIR,STATE_DIR,readJson,writeJsonAtomic,withLock} from '../lib/state.mjs'
import {findRecordFile,getRecord} from '../lib/sessions.mjs'
import {PEER_SESSIONS_DIR,versions} from '../lib/paths.mjs'
import {RUNTIME_BUILD} from '../lib/build.mjs'
if(process.argv.length!==2)throw Error('No arguments accepted')
await withLock('lifecycle-monitor',async()=>{
 const file=join(STATE_DIR,'lifecycle-monitor.json'),prior=readJson(file,null)
 const sessionId=readJson(join(BROKER_DIR,'broker.json'),null)?.sessionId
 let appRunning=null
 try{appRunning=execFileSync('/bin/ps',['-axo','comm='],{encoding:'utf8',timeout:2000,maxBuffer:1024*1024}).split('\n').some(x=>x.trim()==='/Applications/Claude.app/Contents/MacOS/Claude')}catch{}
 const record=sessionId?getRecord(sessionId):null
 const sample=sampleBroker({brokerDir:BROKER_DIR,recordFile:sessionId&&findRecordFile(sessionId),peerDir:PEER_SESSIONS_DIR})
 const native=await captureNativeLifecycle(sessionId)
 const installed=versions(),key=JSON.stringify({sample:eventKey(sample),appRunning,installed,build:RUNTIME_BUILD})
 let logged={recorded:false,reason:'unchanged'}
 if(key!==prior?.key)logged=lifecycleEvent('passive-health-transition',{category:sample.reason||sample.state,versions:installed,build:RUNTIME_BUILD,info:{sessionId,appRunning,exists:!!record,archived:record?.isArchived??null,live:sample.pid?{pid:sample.pid,procStart:sample.procStart}:null},outcome:sample.state})
 // Advance transition identity only after append succeeds; failures remain retryable.
 writeJsonAtomic(file,{schemaVersion:1,lastTickAt:new Date().toISOString(),key:logged.recorded?key:prior?.key??null,lastEventAt:logged.recorded?new Date().toISOString():prior?.lastEventAt??null,appRunning,sample,native,logging:logged,versions:installed,runtimeBuild:RUNTIME_BUILD,recoveryAttempted:false,inferenceCalls:0})
},{timeoutMs:3000})
