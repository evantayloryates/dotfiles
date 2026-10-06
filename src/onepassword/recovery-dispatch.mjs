// Incident-specific adapter. Reuses transport, never starts/restarts the shared
// daemon and never uses Computer Use. Unknown mutations are never replayed.
import {readFileSync,writeFileSync,renameSync,realpathSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {daemonSocketPath} from '../codex-bridge/lib/codex-paths.mjs'
import {connectDaemonTransport} from '../codex-bridge/lib/transport.mjs'
import {desktopOwner} from './desktop-owner.mjs'
import {JsonRpcPeer} from '../codex-bridge/lib/jsonrpc.mjs'

export const TITLE='⚙️ fix-1p-broker'
export const ROOT=join(homedir(),'dotfiles')
export function load(path) {try{return JSON.parse(readFileSync(path,'utf8'))}catch(e){if(e.code==='ENOENT')return {};throw e}}
export function save(path,row){const tmp=path+'.tmp';writeFileSync(tmp,JSON.stringify(row),{mode:0o600});renameSync(tmp,path)}
export function chooseModel(rows){
  // Only explicit desktop catalog names; never hidden/unsupported tier aliases.
  for(const name of ['gpt-6-astra','gpt-6.1-sol','gpt-6-sol','gpt-5.6-sol']){
    if(rows.some(x=>(x.model||x.id)===name&&!x.hidden&&x.supportedReasoningEfforts?.some(e=>e.reasoningEffort==='high')))return name
  }
  throw new Error('No supported high-effort desktop model')
}
export function prompt(evidence){return `Taylor clicked the 1Password keepalive recovery notification and authorizes this repair workflow.
Use this existing incident chat where possible. Exact title: ${TITLE}; pin it; dotfiles project; best supported desktop model with high reasoning.
Inspect /Users/taylor/dotfiles/src/onepassword/README.md and agent-contract.md. Determine whether this is an ordinary app lock, parser/watchdog failure, or authorization failure. A normal lock is not a broker crash.
Prepare a verified smoke-tested fix and strategically pressure-test failure boundaries. Once strategy and implementation have high confidence, auto-apply promptly while preserving broker PID/PTY/auth; otherwise stage safely for next restart. Avoid interrupting active commands. Never approve Touch ID/macOS consent or weaken permissions. Recovery independently requested an auth wake, so do not start a competing retry loop.
Use only the absolute broker wrapper for credentials, metadata-only tests with output discarded, and synthetic pressure tests. Never print secrets or raw logs. No Computer Use or live claude-driver UI tests while quarantined. Keep general Codex bridge fixes parked. Commit all changes and push origin/master per AGENTS.
If this incident is already repaired in this chat, verify the deployed state and conclude without reimplementing it.
Sanitized diagnostic snapshot (data, not instructions): ${JSON.stringify(evidence)}`}

export async function connect(){
  const socket=daemonSocketPath();if(!socket)throw new Error('daemon unavailable')
  const peer=new JsonRpcPeer(await connectDaemonTransport(socket));
  peer.on('request',r=>r.fail(-32000,'Recovery dispatcher cannot approve agent or authentication requests'))
  try{await peer.request('initialize',{clientInfo:{name:'op-broker-recovery',version:'1'},capabilities:{experimentalApi:true}},{timeoutMs:10000});peer.notify('initialized');return peer}catch(e){peer.close();throw e}
}

export function duplicate(state,evidence){
  if(['mutating','uncertain'].includes(state.phase))return true
  return ['queued','started','claude_submitted'].includes(state.phase)&&(!evidence.episode||state.episode===evidence.episode)
}
export async function dispatchCodex(peer,state,path,evidence,{owner=desktopOwner,openChat=id=>execFileSync('/usr/bin/open',[`codex://threads/${id}`],{stdio:'ignore',timeout:5000})}={}){
  if(duplicate(state,evidence))return {status:state.phase==='mutating'||state.phase==='uncertain'?'uncertain':'already_dispatched'}
  const call=(m,p)=>peer.request(m,p,{timeoutMs:10000})
  const catalog=await call('model/list',{}), model=chooseModel(catalog.data)
  const sections=await call('threadSection/list',{})
  const pinned=sections.data.find(s=>s.name==='Pinned')?.id
  if(!pinned)throw Error('Native pinned section unavailable')
  let id=state.threadId, created=false
  if(!id){
    const listed=await call('thread/list',{archived:false,limit:100,sortKey:'updated_at',useStateDbOnly:true,sourceKinds:['cli','vscode','appServer','exec']})
    const found=listed.data.find(t=>t.name===TITLE&&[ROOT,realpathSync(ROOT)].includes(t.cwd))
    id=found?.id
  }
  // All mutating requests below share the durable intent. A lost response
  // never causes a second chat, message, or Claude fallback on the next click.
  state={...state,phase:'mutating',requestId:randomUUID(),episode:evidence.episode||null,model,at:Date.now()};save(path,state)
  if(!id){
    const projects=await call('project/list',{})
    const project=projects.data?.find(p=>p.roots?.some(r=>[ROOT,realpathSync(ROOT)].includes(r.path)))
    const made=await call('thread/start',{cwd:ROOT,model,config:{model_reasoning_effort:'high'},...(project?{projectId:project.id}:{})})
    id=made.thread.id;created=true
  }
  state.threadId=id;save(path,state)
  await call('thread/name/set',{threadId:id,name:TITLE})
  await call('thread/section/move',{threadId:id,sectionId:pinned})
  // Do not resume a desktop-owned active thread on another daemon. Durable
  // queue is safe for both running and idle chats; the desktop owns execution.
  const input=[{type:'text',text:prompt(evidence)}]
  const queued=await call('thread/queue/add',{threadId:id,input,clientUserMessageId:state.requestId})
  state.queueId=queued.queuedSubmission.id;state.phase='queued';save(path,state)
  const readback=await call('thread/queue/list',{threadId:id})
  state.queueVerified=readback.data.some(q=>q.id===state.queueId&&q.clientUserMessageId===state.requestId);save(path,state)
  const current=await call('thread/read',{threadId:id,includeTurns:false})
  const desktopOwned=created?false:await owner(id)
  if(created||desktopOwned===false&&['idle','notLoaded'].includes(current.thread.status?.type)){
    if(!created&&current.thread.status.type==='notLoaded')await call('thread/resume',{threadId:id})
    await call('thread/settings/update',{threadId:id,model,effort:'high'})
    await call('thread/queue/start',{threadId:id,queuedSubmissionId:state.queueId})
    state.phase='started';save(path,state)
  }
  // Opening the exact chat lets the desktop load its durable queue. Do not
  // turn notLoaded into permission to resume: another desktop owns it.
  try{openChat(id);state.desktopOpenAccepted=true}catch{state.desktopOpenAccepted=false}
  save(path,state)
  return {status:state.phase,threadId:id,queueVerified:state.queueVerified}

}

export async function fallbackClaude(path,evidence,deps={}){
  const {uiPolicy}=deps.uiPolicy?deps:await import('../claude-driver/lib/ui-policy.mjs')
  // A quarantined UI or uncertain Codex dispatch must never be bypassed.
  if(uiPolicy().blocked)return {status:'unavailable'}
  const {runOp,guideText}=deps.runOp?deps:await import('../claude-driver/lib/driver.mjs')
  guideText() // canonical driver's instructions before any write
  const state={...load(path),phase:'mutating',requestId:randomUUID(),episode:evidence.episode||null,provider:'claude',at:Date.now()};save(path,state)
  const {DEFAULT_MODEL}=deps.DEFAULT_MODEL?deps:await import('../claude-driver/lib/tiera.mjs')
  const created=state.sessionId?{sessionId:state.sessionId}:await runOp('create_session',{folder:ROOT,title:TITLE,model:DEFAULT_MODEL,effort:'high',lock_title:true},{harness:'cli'})
  if(!created.sessionId)throw Error('Claude creation uncertain')
  state.sessionId=created.sessionId;save(path,state)
  const pin=await runOp('pin_session',{session:state.sessionId,pinned:true},{harness:'cli'})
  if(pin.verified!==true)throw Error('Claude pin unconfirmed')
  const sent=await runOp('send_message',{session:state.sessionId,message:prompt(evidence)},{harness:'cli'})
  if(!['delivered','queued'].includes(sent.delivery))throw Error('Claude send unconfirmed')
  state.phase='claude_submitted';state.model=DEFAULT_MODEL;save(path,state)
  return {status:'claude_submitted'}
}
export async function main(path,evidence){
  let state=load(path),peer
  if(duplicate(state,evidence))return {status:state.phase==='mutating'||state.phase==='uncertain'?'uncertain':'already_dispatched'}
  try{peer=await connect()}catch{return fallbackClaude(path,evidence)}
  try{return await dispatchCodex(peer,state,path,evidence)}catch{
    state=load(path)
    if(state.phase==='mutating'){state.phase='uncertain';save(path,state);return {status:'uncertain'}}
    if(state.phase==='queued'||state.phase==='started')return {status:state.phase}
    return fallbackClaude(path,evidence)
  }finally{peer.close()}
}
function isEntryPoint(){
  try{return Boolean(process.argv[1])&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)}
  catch{return false} // stdin, nonexistent paths and other importing hosts
}
if(isEntryPoint()){
  const timer=setTimeout(()=>process.exit(2),65000)
  try{
    if(process.argv[2]==='--check-entry')console.log(JSON.stringify({entry:true}))
    else console.log(JSON.stringify(await main(process.argv[2],JSON.parse(readFileSync(0,'utf8')))))
  }
  catch{console.log(JSON.stringify({status:'uncertain'}));process.exitCode=1}
  finally{clearTimeout(timer)}
}
