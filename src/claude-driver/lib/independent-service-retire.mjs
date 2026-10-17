import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
import {getRecord} from './sessions.mjs'
import {independentServiceState} from './independent-service-result.mjs'
import {DriverError} from './paths.mjs'
import {retainIndependentGenerationLocator} from './independent-service-index.mjs'
const exec=promisify(execFile)
export async function retireIndependentService(session,serviceId,{signal}={}){
 const record=getRecord(session),state=independentServiceState(session,serviceId,record)
 try{const {stdout}=await exec(process.execPath,[fileURLToPath(new URL('../scripts/independent-service-retire.mjs',import.meta.url)),session,serviceId],{env:{...process.env,CLAUDE_DRIVER_STATE_DIR:state},signal,timeout:65000,maxBuffer:65536});const result=JSON.parse(stdout),after=getRecord(session);if(result.filesRetired!==true||result.serviceId!==serviceId||result.sessionId!==session||after?.cwd!==record.cwd||after.sessionId!==session)throw Error('retirement identity changed');retainIndependentGenerationLocator({session,serviceId,receiverCwd:record.cwd,origin:'verified-retirement'});return result}
 catch{throw new DriverError('independent retirement refused or interrupted; preserve STOP and reconcile the original module and retirement record',{category:'independent_service_retire_unresolved',detail:{serviceId,retrySafe:false}})}
}
