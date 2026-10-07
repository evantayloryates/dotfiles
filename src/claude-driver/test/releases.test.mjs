import {test,after,afterEach} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,chmodSync,rmSync,symlinkSync,existsSync,lstatSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync,execFileSync,spawn} from 'node:child_process'
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
const epoch=pid=>execFileSync('/bin/ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',LC_ALL:'C',TZ:'UTC'}}).trim()
const identity={sessionId:'local_00000000-0000-4000-8000-000000000001',pid:process.pid,procStart:epoch(process.pid),nonce:'owned-nonce'}
state.writeJsonAtomic(join(process.env.CLAUDE_DRIVER_PEER_SESSIONS_DIR,process.pid+'.json'),{pid:identity.pid,procStart:identity.procStart,hostSessionId:identity.sessionId,sessionId:identity.sessionId.slice(6),cwd:state.BROKER_DIR,entrypoint:'claude-desktop'})
afterEach(()=>{rmSync(releases.RUNTIME_POINTER,{force:true});rmSync(join(state.BROKER_DIR,'STOP'),{force:true});for(const name of ['requests','controls','results']){const dir=join(state.BROKER_DIR,name);rmSync(dir,{recursive:true,force:true});mkdirSync(dir,{recursive:true})}})
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
 const info={configured:true,exists:true,sessionId:identity.sessionId,live:{pid:identity.pid,procStart:identity.procStart,status:'idle',entrypoint:'claude-desktop'},residencyProtection:{uncertain:false,pendingCalls:0,jobs:[]}}
 const args={record,info,stop:{owner:releases.HANDOFF_OWNER,nonce:identity.nonce},nonce:identity.nonce,pid:identity.pid,unresolved:[]}
 broker.validateReleaseAdmission(args)
 for(const changes of [{pid:identity.pid+1},{info:{...info,live:{...info.live,procStart:undefined}}},{nonce:'wrong'},{stop:{owner:'not-owned',nonce:identity.nonce}},{unresolved:['pending']},
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
 for(const name of ['broker-wait','broker-check']){const entry=state.readJson(join(state.BROKER_DIR,name+'-entry.json'),null);assert.equal(entry.build,staged.build);assert.equal(entry.phase,'completed');assert.equal(entry.nativeBinding.brokerPid,identity.pid);assert.equal(entry.nativeBinding.brokerProcStart,identity.procStart);assert.equal(entry.nativeBinding.ancestorVerified,true)}
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

test('epoch proof refuses activation without an epoch and a caller outside the owned native ancestry',async()=>{
 assert.throws(()=>releases.commitRelease(staged.build,{...identity,procStart:undefined},()=> 'no'),e=>e.category==='broker_handoff_refused')
 const sibling=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'})
 try{
  const different={...identity,pid:sibling.pid,procStart:epoch(sibling.pid)}
  state.writeJsonAtomic(join(process.env.CLAUDE_DRIVER_PEER_SESSIONS_DIR,sibling.pid+'.json'),{pid:sibling.pid,procStart:different.procStart,hostSessionId:identity.sessionId,sessionId:identity.sessionId.slice(6),cwd:state.BROKER_DIR,entrypoint:'claude-desktop'})
  releases.commitRelease(staged.build,different,()=> 'pinned sibling')
  const script=new URL('../scripts/broker-wait.mjs',import.meta.url).pathname
  const r=spawnSync(process.execPath,[script,'--dir',state.BROKER_DIR,'--max-sec','0'],{encoding:'utf8',timeout:3000})
  assert.notEqual(r.status,0);assert.match(r.stderr,/integrity admission/)
 }finally{sibling.kill('SIGTERM');await new Promise(resolve=>sibling.once('exit',resolve))}
})
test('old matching entries cannot qualify a replaced PID, reused epoch or unbound pointer',()=>{
 const build=staged.build,bootstrapHash='b'.repeat(64),now=Date.now(),pointer={...identity,activatedAt:new Date(now-1000).toISOString()},runtime={build,bootstrapHash,generation:1}
 const live={pid:identity.pid,procStart:identity.procStart,entrypoint:'claude-desktop'},binding={brokerPid:identity.pid,brokerProcStart:identity.procStart,brokerSessionId:identity.sessionId,ancestorVerified:true}
 const entries=['broker-wait','broker-check'].map(kind=>({build,bootstrapHash,generation:1,phase:'completed',at:now,script:join(state.BROKER_DIR,'..','releases',build,'scripts',kind+'.mjs'),nativeBinding:binding}))
 const args={pointer,runtime,live,entries,sessionId:identity.sessionId,brokerDir:state.BROKER_DIR,now}
 assert.equal(releases.entryEpochEvidence(args).verified,true)
 for(const changes of [{pointer:{...pointer,procStart:undefined}},{live:{...live,pid:identity.pid+1}},{live:{...live,procStart:'reused-pid'}},{sessionId:'local_other'},{entries:entries.map(e=>({...e,nativeBinding:null}))},{entries:entries.map(e=>({...e,at:now-2000}))},{entries:entries.map(e=>({...e,generation:2}))},{entries:entries.map(e=>({...e,nativeBinding:{...binding,ancestorVerified:false}}))}])
  assert.equal(releases.entryEpochEvidence({...args,...changes}).verified,false)
})

test('entry qualification refuses a linked, malformed or oversized observation without reading it as authority',()=>{
 const file=join(root,'entry-proof.json'),target=join(root,'entry-target.json');writeFileSync(target,JSON.stringify({kind:'synthetic'}));symlinkSync(target,file)
 assert.equal(releases.loadEntryEvidence(file),null)
 rmSync(file);writeFileSync(file,'incomplete JSON');assert.equal(releases.loadEntryEvidence(file),null)
 writeFileSync(file,'a'.repeat(65537));assert.equal(releases.loadEntryEvidence(file),null)
 writeFileSync(file,JSON.stringify({kind:'synthetic'}));assert.deepEqual(releases.loadEntryEvidence(file),{kind:'synthetic'})
})
test('direct sealed paths complete the same validated native-epoch admission without recursive import',()=>{
 releases.commitRelease(staged.build,identity,()=> 'direct pinned')
 rmSync(join(state.BROKER_DIR,'STOP'),{force:true})
 for(const name of ['requests','controls','results'])mkdirSync(join(state.BROKER_DIR,name),{recursive:true})
 const id='direct-entry-fixture'
 state.writeJsonAtomic(join(state.BROKER_DIR,'requests',id+'.json'),{id,protocol:7,ops:[{op:'get_session',args:{session_id:'local_fixture'}}],expiresAt:Date.now()+30000})
 state.writeJsonAtomic(join(state.BROKER_DIR,'controls',id+'.json'),{id,state:'pending',dispatched:[]})
 const wait=spawnSync(process.execPath,[join(staged.root,'scripts/broker-wait.mjs'),'--dir',state.BROKER_DIR,'--max-sec','1'],{encoding:'utf8',timeout:3000})
 assert.equal(wait.status,0,wait.stderr);assert.match(wait.stdout,/^REQUEST /)
 const check=spawnSync(process.execPath,[join(staged.root,'scripts/broker-check.mjs'),id,'0','--dir',state.BROKER_DIR],{encoding:'utf8',timeout:3000})
 assert.equal(check.status,0,check.stderr);assert.equal(JSON.parse(check.stdout).dispatch,true)
 const pointer=state.readJson(releases.RUNTIME_POINTER),runtime=releases.releaseStatus(),entries=['broker-wait','broker-check'].map(kind=>releases.loadEntryEvidence(join(state.BROKER_DIR,kind+'-entry.json')))
 assert.equal(releases.entryEpochEvidence({pointer,runtime,entries,sessionId:identity.sessionId,brokerDir:state.BROKER_DIR,live:{pid:identity.pid,procStart:identity.procStart,entrypoint:'claude-desktop'}}).verified,true)
})
test('a direct script from a different candidate cannot claim the active release or its pending request',()=>{
 releases.commitRelease(staged.build,identity,()=> 'active package')
 const wrong=join(state.STATE_DIR,'releases','c'.repeat(64),'scripts');mkdirSync(wrong,{recursive:true})
 writeFileSync(join(wrong,'broker-wait.mjs'),readFileSync(new URL('../scripts/broker-wait.mjs',import.meta.url)))
 const id='wrong-candidate-fixture'
 state.writeJsonAtomic(join(state.BROKER_DIR,'requests',id+'.json'),{id,protocol:7,ops:[{op:'get_session',args:{}}],expiresAt:Date.now()+30000})
 state.writeJsonAtomic(join(state.BROKER_DIR,'controls',id+'.json'),{id,state:'pending',dispatched:[]})
 const result=spawnSync(process.execPath,[join(wrong,'broker-wait.mjs'),'--dir',state.BROKER_DIR,'--max-sec','1'],{encoding:'utf8',timeout:3000})
 assert.notEqual(result.status,0);assert.match(result.stderr,/integrity admission/)
 assert.equal(state.readJson(join(state.BROKER_DIR,'controls',id+'.json')).state,'pending')
})

test('a process-mismatched activation refuses ordinary requests before enqueue or template refresh',async()=>{
 releases.commitRelease(staged.build,identity,()=> 'preserved instructions')
 const pointer=state.readJson(releases.RUNTIME_POINTER);state.writeJsonAtomic(releases.RUNTIME_POINTER,{...pointer,procStart:'older native epoch'})
 const before=requireNames(join(state.BROKER_DIR,'requests'))
 await assert.rejects(broker.brokerRequest([{op:'get_session',args:{session_id:identity.sessionId}}],{timeoutMs:500}),e=>e.category==='broker_runtime_epoch_mismatch'&&e.detail.dispatched===false&&e.detail.retrySafe===true)
 assert.deepEqual(requireNames(join(state.BROKER_DIR,'requests')),before)
 assert.equal(readFileSync(join(state.BROKER_DIR,'CLAUDE.md'),'utf8'),'preserved instructions')
})

test('an explicitly malformed epoch field is corruption, not a legacy unbound fallback',()=>{
 releases.commitRelease(staged.build,identity,()=> 'epoch bound')
 const pointer=state.readJson(releases.RUNTIME_POINTER)
 for(const procStart of ['',null,123]){
  state.writeJsonAtomic(releases.RUNTIME_POINTER,{...pointer,procStart})
  assert.equal(releases.releaseStatus().integrity,false)
  assert.throws(()=>releases.activeRelease(),e=>e.category==='broker_runtime_invalid')
 }
 state.writeJsonAtomic(releases.RUNTIME_POINTER,pointer)
 const before=readFileSync(releases.RUNTIME_POINTER)
 for(const change of [{sessionId:'self'},{nonce:''},{pid:0}])assert.throws(()=>releases.commitRelease(staged.build,{...identity,...change},()=> 'not authorized'),e=>e.category==='broker_handoff_refused')
 assert.deepEqual(readFileSync(releases.RUNTIME_POINTER),before)
})

test('cached and direct sealed entry paths drain complete large UTF-8 stdout before exiting',()=>{
 releases.commitRelease(staged.build,identity,()=> 'large output')
 for(const [mode,script] of [['cached',new URL('../scripts/broker-wait.mjs',import.meta.url).pathname],['direct',join(staged.root,'scripts/broker-wait.mjs')]]){
  const id='large-output-'+mode,message='🐈'.repeat(65536)
  state.writeJsonAtomic(join(state.BROKER_DIR,'requests',id+'.json'),{id,protocol:7,ops:[{op:'send_message',args:{session_id:'local_fixture',message}}],expiresAt:Date.now()+30000})
  state.writeJsonAtomic(join(state.BROKER_DIR,'controls',id+'.json'),{id,state:'pending',dispatched:[]})
  const result=spawnSync(process.execPath,[script,'--dir',state.BROKER_DIR,'--max-sec','1'],{encoding:'utf8',timeout:3000,maxBuffer:1024*1024})
  assert.equal(result.status,0,result.stderr)
  const output=JSON.parse(result.stdout.slice('REQUEST '.length));assert.equal(output.id,id);assert.equal(output.ops[0].args.message,message)
 }
})
