import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
import {getRecord} from './sessions.mjs'
import {independentServiceState} from './independent-service-result.mjs'
import {DriverError} from './paths.mjs'
const exec=promisify(execFile)
export async function retireIndependentService(session,serviceId,{signal}={}){
 const state=independentServiceState(session,serviceId,getRecord(session))
 try{const {stdout}=await exec(process.execPath,[fileURLToPath(new URL('../scripts/independent-service-retire.mjs',import.meta.url)),session,serviceId],{env:{...process.env,CLAUDE_DRIVER_STATE_DIR:state},signal,timeout:65000,maxBuffer:65536});return JSON.parse(stdout)}
 catch{throw new DriverError('independent retirement refused or interrupted; preserve STOP and reconcile the original module and retirement record',{category:'independent_service_retire_unresolved',detail:{serviceId,retrySafe:false}})}
}
