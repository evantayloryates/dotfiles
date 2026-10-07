import {test,after} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,appendFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const root=mkdtempSync(join(tmpdir(),'native-receipt-'))
process.env.CLAUDE_DRIVER_APP_SUPPORT=join(root,'app')
process.env.CLAUDE_DRIVER_PROJECTS_DIR=join(root,'projects')
const {NativeReceipts,observeNativeReceipts}=await import('../lib/native-receipts.mjs')
const request={id:'fixture-request',ops:[{op:'send_message',args:{session_id:'local_owned',message:'synthetic 🐈'}}]}
const row=(type,b)=>({type,message:{content:[b]}})
const check=row('assistant',{type:'tool_use',id:'check',name:'Bash',input:{command:'/node /driver/scripts/broker-check.mjs fixture-request 0 --dir "/state/broker"'}})
const checked=row('user',{type:'tool_result',tool_use_id:'check',content:JSON.stringify({dispatch:true,...request.ops[0]})})
const native=row('assistant',{type:'tool_use',id:'native',name:'mcp__ccd_session_mgmt__send_message',input:request.ops[0].args})
const result=row('user',{type:'tool_result',tool_use_id:'native',content:[{type:'text',text:'delivery: queued'}]})
const sequence=[check,checked,native,result]
test('raw native output is correlated to checkpoint and identical arguments',()=>{
 const c=new NativeReceipts(request);for(const r of sequence)c.feed(r)
 assert.equal(c.receipt().source,'native-tool-result');assert.equal(c.receipt().results[0].result,'delivery: queued')
 assert.equal(c.receipt().results[0].nativeToolUseId,'native')
})
test('batched checkpoint output correlates each exact operation without accepting denied entries',()=>{
 const req={id:request.id,ops:[request.ops[0],{op:'set_session_effort',args:{session_id:'local_owned',effort:'low'}}]}
 const batched=row('assistant',{type:'tool_use',id:'batch',name:'Bash',input:{command:req.ops.map((_,i)=>`node broker-check.mjs ${req.id} ${i} --dir /state`).join(' && ')}})
 for(const allowed of [true,false]){
  const c=new NativeReceipts(req);c.feed(batched)
  c.feed(row('user',{type:'tool_result',tool_use_id:'batch',content:req.ops.map((o,i)=>JSON.stringify({dispatch:i===0||allowed,...o})).join('\n')}))
  for(const r of [native,result,row('assistant',{type:'tool_use',id:'effort',name:'mcp__ccd_session_mgmt__set_session_effort',input:req.ops[1].args}),row('user',{type:'tool_result',tool_use_id:'effort',content:'effort: low'})])c.feed(r)
  assert.equal(!!c.receipt(),allowed)
  assert.equal(c.results.has(0),true)
 }
})
test('wrong recipient, denied checkpoint, unrelated result and relay paraphrases cannot settle',()=>{
 for(const mutation of [s=>s[1].message.content[0].content=JSON.stringify({dispatch:false,...request.ops[0]}),s=>s[2].message.content[0].input.session_id='local_other',s=>s[3].message.content[0].tool_use_id='other',s=>s[0].message.content[0].input.command='/node broker-check.mjs other-request 0 --dir /state']){
  const s=structuredClone(sequence);mutation(s);const c=new NativeReceipts(request);for(const r of s)c.feed(r)
  c.feed(row('assistant',{type:'text',text:'Delivered'}));assert.equal(c.receipt(),null)
 }
})
test('native error result remains a failure and thinking never enters receipts',()=>{
 const s=structuredClone(sequence);s[3].message.content[0].is_error=true
 const c=new NativeReceipts(request);c.feed(row('assistant',{type:'thinking',thinking:'PRIVATE'}));for(const r of s)c.feed(r)
 assert.equal(c.receipt().results[0].ok,false);assert.equal(JSON.stringify(c.receipt()).includes('PRIVATE'),false)
})
const broker='local_fixture',cli='fixture-cli',cwd=join(root,'fixture')
const store=join(process.env.CLAUDE_DRIVER_APP_SUPPORT,'claude-code-sessions','a','o');mkdirSync(store,{recursive:true})
writeFileSync(join(store,broker+'.json'),JSON.stringify({sessionId:broker,cliSessionId:cli,cwd}))
const file=join(process.env.CLAUDE_DRIVER_PROJECTS_DIR,cwd.replace(/[^A-Za-z0-9]/g,'-'),cli+'.jsonl');mkdirSync(join(file,'..'),{recursive:true})
test('journal starts at current end, handles partial UTF-8 lines and can reconcile after disconnect',()=>{
 writeFileSync(file,sequence.map(r=>JSON.stringify(r)+'\n').join(''))
 const observe=observeNativeReceipts(broker,request);assert.equal(observe(),null)
 const s=sequence.map(r=>JSON.stringify(r)+'\n').join('');const bytes=Buffer.from(s)
 const cat=bytes.indexOf(Buffer.from('🐈'));appendFileSync(file,bytes.subarray(0,cat+1));assert.equal(observe(),null)
 appendFileSync(file,bytes.subarray(cat+1));assert.equal(observe().results[0].result,'delivery: queued')
 const reattached=observeNativeReceipts(broker,request,observe.start);assert.equal(reattached().source,'native-tool-result')
})
test('journal truncation refuses reconciliation rather than mixing a new transcript',()=>{
 writeFileSync(file,'existing history\n');const observe=observeNativeReceipts(broker,request);writeFileSync(file,'')
 assert.throws(()=>observe(),e=>e.category==='outcome_unknown')
})
after(()=>rmSync(root,{recursive:true,force:true}))

