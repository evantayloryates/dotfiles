import {test,after,afterEach} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,chmodSync,rmSync,symlinkSync,existsSync,lstatSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
const root=mkdtempSync(join(tmpdir(),'claude-release-'))
process.env.CLAUDE_DRIVER_STATE_DIR=join(root,'state')
process.env.CLAUDE_DRIVER_APP_SUPPORT=join(root,'app')
process.env.CLAUDE_DRIVER_PROJECTS_DIR=join(root,'projects')
process.env.CLAUDE_DRIVER_PEER_SESSIONS_DIR=join(root,'peers')
mkdirSync(process.env.CLAUDE_DRIVER_PEER_SESSIONS_DIR,{recursive:true})
const state=await import('../lib/state.mjs')
const releases=await import('../lib/releases.mjs')
const broker=await import('../lib/broker.mjs')
const {runtimeFingerprint}=await import('../lib/build.mjs')
const staged=await releases.stageRelease()
const identity={sessionId:'local_00000000-0000-4000-8000-000000000001',pid:123,nonce:'owned-nonce'}
afterEach(()=>rmSync(releases.RUNTIME_POINTER,{force:true}))
after(()=>{function unseal(p){const s=lstatSync(p);if(s.isDirectory()){chmodSync(p,0o700);for(const n of requireNames(p))unseal(join(p,n))}else if(!s.isSymbolicLink())chmodSync(p,0o600)}unseal(root);rmSync(root,{recursive:true,force:true})})
const {readdirSync:requireNames}=await import('node:fs')
test('staging seals a verified reusable snapshot without activating it',async()=>{
 assert.equal(staged.build,runtimeFingerprint());assert.equal(existsSync(releases.RUNTIME_POINTER),false)
 const reused=await releases.stageRelease();assert.equal(reused.reused,true)
 assert.equal(releases.validateRelease(staged.build).protocol,7)
 assert.equal(lstatSync(join(staged.root,'scripts/broker-wait.mjs')).mode&0o222,0)
})
test('an active pin renders only sealed paths and retains its protocol',()=>{
 const activation=releases.commitRelease(staged.build,identity,()=>{broker.prepareBrokerDir();return readFileSync(join(state.BROKER_DIR,'CLAUDE.md'),'utf8')})
 assert.equal(activation.nativePathsVerified,false);assert.equal(broker.protocolVersion(),'7')
 const text=readFileSync(join(state.BROKER_DIR,'CLAUDE.md'),'utf8')
 assert.ok(text.includes(join(staged.root,'scripts/broker-wait.mjs')))
 assert.equal(text.includes('/dotfiles/src/claude-driver/scripts/'),false)
 assert.equal(releases.releaseStatus().build,staged.build)
})
test('malformed, traversal and dangling pointers fail closed instead of falling back',()=>{
 for(const value of ['broken',JSON.stringify({schemaVersion:1,build:'../source',generation:1})]){
  writeFileSync(releases.RUNTIME_POINTER,value)
  assert.throws(()=>broker.protocolVersion(),e=>e.category==='broker_runtime_invalid')
  assert.throws(()=>broker.prepareBrokerDir(),e=>e.category==='broker_runtime_invalid')
  assert.equal(releases.releaseStatus().integrity,false)
 }
 rmSync(releases.RUNTIME_POINTER);symlinkSync(join(root,'missing'),releases.RUNTIME_POINTER)
 assert.throws(()=>releases.activeRelease(),e=>e.category==='broker_runtime_invalid')
})
test('changed, writable, extra or symlinked release files invalidate admission',()=>{
 const file=join(staged.root,'scripts/broker-check.mjs'),original=readFileSync(file)
 try{
  chmodSync(file,0o644);assert.throws(()=>releases.validateRelease(staged.build))
  writeFileSync(file,'changed');chmodSync(file,0o444);assert.throws(()=>releases.validateRelease(staged.build))
  chmodSync(file,0o644);writeFileSync(file,original);chmodSync(file,0o444)
  chmodSync(staged.root,0o755);writeFileSync(join(staged.root,'extra'),'extra');chmodSync(join(staged.root,'extra'),0o444);chmodSync(staged.root,0o555)
  assert.throws(()=>releases.validateRelease(staged.build))
  chmodSync(staged.root,0o755);rmSync(join(staged.root,'extra'));chmodSync(staged.root,0o555)
  chmodSync(join(staged.root,'scripts'),0o755);rmSync(file);symlinkSync(join(root,'missing'),file);chmodSync(join(staged.root,'scripts'),0o555)
  assert.throws(()=>releases.validateRelease(staged.build))
 }finally{
  chmodSync(join(staged.root,'scripts'),0o755);rmSync(file,{force:true});writeFileSync(file,original,{mode:0o444});chmodSync(join(staged.root,'scripts'),0o555)
 }
 assert.equal(releases.validateRelease(staged.build).build,staged.build)
})
test('a failed instruction write restores the previous pointer and instructions',()=>{
 releases.commitRelease(staged.build,identity,()=> 'first qualified instructions')
 const before=readFileSync(releases.RUNTIME_POINTER,'utf8')
 assert.throws(()=>releases.commitRelease(staged.build,identity,()=>{throw new Error('simulated write failure')}),/simulated/)
 assert.equal(readFileSync(releases.RUNTIME_POINTER,'utf8'),before)
 assert.equal(readFileSync(join(state.BROKER_DIR,'CLAUDE.md'),'utf8'),'first qualified instructions')
})
test('native lifecycle admission refuses wrong PID, busy state, jobs, pending effects and STOP owner',()=>{
 const record={sessionId:identity.sessionId,cwd:state.BROKER_DIR,title:'claude-driver-broker',permissionMode:'bypassPermissions',isArchived:false}
 const info={configured:true,exists:true,sessionId:identity.sessionId,live:{pid:123,status:'idle',entrypoint:'claude-desktop'},residencyProtection:{uncertain:false,pendingCalls:0,jobs:[]}}
 const args={record,info,stop:{owner:releases.HANDOFF_OWNER,nonce:identity.nonce},nonce:identity.nonce,pid:123,unresolved:[]}
 broker.validateReleaseAdmission(args)
 for(const changes of [{pid:124},{nonce:'wrong'},{stop:{owner:'not-owned',nonce:identity.nonce}},{unresolved:['pending']},
  {info:{...info,live:{...info.live,status:'busy'}}},{info:{...info,residencyProtection:{...info.residencyProtection,jobs:[{id:'12345678'}]}}},
  {info:{...info,residencyProtection:{...info.residencyProtection,uncertain:true}}},{record:{...record,permissionMode:'acceptEdits'}}])
  assert.throws(()=>broker.validateReleaseAdmission({...args,...changes}))
})
test('cached workspace commands execute pinned dependencies even when inactive local code is broken',()=>{
 releases.commitRelease(staged.build,identity,()=> 'pinned')
 const shim=join(root,'cached','scripts'),libs=join(root,'cached','lib');mkdirSync(shim,{recursive:true});mkdirSync(libs)
 for(const name of ['broker-wait','broker-check'])writeFileSync(join(shim,name+'.mjs'),readFileSync(new URL('../scripts/'+name+'.mjs',import.meta.url)))
 writeFileSync(join(libs,'requests.mjs'),"throw Error('inactive dependency executed')")
 for(const name of ['requests','controls','results'])mkdirSync(join(state.BROKER_DIR,name),{recursive:true})
 state.writeJsonAtomic(join(state.BROKER_DIR,'requests','entry-fixture.json'),{id:'entry-fixture',protocol:7,ops:[{op:'get_session',args:{session_id:'local_fixture'}}],expiresAt:Date.now()+30000})
 state.writeJsonAtomic(join(state.BROKER_DIR,'controls','entry-fixture.json'),{id:'entry-fixture',state:'pending',dispatched:[]})
 const wait=spawnSync(process.execPath,[join(shim,'broker-wait.mjs'),'--dir',state.BROKER_DIR,'--max-sec','1'],{encoding:'utf8',timeout:3000})
 assert.equal(wait.status,0,wait.stderr);assert.match(wait.stdout,/^REQUEST /)
 const check=spawnSync(process.execPath,[join(shim,'broker-check.mjs'),'entry-fixture','0','--dir',state.BROKER_DIR],{encoding:'utf8',timeout:3000})
 assert.equal(check.status,0,check.stderr);assert.equal(JSON.parse(check.stdout).dispatch,true)
 for(const name of ['broker-wait','broker-check']){const entry=state.readJson(join(state.BROKER_DIR,name+'-entry.json'),null);assert.equal(entry.build,staged.build);assert.equal(entry.phase,'completed')}
})
test('damaged sealed bootstrap refuses a cached waiter before request pickup',()=>{
 releases.commitRelease(staged.build,identity,()=> 'pinned')
 const pointer=state.readJson(releases.RUNTIME_POINTER,null),entry=join(state.STATE_DIR,'entry',pointer.bootstrapHash+'.mjs'),body=readFileSync(entry)
 try{
  chmodSync(entry,0o644);writeFileSync(entry,'throw Error("damaged")');chmodSync(entry,0o444)
  const script=new URL('../scripts/broker-wait.mjs',import.meta.url).pathname
  const r=spawnSync(process.execPath,[script,'--dir',state.BROKER_DIR,'--max-sec','0'],{encoding:'utf8',timeout:3000})
  assert.notEqual(r.status,0);assert.equal(releases.releaseStatus().integrity,false)
 }finally{chmodSync(entry,0o644);writeFileSync(entry,body);chmodSync(entry,0o444)}
})
test('requests cannot clear an owned deployment STOP or enqueue work',async()=>{
 const account=join(process.env.CLAUDE_DRIVER_APP_SUPPORT,'claude-code-sessions','a','o');mkdirSync(account,{recursive:true})
 writeFileSync(join(account,identity.sessionId+'.json'),JSON.stringify({sessionId:identity.sessionId,cwd:state.BROKER_DIR,title:'claude-driver-broker',permissionMode:'bypassPermissions'}))
 state.writeJsonAtomic(join(state.BROKER_DIR,'broker.json'),{sessionId:identity.sessionId})
 state.writeJsonAtomic(join(state.BROKER_DIR,'STOP'),{owner:releases.HANDOFF_OWNER,nonce:identity.nonce})
 const before=requireNames(join(state.BROKER_DIR,'requests'))
 await assert.rejects(broker.brokerRequest([{op:'get_session',args:{}}]),e=>e.category==='broker_handoff_refused')
 assert.equal(state.readJson(join(state.BROKER_DIR,'STOP'),null).nonce,identity.nonce)
 assert.deepEqual(requireNames(join(state.BROKER_DIR,'requests')),before)
 await assert.rejects(broker.reviveBroker({warmOnly:true}),e=>e.category==='broker_handoff_refused')
})
