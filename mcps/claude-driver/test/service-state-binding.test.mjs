import test from 'node:test'
import assert from 'node:assert/strict'
import {serviceStateBindingMatches} from '../src/lib/runtime-entry.mjs'
const receiverCwd='/owned/scratch',sessionId='local_11111111-1111-4111-8111-111111111111',build='a'.repeat(64),id='b'.repeat(32)
const fixture=()=>({binding:{version:1,id,receiverCwd,sessionId,build},dir:receiverCwd+'/.claude-driver-services/'+id+'/broker',sessionId,build,receiverCwd})
test('independent service namespace binds exact receiver, generation and source',()=>{
 assert.equal(serviceStateBindingMatches(fixture()),true)
 for(const change of [x=>x.binding.version=2,x=>x.binding.id='foreign',x=>x.binding.extra=true,x=>x.binding.build='c'.repeat(64),x=>x.binding.sessionId='local_22222222-2222-4222-8222-222222222222',x=>x.receiverCwd='/other',x=>x.dir='/owned/broker',x=>x.dir=x.dir+'/../broker',x=>x.binding.receiverCwd='/owned/../scratch',x=>x.binding.receiverCwd='relative',x=>x.binding.receiverCwd='/']){const x=fixture();change(x);assert.equal(serviceStateBindingMatches(x),false)}
})

