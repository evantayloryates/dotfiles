import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
import {getRecord} from './sessions.mjs'
import {independentServiceState} from './independent-service-result.mjs'
import {DriverError} from './paths.mjs'
import {readIndependentGenerationLocator} from './independent-service-index.mjs'
const exec=promisify(execFile)
export async function quiesceIndependentService(session,serviceId,{signal,offline=false}={}){
 if(typeof offline!=='boolean')throw new DriverError('invalid offline mode',{category:'bad_args'})
 const located=offline?readIndependentGenerationLocator(session,serviceId):null
 const state=independentServiceState(session,serviceId,located?.record??getRecord(session))
 try{const {stdout}=await exec(process.execPath,[fileURLToPath(new URL('../scripts/independent-service-quiesce.mjs',import.meta.url)),session,serviceId,...offline?['--offline',...(located?[located.record.cwd]:[])]:[]],{env:{...process.env,CLAUDE_DRIVER_STATE_DIR:state},signal,timeout:65000,maxBuffer:65536});return JSON.parse(stdout)}
 catch{throw new DriverError('independent quiescence refused or interrupted; inspect original STOP and quiescence record, never clear automatically',{category:'independent_service_quiesce_unresolved',detail:{serviceId,retrySafe:false}})}
}
export function independentStopMatches(marker,{serviceId,pointer}){
 return !!(marker&&Object.keys(marker).sort().join(',')==='at,build,generation,kind,nonce,pid,procStart,schemaVersion,serviceId,sessionId'&&marker.schemaVersion===1&&marker.kind==='independent-service-quiesce'&&marker.serviceId===serviceId&&['build','generation','pid','procStart','sessionId'].every(k=>marker[k]===pointer[k])&&Number.isSafeInteger(marker.at)&&marker.at>=Date.parse(pointer.activatedAt)&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(marker.nonce||''))
}
// The same broker lock covers the entire native read transaction. Do not place
// STOP until that transaction exits, and do not release until post-STOP review.
export async function runIndependentQuiescence(d){
 return d.lock(async()=>{const context=await d.context();await d.installStop(context);return d.review(await d.context())})
}
