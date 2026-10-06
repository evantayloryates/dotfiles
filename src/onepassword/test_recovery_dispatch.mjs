import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {dispatchCodex,chooseModel,load,TITLE,ROOT} from './recovery-dispatch.mjs'
const catalog=[{model:'gpt-6-astra',supportedReasoningEfforts:[{reasoningEffort:'high'}]}]
function fixture(fail){
 const dir=mkdtempSync(join(tmpdir(),'op-dispatch-')),path=join(dir,'state.json'),calls=[]
 const peer={async request(method,args){calls.push({method,args});if(method===fail)throw Error('synthetic disconnect')
 switch(method){case'threadSection/list':return {data:[{id:'pin-uuid',name:'Pinned'}]};case'thread/read':return {thread:{status:{type:'notLoaded'}}};case'model/list':return {data:catalog};case'thread/list':return {data:[{id:'existing',name:TITLE,cwd:ROOT}]};case'thread/queue/add':return {queuedSubmission:{id:'queue'}};case'thread/queue/list':return {data:[{id:'queue',clientUserMessageId:load(path).requestId}]};default:return {}}}}
 return {path,calls,peer,cleanup:()=>rmSync(dir,{recursive:true,force:true})}
}
test('supported desktop models only',()=>{assert.equal(chooseModel(catalog),'gpt-6-astra');assert.throws(()=>chooseModel([{model:'gpt-tierC',supportedReasoningEfforts:[{reasoningEffort:'high'}]}]))})
test('reuse and queue readback; no resume or competing turn',async()=>{const f=fixture();try{const r=await dispatchCodex(f.peer,{},f.path,{kind:'app_locked'},{owner:async()=>true,openChat:()=>{}});assert.equal(r.status,'queued');assert.equal(r.queueVerified,true);assert.ok(f.calls.some(c=>c.method==='thread/section/move'));assert.ok(!f.calls.some(c=>['thread/resume','turn/start','thread/start','thread/queue/start'].includes(c.method)));await dispatchCodex(f.peer,load(f.path),f.path,{});assert.equal(f.calls.filter(c=>c.method==='thread/queue/add').length,1)}finally{f.cleanup()}})
for(const fail of ['thread/name/set','thread/section/move','thread/queue/add'])test('uncertain mutation not replayed: '+fail,async()=>{const f=fixture(fail);try{await assert.rejects(dispatchCodex(f.peer,{},f.path,{}));assert.equal(load(f.path).phase,'mutating');const count=f.calls.length;assert.equal((await dispatchCodex(f.peer,load(f.path),f.path,{})).status,'uncertain');assert.equal(f.calls.length,count)}finally{f.cleanup()}})
test('failed queue readback still retains accepted mutation',async()=>{const f=fixture('thread/queue/list');try{await assert.rejects(dispatchCodex(f.peer,{},f.path,{}));assert.equal(load(f.path).phase,'queued')}finally{f.cleanup()}})

