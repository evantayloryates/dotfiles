#!/usr/bin/env node
import {writeFileSync,readdirSync} from 'node:fs'
import {join} from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {BROKER_DIR,STATE_DIR,withLock,writeJsonAtomic} from '../lib/state.mjs'
import {loadIndependentServiceContext,independentJson as json,independentBytes as bytes} from '../lib/independent-service-context.mjs'
import {independentStopMatches,runIndependentQuiescence} from '../lib/independent-service-quiesce.mjs'
import {summarizeIndependentBudget} from '../lib/independent-service-status.mjs'
import {reviewIndependentAttempts} from '../lib/independent-service-attempts.mjs'
import {requireIndependentOfflineMutation} from '../lib/independent-offline-review.mjs'
const [session,serviceId,mode,receiverCwd]=process.argv.slice(2),offline=mode==='--offline',file=join(STATE_DIR,'quiescence.json'),stop=join(BROKER_DIR,'STOP'),hash=b=>createHash('sha256').update(b).digest('hex')
try{
 if(mode!==undefined&&!offline||receiverCwd!==undefined&&!offline||process.argv.slice(2).length>4)throw Error('quiescence mode')
 const context=async()=>{const c=await loadIndependentServiceContext(session,serviceId,offline?{offlineOnly:true,...receiverCwd?{historicalRecord:{sessionId:session,cwd:receiverCwd}}:{}}:{requireIdle:true});if(offline)requireIndependentOfflineMutation(c.pointer,session);return c}
 const result=await runIndependentQuiescence({lock:fn=>withLock('broker',fn,{timeoutMs:60000}),context,
 installStop:async c=>{
  if(offline)requireIndependentOfflineMutation(c.pointer,session)
  let prior;try{prior=json(file)}catch(e){if(e.code!=='ENOENT')throw e}
  if(prior){const marker=json(stop);if(prior.schemaVersion!==1||prior.serviceId!==serviceId||prior.sessionId!==session||!independentStopMatches(marker,{serviceId,pointer:c.pointer})||prior.stopSha256!==hash(bytes(stop)))throw Error('foreign stop');return}
  // Existing STOP without our durable intent is preserved and refused.
  try{bytes(stop);throw Error('existing stop')}catch(e){if(e.code!=='ENOENT')throw e}
  const marker={schemaVersion:1,kind:'independent-service-quiesce',serviceId,...Object.fromEntries(['sessionId','build','generation','pid','procStart'].map(k=>[k,c.pointer[k]])),at:Date.now(),nonce:randomUUID()},body=JSON.stringify(marker)+'\n',ledger={schemaVersion:1,serviceId,sessionId:session,phase:'before-stop',at:Date.now(),stopSha256:hash(body)}
  writeFileSync(file,JSON.stringify(ledger),{flag:'wx',mode:0o600});writeFileSync(stop,body,{flag:'wx',mode:0o600});writeJsonAtomic(file,{...ledger,phase:'stopped'})
 },
 review:async c=>{
  const marker=json(stop),ledger=json(file);if(!independentStopMatches(marker,{serviceId,pointer:c.pointer})||ledger.stopSha256!==hash(bytes(stop)))throw Error('stop changed')
  const slots=Array.from({length:c.config.maxRequests},(_,slot)=>{try{return c.read('../native-service-budget-'+serviceId+'-'+slot+'.json')}catch(e){if(e.code!=='ENOENT')throw e;return null}}),budget=summarizeIndependentBudget(c.config,slots),attempts=reviewIndependentAttempts({context:c,reservedRequestIds:budget.reservedRequestIds,names:readdirSync(BROKER_DIR)})
  const result={serviceId,sessionId:session,admissionStopped:true,stopOwnerVerified:true,quiescent:attempts.terminalAttemptReviewComplete, ...attempts,nativeEpoch:{pid:c.pointer.pid,procStart:c.pointer.procStart},...offline?{offline:true,previousPidObservedAbsent:true}:{},nativeUnloadQualified:false,processRetired:false,automaticResume:false}
  if(offline)requireIndependentOfflineMutation(c.pointer,session)
  writeJsonAtomic(file,{...ledger,phase:result.quiescent?'quiescent':'stopped-unresolved',reviewedAt:Date.now(),result});return result
 }})
 console.log(JSON.stringify(result))
}catch{console.error('independent quiescence refused; preserve STOP and quiescence record');process.exitCode=1}
