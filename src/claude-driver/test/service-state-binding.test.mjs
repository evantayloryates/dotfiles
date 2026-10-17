import test from 'node:test'
import assert from 'node:assert/strict'
import {serviceStateBindingMatches} from '../lib/runtime-entry.mjs'
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
 const source=`import{stageRelease,commitRelease}from ${JSON.stringify(new URL('../lib/releases.mjs',import.meta.url).href)};const r=await stageRelease();commitRelease(r.build,{sessionId:${JSON.stringify(sessionId)},pid:${process.pid},procStart:${JSON.stringify(epoch)},nonce:'synthetic-owned-state',serviceStateBinding:{version:1,id:${JSON.stringify(id)},receiverCwd:${JSON.stringify(cwd)},sessionId:${JSON.stringify(sessionId)},build:r.build}},()=> 'synthetic fixture');console.log(JSON.stringify(r))`
 function unseal(p){const st=fs.lstatSync(p);if(st.isDirectory()){fs.chmodSync(p,0o700);for(const n of fs.readdirSync(p))unseal(path.join(p,n))}else if(!st.isSymbolicLink())fs.chmodSync(p,0o600)}
 try{
  const staged=spawnSync(process.execPath,['--input-type=module','-e',source],{env,encoding:'utf8',timeout:20000});assert.equal(staged.status,0,staged.stderr)
  const r=JSON.parse(staged.stdout),broker=path.join(state,'broker'),script=path.join(r.root,'scripts/broker-check.mjs'),args=[script,'missing-synthetic-request','0','--dir',broker]
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
