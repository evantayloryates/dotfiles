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
import {pathToFileURL} from 'node:url'
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
export async function loadIndependentServiceContext(session,serviceId,{requireIdle=false}={}){
 const record=getRecord(session),version=versions()
 if(independentServiceState(session,serviceId,record)!==STATE_DIR||version.cli!=='2.1.299'||version.app!=='2.42304.0'||record.permissionMode!=='bypassPermissions')refuse()
 for(const path of [record.cwd,join(record.cwd,'.claude-driver-services'),STATE_DIR,BROKER_DIR]){const st=lstatSync(path);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid())refuse()}
 const release=activeRelease(),pointer=release?.pointer,peer=peerRecord(session,pointer?.pid)
 if(!release||!peer||peer.procStart!==pointer.procStart||peer.entrypoint!=='claude-desktop'||peer.version!=='2.1.299'||peer.cwd!==record.cwd||pointer.sessionId!==session||pointer.serviceStateBinding?.id!==serviceId)refuse()
 const module=join(process.env.CLAUDE_CONFIG_DIR||join(homedir(),'.claude'),'dev-mods',session.slice(6),'desktop-bridge-native-peer-service'),source=bytes(join(module,'hooks/register.js')).toString('utf8'),prefix='const CONFIG=Object.freeze(',end=source.indexOf(');\n')
 if(!source.startsWith(prefix)||end<0)refuse()
 const config=JSON.parse(source.slice(prefix.length,end)),pkg=await buildSealedIndependentPackage(pointer.build,config),epoch={pid:pointer.pid,procStart:pointer.procStart,build:pointer.build}
 if(config.id!==serviceId||config.brokerSession!==session||config.brokerCwd!==BROKER_DIR||config.build!==pointer.build||JSON.stringify(ordered(config.serviceStateBinding))!==JSON.stringify(ordered(pointer.serviceStateBinding)))refuse()
 for(const[name,expected]of Object.entries(pkg.hashes))if(hash(bytes(join(module,name)))!==expected)refuse()
 const policy=json(join(BROKER_DIR,'stop-rescue-policy.json')),settings=nativePolicySettingsPath({pointer,policy,dir:BROKER_DIR})
 if(policy.schemaVersion!==1||policy.nativeEffectAdmissionVersion!==1||policy.nativeRequestBindingVersion!==1||policy.maximumRescuesPerRequest!==0||!settings||policy.script!==join(release.root,'scripts/broker-stop-rescue.mjs')||hash(bytes(policy.script))!==policy.sha256||hash(bytes(settings))!==policy.settingsHash)refuse()
 if(requireIdle&&peer.status!=='idle')refuse()
 return {record,release,pointer,peer,config,epoch,policy,module,pkg,read:name=>json(join(BROKER_DIR,name))}
}
export {bytes as independentBytes,json as independentJson,ordered as independentOrdered}
