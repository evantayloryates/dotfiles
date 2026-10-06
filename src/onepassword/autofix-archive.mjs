// Fallback for generated daemon chats without desktop native tools. Never
// interrupts a turn; only archives a verified, settled, pushed incident.
import {readFileSync,realpathSync,mkdirSync,writeFileSync,renameSync} from 'node:fs'
import {join,dirname,relative,sep} from 'node:path'
import {homedir} from 'node:os'
import {fileURLToPath} from 'node:url'
import {spawn,execFileSync} from 'node:child_process'
import {connect,ROOT} from './recovery-dispatch.mjs'
import {BASE,incidentAt,settled} from './autofix.mjs'
const cache=join(homedir(),'Library/Caches/com.taylor.op-keepalive/archives')
function validate(dir,base=BASE){
 dir=realpathSync(dir);base=realpathSync(base)
 const rel=relative(base,dir)
 if(!rel||rel.startsWith('..')||rel.includes(sep))throw Error('Not a direct autofix incident')
 const incident=incidentAt(dir)
 if(!/^[0-9a-f-]{36}$/.test(incident.threadId)||incident.title!==`⚙️ fix-1p-broker/${rel}`)throw Error('Generated incident identity missing')
 if(!settled(dir))throw Error('Incident is not verifiably settled')
 return incident
}
function gitReady(){
 const git=(...args)=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:15000}).trim()
 if(git('status','--porcelain'))return false
 const head=git('rev-parse','HEAD')
 return git('branch','--show-current')==='master'&&git('ls-remote','origin','refs/heads/master').split(/\s/)[0]===head
}
export async function archiveOnce(dir,{base=BASE,peer,ready=gitReady}={}){
 const incident=validate(dir,base),call=(m,p)=>peer.request(m,p,{timeoutMs:10000})
 const archived=async()=>{
  let cursor=null
  for(let i=0;i<20;i++){
   const r=await call('thread/list',{archived:true,searchTerm:incident.title,limit:100,cursor,useStateDbOnly:true,sourceKinds:['cli','vscode','appServer','exec']})
   if(r.data.some(t=>t.id===incident.threadId))return true
   if(!r.nextCursor)return false
   cursor=r.nextCursor
  }
  throw Error('Archive readback scan exceeded bound')
 }
 if(await archived())return {status:'archived',threadId:incident.threadId,alreadyArchived:true}
 const read=async()=>{
  const r=await call('thread/read',{threadId:incident.threadId,includeTurns:true}),t=r.thread
  if(t.name!==incident.title||![ROOT,realpathSync(ROOT)].includes(t.cwd))throw Error('Chat identity differs from incident')
  const latest=t.turns?.at(-1)
  return latest?.status==='completed'?t.status?.type:'active'
 }
 if(!['idle','notLoaded'].includes(await read()))return {status:'waiting_for_turn'}
 if(!ready())return {status:'waiting_for_commit_push'}
 if(!['idle','notLoaded'].includes(await read()))return {status:'waiting_for_turn'}
 await call('thread/archive',{threadId:incident.threadId})
 return {status:await archived()?'archived':'archive_unconfirmed',threadId:incident.threadId}
}
function receipt(id,row){mkdirSync(cache,{recursive:true,mode:0o700});const path=join(cache,id+'.json'),tmp=path+'.tmp';writeFileSync(tmp,JSON.stringify({...row,at:new Date().toISOString()})+'\n',{mode:0o600});renameSync(tmp,path)}
export function schedule(dir){
 const incident=validate(dir)
 if(!gitReady())throw Error('Commit and push all changes before scheduling archive')
 const worker=spawn(process.execPath,[fileURLToPath(import.meta.url),'finish',incident.dir],{detached:true,stdio:'ignore'})
 worker.unref()
 return {status:'archive_scheduled',threadId:incident.threadId,receipt:join(cache,incident.threadId+'.json')}
}
async function finish(dir){
 const incident=validate(dir),deadline=Date.now()+300000
 let peer
 try{
  peer=await connect()
  while(Date.now()<deadline){
   const result=await archiveOnce(dir,{peer});receipt(incident.threadId,result)
   if(!result.status.startsWith('waiting_'))return result
   await new Promise(r=>setTimeout(r,3000))
  }
  receipt(incident.threadId,{status:'timed_out',threadId:incident.threadId})
 }catch{receipt(incident.threadId,{status:'failed',threadId:incident.threadId})}
 finally{peer?.close()}
}
function isEntry(){try{return process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)}catch{return false}}
if(isEntry()){
 try{
  if(process.argv[2]==='schedule')console.log(JSON.stringify(schedule(process.argv[3])))
  else if(process.argv[2]==='finish')await finish(process.argv[3])
  else throw Error('Usage: autofix-archive.mjs schedule <incident-directory>')
 }catch(e){console.error(e.message);process.exitCode=1}
}
