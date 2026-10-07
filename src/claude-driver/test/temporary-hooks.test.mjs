import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {installTemporaryHookProbe,prepareTemporaryHookPeer,restoreTemporaryHookProbe,bytesHash} from '../lib/temporary-hooks.mjs'
import {eligibleProbeStop} from '../scripts/mechanical-probe-stop.mjs'
const epoch={sessionId:'local_00000000-0000-4000-8000-000000000001',pid:1234,procStart:'synthetic start'},token='a'.repeat(32)
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'driver-hooks-'));mkdirSync(join(dir,'.claude'))
 const settings=Buffer.from('{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"original"}]}],"PreToolUse":[{"matcher":"Bash","hooks":[]}]}}\n'),policy=Buffer.from(JSON.stringify({schemaVersion:1,...epoch,settingsHash:bytesHash(settings),nativeEffectAdmissionVersion:1}))
 writeFileSync(join(dir,'.claude','settings.json'),settings);writeFileSync(join(dir,'stop-rescue-policy.json'),policy);writeFileSync(join(dir,'observer.mjs'),'synthetic')
 return {dir,settings,policy,args:{token,epoch,observerScript:join(dir,'observer.mjs'),receiptPath:join(dir,'receipt.json'),fixtureId:'local_00000000-0000-4000-8000-000000000002',expiresAt:Date.now()+60000}}
}
test('temporary diagnostic preserves core hooks and restores exact bytes after peer binding',()=>{
 const f=fixture();try{
  installTemporaryHookProbe(f.dir,f.args);const s=JSON.parse(readFileSync(join(f.dir,'.claude','settings.json')))
  assert.deepEqual(s.hooks.PreToolUse,JSON.parse(f.settings).hooks.PreToolUse);assert.deepEqual(s.hooks.Stop[0],JSON.parse(f.settings).hooks.Stop[0]);assert.equal(s.hooks.Stop[1].hooks[1].tool,'export_transcript')
  prepareTemporaryHookPeer(f.dir,token,{pid:epoch.pid,procStart:epoch.procStart,msgId:'11111111-1111-4111-8111-111111111111'})
  assert.throws(()=>prepareTemporaryHookPeer(f.dir,token,{pid:epoch.pid,procStart:epoch.procStart,msgId:'11111111-1111-4111-8111-111111111111'}),/binding/)
  assert.equal(restoreTemporaryHookProbe(f.dir,token).restored,true);assert.deepEqual(readFileSync(join(f.dir,'.claude','settings.json')),f.settings);assert.deepEqual(readFileSync(join(f.dir,'stop-rescue-policy.json')),f.policy)
 }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test('foreign edits, owner tokens and symlinks refuse without overwriting another writer',()=>{
 const f=fixture();try{
  installTemporaryHookProbe(f.dir,f.args);assert.throws(()=>restoreTemporaryHookProbe(f.dir,'b'.repeat(32)),/owner/)
  const other=Buffer.from('{"foreign":true}');writeFileSync(join(f.dir,'.claude','settings.json'),other)
  assert.throws(()=>restoreTemporaryHookProbe(f.dir,token),/another/);assert.deepEqual(readFileSync(join(f.dir,'.claude','settings.json')),other)
  rmSync(join(f.dir,'.claude','settings.json'));symlinkSync(join(f.dir,'observer.mjs'),join(f.dir,'.claude','settings.json'));assert.throws(()=>restoreTemporaryHookProbe(f.dir,token))
 }finally{rmSync(f.dir,{recursive:true,force:true})}
})
test('probe Stop witness requires exact current peer turn, native identity, ancestry and expiry',()=>{
 const d={schemaVersion:1,token,epoch,brokerDir:'/synthetic',expiresAt:2000,peer:{msgId:'synthetic'}},input={hook_event_name:'Stop',stop_hook_active:false,session_id:epoch.sessionId.slice(6),cwd:'/synthetic'},peer={...epoch,hostSessionId:epoch.sessionId,sessionId:epoch.sessionId.slice(6),entrypoint:'claude-desktop',version:'2.1.289',cwd:'/synthetic'},latest={origin:{kind:'peer',msg_id:'synthetic'}}
 assert.equal(eligibleProbeStop(input,d,peer,latest,{ancestor:true,now:1000}),true)
 for(const [i,e,p,l,opts] of [[{...input,stop_hook_active:true},d,peer,latest,{ancestor:true,now:1000}],[input,d,{...peer,procStart:'other'},latest,{ancestor:true,now:1000}],[input,d,peer,{origin:{kind:'peer',msg_id:'other'}},{ancestor:true,now:1000}],[input,d,peer,latest,{ancestor:false,now:1000}],[input,d,peer,latest,{ancestor:true,now:2000}]])assert.equal(eligibleProbeStop(i,e,p,l,opts),false)
})
