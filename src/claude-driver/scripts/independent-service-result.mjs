#!/usr/bin/env node
import {constants,openSync,closeSync,fstatSync,readFileSync,lstatSync} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {homedir} from 'node:os'
import {STATE_DIR,BROKER_DIR,withLock,writeJsonAtomic} from '../lib/state.mjs'
import {independentServiceState} from '../lib/independent-service-result.mjs'
import {getRecord} from '../lib/sessions.mjs'
import {peerRecord} from '../lib/peer-direct.mjs'
import {versions} from '../lib/paths.mjs'
import {activeRelease} from '../lib/releases.mjs'
import {nativePolicySettingsPath} from '../lib/runtime-entry.mjs'
import {buildNativePeerServicePackage} from '../lib/native-peer-service-package.mjs'
import {screenNativeServiceResult} from '../lib/native-peer-service-evidence.mjs'
import {nativeRequestBindingMatches} from '../lib/native-request-binding.mjs'
const refuse=()=>{throw Error('independent receipt refused')}
const bytes=(file,limit=65536)=>{const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);try{const st=fstatSync(fd);if(!st.isFile()||st.uid!==process.getuid()||st.size>limit)refuse();const b=readFileSync(fd);if(b.length>limit)refuse();return b}finally{closeSync(fd)}}
const json=file=>JSON.parse(bytes(file)),hash=b=>createHash('sha256').update(b).digest('hex')
const ordered=x=>Array.isArray(x)?x.map(ordered):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordered(x[k])])):x
try{
 const [session,serviceId,requestId]=process.argv.slice(2),record=getRecord(session)
 const version=versions()
 if(!/^rpeer[a-f0-9]{32}$/.test(requestId||'')||independentServiceState(session,serviceId,record)!==STATE_DIR||version.cli!=='2.1.299'||version.app!=='2.42304.0'||record.permissionMode!=='bypassPermissions')refuse()
 for(const path of [record.cwd,join(record.cwd,'.claude-driver-services'),STATE_DIR,BROKER_DIR]){const st=lstatSync(path);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid())refuse()}
 const release=activeRelease(),pointer=release?.pointer,peer=peerRecord(session,pointer?.pid)
 if(!release||!peer||peer.procStart!==pointer.procStart||peer.entrypoint!=='claude-desktop'||peer.version!=='2.1.299'||peer.cwd!==record.cwd||pointer.sessionId!==session||pointer.serviceStateBinding?.id!==serviceId)refuse()
 const module=join(process.env.CLAUDE_CONFIG_DIR||join(homedir(),'.claude'),'dev-mods',session.slice(6),'desktop-bridge-native-peer-service'),source=bytes(join(module,'hooks/register.js')).toString('utf8'),prefix='const CONFIG=Object.freeze(',end=source.indexOf(');\n')
 if(!source.startsWith(prefix)||end<0)refuse()
 const config=JSON.parse(source.slice(prefix.length,end)),pkg=buildNativePeerServicePackage(config),epoch={pid:pointer.pid,procStart:pointer.procStart,build:pointer.build}
 if(config.id!==serviceId||config.brokerSession!==session||config.brokerCwd!==BROKER_DIR||config.build!==pointer.build||JSON.stringify(ordered(config.serviceStateBinding))!==JSON.stringify(ordered(pointer.serviceStateBinding)))refuse()
 for(const[name,expected]of Object.entries(pkg.hashes))if(hash(bytes(join(module,name)))!==expected)refuse()
 const policy=json(join(BROKER_DIR,'stop-rescue-policy.json')),settings=nativePolicySettingsPath({pointer,policy,dir:BROKER_DIR})
 if(!settings||policy.script!==join(release.root,'scripts/broker-stop-rescue.mjs')||hash(bytes(policy.script))!==policy.sha256||hash(bytes(settings))!==policy.settingsHash)refuse()
 const result=await withLock('request-'+requestId,()=>{
  const read=name=>json(join(BROKER_DIR,name)),request=read('requests/'+requestId+'.json'),receipt=read('.native-service-'+requestId+'.result.json')
  const reviewed=screenNativeServiceResult({config,epoch,pointer,request,receipt,ready:read('.native-service-'+serviceId+'.ready.json'),intent:read('.native-service-'+requestId+'.intent.json'),entry:read('broker-check-'+requestId+'-0-g'+pointer.generation+'.completed.json'),admission:read('native-admission-'+requestId+'-0.json'),control:read('controls/'+requestId+'.json')})
  if(!reviewed.receiptVerified||!nativeRequestBindingMatches(request,pointer)||request.nativeEffectAdmissionPolicy?.version!==1||request.nativeEffectAdmissionPolicy?.handlerSha256!==policy.sha256||request.nativeEffectAdmissionPolicy?.settingsHash!==policy.settingsHash)refuse()
  const native={id:requestId,source:'native-peer-service-result',results:[{op:'get_session',...reviewed.result,nativeToolUseId:reviewed.nativeToolUseId}]},file=join(BROKER_DIR,'results',requestId+'.native.json')
  let published=false
  try{if(JSON.stringify(ordered(json(file)))!==JSON.stringify(ordered(native)))refuse()}catch(error){if(error.code!=='ENOENT')throw error;writeJsonAtomic(file,native);published=true}
  if(JSON.stringify(ordered(json(file)))!==JSON.stringify(ordered(native)))refuse()
  return {serviceId,requestId,receiptVerified:true,state:reviewed.result.ok?'completed':'failed',source:native.source,nativeToolUseId:reviewed.nativeToolUseId,published,controlHistoryPreserved:true,releaseAuthorized:false}
 },{timeoutMs:5000})
 console.log(JSON.stringify(result))
}catch{console.error('independent native result evidence refused; no replay');process.exitCode=1}
