// Service-owned idle observation. A notice proves host state, never queue
// quiescence, task success or release authority. No model or recovery fallback.
import {spawn} from 'node:child_process'
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {constants,openSync,closeSync,fstatSync,readFileSync,lstatSync,existsSync} from 'node:fs'
import {dirname,join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {STATE_DIR,ensureDir,withLock,writeJsonAtomic} from './state.mjs'
import {peerRecord,prepareIdleSubscription} from './peer-direct.mjs'
import {DriverError,resolveClaudeBinary} from './paths.mjs'
import {installedModuleContaining,installedWindowContaining} from './installed-source.mjs'
import {RUNTIME_BUILD,runtimeState} from './build.mjs'
import {recordMemory} from './memory.mjs'
const hash=x=>createHash('sha256').update(x).digest('hex'),remoteTtl=43200000
const moduleSha='113b3bbdaa98cdb3b2dd4743bf68f4baa58ab546c45e94624ac95edec2c6b03a',hostSha='50a7b9fb21eee218971f5788974ce697e9d39b4da4fd6144a02bd66be9838ce8'
const fail=(category,message)=>{throw new DriverError(message,{category})}
function readLease(path){
 let fd
 try{fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);const stat=fstatSync(fd);if(!stat.isFile()||stat.uid!==process.getuid()||stat.size>65536)fail('idle_observer_invalid','owned idle lease metadata refused');return JSON.parse(readFileSync(fd,'utf8'))}
 catch(e){if(e.code==='ENOENT')return null;if(e instanceof DriverError)throw e;fail('idle_observer_invalid','owned idle lease unreadable')}
 finally{if(fd!==undefined)closeSync(fd)}
}
export function idleLeaseKey(epoch){
 if(!/^local_[a-f0-9-]{36}$/.test(epoch?.sessionId)||!Number.isInteger(epoch.pid)||epoch.pid<2||typeof epoch.procStart!=='string'||!epoch.procStart||epoch.procStart.length>100)fail('bad_args','idle observer requires an exact native epoch')
 return hash(JSON.stringify(epoch))
}
function validateLease(row,epoch,path){
 if(!row)return
 if(row.schemaVersion!==1||idleLeaseKey(row.epoch)!==idleLeaseKey(epoch)||!['publishing','pending_remote','received','undispatched'].includes(row.phase)||!Number.isFinite(row.createdAt)||!Number.isFinite(row.remoteExpiresAt)||row.remoteExpiresAt!==row.createdAt+remoteTtl+10000||typeof row.id!=='string'||!/^[a-f0-9-]{36}$/.test(row.id)||typeof row.msgId!=='string'||!/^[a-f0-9-]{36}$/.test(row.msgId))fail('idle_observer_invalid','idle lease schema refused')
 if(typeof row.runtimeBuild!=='string'||!/^[a-f0-9]{64}$/.test(row.runtimeBuild)||row.phase==='received'&&(!safeNotice({...row.notice,ok:true,msgId:row.msgId,listenerRemoved:true},{msgId:row.msgId,pid:epoch.pid})||typeof row.afterSameEpoch!=='boolean'||typeof row.sourceChanged!=='boolean'||!Number.isFinite(row.completedAt)))fail('idle_observer_invalid','idle lease receipt refused')
 if(row.mailbox!==undefined&&(row.mailbox!==join(dirname(path),'notices',row.id+'.json')||!Number.isInteger(row.helperPid)||row.helperPid<2))fail('idle_observer_invalid','idle lease mailbox refused')
 if(path&&row.evidence!==join(dirname(path),'observations',row.id+'.json')||row.failureCategory!==undefined&&!['cancelled','idle_observer_timeout','peer_refused','peer_unqualified','idle_observer_invalid','idle_observer_unconfirmed'].includes(row.failureCategory))fail('idle_observer_invalid','idle lease evidence refused')
}
export function summarizeIdleLease(row,{now=Date.now(),notBefore,joined=false}={}){
 const received=row.phase==='received',n=row.notice,verified=received&&row.afterSameEpoch===true&&!row.sourceChanged
 return {observationId:row.id,state:received?n.state:'pending',verified,observedIdle:verified&&n.state==='idle',finishedAt:received?n.finishedAt:null,observedAt:received?n.receivedAt:null,
  freshTurnCompletion:verified&&n.state==='idle'&&Number.isFinite(notBefore)&&Number.isFinite(n.finishedAt)&&n.finishedAt>=notBefore,
  pendingRemoteSubscription:!received&&row.phase!=='undispatched'&&now<row.remoteExpiresAt,nativeSubscriptionCancelled:false,
  joined,epoch:row.epoch,runtimeBuild:row.runtimeBuild,quiescenceVerified:false,releaseAuthorized:false,evidence:row.evidence,
  ...(row.failureCategory?{failureCategory:row.failureCategory}:{})}
}
function safeNotice(raw,prepared){
 if(raw?.ok!==true||raw.msgId!==prepared.msgId||raw.kernelPeerPid!==prepared.pid||raw.kernelPeerUid!==process.getuid()||!['idle','exited','unavailable'].includes(raw.state)||raw.listenerRemoved!==true||!Number.isFinite(raw.receivedAt)||raw.receivedAt>Date.now()+1000||raw.finishedAt!==null&&(!Number.isFinite(raw.finishedAt)||raw.finishedAt<0||raw.finishedAt>raw.receivedAt+1000))return null
 return {state:raw.state,finishedAt:raw.finishedAt,receivedAt:raw.receivedAt,kernelPeerPid:raw.kernelPeerPid,kernelPeerUid:raw.kernelPeerUid,detailPresent:raw.detailPresent===true}
}
export async function exchangeNativeIdle(target,{signal,onPublishing}){
 if(process.platform!=='darwin')fail('peer_unqualified','native idle observer requires the reviewed macOS transport')
 const binary=resolveClaudeBinary(),source=installedModuleContaining(binary,'function m_r('),host=installedWindowContaining(binary,'notePeerIdleStatus:be,enqueueIdleNoticesForModel:Te}',{before:180,after:2000})
 if(source.sha256!==moduleSha||host.sha256!==hostSha)fail('peer_unqualified','native idle subscription source changed')
 const rec=peerRecord(target.sessionId,target.live.pid)
 if(!rec||rec.procStart!==target.live.procStart||rec.version!=='2.1.289')fail('peer_unqualified','native idle epoch unavailable')
 const reply=join(dirname(rec.messagingSocketPath),process.pid+'-'+randomBytes(4).toString('hex')+'.sock'),parent=lstatSync(dirname(reply))
 if(parent.isSymbolicLink()||!parent.isDirectory()||parent.uid!==process.getuid()||existsSync(reply))fail('peer_refused','native idle reply namespace refused')
 const listener=fileURLToPath(new URL('../scripts/peer-idle-listener.py',import.meta.url)),listenerSourceHash=hash(readFileSync(listener)),child=spawn('/usr/bin/python3',[listener,reply,String(rec.pid),String(process.getuid()),'43200','--service'],{detached:true,stdio:['pipe','pipe','ignore']})
 let buffer='',prepared,published=false
 // Cancellation belongs to the caller until durable publication. Thereafter
 // this exact helper belongs to the service and must survive the harness.
 const abort=()=>{if(!prepared)child.kill('SIGTERM')}
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()
 try{return await new Promise((resolve,reject)=>{
  let settled=false
  const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort)
   child.stdout.destroy();child.stdin.destroy();child.unref()
   error?reject(error):resolve({serviceOwned:true,helperPid:child.pid,publicationConfirmed:published})
  }
  const timer=setTimeout(()=>{child.kill('SIGTERM');finish(prepared?undefined:new DriverError('owned idle helper preparation timed out',{category:'idle_observer_timeout'}))},4000)
  child.stdin.on('error',()=>{child.kill('SIGTERM');finish(prepared?undefined:new DriverError('owned idle helper configuration failed',{category:'idle_observer_unavailable'}))})
  child.stdout.on('data',chunk=>{buffer+=chunk.toString();if(Buffer.byteLength(buffer)>8192){child.kill('SIGTERM');finish(new DriverError('owned idle helper output refused',{category:'idle_observer_invalid'}));return}
   for(;;){const at=buffer.indexOf('\n');if(at<0)break;const line=buffer.slice(0,at);buffer=buffer.slice(at+1);let row;try{row=JSON.parse(line)}catch{child.kill('SIGTERM');finish(new DriverError('owned idle helper framing refused',{category:'idle_observer_invalid'}));return}
    if(row?.ready){try{
     if(prepared||signal?.aborted)fail('cancelled','native idle preparation refused')
     const stat=lstatSync(reply);if(stat.dev!==row.dev||stat.ino!==row.ino)fail('peer_refused','idle listener readiness changed')
     prepared=prepareIdleSubscription(target,reply)
     const metadata=onPublishing({msgId:prepared.msgId,listenerSourceHash,hostSourceHash:host.sha256,moduleSourceHash:source.sha256,helperPid:child.pid})
     child.stdin.end(JSON.stringify({socket:prepared.socket,lines:prepared.lines,msgId:prepared.msgId,receiptPath:metadata.mailbox})+'\n')
    }catch(e){child.kill('SIGTERM');finish(e)}}else if(row?.published===true){published=true;finish()}
   }
  })
  child.on('error',()=>finish(new DriverError('owned idle helper unavailable',{category:'idle_observer_unavailable'})))
  child.on('close',()=>finish(prepared?undefined:new DriverError('owned idle helper closed before preparation',{category:signal?.aborted?'cancelled':'idle_observer_unavailable'})))
 })}finally{signal?.removeEventListener('abort',abort)}
}
// deps is internal test injection, never caller/tool input. All production
// publishers use the private, kernel-verified exchange above.
export async function observeNativeIdle(target,{timeoutSec=12,notBefore,signal,cacheMs=1000}={},deps={}){
 if(!Number.isFinite(timeoutSec)||timeoutSec<0.1||timeoutSec>30||!Number.isFinite(cacheMs)||cacheMs<0||cacheMs>3000||notBefore!==undefined&&(!Number.isFinite(notBefore)||notBefore<0||notBefore>Date.now()+1000))fail('bad_args','native idle observation bounds refused')
 if(signal?.aborted)fail('cancelled','native idle observation cancelled before preparation')
 if(runtimeState().restartRequired)fail('runtime_stale','native idle observer source changed')
 const epoch={sessionId:target?.sessionId,pid:target?.live?.pid,procStart:target?.live?.procStart},key=idleLeaseKey(epoch),startedAt=Date.now(),dir=ensureDir(deps.dir??join(STATE_DIR,'native-idle')),path=join(dir,key+'.json')
 const ds=lstatSync(dir);if(ds.isSymbolicLink()||!ds.isDirectory()||ds.uid!==process.getuid())fail('idle_observer_invalid','idle lease directory refused')
 const current=()=>{const row=readLease(path);validateLease(row,epoch,path);return row}
 const reuse=row=>row&&(row.phase==='publishing'||row.phase==='pending_remote')&&row.remoteExpiresAt>Date.now()||cacheMs>0&&row?.phase==='received'&&row.completedAt>=startedAt-cacheMs
 const initial=current()
 // Preserve legacy uncertain publications without waiting on their owner's
 // lock. They have no mailbox to adopt; their native debt still cannot retry.
 if(reuse(initial)&&!initial.mailbox)return summarizeIdleLease(initial,{notBefore,joined:true})
 const fresh=deps.sameEpoch??(()=>{const rec=peerRecord(epoch.sessionId,epoch.pid);return rec?.procStart===epoch.procStart})
 const save=lease=>{const observations=ensureDir(join(dir,'observations')),s=lstatSync(observations);if(s.isSymbolicLink()||!s.isDirectory()||s.uid!==process.getuid())fail('idle_observer_invalid','idle observation directory refused');writeJsonAtomic(path,lease);writeJsonAtomic(lease.evidence,lease)}
 const finalize=(lease,result)=>{
  const n=result?.notice
  const notice=safeNotice(n?{...n,ok:true,msgId:lease.msgId,listenerRemoved:result.listenerRemoved}:null,{msgId:lease.msgId,pid:epoch.pid})
  if(notice&&notice.receivedAt<lease.createdAt)fail('idle_observer_invalid','idle notice predates publication')
  lease.afterSameEpoch=fresh()===true;lease.sourceChanged=runtimeState().restartRequired||lease.runtimeBuild!==RUNTIME_BUILD;lease.completedAt=Date.now();lease.listenerRemoved=result?.listenerRemoved===true
  if(notice){lease.phase='received';lease.notice=notice}
  else {lease.phase=result?.definitelyUndispatched===true?'undispatched':'pending_remote';lease.failureCategory=['cancelled','idle_observer_timeout','peer_refused','peer_unqualified','idle_observer_invalid'].includes(result?.failureCategory)?result.failureCategory:'idle_observer_unconfirmed'}
  save(lease);recordMemory({kind:'observation',topic:'native-idle-observer',source:deps.exchange?'isolated-test':'service',status:deps.exchange?'candidate':notice?'observed':'candidate',evidence:lease.evidence,lesson:'Service-owned native idle observation survives caller cancellation/disconnection; publication, subscription debt and caller wait remain distinct. Host signal is not task success, full queue quiescence or release authority.'})
  return lease
 }
 const reconcile=lease=>{
  if(!lease?.mailbox||lease.phase==='received'||lease.mailboxConsumed)return lease
  const raw=readLease(lease.mailbox);if(!raw)return lease
  // A private mailbox is still evidence, never authority. Match the nonce
  // before constructing a receipt; malformed results cannot be retry proof.
  const notice=safeNotice(raw,{msgId:lease.msgId,pid:epoch.pid})
  lease.mailboxConsumed=true
  return finalize(lease,{notice,listenerRemoved:raw.listenerRemoved===true,definitelyUndispatched:raw.ok===false&&raw.writeAttempted!==true&&raw.subscriptionSent!==true&&raw.listenerRemoved===true})
 }
 let joined=false
 let lease=await withLock('native-idle-'+key,async()=>{
  const previous=reconcile(current());if(reuse(previous)){joined=true;return previous}
  const notices=ensureDir(join(dir,'notices')),ns=lstatSync(notices);if(ns.isSymbolicLink()||!ns.isDirectory()||ns.uid!==process.getuid()||(ns.mode&0o077))fail('idle_observer_invalid','idle mailbox directory refused')
  let prepared,result
  try{result=await (deps.exchange??exchangeNativeIdle)(target,{timeoutSec,signal,onPublishing:metadata=>{
   const now=Date.now(),id=randomUUID();prepared={schemaVersion:1,id,epoch,phase:'publishing',createdAt:now,remoteExpiresAt:now+remoteTtl+10000,runtimeBuild:RUNTIME_BUILD,...metadata,evidence:join(dir,'observations',id+'.json'),...(metadata.helperPid?{mailbox:join(notices,id+'.json')}: {})};validateLease(prepared,epoch,path);save(prepared);return {mailbox:prepared.mailbox}
  }})}catch(e){if(!prepared)throw e;result={failureCategory:'idle_observer_unconfirmed'}}
  if(!prepared)fail('idle_observer_unavailable','idle subscription was not prepared')
  if(result?.serviceOwned){prepared.phase='pending_remote';prepared.publicationConfirmed=result.publicationConfirmed===true;save(prepared);return reconcile(prepared)}
  return finalize(prepared,result)
 },{timeoutMs:(timeoutSec+4)*1000,signal})
 // Never hold the epoch lock across caller waiting. Independent harnesses can
 // adopt the same eventual mailbox even if the publisher process disappears.
 const deadline=startedAt+timeoutSec*1000
 while(lease.mailbox&&lease.phase!=='received'&&!lease.mailboxConsumed&&Date.now()<deadline&&!signal?.aborted){
  await new Promise(resolve=>{const timer=setTimeout(done,Math.min(50,Math.max(1,deadline-Date.now())));function done(){clearTimeout(timer);signal?.removeEventListener('abort',done);resolve()}signal?.addEventListener('abort',done,{once:true})})
  if(!existsSync(lease.mailbox))continue
  lease=await withLock('native-idle-'+key,()=>{const row=current();if(row?.id!==lease.id)fail('idle_observer_invalid','idle observation ownership changed');return reconcile(row)},{timeoutMs:1000})
 }
 return {...summarizeIdleLease(lease,{notBefore,joined}),callerWait:lease.phase==='received'?'completed':signal?.aborted?'cancelled':'timed_out'}
}
