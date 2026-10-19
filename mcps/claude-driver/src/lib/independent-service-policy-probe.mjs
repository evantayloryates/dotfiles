import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {writeFileSync} from 'node:fs'
import {STATE_DIR,ensureDir,writeJsonAtomic} from './state.mjs'
import {independentServiceState,independentServiceRequestId} from './independent-service-result.mjs'
import {getRecord} from './sessions.mjs'
import {DriverError} from './paths.mjs'
const exec=promisify(execFile)
export async function probeIndependentServicePolicy(session,serviceId,{jobId,timeoutMs=20000,signal}={}){
 if(!/^j[a-f0-9]{32}$/.test(jobId||'')||!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000)throw new DriverError('policy probe requires durable job and bounded timeout',{category:'bad_args'})
 const state=independentServiceState(session,serviceId,getRecord(session)),requestId=independentServiceRequestId(jobId),file=join(ensureDir(join(STATE_DIR,'independent-service-policy-probes')),requestId+'.json'),record={schemaVersion:1,jobId,sessionId:session,serviceId,requestId,at:Date.now(),state:'prepared',retrySafe:false}
 writeFileSync(file,JSON.stringify(record),{flag:'wx',mode:0o600})
 let reply
 try{const {stdout}=await exec(process.execPath,[fileURLToPath(new URL('../scripts/independent-service-policy-probe.mjs',import.meta.url)),session,serviceId,requestId,String(timeoutMs)],{env:{...process.env,CLAUDE_DRIVER_STATE_DIR:state},signal,timeout:timeoutMs+15000,maxBuffer:65536});reply=JSON.parse(stdout)}catch{writeJsonAtomic(file,{...record,state:'outcome_unknown'});throw new DriverError('policy probe worker lost; inspect original attempt, never replay',{category:'outcome_unknown',detail:{requestId,retrySafe:false}})}
 writeJsonAtomic(file,{...record,state:reply.ok?'verified':'unresolved',...reply.ok?{result:reply.result}:{error:reply.error}})
 if(!reply.ok)throw new DriverError('policy probe refused or unresolved; inspect original attempt',{category:'independent_service_policy_probe_unresolved',detail:{requestId,phase:reply.error?.phase,retrySafe:false}})
 return reply.result
}
