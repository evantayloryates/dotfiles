import {metadataTargetValid} from './native-metadata-control.mjs'
import {createHash} from 'node:crypto'
import {dirname,join} from 'node:path'
import {serviceStateBindingMatches} from './runtime-entry.mjs'
import {buildReceiverHookArtifact} from './receiver-hook-artifact.mjs'
// Pure preparation. No settings write, policy installation or native admission.
export function buildNativeServicePolicy({binding,epoch,brokerDir,scriptSha256,stableHook=false,metadataTarget,metadataModelControl=false,metadataSendControl=false,metadataStopControl=false,now=Date.now()}){
 if(typeof metadataStopControl!=='boolean'||metadataStopControl&&!metadataTarget)throw Error('invalid stop policy capability')
 if(typeof metadataSendControl!=='boolean'||metadataSendControl&&!metadataTarget)throw Error('invalid send policy capability')
 if(typeof metadataModelControl!=='boolean'||metadataModelControl&&!metadataTarget)throw Error('invalid model policy capability')
 if(metadataTarget!==undefined&&!metadataTargetValid(metadataTarget,binding))throw Error('invalid metadata policy target')
 if(typeof stableHook!=='boolean')throw Error('invalid receiver hook mode')
 if(!serviceStateBindingMatches({binding,dir:brokerDir,sessionId:binding?.sessionId,build:binding?.build,receiverCwd:binding?.receiverCwd})||!Number.isInteger(epoch?.pid)||epoch.pid<=1||typeof epoch.procStart!=='string'||!epoch.procStart||! /^[a-f0-9]{64}$/.test(scriptSha256)||!Number.isSafeInteger(now)||now<0)throw Error('invalid independent policy binding')
 const script=join(dirname(brokerDir),'releases',binding.build,'scripts/broker-stop-rescue.mjs'),settingsPath=join(binding.receiverCwd,'.claude','settings.json')
 const settings={hooks:{PreToolUse:[{matcher:'Bash|mcp__ccd_.*',hooks:[{type:'command',command:process.execPath,args:[script,brokerDir,'PreToolUse'],timeout:5}]}]}}
 const receiverHook=stableHook?buildReceiverHookArtifact(binding.receiverCwd):null
 const settingsBytes=receiverHook?.settingsBytes??JSON.stringify(settings,null,2)+'\n'
 const policy={schemaVersion:1,nativeMetadataTargetVersion:1,...metadataTarget?{metadataTarget}:{},...metadataModelControl?{metadataModelControl:true}:{},...metadataSendControl?{metadataSendControl:true}:{},...metadataStopControl?{metadataStopControl:true}:{},nativeEffectAdmissionVersion:1,nativeRequestBindingVersion:1,sessionId:binding.sessionId,pid:epoch.pid,procStart:epoch.procStart,build:binding.build,script,sha256:scriptSha256,settingsHash:createHash('sha256').update(settingsBytes).digest('hex'),settingsPath,serviceStateBinding:binding,maximumRescuesPerRequest:0,installedAt:now}
 if(receiverHook)policy.receiverHook={version:1,anchorPath:receiverHook.anchorPath,anchorSha256:receiverHook.anchorSha256,selectorPath:join(binding.receiverCwd,'.claude-driver-services','receiver-runtime.json')}
 return {settingsPath,settingsBytes,policyPath:join(brokerDir,'stop-rescue-policy.json'),policy,...receiverHook?{receiverHook}:{}}
}
