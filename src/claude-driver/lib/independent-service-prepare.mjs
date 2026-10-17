import {promisify} from 'node:util'
import {execFile} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {resolve,sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {getRecord} from './sessions.mjs'
import {peerRecord} from './peer-direct.mjs'
import {PROBE_DIR,loadRegistry} from './state.mjs'
import {independentServiceState} from './independent-service-result.mjs'
import {DriverError,versions} from './paths.mjs'
const exec=promisify(execFile)
export function independentPreparationAllowed({record,registered,peer,version,probeRoot,lifetimeSec,maxRequests}){
 return !!(record&&record.isArchived===false&&registered===true&&/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(record.sessionId||'')&&record.permissionMode==='bypassPermissions'&&typeof record.cwd==='string'&&record.cwd===resolve(record.cwd)&&record.cwd.startsWith(resolve(probeRoot)+sep)&&peer?.hostSessionId===record.sessionId&&peer.sessionId===record.sessionId?.replace(/^local_/,'')&&peer.cwd===record.cwd&&peer.entrypoint==='claude-desktop'&&!peer.spare&&!peer.parkedJobId&&peer.status==='idle'&&peer.version==='2.1.299'&&Number.isInteger(peer.pid)&&peer.pid>1&&typeof peer.procStart==='string'&&peer.procStart&&version?.app==='2.42304.0'&&version.cli==='2.1.299'&&Number.isInteger(lifetimeSec)&&lifetimeSec>=60&&lifetimeSec<=3600&&Number.isInteger(maxRequests)&&maxRequests>=1&&maxRequests<=128)
}
export async function prepareIndependentService(session,{lifetimeSec=300,maxRequests=8,signal,jobId}={}){
 const record=getRecord(session),peer=peerRecord(session)
 if(!independentPreparationAllowed({record,peer,registered:!!loadRegistry().sessions[session],version:versions(),probeRoot:PROBE_DIR,lifetimeSec,maxRequests})||jobId!==undefined&&!/^j[a-f0-9]{32}$/.test(jobId))throw new DriverError('independent preparation requires an idle driver-owned bypass scratch receiver',{category:'independent_service_prepare_refused',detail:{dispatched:false,retrySafe:true}})
 const serviceId=jobId?jobId.slice(1):randomUUID().replaceAll('-',''),state=independentServiceState(session,serviceId,record)
 try{const {stdout}=await exec(process.execPath,[fileURLToPath(new URL('../scripts/independent-service-prepare.mjs',import.meta.url)),session,serviceId,String(lifetimeSec),String(maxRequests),String(peer.pid),peer.procStart],{env:{...process.env,CLAUDE_DRIVER_STATE_DIR:state},signal,timeout:30000,maxBuffer:65536});return JSON.parse(stdout)}
 catch{throw new DriverError('independent preparation failed or was interrupted; inspect the original service namespace',{category:'independent_service_prepare_unresolved',detail:{serviceId,installed:false,settingsChanged:false,retrySafe:false}})}
}
