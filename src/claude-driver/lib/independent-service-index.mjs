import {constants,openSync,closeSync,fstatSync,readSync,lstatSync,mkdirSync,writeFileSync} from 'node:fs'
import {join,resolve,sep} from 'node:path'
import {STATE_DIR,PROBE_DIR} from './state.mjs'
import {independentServiceState} from './independent-service-location.mjs'
const INDEX_DIR=join(STATE_DIR,'independent-service-generations')
const dirOwned=dir=>{const s=lstatSync(dir);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid())throw Error('generation index directory')}
export function validateIndependentGenerationLocator(row,{session,serviceId,probeRoot=PROBE_DIR}){
 if(!row||Object.keys(row).sort().join(',')!=='createdAt,jobId,kind,origin,receiverCwd,schemaVersion,serviceId,sessionId,state'||row.schemaVersion!==1||row.kind!=='independent-generation-locator'||row.sessionId!==session||row.serviceId!==serviceId||!['preparation-intent','verified-retirement'].includes(row.origin)||!Number.isSafeInteger(row.createdAt)||row.createdAt<0||row.jobId!==null&&!/^j[a-f0-9]{32}$/.test(row.jobId))throw Error('generation locator shape')
 if(typeof row.receiverCwd!=='string'||row.receiverCwd!==resolve(row.receiverCwd)||!row.receiverCwd.startsWith(resolve(probeRoot)+sep))throw Error('generation locator scope')
 const record={sessionId:session,cwd:row.receiverCwd},state=independentServiceState(session,serviceId,record)
 if(row.state!==state)throw Error('generation locator namespace')
 return {record,state,origin:row.origin,indexed:true}
}
export function readIndependentGenerationLocator(session,serviceId,{dir=INDEX_DIR,probeRoot=PROBE_DIR}={}){
 // Validate IDs before using any filename. Never scan for a similar identity.
 independentServiceState(session,serviceId,{sessionId:session,cwd:resolve(probeRoot)})
 try{dirOwned(dir)}catch(e){if(e.code==='ENOENT')return null;throw e}
 let fd
 try{fd=openSync(join(dir,serviceId+'.json'),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)}catch(e){if(e.code==='ENOENT')return null;throw e}
 try{const before=fstatSync(fd);if(!before.isFile()||before.uid!==process.getuid()||before.size>4096)throw Error('generation locator file');const b=Buffer.alloc(before.size);let offset=0;while(offset<b.length){const n=readSync(fd,b,offset,b.length-offset,offset);if(!n)throw Error('generation locator changed');offset+=n}const after=fstatSync(fd);if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)throw Error('generation locator changed');return validateIndependentGenerationLocator(JSON.parse(b.toString('utf8')),{session,serviceId,probeRoot})}finally{closeSync(fd)}
}
export function retainIndependentGenerationLocator({session,serviceId,receiverCwd,origin,jobId=null},{dir=INDEX_DIR,probeRoot=PROBE_DIR}={}){
 const row={schemaVersion:1,kind:'independent-generation-locator',sessionId:session,serviceId,receiverCwd,state:independentServiceState(session,serviceId,{sessionId:session,cwd:receiverCwd}),origin,jobId,createdAt:Date.now()},expected=validateIndependentGenerationLocator(row,{session,serviceId,probeRoot}),prior=readIndependentGenerationLocator(session,serviceId,{dir,probeRoot})
 if(prior){if(prior.state!==expected.state||prior.record.cwd!==receiverCwd)throw Error('generation locator conflict');return {...prior,reused:true}}
 mkdirSync(dir,{recursive:true,mode:0o700});dirOwned(dir)
 try{writeFileSync(join(dir,serviceId+'.json'),JSON.stringify(row)+'\n',{flag:'wx',mode:0o600})}catch(e){if(e.code!=='EEXIST')throw e;const raced=readIndependentGenerationLocator(session,serviceId,{dir,probeRoot});if(raced?.state!==expected.state)throw Error('generation locator race');return {...raced,reused:true}}
 return {...expected,reused:false}
}
