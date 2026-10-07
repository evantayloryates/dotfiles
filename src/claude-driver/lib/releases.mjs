// Sealed broker dependency snapshots. This is deployment isolation, not a
// hostile-user security boundary: the owning user can change file permissions.
import {createHash,randomUUID} from 'node:crypto'
import {constants,openSync,closeSync,fstatSync,chmodSync,copyFileSync,existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,realpathSync,renameSync,rmSync,writeFileSync} from 'node:fs'
import {dirname,join,resolve,sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {runtimeFingerprint} from './build.mjs'
import {BROKER_DIR,STATE_DIR,ensureDir,withLock,writeJsonAtomic} from './state.mjs'
import {DriverError} from './paths.mjs'

const SOURCE=dirname(dirname(fileURLToPath(import.meta.url)))
const RELEASES=join(STATE_DIR,'releases')
export const RUNTIME_POINTER=join(BROKER_DIR,'runtime.json')
export const HANDOFF_OWNER='claude-driver-qualified-runtime-handoff'
const roots=['server.mjs','cli.mjs','broker-template','lib','scripts','docs']
const hex=/^[a-f0-9]{64}$/
const fail=()=>{throw new DriverError('broker release integrity check failed; preserve STOP and reconcile runtime.json',{category:'broker_runtime_invalid'})}
function present(path){try{lstatSync(path);return true}catch(e){if(e.code==='ENOENT')return false;throw e}}
function owned(path,{sealed=false,directory=false}={}) {
 const stat=lstatSync(path)
 if(stat.isSymbolicLink()||stat.uid!==process.getuid()||(directory?!stat.isDirectory():!stat.isFile())||sealed&&(stat.mode&0o222))fail()
 return stat
}
function inventory(root,{sealed=false}={}) {
 const out={}
 function visit(dir,prefix='') {
  owned(dir,{sealed,directory:true})
  for(const name of readdirSync(dir).sort()) {
   const rel=prefix+name,path=join(dir,name),stat=lstatSync(path)
   if(stat.isDirectory())visit(path,rel+'/')
   else {
    owned(path,{sealed})
    if(rel==='release.json')continue
    if(stat.size>4*1024*1024||Object.keys(out).length>=256)fail()
    out[rel]=createHash('sha256').update(readFileSync(path)).digest('hex')
   }
  }
 }
 visit(root);return out
}
function json(path){if(owned(path).size>1024*1024)fail();return JSON.parse(readFileSync(path,'utf8'))}
export function validateRelease(build) {
 try {
  if(!hex.test(build))fail()
  owned(STATE_DIR,{directory:true});owned(RELEASES,{directory:true})
  const root=join(RELEASES,build)
  owned(root,{sealed:true,directory:true})
  if(realpathSync(root)!==join(realpathSync(STATE_DIR),'releases',build))fail()
  owned(join(root,'release.json'),{sealed:true})
  const manifest=json(join(root,'release.json')),files=inventory(root,{sealed:true})
  if(manifest.schemaVersion!==1||manifest.build!==build||!manifest.files||
     JSON.stringify(Object.entries(files).sort())!==JSON.stringify(Object.entries(manifest.files).sort())||
     runtimeFingerprint(root)!==build)fail()
  for(const file of ['scripts/broker-wait.mjs','scripts/broker-check.mjs','broker-template/CLAUDE.md'])if(!files[file])fail()
  const template=readFileSync(join(root,'broker-template/CLAUDE.md'),'utf8')
  const protocol=Number(template.match(/^Protocol version: (\d+)/m)?.[1])
  if(!Number.isInteger(protocol)||protocol<1)fail()
  return {build,root,protocol,manifest}
 }catch{fail()}
}
export function activeRelease() {
 // An invalid existing pointer must never silently select mutable source.
 if(!present(RUNTIME_POINTER))return null
 try {
  const pointer=json(RUNTIME_POINTER)
  if(pointer.schemaVersion!==1||!hex.test(pointer.build)||!Number.isInteger(pointer.generation)||pointer.generation<1)fail()
  if(Object.hasOwn(pointer,'procStart')&&(typeof pointer.procStart!=='string'||!pointer.procStart||!Number.isInteger(pointer.pid)||pointer.pid<=0||typeof pointer.sessionId!=='string'))fail()
  if(!hex.test(pointer.bootstrapHash))fail()
  const entry=join(STATE_DIR,'entry',pointer.bootstrapHash+'.mjs')
  owned(join(STATE_DIR,'entry'),{directory:true});owned(entry,{sealed:true})
  if(createHash('sha256').update(readFileSync(entry)).digest('hex')!==pointer.bootstrapHash)fail()
  return {...validateRelease(pointer.build),pointer}
 }catch{fail()}
}
export function releaseStatus() {
 try {const active=activeRelease();return active?{pinned:true,integrity:true,build:active.build,bootstrapHash:active.pointer.bootstrapHash,protocol:active.protocol,generation:active.pointer.generation,previousBuild:active.pointer.previousBuild??null,nativePathsVerified:false}:{pinned:false,integrity:true,build:null,nativePathsVerified:false}}
 catch{return {pinned:present(RUNTIME_POINTER),integrity:false,build:null,nativePathsVerified:false}}
}
// Executed-entry observations are useful only for the native process which
// owns this activation. Old unbound pointers retain integrity, not live proof.
export function loadEntryEvidence(path) {
 let fd
 try{
  fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
  const stat=fstatSync(fd);if(!stat.isFile()||stat.uid!==process.getuid()||stat.size>65536)return null
  const bytes=readFileSync(fd);if(bytes.length>65536)return null
  return JSON.parse(bytes.toString('utf8'))
 }catch{return null}finally{if(fd!==undefined)closeSync(fd)}
}
export function entryEpochEvidence({pointer,runtime,live,entries,sessionId,brokerDir,now=Date.now()}) {
 const no=reason=>({verified:false,reason})
 if(typeof pointer?.procStart!=='string'||!pointer.procStart)return no('activation-epoch-unbound')
 if(!live||live.entrypoint!=='claude-desktop'||pointer.pid!==live.pid||pointer.procStart!==live.procStart||pointer.sessionId!==sessionId)return no('native-process-epoch-mismatch')
 const activated=Date.parse(pointer.activatedAt)
 if(!Number.isFinite(activated)||!Array.isArray(entries)||entries.length!==2)return no('entry-evidence-unavailable')
 for(let i=0;i<2;i++){
  const entry=entries[i],binding=entry?.nativeBinding
  if(entry?.build!==runtime.build||entry.bootstrapHash!==runtime.bootstrapHash||entry.generation!==runtime.generation||entry.phase!=='completed'||!Number.isFinite(entry.at)||entry.at<activated||entry.at>now||entry.script!==join(brokerDir,'..','releases',runtime.build,'scripts',i===0?'broker-wait.mjs':'broker-check.mjs'))return no('entry-evidence-mismatch')
  if(!binding?.ancestorVerified||binding.brokerPid!==pointer.pid||binding.brokerProcStart!==pointer.procStart||binding.brokerSessionId!==sessionId)return no('entry-native-epoch-unbound')
 }
 return {verified:true,reason:'completed-entries-bound-to-current-native-epoch'}
}
function installBootstrap() {
 const body=readFileSync(join(SOURCE,'lib','runtime-entry.mjs')),hash=createHash('sha256').update(body).digest('hex')
 const dir=join(STATE_DIR,'entry');ensureDir(dir);owned(dir,{directory:true})
 const path=join(dir,hash+'.mjs')
 if(present(path)){owned(path,{sealed:true});if(createHash('sha256').update(readFileSync(path)).digest('hex')!==hash)fail()}
 else {writeFileSync(path,body,{mode:0o444})}
 return hash
}
export async function stageRelease({evidence=[]}={}) {
 if(!Array.isArray(evidence)||evidence.some(x=>typeof x!=='string'||!resolve(x).startsWith(resolve(STATE_DIR,'pressure')+sep)))throw new DriverError('release evidence must reference local pressure artifacts',{category:'bad_args'})
 return withLock('release-stage',()=>{
  ensureDir(RELEASES);owned(STATE_DIR,{directory:true});owned(RELEASES,{directory:true});const build=runtimeFingerprint(),target=join(RELEASES,build)
  if(present(target)){const release=validateRelease(build);return {build,root:release.root,reused:true,active:false}}
  const temp=join(RELEASES,`.stage-${randomUUID()}`);mkdirSync(temp,{mode:0o700})
  try {
   function copy(src,dst) {
    const stat=owned(src,{directory:lstatSync(src).isDirectory()})
    if(stat.isDirectory()){mkdirSync(dst,{mode:0o700});for(const name of readdirSync(src))copy(join(src,name),join(dst,name))}
    else copyFileSync(src,dst)
   }
   for(const name of roots)copy(join(SOURCE,name),join(temp,name))
   const files=inventory(temp)
   if(runtimeFingerprint()!==build||runtimeFingerprint(temp)!==build)throw new DriverError('source changed during release staging',{category:'runtime_stale'})
   writeFileSync(join(temp,'release.json'),JSON.stringify({schemaVersion:1,build,createdAt:new Date().toISOString(),status:'staged-not-active',scope:'broker wait/check dependency snapshot; host MCP launcher is not installed',source:SOURCE,files,evidence},null,2),{mode:0o600})
   function seal(path){const stat=lstatSync(path);if(stat.isDirectory()){for(const name of readdirSync(path))seal(join(path,name));chmodSync(path,0o555)}else chmodSync(path,0o444)}
   seal(temp);renameSync(temp,target);validateRelease(build)
   return {build,root:target,reused:false,active:false}
  }catch(e){if(existsSync(temp)){function unseal(path){const stat=lstatSync(path);if(stat.isDirectory()){chmodSync(path,0o700);for(const name of readdirSync(path))unseal(join(path,name))}else chmodSync(path,0o600)}unseal(temp);rmSync(temp,{recursive:true,force:true})}throw e}
 })
}

// Called only under the broker lifecycle lock, after exact native admission.
// A crash between pointer and instructions remains stopped. Current clients
// reject the owned handoff STOP instead of clearing it on request admission.
export function commitRelease(build,{sessionId,pid,procStart,nonce},render) {
 if(!Number.isInteger(pid)||pid<=0||typeof procStart!=='string'||!procStart||typeof sessionId!=='string'||!/^local_[a-f0-9-]{36}$/.test(sessionId)||typeof nonce!=='string'||!nonce||nonce.length>128)throw new DriverError('release activation requires native PID and start epoch',{category:'broker_handoff_refused'})
 const release=validateRelease(build),prior=activeRelease()
 const before=existsSync(RUNTIME_POINTER)?readFileSync(RUNTIME_POINTER):null
 const instructions=join(BROKER_DIR,'CLAUDE.md'),oldText=existsSync(instructions)?readFileSync(instructions):null
 try {
  writeJsonAtomic(RUNTIME_POINTER,{schemaVersion:1,build,bootstrapHash:installBootstrap(),previousBuild:prior?.build??null,generation:(prior?.pointer.generation??0)+1,activatedAt:new Date().toISOString(),sessionId,pid,procStart,handoffNonce:nonce})
  writeFileSync(instructions,render(),{mode:0o600})
 }catch(e){
  if(before)writeFileSync(RUNTIME_POINTER,before,{mode:0o600});else rmSync(RUNTIME_POINTER,{force:true})
  if(oldText)writeFileSync(instructions,oldText,{mode:0o600});else rmSync(instructions,{force:true})
  throw e
 }
 return {build:release.build,previousBuild:prior?.build??null,pid,stopped:true,nativePathsVerified:false}
}
