// Native deep-link recovery only. No Computer Use import or fallback.
import {resolve} from 'node:path'
import {DriverError,sleep} from './paths.mjs'

export function validateWarmBroker(info,record,brokerDir) {
 if(!info?.configured||!info.exists||!record)throw new DriverError('owned broker is missing',{category:'broker_missing'})
 if(record.sessionId!==info.sessionId||resolve(record.cwd||'/')!==resolve(brokerDir)||record.isArchived||
    record.permissionMode!=='bypassPermissions'||record.title!=='claude-driver-broker')
  throw new DriverError('warm recovery requires the existing approved broker in its service folder',{category:'broker_recovery_refused'})
}

// Only the exact owned query's numeric exit code leaves the native log reader.
export function nativeWarmFailure(lines,sessionId,{capped=false}={}) {
 const escaped=sessionId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
 const pattern=new RegExp(`Session ${escaped} query error: Claude Code process exited with code (\\d+)\\b`)
 for(const line of [...lines].reverse()) {
  const match=line.match(pattern),code=match&&Number(match[1])
  if(Number.isInteger(code)&&code>=0&&code<=255)return {reason:'app_query_exited',exitCode:code}
 }
 return {reason:capped?'governor_cap':'native_warm_spawn_unobserved'}
}

// Dependencies keep the boundary testable without app navigation. Production
// supplies only observation, a native link, and conditional focus restoration.
export async function warmOnlyRecovery({sessionId,timeoutMs=12000,signal},deps) {
 const check=()=>{if(signal?.aborted)throw new DriverError('warm recovery cancelled',{category:'cancelled'})}
 check();await deps.audit('before-warm-recovery');check()
 const before=await deps.snapshot(),start=Date.now()
 let result,failure
 try {
  check();await deps.open(sessionId)
  const deadline=Date.now()+timeoutMs
  while(Date.now()<deadline){
   check()
   const live=deps.live()
   if(live){result={method:'native_warm_spawn',live,ms:Date.now()-start,inputAutomation:false};break}
   if(deps.capped())break
   await sleep(150)
  }
  if(!result){
   check();const live=deps.live()
   if(live)result={method:'native_warm_spawn',live,ms:Date.now()-start,inputAutomation:false}
   else {
    const capped=deps.capped(),native=deps.failure?.()||{}
    throw new DriverError('Native broker navigation did not start a process; no keyboard fallback was attempted',{category:'broker_wake_required',detail:{inputAutomation:false,retrySafe:true,governorCapped:capped,reason:native.reason||(capped?'governor_cap':'native_warm_spawn_unobserved'),...(Number.isInteger(native.exitCode)?{exitCode:native.exitCode}:{})}})
   }
  }
 }catch(e){failure=e}
 finally {
  try {const action=await deps.restore(before,sessionId);if(result)result.focus=action}
  catch(e){failure??=e}
  try {await deps.audit('after-warm-recovery')}catch(e){failure=e}
 }
 if(failure)throw failure
 return result
}
