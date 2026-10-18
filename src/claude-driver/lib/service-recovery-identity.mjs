// Immutable identity evidence, not authority to import, raise permissions,
// transfer service roles or replay work after an app record disappears.
import {createHash} from 'node:crypto'
import {constants,openSync,closeSync,fstatSync,readFileSync,writeFileSync,mkdirSync,lstatSync} from 'node:fs'
import {dirname,join,resolve,sep} from 'node:path'
import {STATE_DIR,PROBE_DIR} from './state.mjs'
const sid=/^local_[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,hex=/^[a-f0-9]{64}$/
const root=join(STATE_DIR,'service-recovery-identities')
export function validateServiceRecoveryIdentity(row,{session,serviceId,probeRoot=PROBE_DIR}={}){
 if(!row||Object.keys(row).sort().join(',')!=='capturedAt,cliSessionId,cwd,jobId,permissionMode,schemaVersion,serviceId,sessionId,storeHash'||row.schemaVersion!==1||!sid.test(session||'')||row.sessionId!==session||!/^[a-f0-9]{32}$/.test(serviceId||'')||row.serviceId!==serviceId||row.cliSessionId!==session.slice(6)||typeof row.cwd!=='string'||row.cwd!==resolve(row.cwd)||!row.cwd.startsWith(resolve(probeRoot)+sep)||row.permissionMode!=='bypassPermissions'||!hex.test(row.storeHash||'')||!Number.isSafeInteger(row.capturedAt)||row.capturedAt<0||row.jobId!==null&&row.jobId!=='j'+serviceId)throw Error('service recovery identity unqualified')
 return row
}
function ownedDir(dir){const st=lstatSync(dir);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid())throw Error('recovery identity directory unqualified')}
export function readServiceRecoveryIdentity(session,serviceId,{dir=root,probeRoot=PROBE_DIR}={}){
 if(!sid.test(session||'')||!/^[a-f0-9]{32}$/.test(serviceId||''))throw Error('exact recovery identity required')
 try{ownedDir(dir)}catch(e){if(e.code==='ENOENT')return null;throw e}
 let fd;try{fd=openSync(join(dir,serviceId+'.json'),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)}catch(e){if(e.code==='ENOENT')return null;throw e}
 try{const before=fstatSync(fd);if(!before.isFile()||before.uid!==process.getuid()||before.mode&0o077||before.size>8192)throw Error('recovery identity file unqualified');const bytes=readFileSync(fd),after=fstatSync(fd);if(bytes.length>8192||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)throw Error('recovery identity changed');return validateServiceRecoveryIdentity(JSON.parse(bytes),{session,serviceId,probeRoot})}finally{closeSync(fd)}
}
export function retainServiceRecoveryIdentity(record,{serviceId,jobId=null},{dir=root,probeRoot=PROBE_DIR,now=Date.now()}={}){
 if(typeof record?._file!=='string'||record._file!==resolve(record._file)||!record._file.endsWith('/'+record.sessionId+'.json'))throw Error('saved service account identity unavailable')
 const row=validateServiceRecoveryIdentity({schemaVersion:1,sessionId:record.sessionId,serviceId,jobId,cwd:record.cwd,cliSessionId:record.cliSessionId,permissionMode:record.permissionMode,storeHash:createHash('sha256').update(dirname(record._file)).digest('hex'),capturedAt:now},{session:record.sessionId,serviceId,probeRoot})
 mkdirSync(dir,{recursive:true,mode:0o700});ownedDir(dir)
 const same=prior=>JSON.stringify({...prior,capturedAt:0})===JSON.stringify({...row,capturedAt:0})
 const prior=readServiceRecoveryIdentity(row.sessionId,serviceId,{dir,probeRoot});if(prior){if(!same(prior))throw Error('recovery identity conflict');return {retained:true,reused:true}}
 try{writeFileSync(join(dir,serviceId+'.json'),JSON.stringify(row)+'\n',{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST')throw e;const raced=readServiceRecoveryIdentity(row.sessionId,serviceId,{dir,probeRoot});if(!same(raced))throw Error('recovery identity race')}
 return {retained:true,reused:false}
}
