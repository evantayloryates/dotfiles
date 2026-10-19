#!/usr/bin/env node
// One exact owned broker control subscription; no model turn or recovery.
import {spawn} from 'node:child_process'
import {randomBytes,createHash} from 'node:crypto'
import {existsSync,lstatSync,readFileSync} from 'node:fs'
import {join,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {brokerInfo} from '../lib/broker.mjs'
import {peerRecord,prepareIdleSubscription} from '../lib/peer-direct.mjs'
import {STATE_DIR,BROKER_DIR,withLock,writeJsonAtomic} from '../lib/state.mjs'
import {sessionEvents} from '../lib/events.mjs'
import {RUNTIME_BUILD,runtimeFingerprint} from '../lib/build.mjs'
import {versions,resolveClaudeBinary} from '../lib/paths.mjs'
import {installedWindowContaining} from '../lib/installed-source.mjs'
import {recordMemory} from '../lib/memory.mjs'
if(process.argv.length!==3||process.argv[2]!=='--run-owned-idle-subscription')throw Error('explicit owned idle subscription flag required')
const epoch={sessionId:'local_35b3ba48-f02e-48de-bfbb-925192d90de1',pid:71262,procStart:'Wed Oct  7 03:24:51 2026'},report=join(STATE_DIR,'pressure','native-peer-idle-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json')
const out={scope:'owned-native-peer-idle-subscription',epoch,runtimeBuild:RUNTIME_BUILD,versions:versions(),ok:false,releaseAuthorized:false,limitations:['A host idle notice is not full internal queue quiescence, a new turn result, native effect settlement or release authorization','A timed-out native subscription can remain until its one-shot notice or native12h expiry; do not blindly repeat it']}
const same=i=>i.sessionId===epoch.sessionId&&i.live?.pid===epoch.pid&&i.live.procStart===epoch.procStart&&i.live.entrypoint==='claude-desktop'&&i.runtime?.integrity
try{
 await withLock('broker',async()=>{
  const before=brokerInfo();if(!same(before)||before.permissionMode!=='bypassPermissions'||existsSync(join(BROKER_DIR,'mechanical-probe.json'))||existsSync(join(BROKER_DIR,'STOP')))throw Error('owned native idle subscription admission refused')
  const source=installedWindowContaining(resolveClaudeBinary(),'notePeerIdleStatus:be,enqueueIdleNoticesForModel:Te}',{before:180,after:2000});out.hostSourceHash=source.sha256
  if(!source.text.includes('K(r.sessionState.stateChanged.subscribe((Ie)=>{be(Ie==="idle",Ie==="running")}))'))throw Error('headless idle host source changed')
  const rec=peerRecord(epoch.sessionId,epoch.pid),reply=join(dirname(rec.messagingSocketPath),process.pid+'-'+randomBytes(4).toString('hex')+'.sock')
  if(existsSync(reply))throw Error('owned reply path already exists')
  const parent=lstatSync(dirname(reply));if(!parent.isDirectory()||parent.isSymbolicLink()||parent.uid!==process.getuid())throw Error('reply namespace owner refused')
  const cursor=sessionEvents({session:epoch.sessionId}).cursor;out.startedAt=Date.now()
  const listener=fileURLToPath(new URL('./peer-idle-listener.py',import.meta.url));out.listenerSourceHash=createHash('sha256').update(readFileSync(listener)).digest('hex')
  const child=spawn('/usr/bin/python3',[listener,reply,String(epoch.pid),String(process.getuid())],{stdio:['pipe','pipe','pipe']})
  let buffer='',prepared,complete,stderrBytes=0
  const code=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{child.kill('SIGTERM');reject(Error('owned listener outer deadline'))},18000)
   child.stderr.on('data',b=>stderrBytes+=b.length)
   child.stdout.on('data',chunk=>{buffer+=chunk.toString();if(Buffer.byteLength(buffer)>8192){child.kill('SIGTERM');return}
    for(;;){const at=buffer.indexOf('\n');if(at<0)break;const line=buffer.slice(0,at);buffer=buffer.slice(at+1);let r;try{r=JSON.parse(line)}catch{child.kill('SIGTERM');continue}
     if(r.ready){try{const stat=lstatSync(reply);if(stat.dev!==r.dev||stat.ino!==r.ino||!same(brokerInfo()))throw Error('listener readiness identity refused');prepared=prepareIdleSubscription(before,reply);out.subscription={msgId:prepared.msgId,pid:prepared.pid,procStart:prepared.procStart};child.stdin.end(JSON.stringify({socket:prepared.socket,lines:prepared.lines,msgId:prepared.msgId})+'\n')}catch{child.stdin.end();child.kill('SIGTERM')}}else complete=r
    }
   })
   child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('exit',code=>{clearTimeout(timer);resolve(code)})
  })
  out.listenerExit=code;out.listenerStderrBytes=stderrBytes;out.notice=complete??null;out.listenerRemoved=!existsSync(reply)
  const events=sessionEvents({session:epoch.sessionId,cursor,include_causality:true,limit:100});out.observedTurnEvents=events.events.filter(e=>['user','assistant'].includes(e.type)).map(e=>({id:e.id,type:e.type}))
  out.afterSameEpoch=same(brokerInfo());out.ok=code===0&&complete?.ok===true&&complete.msgId===prepared?.msgId&&complete.kernelPeerPid===epoch.pid&&complete.kernelPeerUid===process.getuid()&&complete.state==='idle'&&out.listenerRemoved&&out.afterSameEpoch&&out.observedTurnEvents.length===0
  if(!out.ok)out.failure=complete?.failure??'idle notice conjunction not proved'
 },{timeoutMs:10000})
}catch(e){out.failure=String(e.message).slice(0,200)}
out.sourceChanged=runtimeFingerprint()!==RUNTIME_BUILD;out.ok=out.ok&&!out.sourceChanged
writeJsonAtomic(report,out);recordMemory({kind:'test_result',topic:'peer-idle-control',source:'owned-native-control-probe',status:out.ok?'passed':'failed',evidence:report,lesson:'One correlated native idle control subscription uses kernel PID/UID reply proof and no user/model message. Host idle alone is not queue quiescence or release authority; retain timeout subscriptions rather than blind replay.'});console.log(JSON.stringify({report,...out}));process.exitCode=out.ok?0:1
