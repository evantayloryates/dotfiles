import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,writeFileSync,rmSync,chmodSync,readdirSync,lstatSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const state=mkdtempSync(join(tmpdir(),'claude-rescue-policy-'));process.env.CLAUDE_DRIVER_STATE_DIR=state
const {installStopRescue,stopRescuePolicy,armStopRescue,armStopHandoff,disarmStopRescue}=await import('../lib/stop-rescue.mjs')
const dir=join(state,'broker'),identity={sessionId:'local_00000000-0000-4000-8000-000000000001',pid:123,procStart:'epoch'},request={id:'rpolicy',expiresAt:Date.now()+60000,nativeObservation:{brokerSessionId:identity.sessionId}},wake={pid:123,procStart:'epoch',msgId:'00000000-0000-4000-8000-000000000002'}
test.after(()=>{function unseal(path){const s=lstatSync(path);if(s.isDirectory()){chmodSync(path,0o700);for(const n of readdirSync(path))unseal(join(path,n))}else chmodSync(path,0o600)}unseal(state);rmSync(state,{recursive:true,force:true})})
test('opt-in immutable hook policy arms only exact UUID/request epoch and preserves settings',async()=>{
 assert.equal(stopRescuePolicy(),null);const policy=await installStopRescue(identity);assert.equal(policy.maximumRescuesPerRequest,1);assert.equal(policy.nativeEffectAdmissionVersion,1);assert.equal((await installStopRescue(identity)).reused,true)
 const config=join(dir,'.claude','settings.json'),original=readFileSync(config,'utf8');assert.deepEqual(Object.keys(JSON.parse(original)),['hooks'])
 assert.throws(()=>armStopRescue(policy,request,{...wake,procStart:'replacement'}),e=>e.category==='broker_stop_rescue_refused')
  armStopRescue(policy,request,wake);const arm=JSON.parse(readFileSync(join(dir,'stop-rescue-arm.json'),'utf8'));assert.equal(arm.msgId,wake.msgId);disarmStopRescue('other');assert.equal(JSON.parse(readFileSync(join(dir,'stop-rescue-arm.json'),'utf8')).requestId,'rpolicy');disarmStopRescue('rpolicy')
  assert.throws(()=>armStopHandoff(policy,{nonce:'owned',expiresAt:Date.now()+30000},wake),e=>e.detail.dispatched===false)
  writeFileSync(join(dir,'STOP'),JSON.stringify({owner:'claude-driver-qualified-runtime-handoff',nonce:'owned',...identity}));armStopHandoff(policy,{nonce:'owned',expiresAt:Date.now()+30000},wake);assert.equal(JSON.parse(readFileSync(join(dir,'stop-rescue-arm.json'),'utf8')).mode,'settle-handoff');disarmStopRescue('rhandoff-owned');rmSync(join(dir,'STOP'))
  const upgraded=await installStopRescue({...identity,upgrade:true});assert.equal(upgraded.build,policy.build)
 for(const quietWaitMs of [-1,1,60001,Infinity,'60000'])await assert.rejects(()=>installStopRescue({...identity,upgrade:true,quietWaitMs}),e=>e.category==='broker_stop_rescue_refused')
 const quiet=await installStopRescue({...identity,upgrade:true,quietWaitMs:60000});assert.equal(quiet.quietWait.maxMs,60000)
 const enrolled=JSON.parse(readFileSync(config,'utf8'));assert.equal(enrolled.hooks.Stop[0].hooks[0].timeout,65);assert.equal(enrolled.hooks.PreToolUse[0].hooks[0].timeout,5)
 assert.equal((await installStopRescue({...identity,upgrade:true})).quietWait.maxMs,60000)
 const disabled=await installStopRescue({...identity,upgrade:true,quietWaitMs:0});assert.equal(disabled.quietWait,undefined);assert.equal(JSON.parse(readFileSync(config,'utf8')).hooks.Stop[0].hooks[0].timeout,5)
 writeFileSync(config,original+' ');assert.throws(()=>stopRescuePolicy(),e=>e.category==='broker_stop_rescue_refused');assert.throws(()=>armStopRescue(policy,request,wake),e=>e.detail.dispatched===false&&e.detail.retrySafe===true);assert.equal(readFileSync(config,'utf8'),original+' ')
})
