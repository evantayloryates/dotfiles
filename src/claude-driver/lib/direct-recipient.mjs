// Internal candidate only. Explicit single-publication send; no broker wake,
// native controls, inference fallback, immediate priority or permission changes.
import {createHash} from 'node:crypto'
import {realpathSync} from 'node:fs'
import {resolveSession,callerHostSession} from './sessions.mjs'
import {brokerInfo} from './broker.mjs'
import {peerRecord,deliver} from './peer-direct.mjs'
import {armPeerSend,inspectPeerSend,reconcilePeerSend} from './peer-send-ledger.mjs'
import {withSessionControl} from './controls.mjs'
import {runtimeState} from './build.mjs'
import {DriverError,sleep} from './paths.mjs'
const unknown=id=>new DriverError('direct recipient publication uncertain; reconcile without replay',{category:'outcome_unknown',detail:{operationId:id,retrySafe:false}})
export async function sendDirectRecipient({operationId,session,message,timeoutMs=15000},{signal}={}){
 if(typeof message!=='string'||!message||Buffer.byteLength(message)>65536||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>60000||typeof operationId!=='string'||! /^[A-Za-z0-9_-]{1,100}$/.test(operationId))throw new DriverError('invalid direct recipient request',{category:'bad_args'})
 const rec=resolveSession(session),deadline=Date.now()+timeoutMs,payloadDigest=createHash('sha256').update(message).digest('hex')
 if([brokerInfo().sessionId,callerHostSession()].includes(rec.sessionId))throw new DriverError('refusing direct send to broker or caller',{category:'gate'})
 const remaining=()=>Math.max(1,deadline-Date.now())
 const check=()=>{if(signal?.aborted)throw new DriverError('direct send cancelled before publication',{category:'cancelled',detail:{dispatched:false,retrySafe:true}});if(Date.now()>=deadline)throw new DriverError('direct send deadline expired before publication',{category:'cli_timeout',detail:{dispatched:false,retrySafe:true}});if(runtimeState().restartRequired)throw new DriverError('direct send source changed; reconnect before publication',{category:'runtime_stale',detail:{dispatched:false,retrySafe:true}})}
 try{return await withSessionControl(rec.sessionId,async()=>{
  let armed=false,reused=false
  try{
   const old=await inspectPeerSend(operationId,{timeoutMs:remaining()})
   armed=!!old
   check()
   if(old){if(old.target.hostSessionId!==rec.sessionId||old.payloadDigest!==payloadDigest)throw unknown(operationId);armed=true;reused=true}
   else {
    check();const current=resolveSession(rec.sessionId)
    if(current.isArchived)throw new DriverError('direct recipient is archived',{category:'bad_state',detail:{dispatched:false,retrySafe:true}})
    const peer=peerRecord(rec.sessionId)
    if(!peer||peer.entrypoint!=='claude-desktop'||peer.sessionId!==(current.cliSessionId||rec.sessionId.slice(6)))throw new DriverError('direct recipient native identity unavailable',{category:'peer_unqualified',detail:{dispatched:false,retrySafe:true}})
    if(realpathSync(peer.cwd)!==realpathSync(current.cwd))throw new DriverError('direct recipient cwd identity mismatch',{category:'peer_refused',detail:{dispatched:false,retrySafe:true}})
    const wakeSignal=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(remaining())])
    await deliver({sessionId:rec.sessionId,permissionMode:current.permissionMode,live:{pid:peer.pid,procStart:peer.procStart}},message,{signal:wakeSignal,timeoutMs:remaining(),onPrepared:async meta=>{
     check();if(meta.pid!==peer.pid||meta.procStart!==peer.procStart)throw unknown(operationId)
     const result=await armPeerSend({operationId,rec:peer,messageId:meta.msgId,payloadDigest},{signal:wakeSignal,timeoutMs:remaining()})
     armed=true;if(!result.canPublish)throw unknown(operationId)
     // Once armed, any crash/cancel/deadline is persistent uncertainty, even
     // when this process knows it has not yet written the socket frame.
     check()
    }})
   }
   do{
    if(signal?.aborted)throw unknown(operationId)
    const out=await reconcilePeerSend(operationId,{signal,timeoutMs:remaining()})
    if(out.record.phase==='received')return {operationId,transport:'peer-direct',delivery:'received',...out.record.receipt,reused}
    if(Date.now()>=deadline)break
    await sleep(Math.min(50,Math.max(1,deadline-Date.now())))
   }while(Date.now()<deadline)
   throw unknown(operationId)
  }catch(e){if(armed)throw unknown(operationId);throw e}
 },{signal,timeoutMs:remaining()})}catch(e){
  try{if(await inspectPeerSend(operationId))throw unknown(operationId)}catch{throw unknown(operationId)}
  throw e
 }
}
