// Pure receiver selector admission. Selection is never native readiness or
// dispatch authority; the selected sealed handler must still enforce its gates.
import {join,resolve} from 'node:path'
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
