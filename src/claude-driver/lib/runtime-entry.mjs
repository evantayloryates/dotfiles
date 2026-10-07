// Installed as a separately hashed, sealed bootstrap. Built-ins only: a
// cached workspace command must not import mutable service dependencies.
import {createHash} from 'node:crypto'
import {lstatSync,readFileSync,readdirSync,realpathSync,writeFileSync,renameSync} from 'node:fs'
import {dirname,join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const hex=/^[a-f0-9]{64}$/
const hash=x=>createHash('sha256').update(x).digest('hex')
const refuse=()=>{throw new Error('pinned broker runtime failed integrity admission; no work claimed')}
function owned(path,dir=false){const s=lstatSync(path);if(s.isSymbolicLink()||s.uid!==process.getuid()||(dir?!s.isDirectory():!s.isFile())||s.mode&0o222)refuse();return s}
export async function runPinnedEntry({dir,kind}) {
 if(!['broker-wait','broker-check'].includes(kind))refuse()
 const pointerFile=join(dir,'runtime.json'),s=lstatSync(pointerFile)
 if(s.isSymbolicLink()||!s.isFile()||s.uid!==process.getuid()||s.size>1024*1024)refuse()
 const pointer=JSON.parse(readFileSync(pointerFile,'utf8'))
 if(pointer.schemaVersion!==1||!hex.test(pointer.build)||!hex.test(pointer.bootstrapHash))refuse()
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
 for(const folder of ['lib','scripts'])for(const name of readdirSync(join(root,folder)))if(name.endsWith('.mjs')||name.endsWith('.swift'))runtimeFiles.push(folder+'/'+name)
 const fingerprint=createHash('sha256');for(const file of runtimeFiles.sort())fingerprint.update(file).update('\0').update(readFileSync(join(root,file))).update('\0')
 if(fingerprint.digest('hex')!==pointer.build)refuse()
 const script=join(root,'scripts',kind+'.mjs')
 if(realpathSync(process.argv[1])===realpathSync(script))refuse() // snapshot scripts enter directly, never recurse
 process.env.CLAUDE_DRIVER_STATE_DIR=state
 // Native receipt + completed entry, bound to generation and PID, is evidence
 // of execution. Selection alone is explicitly not a completion/readiness claim.
 function observe(phase){const file=join(dir,kind+(phase==='selected'?'-entry-selected.json':'-entry.json')),tmp=file+'.'+process.pid+'.tmp';writeFileSync(tmp,JSON.stringify({build:pointer.build,bootstrapHash:pointer.bootstrapHash,generation:pointer.generation,pid:process.pid,at:Date.now(),script,phase,...(kind==='broker-check'?{requestId:process.argv[2]}:{})}),{mode:0o600});renameSync(tmp,file)}
 observe('selected')
 await import(pathToFileURL(script).href)
 observe('completed')
}
