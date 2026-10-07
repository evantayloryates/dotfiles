#!/usr/bin/env node
// Read-only fixed experiment review. Never sends, loads, wakes or acknowledges.
import {resolve} from 'node:path'
import {readProbeBytes,probePathPresence} from '../lib/native-mod-probe-evidence.mjs'
import {screenNativePeerEvidence,screenNativePeerState} from '../lib/native-peer-evidence.mjs'
import {buildNativePeerPackage} from '../lib/native-peer-package.mjs'
const id=process.argv[2]
if(process.argv.length!==3||! /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id||''))throw Error('one exact probe UUID required')
const root='/Users/taylor/.local/state/claude-driver/pressure',reportPath='/Users/taylor/Desktop/temp_reports/native-peer-read-'+id+'.report.json'
if(!probePathPresence(reportPath)){console.log(JSON.stringify({pending:false,id}));process.exit(0)}
try{
 const json=p=>JSON.parse(readProbeBytes(p,16384).bytes.toString('utf8'))
 const enrollment=json(resolve(root,'native-peer-enrollment-'+id+'.json')),replacement=json(resolve(root,'native-peer-flat-replacement-'+id+'.json'))
 if(enrollment.config?.id!==id||replacement.id!==id||enrollment.dest!=='/Users/taylor/.claude/dev-mods/'+enrollment.config.brokerSession.slice(6)+'/desktop-bridge-native-peer-read')throw Error('experiment identity refused')
 const generated=buildNativePeerPackage(enrollment.config)
 if(Object.keys(generated.hashes).some(p=>generated.hashes[p]!==replacement.hashes?.[p]))throw Error('staged source drift')
 const reportRead=readProbeBytes(reportPath,4096),report=JSON.parse(reportRead.bytes.toString('utf8'))
 const evidence=screenNativePeerEvidence({config:enrollment.config,ready:json(enrollment.config.ready),intent:json(enrollment.config.intent),report})
 const {brokerInfo}=await import('../lib/broker.mjs'),{versions}=await import('../lib/paths.mjs')
 const hash=p=>{try{return readProbeBytes(p).sha256}catch{return null}}
 const baseline=Object.fromEntries(Object.keys(enrollment.baseline).map(p=>[p,hash(resolve(enrollment.config.brokerCwd,p))]))
 const installedHashes=Object.fromEntries(Object.keys(generated.hashes).map(p=>[p,hash(resolve(enrollment.dest,p))]))
 const state=screenNativePeerState({evidence,config:enrollment.config,epoch:enrollment.epoch,broker:brokerInfo(),baseline:enrollment.baseline,currentBaseline:baseline,hashes:replacement.hashes,installedHashes,versions:versions(),expectedVersions:{app:'2.26454.0',cli:'2.1.289'},stopped:probePathPresence(resolve(enrollment.config.brokerCwd,'STOP')),armed:probePathPresence(resolve(enrollment.config.brokerCwd,'stop-rescue-arm.json')),diagnostic:probePathPresence(resolve(enrollment.config.brokerCwd,'mechanical-probe.json'))})
 console.log(JSON.stringify({pending:true,id,sha256:reportRead.sha256,evidence,state,acknowledged:false}))
}catch{console.log(JSON.stringify({pending:true,id,consistent:false,eligibleForIndependentNativeReview:false,nativeGateQualified:false,releaseAuthorized:false,reason:'fixed-evidence-unavailable-or-inconsistent'}))}