test('two confirmed episodes reuse one chat and send fresh diagnostics',async()=>{const f=fixture();try{
 await dispatchCodex(f.peer,{},f.path,{episode:'first'},{owner:async()=>true,openChat:()=>{}})
 await dispatchCodex(f.peer,load(f.path),f.path,{episode:'first'},{owner:async()=>true,openChat:()=>{}})
 await dispatchCodex(f.peer,load(f.path),f.path,{episode:'second'},{owner:async()=>true,openChat:()=>{}})
 assert.equal(f.calls.filter(c=>c.method==='thread/queue/add').length,2)
 assert.equal(f.calls.filter(c=>c.method==='thread/list').length,1)
 assert.equal(load(f.path).threadId,'existing')
}finally{f.cleanup()}})
test('confirmed idle daemon chat starts its exact queued submission',async()=>{const f=fixture();const request=f.peer.request;f.peer.request=async(m,a)=>m==='thread/read'?{thread:{status:{type:'idle'}}}:request(m,a);try{const r=await dispatchCodex(f.peer,{},f.path,{episode:'first'},{owner:async()=>false,openChat:()=>{}});assert.equal(r.status,'started');assert.equal(f.calls.find(c=>c.method==='thread/queue/start').args.queuedSubmissionId,'queue')}finally{f.cleanup()}})
test('first-created chat: project, name, pin, high effort, verified queue, start',async()=>{const f=fixture();const original=f.peer.request;f.peer.request=async(m,a)=>{if(m==='thread/list'){f.calls.push({method:m,args:a});return {data:[]}}if(m==='project/list')return {data:[{id:'dotfiles',roots:[{path:ROOT}]}]};if(m==='thread/start'){f.calls.push({method:m,args:a});return {thread:{id:'new'}}};return original(m,a)};try{const r=await dispatchCodex(f.peer,{},f.path,{episode:'new'},{owner:async()=>true,openChat:()=>{}});assert.equal(r.status,'started');const start=f.calls.find(c=>c.method==='thread/start').args;assert.equal(start.projectId,'dotfiles');assert.equal(start.model,'gpt-6-astra');assert.equal(start.config.model_reasoning_effort,'high');assert.equal(f.calls.find(c=>c.method==='thread/section/move').args.sectionId,'pin-uuid')}finally{f.cleanup()}})
test('absolute symlink invocation executes the entry point',async()=>{const {symlinkSync}=await import('node:fs');const {execFileSync}=await import('node:child_process');const {fileURLToPath}=await import('node:url');const dir=mkdtempSync(join(tmpdir(),'op-entry-'));try{const link=join(dir,'dispatch.mjs');symlinkSync(fileURLToPath(new URL('./recovery-dispatch.mjs',import.meta.url)),link);assert.deepEqual(JSON.parse(execFileSync(process.execPath,[link,'--check-entry'],{encoding:'utf8'})),{entry:true})}finally{rmSync(dir,{recursive:true,force:true})}})
test('Claude quarantine refuses before all writes',async()=>{const {fallbackClaude}=await import('./recovery-dispatch.mjs');const f=fixture();try{const r=await fallbackClaude(f.path,{}, {uiPolicy:()=>({blocked:true}),runOp:()=>{throw Error('must not run')}});assert.equal(r.status,'unavailable');assert.deepEqual(load(f.path),{})}finally{f.cleanup()}})
test('Claude fallback explicitly configures model, pins before sending, reuses later',async()=>{const {fallbackClaude}=await import('./recovery-dispatch.mjs');const f=fixture(),calls=[];const deps={uiPolicy:()=>({blocked:false}),guideText:()=>{},DEFAULT_MODEL:'fixture-opus',runOp:async(op,args)=>{calls.push({op,args});return op==='create_session'?{sessionId:'local_fixture'}:op==='pin_session'?{verified:true}:{delivery:'queued'}}};try{assert.equal((await fallbackClaude(f.path,{episode:'first'},deps)).status,'claude_submitted');assert.deepEqual(calls.map(c=>c.op),['create_session','pin_session','send_message']);assert.equal(calls[0].args.model,'fixture-opus');assert.equal(calls[0].args.effort,'high');await fallbackClaude(f.path,{episode:'second'},deps);assert.equal(calls.filter(c=>c.op==='create_session').length,1)}finally{f.cleanup()}})
test('stdin and missing host entry paths can import without dispatch',async()=>{
 const {spawnSync}=await import('node:child_process')
 const dir=mkdtempSync(join(tmpdir(),'op-import-'))
 const moduleUrl=new URL('./recovery-dispatch.mjs',import.meta.url).href
 try{
  for(const entry of [undefined,join(dir,'missing.mjs')]){
   const input=`${entry?`process.argv[1]=${JSON.stringify(entry)};`:''}const m=await import(${JSON.stringify(moduleUrl)}); console.log(typeof m.dispatchCodex)`
   const result=spawnSync(process.execPath,['--input-type=module','-'],{input,encoding:'utf8',timeout:5000})
   assert.equal(result.status,0,result.stderr)
   assert.equal(result.stdout.trim(),'function')
  }
 }finally{rmSync(dir,{recursive:true,force:true})}
})