test('sealed helper admits only the bound private state under the same native ancestry',async()=>{
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path'),{spawnSync,execFileSync}=await import('node:child_process')
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'service-state-binding-')),cwd=path.join(root,'receiver'),state=path.join(cwd,'.claude-driver-services',id),peers=path.join(root,'peers')
 fs.mkdirSync(state,{recursive:true});fs.mkdirSync(peers)
 const epoch=execFileSync('/bin/ps',['-p',String(process.pid),'-o','lstart='],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',LC_ALL:'C',TZ:'UTC'}}).trim()
 fs.writeFileSync(path.join(peers,process.pid+'.json'),JSON.stringify({pid:process.pid,procStart:epoch,hostSessionId:sessionId,sessionId:sessionId.slice(6),entrypoint:'claude-desktop',cwd}))
 const env={...process.env,CLAUDE_DRIVER_STATE_DIR:state,CLAUDE_DRIVER_PEER_SESSIONS_DIR:peers}
 const source=`import{stageRelease,commitRelease}from ${JSON.stringify(new URL('../src/lib/releases.mjs',import.meta.url).href)};const r=await stageRelease();commitRelease(r.build,{sessionId:${JSON.stringify(sessionId)},pid:${process.pid},procStart:${JSON.stringify(epoch)},nonce:'synthetic-owned-state',serviceStateBinding:{version:1,id:${JSON.stringify(id)},receiverCwd:${JSON.stringify(cwd)},sessionId:${JSON.stringify(sessionId)},build:r.build}},()=> 'synthetic fixture');console.log(JSON.stringify(r))`
 function unseal(p){const st=fs.lstatSync(p);if(st.isDirectory()){fs.chmodSync(p,0o700);for(const n of fs.readdirSync(p))unseal(path.join(p,n))}else if(!st.isSymbolicLink())fs.chmodSync(p,0o600)}
 try{
  const staged=spawnSync(process.execPath,['--input-type=module','-e',source],{env,encoding:'utf8',timeout:20000});assert.equal(staged.status,0,staged.stderr)
  const r=JSON.parse(staged.stdout),broker=path.join(state,'broker'),script=path.join(r.root,'scripts/broker-check.mjs'),args=[script,'missing-synthetic-request','0','--dir',broker]
  const initialPointer=JSON.parse(fs.readFileSync(path.join(broker,'runtime.json'))),bootstrap=path.join(state,'entry',initialPointer.bootstrapHash+'.mjs'),{pathToFileURL}=await import('node:url')
  const hookInput={hook_event_name:'PreToolUse',session_id:sessionId.slice(6),cwd}
  const hook=(expectedPointer=initialPointer,input=hookInput)=>spawnSync(process.execPath,['--input-type=module','-e',`import {admitPinnedReceiverHook} from ${JSON.stringify(pathToFileURL(bootstrap).href)};console.log(JSON.stringify(admitPinnedReceiverHook({dir:${JSON.stringify(broker)},expectedPointer:${JSON.stringify(expectedPointer)},input:${JSON.stringify(input)}})))`],{env,encoding:'utf8',timeout:10000})
  const hookOk=hook();assert.equal(hookOk.status,0,hookOk.stderr);assert.equal(JSON.parse(hookOk.stdout).nativeBinding.ancestorVerified,true)
  assert.equal(JSON.parse(hookOk.stdout).script,path.join(r.root,'scripts/broker-stop-rescue.mjs'))
  assert.equal(fs.existsSync(path.join(broker,'broker-check-entry-selected.json')),false)
  const staleHook=hook({...initialPointer,generation:initialPointer.generation+1});assert.notEqual(staleHook.status,0);assert.match(staleHook.stderr,/receiver-pointer-mismatch/)
  const foreignHook=hook(initialPointer,{...hookInput,cwd:root});assert.notEqual(foreignHook.status,0);assert.match(foreignHook.stderr,/receiver-hook-identity/)
  const {buildReceiverHookArtifact}=await import('../src/lib/receiver-hook-artifact.mjs'),{buildNativeServicePolicy}=await import('../src/lib/native-service-policy.mjs'),{createHash}=await import('node:crypto')
  const artifact=buildReceiverHookArtifact(cwd),handler=path.join(r.root,'scripts/broker-stop-rescue.mjs'),prepared=buildNativeServicePolicy({binding:initialPointer.serviceStateBinding,epoch:{pid:process.pid,procStart:epoch},brokerDir:broker,scriptSha256:createHash('sha256').update(fs.readFileSync(handler)).digest('hex')})
  fs.writeFileSync(artifact.anchorPath,artifact.source,{mode:0o400});fs.mkdirSync(path.dirname(artifact.settingsPath));fs.writeFileSync(artifact.settingsPath,artifact.settingsBytes,{mode:0o600})
  fs.writeFileSync(prepared.policyPath,JSON.stringify({...prepared.policy,settingsHash:artifact.settingsSha256}),{mode:0o600})
  const selector={schemaVersion:1,receiverCwd:cwd,serviceId:id,sessionId,build:r.build,bootstrapHash:initialPointer.bootstrapHash,anchorSha256:artifact.anchorSha256,settingsSha256:artifact.settingsSha256,generation:initialPointer.generation,pid:process.pid,procStart:epoch}
  fs.writeFileSync(path.join(cwd,'.claude-driver-services','receiver-runtime.json'),JSON.stringify(selector),{mode:0o600})
  const anchorRun=input=>spawnSync(process.execPath,[artifact.anchorPath],{env,input:JSON.stringify(input),encoding:'utf8',timeout:10000})
  const deniedHandler=anchorRun({...hookInput,tool_name:'Bash',tool_input:{command:'echo unqualified'}})
  assert.equal(deniedHandler.status,0,deniedHandler.stderr)
  const denial=JSON.parse(deniedHandler.stdout).hookSpecificOutput
  assert.equal(denial.permissionDecision,'deny');assert.match(denial.permissionDecisionReason,/broker may execute only/)
  const wrongSession=anchorRun({...hookInput,session_id:'foreign',tool_name:'Bash',tool_input:{command:'echo unqualified'}})
  assert.match(JSON.parse(wrongSession.stdout).hookSpecificOutput.permissionDecisionReason,/Receiver runtime entry failed/)
  const admitted=spawnSync(process.execPath,args,{env,encoding:'utf8',timeout:10000});assert.equal(admitted.status,0,admitted.stderr);assert.equal(JSON.parse(admitted.stdout).dispatch,false)
  const entry=JSON.parse(fs.readFileSync(path.join(broker,'broker-check-entry.json')));assert.equal(entry.nativeBinding.ancestorVerified,true);assert.equal(entry.nativeBinding.brokerPid,process.pid)
  const manifestFile=path.join(r.root,'release.json'),manifestBytes=fs.readFileSync(manifestFile),manifest=JSON.parse(manifestBytes);delete manifest.nativeServiceStateBindingVersion;fs.chmodSync(manifestFile,0o600);fs.writeFileSync(manifestFile,JSON.stringify(manifest));fs.chmodSync(manifestFile,0o444)
  const unsupported=spawnSync(process.execPath,args,{env,encoding:'utf8',timeout:10000});assert.notEqual(unsupported.status,0);assert.match(unsupported.stderr,/native-service-state-capability-missing/)
  fs.chmodSync(manifestFile,0o600);fs.writeFileSync(manifestFile,manifestBytes);fs.chmodSync(manifestFile,0o444)
  const pointerFile=path.join(broker,'runtime.json'),pointer=JSON.parse(fs.readFileSync(pointerFile));fs.writeFileSync(pointerFile,JSON.stringify({...pointer,serviceStateBinding:{...pointer.serviceStateBinding,receiverCwd:root}}))
  const refused=spawnSync(process.execPath,args,{env,encoding:'utf8',timeout:10000});assert.notEqual(refused.status,0);assert.match(refused.stderr,/native-service-state-binding-mismatch/)
  fs.writeFileSync(pointerFile,JSON.stringify(pointer));const recordFile=path.join(peers,process.pid+'.json'),record=JSON.parse(fs.readFileSync(recordFile));fs.writeFileSync(recordFile,JSON.stringify({...record,cwd:root}))
  const foreign=spawnSync(process.execPath,args,{env,encoding:'utf8',timeout:10000});assert.notEqual(foreign.status,0);assert.match(foreign.stderr,/native-service-state-binding-mismatch/)
  fs.writeFileSync(recordFile,JSON.stringify(record));const moved=path.join(root,'relocated-state');fs.renameSync(state,moved);fs.symlinkSync(moved,state)
  const linked=spawnSync(process.execPath,args,{env,encoding:'utf8',timeout:10000});assert.notEqual(linked.status,0);assert.match(linked.stderr,/native-service-state-directory-unowned/);fs.unlinkSync(state);fs.renameSync(moved,state)
 }finally{unseal(root);fs.rmSync(root,{recursive:true,force:true})}
})

