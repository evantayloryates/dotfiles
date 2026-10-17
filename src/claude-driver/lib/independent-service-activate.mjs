import {lstatSync} from 'node:fs'
import {promisify} from 'node:util'
import {execFile} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {getRecord} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {PROBE_DIR,loadRegistry,withLock} from './state.mjs'
import {DriverError,versions} from './paths.mjs'
import {independentServiceState} from './independent-service-result.mjs'
import {independentPreparationAllowed} from './independent-service-prepare.mjs'
const exec=promisify(execFile)
export async function activateIndependentService(session,serviceId,{signal}={}){
 return withLock('independent-activation-'+session,async()=>{
  const record=getRecord(session),peer=peerRecord(session)
  if(!independentPreparationAllowed({record,peer,registered:!!loadRegistry().sessions[session],version:versions(),probeRoot:PROBE_DIR,lifetimeSec:300,maxRequests:8}))throw new DriverError('activation requires an idle owned bypass scratch receiver',{category:'independent_service_activate_refused'})
  const state=independentServiceState(session,serviceId,record)
  try{const {stdout}=await exec(process.execPath,[fileURLToPath(new URL('../scripts/independent-service-activate.mjs',import.meta.url)),session,serviceId,String(peer.pid),peer.procStart],{env:{...process.env,CLAUDE_DRIVER_STATE_DIR:state},signal,timeout:30000,maxBuffer:65536});return JSON.parse(stdout)}
  catch(error){const phase=/refused at ([a-z-]+);/.exec(String(error.stderr??''))?.[1]??'unobserved';throw new DriverError('independent activation refused or interrupted; inspect the original activation record before any retry',{category:'independent_service_activate_unresolved',detail:{serviceId,phase,retrySafe:false}})}
 },{timeoutMs:5000,signal})
}
// No retries or rollback across publication uncertainty. Each phase is durable
// before its effect, so a failed job is inspected rather than silently replayed.
export async function runIndependentActivation({guard,record,policy,pointer,settings,publish,verify}){
 for(const [phase,effect]of [['policy',policy],['pointer',pointer],['settings',settings],['publish',publish]]){
  await guard();await record('before-'+phase);await effect();await record('after-'+phase)
 }
 await guard();const result=await verify();await record('installed');return result
}

export function independentPathPresent(path){try{lstatSync(path);return true}catch(error){if(error.code==='ENOENT')return false;throw error}}
