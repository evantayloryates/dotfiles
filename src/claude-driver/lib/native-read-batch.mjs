// Experimental deterministic native metadata execution. Hook dispatch uses no
// model tool selection; one short owned turn triggers a batch. Never mutations.
import {randomBytes,randomUUID} from 'node:crypto'
import {constants,openSync,closeSync,fstatSync,readSync,existsSync} from 'node:fs'
import {join} from 'node:path'
import {homedir} from 'node:os'
import {brokerInfo} from './broker.mjs'
import {getRecord} from './sessions.mjs'
import {STATE_DIR,BROKER_DIR,ensureDir,withLock,writeJsonAtomic} from './state.mjs'
import {RUNTIME_BUILD,runtimeState} from './build.mjs'
import {DriverError,sleep,versions} from './paths.mjs'
import {stageRelease} from './releases.mjs'
import {stopRescuePolicy} from './stop-rescue.mjs'
import {installTemporaryHookProbe,prepareTemporaryHookPeer,restoreTemporaryHookProbe,recoverExpiredTemporaryHookProbe,ownedBytes,bytesHash} from './temporary-hooks.mjs'
import {nativeHookResult,nativeHookEventError} from './native-hook-receipts.mjs'
import {sessionEvents} from './events.mjs'
import {deliver} from './peer.mjs'
import {observeNativeIdle} from './native-idle.mjs'
import {recordMemory} from './memory.mjs'
const sid=x=>typeof x==='string'&&/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x)
const refuse=(category,message,detail)=>{throw new DriverError(message,{category,detail})}
export function normalizeReadTargets(sessions){
 if(!Array.isArray(sessions)||sessions.length<1||sessions.length>8||sessions.some(x=>!sid(x)))refuse('bad_args','metadata batch requires 1–8 exact native session IDs')
 return [...new Set(sessions)]
}
export function matchMetadataReceipt(receipt,targets){
 if(!receipt?.ok||receipt.command!=='ccd_session_mgmt/get_session'||typeof receipt.stdout!=='string'||Buffer.byteLength(receipt.stdout)>65536)return null
 let m;try{m=JSON.parse(receipt.stdout)}catch{return null}
 if(!m||typeof m!=='object'||Array.isArray(m)||!targets.includes(m.sessionId)||typeof m.isArchived!=='boolean'||Object.hasOwn(m,'pinned')&&typeof m.pinned!=='boolean'||typeof m.isRunning!=='boolean')return null
 const metadata={sessionId:m.sessionId,isArchived:m.isArchived,pinned:typeof m.pinned==='boolean'?m.pinned:null,isRunning:m.isRunning}
 for(const key of ['title','cwd','model','effort','permissionMode','cliSessionId'])if(typeof m[key]==='string'&&m[key].length<=4096)metadata[key]=m[key]
 return {sessionId:m.sessionId,metadata,receipt:{uuid:receipt.uuid,eventId:receipt.hookEventId,at:receipt.at,stdoutHash:bytesHash(receipt.stdout),stderrHash:bytesHash(receipt.stderr)}}
}
export async function nativeReadBatch(sessions,{timeoutSec=20,signal}={}){
 const targets=normalizeReadTargets(sessions)
 if(!Number.isFinite(timeoutSec)||timeoutSec<5||timeoutSec>60)refuse('bad_args','native read batch timeout must be 5–60 seconds')
 if(signal?.aborted)refuse('cancelled','metadata batch cancelled before preparation')
 const id=randomUUID(),token=randomBytes(16).toString('hex'),evidence=join(ensureDir(join(STATE_DIR,'native-reads')),id+'.json'),witnessPath=join(STATE_DIR,'native-reads',id+'.stop.json')
 const plan={schemaVersion:1,id,runtimeBuild:RUNTIME_BUILD,targets,phase:'preparing',createdAt:Date.now(),inferenceTurns:0,releaseAuthorized:false}
 const save=()=>writeJsonAtomic(evidence,plan)
 let installed=false,fd,initial,failure,answer
 save()
 try{answer=await withLock('broker',async()=>{
  if(runtimeState().restartRequired)refuse('runtime_stale','native read batch source changed')
  initial=brokerInfo();const epoch={sessionId:initial.sessionId,pid:initial.live?.pid,procStart:initial.live?.procStart}
  if(!initial.configured||!initial.live||!sid(epoch.sessionId))refuse('native_read_refused','metadata hook batch requires a configured live desktop broker')
  const same=()=>{const b=brokerInfo();return b.sessionId===epoch.sessionId&&b.live?.pid===epoch.pid&&b.live.procStart===epoch.procStart&&b.live.entrypoint==='claude-desktop'&&b.runtime.integrity}
  const v=versions(),record=getRecord(epoch.sessionId)
  if(v.app!=='2.26454.0'||v.cli!=='2.1.289'||!same()||record?.cwd!==BROKER_DIR||record.isArchived||initial.live.status!=='idle'||initial.resident.resident||initial.handoffStopped||existsSync(join(BROKER_DIR,'STOP'))||existsSync(join(BROKER_DIR,'stop-rescue-arm.json'))||existsSync(join(BROKER_DIR,'quiet-hook-owner.json')))refuse('native_read_refused','metadata hook batch requires the reviewed intact idle unarmed desktop broker')
  recoverExpiredTemporaryHookProbe(BROKER_DIR,initial)
  const policy=stopRescuePolicy();if(!policy||policy.quietWait)refuse('native_read_refused','metadata hook batch requires the intact existing core policy')
  for(const target of targets)if(!getRecord(target))refuse('not_found','native metadata target does not exist')
  const release=await stageRelease(),cursor=sessionEvents({session:epoch.sessionId}).cursor,c=JSON.parse(Buffer.from(cursor,'base64url').toString()),path=join(homedir(),'.claude','projects',BROKER_DIR.replace(/[^A-Za-z0-9]/g,'-'),epoch.sessionId.slice(6)+'.jsonl')
  fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);const identity=fstatSync(fd)
  if(!identity.isFile()||identity.uid!==process.getuid()||c.identity!==epoch.sessionId.slice(6)+':'+identity.dev+':'+identity.ino)refuse('native_read_refused','native metadata journal identity changed')
  let offset=c.offset,eventsCursor=cursor,peer,foreign=false;const chain=new Set(),seen=new Set(),matched=new Map()
  plan.epoch=epoch;plan.versions=v;plan.probeBuild=release.build;plan.startedAt=Date.now();plan.expiresAt=plan.startedAt+timeoutSec*1000
  try{
   const d=installTemporaryHookProbe(BROKER_DIR,{token,epoch,observerScript:join(release.root,'scripts','mechanical-probe-stop.mjs'),receiptPath:witnessPath,operation:'get_session',readTargets:targets,expiresAt:plan.expiresAt});installed=true
   plan.settingsHash=d.settingsHash;plan.phase='enrolled';save()
   await sleep(1500)
   if(signal?.aborted||Date.now()>=plan.expiresAt)refuse('cancelled','metadata batch ended before publication')
   peer=await deliver(initial,'claude-driver mechanical read probe '+token+'. Finish this diagnostic turn with exactly '+token+' and no tools. The service Stop hook owns the metadata batch. Do not execute requests, waiters, maintenance, recovery or change settings.',{method:'direct',priority:'now',timeoutMs:Math.min(5000,plan.expiresAt-Date.now()),signal,onPrepared:p=>{prepareTemporaryHookPeer(BROKER_DIR,token,p);plan.peer={msgId:p.msgId,pid:p.pid,procStart:p.procStart};plan.phase='publication_attempted';save()}})
   plan.inferenceTurns=1;plan.phase='published';save()
   while(Date.now()<plan.expiresAt&&!signal?.aborted){
    if(!same())refuse('native_read_epoch_changed','metadata batch native epoch changed')
    const events=sessionEvents({session:epoch.sessionId,cursor:eventsCursor,include_causality:true,limit:100});eventsCursor=events.cursor
    for(const e of events.events){
     if(e.type==='user'&&e.peerMessageId===peer.msgId){chain.add(e.id);plan.userUuid=e.id;continue}
     if(e.type==='user')foreign=true
     if(!e.sidechain&&chain.has(e.parentId)){chain.add(e.id);if(e.type==='assistant'&&e.tools?.length)refuse('native_read_unexpected_tools','metadata diagnostic invoked assistant tools')}
    }
    const stat=fstatSync(fd);if(stat.dev!==identity.dev||stat.ino!==identity.ino||stat.size<offset||stat.size-offset>256*1024)refuse('native_read_journal_changed','metadata journal changed or exceeded bound')
    const b=Buffer.alloc(stat.size-offset);readSync(fd,b,0,b.length,offset);const end=b.lastIndexOf(10)
    if(end>=0){offset+=end+1;for(const line of b.subarray(0,end).toString().split('\n')){
     let row;try{row=JSON.parse(line)}catch{continue}
     const opts={cliSessionId:epoch.sessionId.slice(6),cwd:BROKER_DIR,chain,notBefore:plan.startedAt,notAfter:plan.expiresAt},receipt=nativeHookResult(row,{...opts,command:'ccd_session_mgmt/get_session'}),error=nativeHookEventError(row,opts)
     if(error)refuse('native_read_hook_error','native metadata event has a commandless error')
     if(receipt&&!seen.has(receipt.uuid)){seen.add(receipt.uuid);chain.add(receipt.uuid);const match=matchMetadataReceipt(receipt,targets);if(!match||matched.has(match.sessionId))refuse('native_read_bad_receipt','native metadata receipt does not uniquely match this batch');matched.set(match.sessionId,match)}
    }}
    if(foreign)refuse('native_read_foreign_turn','another native turn overlapped the metadata batch')
    if(matched.size===targets.length&&existsSync(witnessPath)){
     const w=JSON.parse(ownedBytes(witnessPath));if(w.token!==token||w.msgId!==peer.msgId||w.userUuid!==plan.userUuid||w.settingsHash!==plan.settingsHash||w.epoch.pid!==epoch.pid||w.epoch.procStart!==epoch.procStart)refuse('native_read_bad_witness','metadata batch Stop witness mismatch')
     const idle=await observeNativeIdle(brokerInfo(),{timeoutSec:Math.min(3,Math.max(0.1,(plan.expiresAt-Date.now())/1000)),notBefore:plan.startedAt,cacheMs:0,signal})
     const lastReceipt=Math.max(...[...matched.values()].map(x=>Date.parse(x.receipt.at)))
     if(!idle.verified||!idle.observedIdle||!idle.freshTurnCompletion||idle.finishedAt<lastReceipt)refuse('native_read_not_finished','native metadata batch lacks correlated host completion')
     plan.idleObservation=idle.observationId;plan.receipts=targets.map(x=>({sessionId:x,...matched.get(x).receipt}));plan.phase='received';save()
     return {id,results:sessions.map(sessionId=>({...matched.get(sessionId),verified:true})),uniqueNativeReads:targets.length,requestedReads:sessions.length,elapsedMs:Date.now()-plan.startedAt,evidence,receiptSource:'native-hook-result',triggerInferenceTurns:1,executionInference:false,releaseAuthorized:false,quiescenceVerified:false}
    }
    await sleep(50)
   }
   refuse(signal?.aborted?'cancelled':'native_read_timeout','metadata batch stopped waiting; native reads may still finish',{id,evidence,retrySafe:true})
  }finally{
   if(installed){
    if(same()&&brokerInfo().live.status!=='idle'){
     // Cancel the caller's wait, not cleanup ownership. One bounded native
     // observation lets the owned tool-free turn finish without another wake.
     try{await observeNativeIdle(brokerInfo(),{timeoutSec:3,notBefore:plan.startedAt,cacheMs:0})}catch{}
    }
    // Restore only the exact transaction's bytes in the original live epoch.
    // A busy/changed epoch stays durably owned for existing expiry recovery.
    if(same()&&brokerInfo().live.status==='idle'){plan.restoration=restoreTemporaryHookProbe(BROKER_DIR,token);installed=false}
    else plan.restorePending=true
    save()
   }
  }
 },{timeoutMs:timeoutSec*1000,signal})
 }catch(e){failure=e;plan.failureCategory=e.category??'native_read_failed'}finally{
  if(fd!==undefined)closeSync(fd)
  plan.sourceChanged=runtimeState().restartRequired;plan.phase=answer&&!failure&&!installed&&!plan.sourceChanged?'completed':'failed';plan.completedAt=Date.now();if(installed)plan.restorePending=true;save()
  recordMemory({kind:'test_result',topic:'native-read-batch',source:'experimental-service',status:plan.phase==='completed'?'observed':'candidate',evidence,lesson:'Opt-in deterministic metadata hook batch requires exact native receipts, one owned peer turn, host finish and exact settings restoration. Trigger uses one short model turn; tool execution does not. Direct hooks do not inherit mutation admission; mutations are excluded.'})
 }
 if(failure)throw new DriverError('Native metadata batch failed; inspect bounded service evidence before retrying',{category:failure.category??'native_read_failed',detail:{id,evidence,restorePending:installed,retrySafe:true}})
 if(plan.phase!=='completed')refuse('native_read_incomplete','metadata batch did not restore or retain source identity',{id,evidence,restorePending:installed,retrySafe:true})
 return answer
}
