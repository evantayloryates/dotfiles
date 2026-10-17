import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {buildNativeServicePolicy} from '../lib/native-service-policy.mjs'
import {nativePolicySettingsPath} from '../lib/runtime-entry.mjs'
const binding={version:1,id:'a'.repeat(32),receiverCwd:'/owned/receiver',sessionId:'local_11111111-1111-4111-8111-111111111111',build:'b'.repeat(64)},brokerDir=binding.receiverCwd+'/.claude-driver-services/'+binding.id+'/broker',epoch={pid:42,procStart:'exact epoch'}
const fixture=()=>buildNativeServicePolicy({binding,epoch,brokerDir,scriptSha256:'c'.repeat(64),now:1000})
test('independent policy prepares only receiver-cwd PreToolUse settings, with no rescue or permission override',()=>{
 const x=fixture(),settings=JSON.parse(x.settingsBytes),pointer={serviceStateBinding:binding,sessionId:binding.sessionId,build:binding.build,...epoch}
 assert.deepEqual(Object.keys(settings.hooks),['PreToolUse']);assert.equal(x.settingsPath,'/owned/receiver/.claude/settings.json');assert.equal(x.policy.maximumRescuesPerRequest,0)
 assert.equal(x.policy.settingsHash,createHash('sha256').update(x.settingsBytes).digest('hex'));assert.equal(settings.hooks.PreToolUse[0].hooks[0].args[1],brokerDir);assert.equal(x.policyPath,brokerDir+'/stop-rescue-policy.json')
 assert.equal(nativePolicySettingsPath({pointer,policy:x.policy,dir:brokerDir}),x.settingsPath)
 for(const patch of [{settingsPath:brokerDir+'/.claude/settings.json'},{settingsPath:'/other/settings.json'},{build:'d'.repeat(64)},{pid:43},{procStart:'foreign'},{serviceStateBinding:{...binding,id:'d'.repeat(32)}}])assert.equal(nativePolicySettingsPath({pointer,policy:{...x.policy,...patch},dir:brokerDir}),null)
 assert.equal(nativePolicySettingsPath({pointer:{},policy:{},dir:'/legacy'}),'/legacy/.claude/settings.json')
 assert.equal(nativePolicySettingsPath({pointer:{},policy:x.policy,dir:'/legacy'}),null)
})
test('policy preparation refuses foreign namespace, source and epoch',()=>{
 for(const patch of [{brokerDir:'/legacy'},{binding:{...binding,version:2}},{epoch:{pid:0,procStart:'epoch'}},{epoch:{pid:42,procStart:''}},{scriptSha256:'unknown'},{now:NaN}])assert.throws(()=>buildNativeServicePolicy({binding,epoch,brokerDir,scriptSha256:'c'.repeat(64),now:1000,...patch}))
})