test('current PreToolUse identity is opt-in; legacy and rescue qualifications are not broadened',async()=>{
 const {nativePolicyPeerMatches}=await import('../src/lib/runtime-entry.mjs'),x=fixture(),pointer={pid:42,procStart:'epoch',sessionId,build,serviceStateBinding:x.binding},peer={pid:42,procStart:'epoch',hostSessionId:sessionId,sessionId:sessionId.slice(6),version:'2.1.299',cwd:receiverCwd,entrypoint:'claude-desktop'},base={pointer,peer,dir:x.dir,inputCwd:receiverCwd}
 assert.equal(nativePolicyPeerMatches(base),true)
 for(const patch of [{version:'2.1.289'},{version:'future'},{cwd:'/foreign'},{procStart:'changed'},{pid:43},{spare:true},{parkedJobId:'owned-other'},{entrypoint:'cli'}])assert.equal(nativePolicyPeerMatches({...base,peer:{...peer,...patch}}),false)
 assert.equal(nativePolicyPeerMatches({...base,inputCwd:x.dir}),false)
 const legacy={...pointer};delete legacy.serviceStateBinding
 assert.equal(nativePolicyPeerMatches({...base,pointer:legacy,peer:{...peer,cwd:x.dir},inputCwd:x.dir}),false)
 assert.equal(nativePolicyPeerMatches({...base,pointer:legacy,peer:{...peer,version:'2.1.289',cwd:x.dir},inputCwd:x.dir}),true)
})

