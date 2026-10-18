#!/usr/bin/env node
import {constants,openSync,closeSync,fstatSync,readFileSync,lstatSync} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {homedir} from 'node:os'
import {STATE_DIR,BROKER_DIR} from './state.mjs'
import {independentServiceState} from './independent-service-result.mjs'
import {getRecord} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {versions} from './paths.mjs'
import {activeRelease,validateRelease} from './releases.mjs'
import {nativePolicySettingsPath} from './runtime-entry.mjs'
import {snapshotIndependentModule,independentRetirementLedgerMatches} from './independent-module-tree.mjs'
import {independentStopMatches} from './independent-service-quiesce.mjs'
import {pathToFileURL} from 'node:url'
import {requireIndependentEpochAbsent} from './independent-offline-review.mjs'
const refuse=()=>{throw Error('independent receipt refused')}
const bytes=(file,limit=65536)=>{const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);try{const st=fstatSync(fd);if(!st.isFile()||st.uid!==process.getuid()||st.size>limit)refuse();const b=readFileSync(fd);if(b.length>limit)refuse();return b}finally{closeSync(fd)}}
const json=file=>JSON.parse(bytes(file)),hash=b=>createHash('sha256').update(b).digest('hex')
const ordered=x=>Array.isArray(x)?x.map(ordered):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordered(x[k])])):x
export async function buildSealedIndependentPackage(build,config){
 const release=validateRelease(build)
 if(config?.build!==build||release.manifest.nativeServiceStateBindingVersion!==1)refuse()
 const {buildNativePeerServicePackage}=await import(pathToFileURL(join(release.root,'lib/native-peer-service-package.mjs')).href)
 if(typeof buildNativePeerServicePackage!=='function')refuse()
 return buildNativePeerServicePackage(config)
}
export async function loadIndependentServiceContext(session,serviceId,{requireIdle=false,allowRetired=false,historicalOnly=false,offlineOnly=false,historicalRecord}={}){
 if(historicalOnly&&(!allowRetired||requireIdle)||offlineOnly&&(historicalOnly||requireIdle)||historicalRecord!==undefined&&!historicalOnly&&!offlineOnly)refuse()
 const evidenceOnly=historicalOnly||offlineOnly,record=evidenceOnly&&historicalRecord!==undefined?historicalRecord:getRecord(session),version=evidenceOnly?null:versions()
 if(independentServiceState(session,serviceId,record)!==STATE_DIR||!evidenceOnly&&(version.cli!=='2.1.299'||version.app!=='2.42304.0'||record.permissionMode!=='bypassPermissions'))refuse()
 for(const path of [record.cwd,join(record.cwd,'.claude-driver-services'),STATE_DIR,BROKER_DIR]){const st=lstatSync(path);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid())refuse()}
 const release=activeRelease(),pointer=release?.pointer,peer=evidenceOnly?null:peerRecord(session,pointer?.pid)
 if(!release||pointer.sessionId!==session||pointer.serviceStateBinding?.id!==serviceId||!evidenceOnly&&(!peer||peer.procStart!==pointer.procStart||peer.entrypoint!=='claude-desktop'||peer.version!=='2.1.299'||peer.cwd!==record.cwd))refuse()
 const offlineObservation=offlineOnly?requireIndependentEpochAbsent(pointer):null
 const watchedModule=join(process.env.CLAUDE_CONFIG_DIR||join(homedir(),'.claude'),'dev-mods',session.slice(6),'desktop-bridge-native-peer-service')
 let module=watchedModule,retirement=null,sourceDisposition='installed'
 const useRetired=()=>{
  retirement=json(join(STATE_DIR,'retirement.json'))
  if(!independentRetirementLedgerMatches(retirement,{serviceId,pointer})||!independentStopMatches(json(join(BROKER_DIR,'STOP')),{serviceId,pointer}))refuse()
  module=join(STATE_DIR,'retired-module');sourceDisposition=retirement.phase==='files-retired'?'files-retired':'files-retired-uncheckpointed'
 }
 if(historicalOnly)useRetired()
 else try{lstatSync(watchedModule)}catch(error){if(error.code!=='ENOENT'||!allowRetired)refuse();useRetired()}
 const source=bytes(join(module,'hooks/register.js')).toString('utf8'),prefix='const CONFIG=Object.freeze(',end=source.indexOf(');\n')
 if(!source.startsWith(prefix)||end<0)refuse()
 const config=JSON.parse(source.slice(prefix.length,end)),pkg=await buildSealedIndependentPackage(pointer.build,config),epoch={pid:pointer.pid,procStart:pointer.procStart,build:pointer.build}
 if(config.id!==serviceId||config.brokerSession!==session||config.brokerCwd!==BROKER_DIR||config.build!==pointer.build||JSON.stringify(ordered(config.serviceStateBinding))!==JSON.stringify(ordered(pointer.serviceStateBinding)))refuse()
 for(const[name,expected]of Object.entries(pkg.hashes))if(hash(bytes(join(module,name)))!==expected)refuse()
 if(retirement&&JSON.stringify(ordered(snapshotIndependentModule(module,pkg.hashes)))!==JSON.stringify(ordered(retirement.inventory)))refuse()
 const policy=json(join(BROKER_DIR,'stop-rescue-policy.json')),settings=nativePolicySettingsPath({pointer,policy,dir:BROKER_DIR})
 if([config,policy,pointer].some(x=>x.sessionStopControl!==undefined)&&(![config,policy,pointer].every(x=>x.sessionStopControl===true)||config.sessionManagementControl!==true))refuse()
 if([config,policy,pointer].some(x=>x.sessionArchiveControl!==undefined)&&(![config,policy,pointer].every(x=>x.sessionArchiveControl===true)||config.sessionManagementControl!==true))refuse()
 if([config,policy,pointer].some(x=>x.sessionSendControl!==undefined)&&(![config,policy,pointer].every(x=>x.sessionSendControl===true)||config.sessionManagementControl!==true))refuse()
 if([config,policy,pointer].some(x=>x.sessionMetadataControl!==undefined)&&(![config,policy,pointer].every(x=>x.sessionMetadataControl===true)||config.sessionManagementControl!==true))refuse()
 if([config,policy,pointer].some(x=>x.sessionManagementControl!==undefined)&&![config,policy,pointer].every(x=>x.sessionManagementControl===true))refuse()
 let settingsEvidencePath=settings,settingsEvidence='current-settings'
 if(retirement){try{const retained=join(STATE_DIR,'retired-settings.json');bytes(retained);if(!['before-move','retained'].includes(retirement.settingsPhase)||retirement.settingsSha256!==policy.settingsHash)refuse();settingsEvidencePath=retained;settingsEvidence=retirement.settingsPhase==='retained'?'retained-settings':'retained-settings-uncheckpointed'}catch(error){if(error.code!=='ENOENT')throw error}}
 if(policy.schemaVersion!==1||policy.nativeEffectAdmissionVersion!==1||policy.nativeRequestBindingVersion!==1||policy.maximumRescuesPerRequest!==0||!settings||policy.script!==join(release.root,'scripts/broker-stop-rescue.mjs')||hash(bytes(policy.script))!==policy.sha256||hash(bytes(settingsEvidencePath))!==policy.settingsHash)refuse()
 if(Object.hasOwn(policy,'receiverHook')){
  const {buildNativeServicePolicy}=await import(pathToFileURL(join(release.root,'lib/native-service-policy.mjs')).href)
  const expected=buildNativeServicePolicy({binding:pointer.serviceStateBinding,epoch,brokerDir:BROKER_DIR,scriptSha256:policy.sha256,stableHook:true,now:policy.installedAt})
  if(!expected.receiverHook||JSON.stringify(ordered(policy.receiverHook))!==JSON.stringify(ordered(expected.policy.receiverHook))||policy.settingsHash!==expected.policy.settingsHash||hash(bytes(policy.receiverHook.anchorPath))!==expected.receiverHook.anchorSha256)refuse()
  if(!retirement){const {loadReceiverSelection}=await import(pathToFileURL(join(release.root,'lib/receiver-runtime-selection.mjs')).href),selected=loadReceiverSelection(record.cwd);if(JSON.stringify(ordered(selected.pointer))!==JSON.stringify(ordered(pointer))||selected.brokerDir!==BROKER_DIR)refuse()}
 }
 if(requireIdle&&peer.status!=='idle')refuse()
 if(offlineOnly){requireIndependentEpochAbsent(pointer);if(JSON.stringify(ordered(activeRelease()?.pointer))!==JSON.stringify(ordered(pointer)))refuse()}
 return {record,release,pointer,peer,config,epoch,policy,module,watchedModule,sourceDisposition,settingsEvidence,settingsEvidencePath,watchedPathAssessed:!historicalOnly,verificationMode:historicalOnly?'historical-retired':offlineOnly?(retirement?'offline-retired':'offline-installed'):'live-native',offlineObservation,pkg,read:name=>json(join(BROKER_DIR,name))}
}
export {bytes as independentBytes,json as independentJson,ordered as independentOrdered}
