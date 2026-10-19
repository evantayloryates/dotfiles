import {test} from 'node:test'
import assert from 'node:assert/strict'
import {selectReceiverRuntime,loadReceiverSelection} from '../src/lib/receiver-runtime-selection.mjs'
import {mkdtempSync,mkdirSync,writeFileSync,chmodSync,symlinkSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname,join} from 'node:path'
import {createHash} from 'node:crypto'
const receiverCwd='/owned/receiver',build='a'.repeat(64),serviceId='b'.repeat(32),sessionId='local_74c54e49-972e-4dac-adfa-d23e01316119'
function fixture(){
 const selector={schemaVersion:1,receiverCwd,serviceId,sessionId,build,bootstrapHash:'c'.repeat(64),anchorSha256:'d'.repeat(64),settingsSha256:'e'.repeat(64),generation:1,pid:20499,procStart:'Sat Oct 17 15:48:23 2026'}
 const binding={version:1,id:serviceId,sessionId,receiverCwd,build}
 const pointer={schemaVersion:1,serviceStateBinding:binding,...Object.fromEntries(['build','bootstrapHash','generation','pid','procStart','sessionId'].map(k=>[k,selector[k]]))}
 const policy={serviceStateBinding:binding,build,pid:selector.pid,procStart:selector.procStart,sessionId,settingsHash:selector.settingsSha256,settingsPath:receiverCwd+'/.claude/settings.json',maximumRescuesPerRequest:0,nativeEffectAdmissionVersion:1,nativeRequestBindingVersion:1,script:receiverCwd+'/.claude-driver-services/'+serviceId+'/releases/'+build+'/scripts/broker-stop-rescue.mjs',sha256:'f'.repeat(64)}
 return {selector,receiverCwd,pointer,policy,anchorSha256:selector.anchorSha256,settingsSha256:selector.settingsSha256}
}
test('selects only derived handler and bootstrap, without effects',()=>{
 const f=fixture(),before=JSON.stringify(f),selected=selectReceiverRuntime(f)
 assert.equal(selected.handler,f.policy.script)
 assert.equal(selected.bootstrap,selected.stateDir+'/entry/'+f.selector.bootstrapHash+'.mjs')
 assert.equal(JSON.stringify(f),before)
})
test('rejects cross-generation, cross-epoch, settings and executable substitutions',()=>{
 const mutations=[f=>f.selector.generation++,f=>f.pointer.pid++,f=>f.selector.bootstrapHash='0'.repeat(64),f=>f.policy.serviceStateBinding={...f.policy.serviceStateBinding,id:'0'.repeat(32)},f=>f.settingsSha256='0'.repeat(64),f=>f.anchorSha256='0'.repeat(64),f=>f.policy.script='/tmp/handler.mjs',f=>f.policy.maximumRescuesPerRequest=1,f=>f.selector.command='evil',f=>f.selector.receiverCwd+='/../receiver',f=>f.selector.serviceId='../elsewhere',f=>f.policy.nativeRequestBindingVersion=0]
 for(const mutate of mutations){const f=fixture();mutate(f);assert.throws(()=>selectReceiverRuntime(f),/selection refused/)}
})
test('owned file loader rejects symlinks, oversized evidence and changed sealed bytes',()=>{
 const root=mkdtempSync(join(tmpdir(),'receiver-selection-'))
 const hash=s=>createHash('sha256').update(s).digest('hex')
 const put=(p,s,sealed=false)=>{mkdirSync(dirname(p),{recursive:true,mode:0o700});writeFileSync(p,s,{mode:sealed?0o400:0o600})}
 try{
  const f=fixture(),s=f.selector,cwd=root,anchor='// anchor fixture\n',bootstrap='// bootstrap fixture\n',handler='// handler fixture\n',settings='{}\n'
  s.receiverCwd=cwd;s.anchorSha256=hash(anchor);s.bootstrapHash=hash(bootstrap);s.settingsSha256=hash(settings)
  f.pointer.bootstrapHash=s.bootstrapHash;f.pointer.serviceStateBinding.receiverCwd=cwd
  f.policy.settingsPath=join(cwd,'.claude','settings.json');f.policy.settingsHash=s.settingsSha256
  const state=join(cwd,'.claude-driver-services',serviceId),broker=join(state,'broker'),entry=join(cwd,'.claude-driver-services','receiver-stop-entry.mjs')
  f.policy.script=join(state,'releases',build,'scripts','broker-stop-rescue.mjs');f.policy.sha256=hash(handler)
  put(join(broker,'runtime.json'),JSON.stringify(f.pointer));put(join(broker,'stop-rescue-policy.json'),JSON.stringify(f.policy))
  put(join(cwd,'.claude-driver-services','receiver-runtime.json'),JSON.stringify(s));put(entry,anchor,true)
  put(f.policy.settingsPath,settings);put(f.policy.script,handler,true);put(join(state,'entry',s.bootstrapHash+'.mjs'),bootstrap,true)
  assert.equal(loadReceiverSelection(cwd).executionQualified,false)
  chmodSync(f.policy.script,0o600);writeFileSync(f.policy.script,'changed');chmodSync(f.policy.script,0o400)
  assert.throws(()=>loadReceiverSelection(cwd),/sealed entry refused/)
  chmodSync(f.policy.script,0o600);writeFileSync(f.policy.script,handler);chmodSync(f.policy.script,0o400)
  writeFileSync(f.policy.settingsPath,'x'.repeat(65537));assert.throws(()=>loadReceiverSelection(cwd),/file refused/)
  writeFileSync(f.policy.settingsPath,settings)
  rmSync(entry);symlinkSync(f.policy.script,entry);assert.throws(()=>loadReceiverSelection(cwd))
 }finally{rmSync(root,{recursive:true,force:true})}
})
