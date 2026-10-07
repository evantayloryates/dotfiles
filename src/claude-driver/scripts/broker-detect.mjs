#!/usr/bin/env node
import {join} from 'node:path'
import {sampleBroker,detectorTransition,publishDetectorEvent} from '../lib/broker-detector.mjs'
import {BROKER_DIR,STATE_DIR,readJson,withLock,writeJsonAtomic} from '../lib/state.mjs'
import {findRecordFile} from '../lib/sessions.mjs'
import {PEER_SESSIONS_DIR,sleep} from '../lib/paths.mjs'
import {RUNTIME_BUILD} from '../lib/build.mjs'
const stateFile=join(STATE_DIR,'detector-v1.json'),reportDir='/Users/taylor/Desktop/temp_reports'
await withLock('broker-detector',async()=>{
 const prior=readJson(stateFile,null)
 const observe=()=>{const session=readJson(join(BROKER_DIR,'broker.json'),null)?.sessionId;return sampleBroker({brokerDir:BROKER_DIR,recordFile:session&&findRecordFile(session),peerDir:PEER_SESSIONS_DIR})}
 let sample=observe(),event=detectorTransition(prior?.sample,sample)
 if(event?.kind==='fault-observation'){
  await sleep(2000) // confirm a transition across atomic metadata writes
  const confirmed=observe()
  event=detectorTransition(prior?.sample,confirmed);sample=confirmed
 }
 let published
 if(event)published=publishDetectorEvent({sample,event,reportDir,runtimeBuild:RUNTIME_BUILD})
 writeJsonAtomic(stateFile,{schemaVersion:1,sample,lastEvent:event?{...event,...published,at:sample.at}:prior?.lastEvent??null,runtimeBuild:RUNTIME_BUILD,tickIntervalSec:30,inferenceCalls:0,recoveryOwner:'Claude observer'})
 // A healthy tick is silent. The existing inbox consumes only new evidence.
 if(published)console.log(JSON.stringify({event:event.kind,report:published.file,inferenceCalls:0}))
},{timeoutMs:5000})
