#!/usr/bin/env node
// Zero-inference screening. No report -> no native/source inspection or writes.
// Never acknowledge, execute report commands, wake, load or mutate a session.
import {fileURLToPath} from 'node:url'
import {resolve} from 'node:path'
import {scanReports} from '../lib/report-inbox.mjs'
import {MOD_PROBE,readProbeBytes,probePathPresence,screenProbeReport,screenProbeState} from '../lib/native-mod-probe-evidence.mjs'
import {STATE_DIR,readJson} from '../lib/state.mjs'
const directory='/Users/taylor/Desktop/temp_reports'
// Locate this exact experiment even when older unresolved reports fill the
// generic inbox's first32 window. Preserve all of their pending/ack state.
const scanned=scanReports(directory).find(x=>x.name===MOD_PROBE.reportName)
const reviewed=readJson(resolve(STATE_DIR,'report-inbox.json'),{reviewed:{}}).reviewed||{}
const pending=scanned&&reviewed[scanned.name]!==scanned.sha256?scanned:null
if(!pending){console.log(JSON.stringify({pending:false,probeId:MOD_PROBE.id}));process.exit(0)}
let screen
try{
 const read=readProbeBytes(resolve(directory,pending.name),4096)
 const intent=JSON.parse(readProbeBytes(resolve(MOD_PROBE.brokerCwd,'.native-mod-probe-'+MOD_PROBE.id+'.started.json'),4096).bytes.toString('utf8'))
 screen=screenProbeReport(read.bytes,{sha256:pending.sha256,intent})
 if(!screen.reportConsistent)throw Error('report refused')
 // Deliberately lazy: these metadata readers are only needed for new evidence.
 const {brokerInfo}=await import('../lib/broker.mjs'),{versions}=await import('../lib/paths.mjs')
 const source=fileURLToPath(new URL('../candidates/native-mod-probe/',import.meta.url))
 const installed='/Users/taylor/.claude/dev-mods/'+MOD_PROBE.cliSessionId+'/desktop-bridge-native-probe'
 const hashes=dir=>Object.fromEntries(Object.keys(MOD_PROBE.files).map(file=>{try{return [file,readProbeBytes(resolve(dir,file)).sha256]}catch{return [file,null]}}))
 const hash=file=>{try{return readProbeBytes(file).sha256}catch{return null}}
 const b=MOD_PROBE.brokerCwd
 screen={...screen,...screenProbeState({report:screen,versions:versions(),broker:brokerInfo(),settingsHash:hash(resolve(b,'.claude/settings.json')),policyHash:hash(resolve(b,'stop-rescue-policy.json')),sourceFiles:hashes(source),installedFiles:hashes(installed),stopped:probePathPresence(resolve(b,'STOP')),armed:probePathPresence(resolve(b,'stop-rescue-arm.json')),diagnostic:probePathPresence(resolve(b,'mechanical-probe.json'))})}
}catch{
 screen={reportConsistent:false,eligibleForNativeReview:false,reason:'probe-evidence-unavailable-or-inconsistent',nativeGateQualified:false,nativeModelTurnsQualified:false,releaseAuthorized:false}
}
console.log(JSON.stringify({pending:true,name:pending.name,sha256:pending.sha256,screen,acknowledged:false,inferenceCalls:0}))
