// One remote read-only native keeper gate. No app acquisition, input, actual
// model host, notifier, auth change or permission relay is available here.
import {spawnSync,execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync,lstatSync} from 'node:fs'
import {homedir,hostname} from 'node:os'
import {join} from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {audit} from './native-audit.mjs'
const root='/Users/theo/.local/state/claude-driver/input-teardown-20261018'
if(process.platform!=='darwin'||hostname().split('.')[0]!=='theo-air'||homedir()!=='/Users/theo'||!process.env.SSH_CONNECTION||JSON.parse(readFileSync(join(root,'owner.json'))).threadId!=='01a112b1-fbf6-7cb0-8228-ce3e6cb6112d')throw Error('remote keeper gate owner refused')
const run=join(root,'evidence','keeper-native-'+Date.now()+'-'+randomUUID().slice(0,8));mkdirSync(run,{mode:0o700})
process.env.CLAUDE_DRIVER_STATE_DIR=join(run,'policy');process.env.CODEX_HOME=join(root,'codex-home');mkdirSync(process.env.CLAUDE_DRIVER_STATE_DIR,{mode:0o700})
writeFileSync(join(process.env.CLAUDE_DRIVER_STATE_DIR,'ui-quarantine.json'),JSON.stringify({blocked:false,scope:'authorized remote inventory-only keeper gate'}),{flag:'wx',mode:0o600})
const {createKeeperLifetime}=await import('../../candidates/input-keeper/lifetime.mjs')
const {openNativeKeeperResource}=await import('../../candidates/input-keeper/native-resource.mjs')
const {inspectPrivateInputRuntime}=await import('../../lib/private-input-service.mjs')
const {acquireKernelLock}=await import('../../lib/kernel-lock.mjs')
const hash=b=>createHash('sha256').update(b).digest('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms))
const report={run,scope:'owned-private-native-inventory-keeper-lifetime',startedAt:new Date().toISOString(),inputEventsRequested:0,appAcquisitionsRequested:0,nativePermissionRelays:0,actualHostTurn:false,sources:[]}
for(const path of ['../../candidates/input-keeper/lifetime.mjs','../../candidates/input-keeper/native-resource.mjs','../../candidates/input-keeper/resource-host.mjs','../../candidates/input-keeper/process-observation.mjs','./keeper-native.mjs','./native-audit.mjs','../../lib/private-input-service.mjs','../../lib/kernel-lock.mjs','../../lib/state.mjs','../../../codex-bridge/lib/jsonrpc.mjs']){
 const bytes=readFileSync(new URL(path,import.meta.url)),name=path.split('/').at(-1);writeFileSync(join(run,'source-'+name),bytes,{flag:'wx',mode:0o600});report.sources.push({path,sha256:hash(bytes)})
}
const save=()=>writeFileSync(join(run,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600})
const inspect=()=>inspectPrivateInputRuntime({resourceRoot:join(root,'tools/cua_node'),helperApp:join(root,'codex-home/computer-use/Codex Computer Use.app'),cli:join(root,'tools/CodexCLI.app/Contents/MacOS/codex')})
const lockPath=join(run,'ui.mutex');let releaseLock,resource,keeper,closed=false
const contend=()=>{
 const code='import{acquireKernelLock}from '+JSON.stringify(new URL('../../lib/kernel-lock.mjs',import.meta.url).href)+';try{const r=await acquireKernelLock('+JSON.stringify(lockPath)+',{timeoutMs:100});r();console.log("ACQUIRED")}catch(e){console.log(e.category)}'
 const r=spawnSync(process.execPath,['--input-type=module','-e',code],{env:{HOME:homedir(),PATH:'/usr/bin:/bin:/usr/sbin:/sbin'},encoding:'utf8',timeout:3000});return {code:r.status,result:r.stdout.trim(),error:r.error?.code}
}
const ownedRows=group=>execFileSync('/bin/ps',['-axo','pid=,ppid=,pgid=,comm='],{encoding:'utf8',timeout:5000}).split('\n').flatMap(line=>{const m=line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);return m&&+m[3]===group?[{pid:+m[1],ppid:+m[2],group:+m[3],path:m[4]}]:[]})
try{
 report.before=audit(root);if(report.before.helperProcesses.length||report.before.fixtureProcessCurrent)throw Error('empty owned native baseline required')
 const runtime=await inspect(),epoch=hash(JSON.stringify(runtime.hashes));report.runtimeHashes=runtime.hashes
 releaseLock=await acquireKernelLock(lockPath);const s=lstatSync(lockPath),uiLock={dev:s.dev,ino:s.ino};report.uiLock=uiLock
 const adapters={runtimeEpoch:async()=>hash(JSON.stringify((await inspect()).hashes)),openResource:async()=>{
  resource=await openNativeKeeperResource({dir:run,uiLock});report.resourceHostPid=resource.pid;report.resourceStartError=resource.startError;save()
  if(resource.startError)throw Error(resource.startError)
  report.inventory=resource.ready.inventory;return resource
 },observeResource:async()=>resource.probe(),observeOwner:async()=>{throw Error('no UI lease in inventory gate')},openClient:async()=>{throw Error('no task client in inventory gate')},retireClient:async()=>{throw Error('no task client in inventory gate')},settleInput:async()=>{throw Error('no input in inventory gate')},closeResource:async()=>{const result=await resource.close();closed=true;report.closeReceipt=result;return result}}
 keeper=await createKeeperLifetime({evidence:join(run,'keeper.json'),epoch},adapters)
 report.ready=await keeper.start();report.lockBeforeRelease=contend();save()
 if(report.lockBeforeRelease.result!=='lock_timeout')throw Error('parent UI lock admission failed')
 releaseLock();releaseLock=undefined;report.lockAfterParentRelease=contend()
 if(report.lockAfterParentRelease.result!=='ACQUIRED')throw Error('keeper inherited a UI-lock descriptor')
 report.idle=[];const started=Date.now()
 for(const wait of [1000,5000]){
  await sleep(Math.max(0,wait-(Date.now()-started)));const observed=await resource.probe()
  if(observed.identity.pid!==report.ready.pid||observed.uiLockInherited||observed.clientExit)throw Error('idle keeper resource changed')
  report.idle.push({elapsedMs:Date.now()-started,...observed});save()
 }
 report.shutdown=await keeper.shutdown();report.after=audit(root)
 report.remainingGroup=ownedRows(resource.pid)
 report.ok=closed&&report.closeReceipt.helperExit?.code===0&&report.closeReceipt.hostExit?.code===0&&report.after.helperProcesses.length===0&&report.after.helperKeyboardFilters.length===0&&!report.after.fixtureProcessCurrent&&report.remainingGroup.length===0
}catch(error){report.ok=false;report.error={message:error.message,category:error.category};save()}
finally{
 if(resource&&!closed)try{report.failureCleanup=await resource.close();closed=true}catch(error){report.cleanupError=error.message}
 releaseLock?.();report.resourceStatus=resource?.status();report.final=audit(root);report.finishedAt=new Date().toISOString();save()
 console.log(JSON.stringify({run,ok:report.ok,error:report.error,cleanupError:report.cleanupError,resourceHostPid:resource?.pid,helperPid:report.ready?.pid,inventory:report.inventory,lockAfterParentRelease:report.lockAfterParentRelease,closeReceipt:report.closeReceipt,finalHelpers:report.final.helperProcesses.length,finalFilters:report.final.helperKeyboardFilters.length}))
}
process.exitCode=report.ok?0:1