test('actual command hook admits current bound checkpoint only with namespace capability',async()=>{
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path'),{spawnSync,execFileSync}=await import('node:child_process'),{fileURLToPath}=await import('node:url')
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'current-state-policy-')),cwd=path.join(home,'receiver'),state=path.join(cwd,'.claude-driver-services',id),dir=path.join(state,'broker'),release=path.join(state,'releases',build),script=path.join(release,'scripts/broker-check.mjs'),peers=path.join(home,'.claude/sessions')
 const epoch=execFileSync('/bin/ps',['-p',String(process.pid),'-o','lstart='],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',LC_ALL:'C',TZ:'UTC'}}).trim(),pointer={build,pid:process.pid,procStart:epoch,sessionId,serviceStateBinding:{version:1,id,receiverCwd:cwd,sessionId,build}},peer={version:'2.1.299',pid:process.pid,procStart:epoch,hostSessionId:sessionId,sessionId:sessionId.slice(6),entrypoint:'claude-desktop',cwd}
 const save=(p,v)=>fs.writeFileSync(p,JSON.stringify(v)),input={hook_event_name:'PreToolUse',tool_name:'Bash',session_id:sessionId.slice(6),cwd,tool_input:{command:`/opt/homebrew/bin/node "${script}" rmissing 0 --dir "${dir}"`,timeout:5000}}
 const run=()=>{const r=spawnSync(process.execPath,[fileURLToPath(new URL('../src/scripts/broker-stop-rescue.mjs',import.meta.url)),dir,'PreToolUse'],{env:{PATH:'/usr/bin:/bin',HOME:home},input:JSON.stringify(input),encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout).hookSpecificOutput}
 try{
  for(const p of[dir,path.dirname(script),peers])fs.mkdirSync(p,{recursive:true})
  fs.writeFileSync(script,'// synthetic sealed entry; never executed',{mode:0o444});const {createHash}=await import('node:crypto'),manifest={nativeServiceStateBindingVersion:1,files:{'scripts/broker-check.mjs':createHash('sha256').update(fs.readFileSync(script)).digest('hex')}}
  save(path.join(release,'release.json'),manifest);save(path.join(dir,'runtime.json'),pointer);save(path.join(peers,process.pid+'.json'),peer)
  const allowed=run();assert.equal(allowed.permissionDecision,undefined);assert.equal(allowed.updatedInput.run_in_background,false);assert.match(allowed.updatedInput.command,/rmissing 0 --dir/)
  save(path.join(release,'release.json'),{files:manifest.files});assert.equal(run().permissionDecision,'deny');save(path.join(release,'release.json'),manifest)
  save(path.join(peers,process.pid+'.json'),{...peer,version:'2.1.289'});assert.equal(run().permissionDecision,'deny');save(path.join(peers,process.pid+'.json'),peer)
  input.cwd=dir;assert.equal(run().permissionDecision,'deny')
  input.cwd=cwd;input.tool_use_id='native-policy-probe';const {buildNativeServicePolicy}=await import('../src/lib/native-service-policy.mjs'),handler=fileURLToPath(new URL('../src/scripts/broker-stop-rescue.mjs',import.meta.url)),prepared=buildNativeServicePolicy({binding:pointer.serviceStateBinding,epoch:{pid:process.pid,procStart:epoch},brokerDir:dir,scriptSha256:createHash('sha256').update(fs.readFileSync(handler)).digest('hex')});fs.mkdirSync(path.dirname(prepared.settingsPath));fs.writeFileSync(prepared.settingsPath,prepared.settingsBytes);save(prepared.policyPath,prepared.policy)
  assert.equal(run().permissionDecision,undefined);const audit=JSON.parse(fs.readFileSync(path.join(dir,'native-policy-invocation-native-policy-probe.json')));assert.equal(audit.toolUseId,input.tool_use_id);assert.equal(audit.settingsHash,prepared.policy.settingsHash);assert.equal(run().permissionDecision,'deny')
 }finally{fs.rmSync(home,{recursive:true,force:true})}
})
