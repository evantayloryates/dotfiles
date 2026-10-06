import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,symlinkSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {spawnSync,execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {dispatchCodex,chooseModel,load,prompt,fallbackClaude,ROOT} from './recovery-dispatch.mjs'
import {reserve} from './autofix.mjs'
const catalog=[{model:'gpt-6-astra',supportedReasoningEfforts:[{reasoningEffort:'high'}]}]
function fixture(fail){
 const dir=mkdtempSync(join(tmpdir(),'op-dispatch-')),path=join(dir,'state.json'),calls=[]
 const incident=reserve({base:dir,date:new Date('2026-10-06T21:17:00Z')})
 const initial={incidentDir:incident.dir,threadId:'existing'}
 const deps={base:dir,date:new Date('2026-10-06T21:17:00Z'),owner:async()=>true,openChat:()=>{}}
 const peer={async request(method,args){calls.push({method,args});if(method===fail)throw Error('synthetic disconnect')
 switch(method){
  case'threadSection/list':return {data:[{id:'pin-uuid',name:'Pinned'}]}
  case'thread/read':return {thread:{status:{type:'notLoaded'}}}
  case'model/list':return {data:catalog}
  case'thread/list':return {data:[]}
  case'project/list':return {data:[{id:'dotfiles',roots:[{path:ROOT}]}]}
  case'thread/start':return {thread:{id:'new'},approvalPolicy:'never'}
  case'thread/queue/add':return {queuedSubmission:{id:'queue'}}
  case'thread/queue/list':return {data:[{id:'queue',clientUserMessageId:load(path).requestId}]}
  default:return {}
 }}}
 return {dir,path,calls,peer,initial,incident,deps,cleanup:()=>rmSync(dir,{recursive:true,force:true})}
}
test('supported desktop models only',()=>{assert.equal(chooseModel(catalog),'gpt-6-astra');assert.throws(()=>chooseModel([{model:'gpt-tierC',supportedReasoningEfforts:[{reasoningEffort:'high'}]}]))})
test('reuse active incident and read queue back without competing turn',async()=>{const f=fixture();try{
 const r=await dispatchCodex(f.peer,f.initial,f.path,{kind:'app_locked'},f.deps)
 assert.equal(r.status,'queued');assert.equal(r.queueVerified,true)
 assert.ok(!f.calls.some(c=>['thread/resume','turn/start','thread/start','thread/queue/start'].includes(c.method)))
 assert.equal(f.calls.find(c=>c.method==='thread/settings/update').args.approvalPolicy,'never')
 await dispatchCodex(f.peer,load(f.path),f.path,{},f.deps)
 assert.equal(f.calls.filter(c=>c.method==='thread/queue/add').length,1)
}finally{f.cleanup()}})
for(const fail of ['thread/name/set','thread/section/move','thread/settings/update','thread/queue/add'])test('uncertain mutation never replays: '+fail,async()=>{const f=fixture(fail);try{
 await assert.rejects(dispatchCodex(f.peer,f.initial,f.path,{},f.deps))
 assert.equal(load(f.path).phase,'mutating');const count=f.calls.length
 assert.equal((await dispatchCodex(f.peer,load(f.path),f.path,{},f.deps)).status,'uncertain');assert.equal(f.calls.length,count)
}finally{f.cleanup()}})
test('failed readback retains accepted queue',async()=>{const f=fixture('thread/queue/list');try{await assert.rejects(dispatchCodex(f.peer,f.initial,f.path,{},f.deps));assert.equal(load(f.path).phase,'queued')}finally{f.cleanup()}})
test('later episodes reuse unsettled incidents; settled incidents get a fresh chat',async()=>{const f=fixture();try{
 await dispatchCodex(f.peer,f.initial,f.path,{episode:'first'},f.deps)
 await dispatchCodex(f.peer,load(f.path),f.path,{episode:'first'},f.deps)
 await dispatchCodex(f.peer,load(f.path),f.path,{episode:'second'},f.deps)
 assert.equal(f.calls.filter(c=>c.method==='thread/queue/add').length,2)
 assert.equal(f.calls.filter(c=>c.method==='thread/start').length,0)
 writeFileSync(join(f.incident.dir,'report.json'),'{}')
 writeFileSync(join(f.incident.dir,'artifacts/check.json'),'{}')
 const sha256=createHash('sha256').update('{}').digest('hex')
 writeFileSync(join(f.incident.dir,'settled.json'),JSON.stringify({reportSha256:sha256,artifacts:[{name:'artifacts/check.json',sha256}]}))
 await dispatchCodex(f.peer,load(f.path),f.path,{episode:'second'},f.deps)
 assert.equal(f.calls.filter(c=>c.method==='thread/queue/add').length,2)
 await dispatchCodex(f.peer,load(f.path),f.path,{episode:'third'},f.deps)
 assert.equal(f.calls.filter(c=>c.method==='thread/start').length,1)
 assert.notEqual(load(f.path).incidentDir,f.incident.dir)
 assert.equal(load(f.path).threadId,'new')
}finally{f.cleanup()}})
test('unowned idle chat starts the exact queued submission',async()=>{const f=fixture();try{
 const r=await dispatchCodex(f.peer,f.initial,f.path,{episode:'first'},{...f.deps,owner:async()=>false})
 assert.equal(r.status,'started');assert.equal(f.calls.find(c=>c.method==='thread/queue/start').args.queuedSubmissionId,'queue')
}finally{f.cleanup()}})
test('legacy maintenance chat is not renamed or archived; new incident has project/model/pin/no approval',async()=>{const f=fixture();try{
 const r=await dispatchCodex(f.peer,{threadId:'maintenance'},f.path,{episode:'new'},f.deps)
 assert.equal(r.status,'started');const start=f.calls.find(c=>c.method==='thread/start').args
 assert.equal(start.projectId,'dotfiles');assert.equal(start.model,'gpt-6-astra');assert.equal(start.config.model_reasoning_effort,'high');assert.equal(start.approvalPolicy,'never')
 assert.equal(f.calls.find(c=>c.method==='thread/section/move').args.sectionId,'pin-uuid')
 assert.equal(f.calls.find(c=>c.method==='thread/name/set').args.name,'⚙️ fix-1p-broker/oct-06-5.17p')
 assert.ok(!f.calls.some(c=>c.args.threadId==='maintenance'))
}finally{f.cleanup()}})
test('policy rejection stops before queue or inference',async()=>{const f=fixture();const original=f.peer.request;f.peer.request=async(m,a)=>m==='thread/start'?{thread:{id:'new'},approvalPolicy:'on-request'}:original(m,a);try{
 await assert.rejects(dispatchCodex(f.peer,{},f.path,{},f.deps),/policy not confirmed/)
 assert.equal(load(f.path).threadId,'new');assert.ok(!f.calls.some(c=>c.method==='thread/queue/add'))
}finally{f.cleanup()}})
test('repair prompt includes standing authorization, reports and native self archive',()=>{
 const p=prompt({}, {title:'fixture',dir:'/fixture'})
 for(const part of ['Do not ask for a second click','set_thread_archived','summary.html','summary.md','agent docs','ready for the next service load','Touch ID/macOS consent'])assert.ok(p.includes(part),part)
})
test('symlink entry executes, stdin and missing importing host do not dispatch',()=>{
 const dir=mkdtempSync(join(tmpdir(),'op-entry-')),url=new URL('./recovery-dispatch.mjs',import.meta.url)
 try{
  const link=join(dir,'dispatch.mjs');symlinkSync(fileURLToPath(url),link)
  assert.deepEqual(JSON.parse(execFileSync(process.execPath,[link,'--check-entry'],{encoding:'utf8'})),{entry:true})
  for(const entry of [undefined,join(dir,'missing.mjs')]){
   const input=`${entry?`process.argv[1]=${JSON.stringify(entry)};`:''}const m=await import(${JSON.stringify(url.href)}); console.log(typeof m.dispatchCodex)`
   const result=spawnSync(process.execPath,['--input-type=module','-'],{input,encoding:'utf8',timeout:5000})
   assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'function')
  }
 }finally{rmSync(dir,{recursive:true,force:true})}
})
test('Claude quarantine refuses before all writes',async()=>{const f=fixture();try{assert.equal((await fallbackClaude(f.path,{}, {uiPolicy:()=>({blocked:true}),runOp:()=>{throw Error('must not run')}})).status,'unavailable');assert.deepEqual(load(f.path),{})}finally{f.cleanup()}})
test('Claude fallback configures, pins, reuses an unsettled dated incident',async()=>{const f=fixture(),calls=[];const deps={base:f.dir,uiPolicy:()=>({blocked:false}),guideText:()=>{},DEFAULT_MODEL:'fixture-opus',runOp:async(op,args)=>{calls.push({op,args});return op==='create_session'?{sessionId:'local_fixture'}:op==='pin_session'?{verified:true}:{delivery:'queued'}}};try{
 assert.equal((await fallbackClaude(f.path,{episode:'first'},deps)).status,'claude_submitted')
 assert.deepEqual(calls.map(c=>c.op),['create_session','pin_session','send_message']);assert.equal(calls[0].args.model,'fixture-opus');assert.equal(calls[0].args.effort,'high');assert.match(calls[0].args.title,/^⚙️ fix-1p-broker\//)
 await fallbackClaude(f.path,{episode:'second'},deps);assert.equal(calls.filter(c=>c.op==='create_session').length,1)
}finally{f.cleanup()}})
