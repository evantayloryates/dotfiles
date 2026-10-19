// Pure receiver selector admission. Selection is never native readiness or
// dispatch authority; the selected sealed handler must still enforce its gates.
import {join,resolve} from 'node:path'
import {constants,openSync,closeSync,fstatSync,lstatSync,readSync} from 'node:fs'
import {createHash} from 'node:crypto'
const hex=/^[a-f0-9]{64}$/
const keys='anchorSha256,bootstrapHash,build,generation,pid,procStart,receiverCwd,schemaVersion,serviceId,sessionId,settingsSha256'
export function selectReceiverRuntime({selector,receiverCwd,pointer,policy,anchorSha256,settingsSha256}={}){
 const fail=()=>{throw Error('receiver runtime selection refused')}
 if(!selector||Array.isArray(selector)||Object.keys(selector).sort().join(',')!==keys)fail()
 const s=selector
 if(s.schemaVersion!==1||typeof receiverCwd!=='string'||receiverCwd==='/'||resolve(receiverCwd)!==receiverCwd||s.receiverCwd!==receiverCwd||!/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s.sessionId)||! /^[a-f0-9]{32}$/.test(s.serviceId)||!Number.isSafeInteger(s.generation)||s.generation<1||!Number.isSafeInteger(s.pid)||s.pid<=1||typeof s.procStart!=='string'||!s.procStart.trim())fail()
 for(const field of ['build','bootstrapHash','anchorSha256','settingsSha256'])if(typeof s[field]!=='string'||!hex.test(s[field]))fail()
 if(s.anchorSha256!==anchorSha256||s.settingsSha256!==settingsSha256)fail()
 const stateDir=join(receiverCwd,'.claude-driver-services',s.serviceId),brokerDir=join(stateDir,'broker')
 const binding={version:1,id:s.serviceId,sessionId:s.sessionId,receiverCwd,build:s.build}
 const sameBinding=b=>b&&Object.keys(b).sort().join(',')==='build,id,receiverCwd,sessionId,version'&&Object.entries(binding).every(([k,v])=>b[k]===v)
 if(pointer?.schemaVersion!==1||!sameBinding(pointer.serviceStateBinding)||!sameBinding(policy?.serviceStateBinding))fail()
 for(const field of ['build','generation','pid','procStart','sessionId'])if(pointer[field]!==s[field])fail()
 if(pointer.bootstrapHash!==s.bootstrapHash||policy.build!==s.build||policy.pid!==s.pid||policy.procStart!==s.procStart||policy.sessionId!==s.sessionId||policy.settingsHash!==s.settingsSha256||policy.settingsPath!==join(receiverCwd,'.claude','settings.json')||policy.maximumRescuesPerRequest!==0||policy.nativeEffectAdmissionVersion!==1||policy.nativeRequestBindingVersion!==1)fail()
 const handler=join(stateDir,'releases',s.build,'scripts','broker-stop-rescue.mjs')
 if(policy.script!==handler||!hex.test(policy.sha256||''))fail()
 return {stateDir,brokerDir,handler,bootstrap:join(stateDir,'entry',s.bootstrapHash+'.mjs')}
}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
function ownedDirectory(path){
 const s=lstatSync(path)
 if(s.isSymbolicLink()||!s.isDirectory()||s.uid!==process.getuid()||(s.mode&0o022))throw Error('receiver directory refused')
}
export function readReceiverFile(path,maxBytes,{sealed=false}={}){
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
 try{
  const before=fstatSync(fd)
  if(!before.isFile()||before.uid!==process.getuid()||before.size>maxBytes||(before.mode&0o022)||sealed&&(before.mode&0o222))throw Error('receiver file refused')
  const bytes=Buffer.alloc(before.size)
  for(let offset=0;offset<bytes.length;){const n=readSync(fd,bytes,offset,bytes.length-offset,offset);if(!n)throw Error('receiver file changed');offset+=n}
  const after=fstatSync(fd),named=lstatSync(path)
  for(const field of ['dev','ino','size','mtimeMs','ctimeMs','mode','uid'])if(before[field]!==after[field]||after[field]!==named[field])throw Error('receiver file changed')
  if(named.isSymbolicLink())throw Error('receiver file changed')
  return bytes
 }finally{closeSync(fd)}
}
// Read-only evidence loader, deliberately separate from execution admission.
// Full release inventory and actual native ancestry remain the entry's duty.
export function loadReceiverSelection(receiverCwd){
 if(typeof receiverCwd!=='string'||receiverCwd==='/'||resolve(receiverCwd)!==receiverCwd)throw Error('receiver cwd refused')
 ownedDirectory(receiverCwd)
 const root=join(receiverCwd,'.claude-driver-services');ownedDirectory(root)
 const selectorPath=join(root,'receiver-runtime.json'),selectorBytes=readReceiverFile(selectorPath,4096),selector=JSON.parse(selectorBytes)
 // Validate identifiers BEFORE deriving any selected filesystem path.
 if(!/^[a-f0-9]{32}$/.test(selector?.serviceId||'')||!hex.test(selector?.build||'')||!hex.test(selector?.bootstrapHash||''))throw Error('receiver selector paths refused')
 const state=join(root,selector.serviceId),broker=join(state,'broker')
 for(const dir of [state,broker,join(receiverCwd,'.claude'),join(state,'entry'),join(state,'releases'),join(state,'releases',selector.build),join(state,'releases',selector.build,'scripts')])ownedDirectory(dir)
 const pointer=JSON.parse(readReceiverFile(join(broker,'runtime.json'),16384)),policy=JSON.parse(readReceiverFile(join(broker,'stop-rescue-policy.json'),16384))
 const anchor=readReceiverFile(join(root,'receiver-stop-entry.mjs'),65536,{sealed:true}),settings=readReceiverFile(join(receiverCwd,'.claude','settings.json'),65536)
 const selected=selectReceiverRuntime({selector,receiverCwd,pointer,policy,anchorSha256:sha(anchor),settingsSha256:sha(settings)})
 const handler=readReceiverFile(selected.handler,4*1024*1024,{sealed:true}),bootstrap=readReceiverFile(selected.bootstrap,65536,{sealed:true})
 if(sha(handler)!==policy.sha256||sha(bootstrap)!==selector.bootstrapHash)throw Error('receiver sealed entry refused')
 if(!readReceiverFile(selectorPath,4096).equals(selectorBytes))throw Error('receiver selector changed')
 return {...selected,selector,pointer,policy,executionQualified:false}
}
