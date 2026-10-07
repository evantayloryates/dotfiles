// Installed as a separately hashed, sealed bootstrap. Built-ins only: a
// cached workspace command must not import mutable service dependencies.
import {execFileSync} from 'node:child_process'
import {homedir} from 'node:os'
import {createHash} from 'node:crypto'
import {constants,openSync,closeSync,fstatSync,lstatSync,readFileSync,readdirSync,realpathSync,writeFileSync,renameSync} from 'node:fs'
import {dirname,join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const hex=/^[a-f0-9]{64}$/
const hash=x=>createHash('sha256').update(x).digest('hex')
const refuse=()=>{throw new Error('pinned broker runtime failed integrity admission; no work claimed')}
function owned(path,dir=false){const s=lstatSync(path);if(s.isSymbolicLink()||s.uid!==process.getuid()||(dir?!s.isDirectory():!s.isFile())||s.mode&0o222)refuse();return s}
function nativeBinding(pointer,dir) {
 // Legacy releases are preserved for controlled handoff. They must not produce
 // current-epoch qualification in a new host merely from an old entry record.
 if(!Object.hasOwn(pointer,'procStart'))return null
 if(typeof pointer.procStart!=='string'||!pointer.procStart)refuse()
 if(!Number.isInteger(pointer.pid)||pointer.pid<=0||typeof pointer.sessionId!=='string')refuse()
 const peers=process.env.CLAUDE_DRIVER_PEER_SESSIONS_DIR||join(process.env.CLAUDE_CONFIG_DIR||join(homedir(),'.claude'),'sessions')
 let fd,record
 try {
  fd=openSync(join(peers,pointer.pid+'.json'),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
  const stat=fstatSync(fd);if(!stat.isFile()||stat.uid!==process.getuid()||stat.size>65536)refuse()
  const bytes=readFileSync(fd);if(bytes.length>65536)refuse();record=JSON.parse(bytes.toString('utf8'))
 }catch{refuse()}finally{if(fd!==undefined)closeSync(fd)}
 if(record.pid!==pointer.pid||record.procStart!==pointer.procStart||record.hostSessionId!==pointer.sessionId||record.sessionId!==pointer.sessionId.replace(/^local_/, '')||record.entrypoint!=='claude-desktop'||record.spare||record.parkedJobId||resolve(record.cwd||'/')!==resolve(dir))refuse()
 let cursor=process.ppid
 for(let hop=0;hop<24&&cursor>1;hop++){
  let line
  try{line=execFileSync('/bin/ps',['-p',String(cursor),'-o','ppid=','-o','lstart='],{encoding:'utf8',timeout:1000,env:{PATH:'/usr/bin:/bin',LC_ALL:'C',TZ:'UTC'}}).trim()}catch{refuse()}
  const match=line.match(/^(\d+)\s+(.+)$/);if(!match)refuse()
  if(cursor===pointer.pid){if(match[2]!==pointer.procStart)refuse();return {brokerPid:pointer.pid,brokerProcStart:pointer.procStart,brokerSessionId:pointer.sessionId,ancestorVerified:true}}
  const parent=Number(match[1]);if(parent===cursor)refuse();cursor=parent
 }
 refuse()
}
export function admitPinnedEntry({dir,kind,script:loadedScript}={}) {
 if(!['broker-wait','broker-check'].includes(kind))refuse()
 const pointerFile=join(dir,'runtime.json'),s=lstatSync(pointerFile)
 if(s.isSymbolicLink()||!s.isFile()||s.uid!==process.getuid()||s.size>1024*1024)refuse()
 const pointer=JSON.parse(readFileSync(pointerFile,'utf8'))
 if(pointer.schemaVersion!==1||!hex.test(pointer.build)||!hex.test(pointer.bootstrapHash)||!Number.isInteger(pointer.generation)||pointer.generation<1||!Number.isFinite(Date.parse(pointer.activatedAt)))refuse()
 const state=dirname(resolve(dir)),releases=join(state,'releases'),root=join(releases,pointer.build)
 if(lstatSync(releases).isSymbolicLink()||realpathSync(root)!==join(realpathSync(state),'releases',pointer.build))refuse()
 owned(root,true);owned(join(root,'release.json'))
 const manifest=JSON.parse(readFileSync(join(root,'release.json'),'utf8')),files={}
 function visit(folder,prefix=''){
  owned(folder,true)
  for(const name of readdirSync(folder).sort()){
   const file=join(folder,name),rel=prefix+name,st=lstatSync(file)
   if(st.isDirectory())visit(file,rel+'/')
   else {owned(file);if(st.size>4*1024*1024||Object.keys(files).length>=256)refuse();if(rel!=='release.json')files[rel]=hash(readFileSync(file))}
  }
 }
 visit(root)
 if(manifest.schemaVersion!==1||manifest.build!==pointer.build||JSON.stringify(Object.entries(files).sort())!==JSON.stringify(Object.entries(manifest.files||{}).sort()))refuse()
 const runtimeFiles=['server.mjs','cli.mjs','broker-template/CLAUDE.md']
 for(const folder of ['lib','scripts'])for(const name of readdirSync(join(root,folder)))if(name.endsWith('.mjs')||name.endsWith('.swift')||name.endsWith('.py'))runtimeFiles.push(folder+'/'+name)
 const fingerprint=createHash('sha256');for(const file of runtimeFiles.sort())fingerprint.update(file).update('\0').update(readFileSync(join(root,file))).update('\0')
 if(fingerprint.digest('hex')!==pointer.build)refuse()
 const script=join(root,'scripts',kind+'.mjs')
 if(loadedScript!==undefined&&realpathSync(loadedScript)!==realpathSync(script))refuse()
 process.env.CLAUDE_DRIVER_STATE_DIR=state
 // Native receipt + completed entry, bound to generation and PID, is evidence
 // of execution. Selection alone is explicitly not a completion/readiness claim.
 function observe(phase){const binding=nativeBinding(pointer,dir);const file=join(dir,kind+(phase==='selected'?'-entry-selected.json':'-entry.json')),tmp=file+'.'+process.pid+'.tmp';writeFileSync(tmp,JSON.stringify({build:pointer.build,bootstrapHash:pointer.bootstrapHash,generation:pointer.generation,pid:process.pid,nativeBinding:binding,at:Date.now(),script,phase,...(kind==='broker-check'?{requestId:process.argv[2],index:Number(process.argv[3])}:{})}),{mode:0o600});renameSync(tmp,file)}
 observe('selected')
 return {script,complete:()=>observe('completed')}
}
export async function runPinnedEntry({dir,kind}) {
 const admission=admitPinnedEntry({dir,kind})
 if(realpathSync(process.argv[1])===realpathSync(admission.script))refuse() // direct scripts use admission without self-import
 await import(pathToFileURL(admission.script).href)
 admission.complete()
}