test('wake refusal uses exact peer msg_id and causal UUID ancestry; body lookalikes are insufficient',()=>{
 const c=new NativeReceipts(request);c.watchWake('fixture-peer-id')
 const user={type:'user',uuid:'u',message:{content:'synthetic wake'},origin:{kind:'peer',msg_id:'fixture-peer-id'}}
 c.feed({...user,origin:{kind:'peer',msg_id:'other',body:'fixture-peer-id'}})
 c.feed({type:'assistant',uuid:'a',parentUuid:'u',message:{stop_reason:'end_turn',content:[{type:'text',text:'Running'}]}})
 assert.equal(c.wakeStatus('fixture-peer-id').landed,false)
 c.feed(user);c.feed({type:'attachment',uuid:'attachment',parentUuid:'u'})
 c.feed({type:'assistant',uuid:'a',parentUuid:'attachment',message:{stop_reason:'end_turn',content:[{type:'thinking',thinking:'PRIVATE'}]}})
 assert.equal(c.wakeStatus('fixture-peer-id').terminalWithoutTools,true)
 assert.equal(JSON.stringify(c.wakeStatus('fixture-peer-id')).includes('PRIVATE'),false)
})
test('unrelated user branches, sidechains, and nonterminal tool work do not prove wake refusal',()=>{
 for(const variation of ['other-user','sidechain','tools']){
  const c=new NativeReceipts(request);c.watchWake('wake');c.feed({type:'user',uuid:'u',origin:{kind:'peer',msg_id:'wake'},message:{content:'wake'}})
  if(variation==='other-user')c.feed({type:'user',uuid:'other',parentUuid:'u',message:{content:[{type:'text',text:'user instructions'}]}})
  c.feed({type:'assistant',uuid:'a',parentUuid:variation==='other-user'?'other':'u',isSidechain:variation==='sidechain',message:{stop_reason:'end_turn',content:variation==='tools'?[{type:'tool_use',id:'t',name:'Bash',input:{command:'synthetic'}}]:[{type:'text',text:'Running'}]}})
  assert.equal(c.wakeStatus('wake').terminalWithoutTools,false)
 }
})
