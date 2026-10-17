import {createHash} from 'node:crypto'
import {dirname,join} from 'node:path'
import {serviceStateBindingMatches} from './runtime-entry.mjs'
// Pure preparation. No settings write, policy installation or native admission.
export function buildNativeServicePolicy({binding,epoch,brokerDir,scriptSha256,now=Date.now()}){
 if(!serviceStateBindingMatches({binding,dir:brokerDir,sessionId:binding?.sessionId,build:binding?.build,receiverCwd:binding?.receiverCwd})||!Number.isInteger(epoch?.pid)||epoch.pid<=1||typeof epoch.procStart!=='string'||!epoch.procStart||! /^[a-f0-9]{64}$/.test(scriptSha256)||!Number.isSafeInteger(now)||now<0)throw Error('invalid independent policy binding')
 const script=join(dirname(brokerDir),'releases',binding.build,'scripts/broker-stop-rescue.mjs'),settingsPath=join(binding.receiverCwd,'.claude','settings.json')
 const settings={hooks:{PreToolUse:[{matcher:'Bash|mcp__ccd_.*',hooks:[{type:'command',command:process.execPath,args:[script,brokerDir,'PreToolUse'],timeout:5}]}]}}
 const settingsBytes=JSON.stringify(settings,null,2)+'\n'
 const policy={schemaVersion:1,nativeEffectAdmissionVersion:1,nativeRequestBindingVersion:1,sessionId:binding.sessionId,pid:epoch.pid,procStart:epoch.procStart,build:binding.build,script,sha256:scriptSha256,settingsHash:createHash('sha256').update(settingsBytes).digest('hex'),settingsPath,serviceStateBinding:binding,maximumRescuesPerRequest:0,installedAt:now}
 return {settingsPath,settingsBytes,policyPath:join(brokerDir,'stop-rescue-policy.json'),policy}
}
