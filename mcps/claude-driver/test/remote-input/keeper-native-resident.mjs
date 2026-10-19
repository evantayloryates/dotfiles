// Read-only native composition gate for multiple independent client processes.
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmdirSync,existsSync} from 'node:fs'
import {join} from 'node:path'
import {hostname,homedir} from 'node:os'
import {randomUUID,createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {connectKeeperResident,inspectKeeperRequest} from '../../src/candidates/input-keeper/resident.mjs'
import {audit} from './native-audit.mjs'
import {readProcessSnapshot} from '../../src/candidates/input-keeper/process-observation.mjs'
const root='/Users/theo/.local/state/claude-driver/input-teardown-20261018'
if(process.platform!=='darwin'||hostname().split('.')[0]!=='theo-air'||homedir()!=='/Users/theo'||!process.env.SSH_CONNECTION||JSON.parse(readFileSync(join(root,'owner.json'))).threadId!=='01a112b1-fbf6-7cb0-8228-ce3e6cb6112d')throw Error('remote resident gate owner refused')
const run=join(root,'evidence','keeper-native-resident-'+Date.now()+'-'+randomUUID().slice(0,8));mkdirSync(run,{mode:0o700});mkdirSync(join(run,'policy'),{mode:0o700})
writeFileSync(join(run,'policy/ui-quarantine.json'),JSON.stringify({blocked:false,scope:'authorized remote inventory-only resident gate'}),{flag:'wx',mode:0o600})
const controlDir=mkdtempSync('/private/tmp/keeper-native-control-501-'),hash=b=>createHash('sha256').update(b).digest('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms))
const report={run,controlDir,scope:'owned-native-inventory-resident-client-reconnect',startedAt:new Date().toISOString(),inputEventsRequested:0,appAcquisitionsRequested:0,actualHostTurn:false,sources:[],clients:[]}
for(const path of ['../../src/candidates/input-keeper/resident.mjs','../../src/candidates/input-keeper/lifetime.mjs','../../src/candidates/input-keeper/native-resource.mjs','../../src/candidates/input-keeper/resource-host.mjs','../../src/candidates/input-keeper/process-observation.mjs','./keeper-native-resident.mjs','./keeper-native-resident-owner.mjs','./native-audit.mjs','../../src/lib/private-input-service.mjs','../../src/lib/kernel-lock.mjs','../../src/lib/state.mjs','../../../codex-bridge/src/lib/jsonrpc.mjs']){
 const bytes=readFileSync(new URL(path,import.meta.url)),name=path.split('/').at(-1);writeFileSync(join(run,'source-'+name),bytes,{flag:'wx',mode:0o600});report.sources.push({path,sha256:hash(bytes)})
}
const save=()=>writeFileSync(join(run,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600})
const env={HOME:homedir(),USER:'theo',LOGNAME:'theo',PATH:'/usr/bin:/bin:/usr/sbin:/sbin',TMPDIR:join(root,'tmp'),SSH_CONNECTION:process.env.SSH_CONNECTION,CODEX_HOME:join(root,'codex-home'),CLAUDE_DRIVER_STATE_DIR:join(run,'policy')}
let owner,done,ready,closed=false
try{
 report.before=audit(root);if(report.before.helperProcesses.length||report.before.fixtureProcessCurrent)throw Error('empty native baseline required')
 owner=spawn(process.execPath,[fileURLToPath(new URL('./keeper-native-resident-owner.mjs',import.meta.url)),run,controlDir],{env,cwd:run,detached:true,stdio:['ignore','ignore','pipe','ipc']});report.ownerPid=owner.pid;report.ownerStderrBytes=0;owner.stderr.on('data',b=>report.ownerStderrBytes+=b.length)
 done=once(owner,'exit').then(([code,signal])=>({code,signal}))
 ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('resident readiness uncertain; do not restart')),60000);owner.once('message',m=>{clearTimeout(timer);m.type==='ready'?resolve(m):reject(Error('readiness identity failed'))});owner.once('exit',()=>{clearTimeout(timer);reject(Error('resident exited before readiness'))})})
 if(ready.pid!==owner.pid)throw Error('resident readiness PID mismatch');report.ready=ready;owner.disconnect();report.bootstrapChannelClosed=true
 const client=()=>connectKeeperResident({dir:run,controlDir,epoch:ready.epoch});report.initial=await client().request('status');save()
 const helperPid=report.initial.result.resource.pid
 for(let i=0;i<2;i++){
  const spec=JSON.stringify({dir:run,controlDir,epoch:ready.epoch}),code='import{connectKeeperResident}from '+JSON.stringify(new URL('../../src/candidates/input-keeper/resident.mjs',import.meta.url).href)+';const r=await connectKeeperResident('+spec+').request("status");console.log(JSON.stringify(r));'
  const child=spawn(process.execPath,['--input-type=module','-e',code],{env,cwd:run,detached:true,stdio:['ignore','pipe','pipe']});let stdout='',stderrBytes=0;child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderrBytes+=b.length)
  const [exitCode,signal]=await once(child,'exit');const result=JSON.parse(stdout)
  report.clients.push({pid:child.pid,exit:{code:exitCode,signal},stderrBytes,result});save()
  if(exitCode!==0||signal!==null||result.generation!==ready.generation||!result.result.live||result.result.resource.pid!==helperPid)throw Error('independent resident client failed identity/liveness')
 }
 await sleep(1000);report.afterClientEOF=await client().request('status')
 if(report.afterClientEOF.result.resource.pid!==helperPid||!report.afterClientEOF.result.live)throw Error('resident lost resource after client EOF')
 const id=randomUUID();report.shutdownRequestId=id;save();report.shutdown=await client().request('shutdown',{}, {id,timeoutMs:30000});report.shutdownLedger=inspectKeeperRequest(run,id,ready.generation);report.ownerExit=await done;closed=true
 report.final=audit(root);report.remainingOwned=readProcessSnapshot().rows.filter(p=>p.group===owner.pid||p.group===ready.resourceHostPid)
 report.ok=report.ownerExit.code===0&&report.ownerExit.signal===null&&report.shutdownLedger.state==='completed'&&report.shutdown.result.closedNormally===true&&report.remainingOwned.length===0&&report.final.helperProcesses.length===0&&report.final.helperKeyboardFilters.length===0&&!existsSync(join(controlDir,'s'))
 if(report.ok){rmdirSync(controlDir);report.ownedEmptyControlDirRemoved=true}
}catch(error){report.ok=false;report.error={message:error.message,category:error.category};save()}
finally{
 if(owner&&!closed&&ready)try{
  if(report.shutdownRequestId){
   // Reconcile the exact attempted shutdown; never send a new mutation because
   // its reply was uncertain. Keep the calling handle alive if still pending.
   for(let i=0;i<30;i++){const row=inspectKeeperRequest(run,report.shutdownRequestId,ready.generation);report.shutdownLedger=row;if(row.state!=='pending')break;await sleep(1000)}
   if(report.shutdownLedger?.state!=='completed')throw Error('exact shutdown request unresolved; no replay')
   report.ownerExit=await done;closed=true
  }else{
   const c=connectKeeperResident({dir:run,controlDir,epoch:ready.epoch}),id=randomUUID();report.shutdownRequestId=id;save()
   report.failureCleanup=await c.request('shutdown',{}, {id,timeoutMs:30000});report.ownerExit=await done;closed=true
  }
 }catch(error){report.cleanupError=error.message}
 report.final??=audit(root);report.finishedAt=new Date().toISOString();save()
 console.log(JSON.stringify({run,ok:report.ok,error:report.error,cleanupError:report.cleanupError,ownerPid:owner?.pid,resourceHostPid:ready?.resourceHostPid,helperPid:report.initial?.result.resource.pid,clients:report.clients.map(c=>({pid:c.pid,exit:c.exit})),ownerExit:report.ownerExit,finalHelpers:report.final.helperProcesses.length,finalFilters:report.final.helperKeyboardFilters.length}))
}
process.exitCode=report.ok?0:1
