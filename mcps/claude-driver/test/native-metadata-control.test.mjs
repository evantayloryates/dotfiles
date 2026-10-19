import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {metadataControlArguments,metadataStateMatches,metadataTargetPreflightMatches,metadataObservationMatches,metadataTargetRegistered,metadataPriorAttemptsClear} from '../src/lib/native-metadata-control.mjs'
const target={sessionId:'local_22222222-2222-4222-8222-222222222222',cwd:'/owned/probe/target',pid:42,procStart:'epoch'}
test('typed metadata operations reject ambiguous aliases, and title equality alone cannot prove a lock',()=>{
 assert.deepEqual(metadataControlArguments(target,'set_pinned',false),{session_id:target.sessionId,pinned:false})
 for(const [op,v]of [['set_session_title',''],['set_session_title','x'.repeat(201)],['set_session_title',true],['set_pinned','true'],['set_session_effort','unbounded'],['set_session_permission_mode','bypassPermissions']])assert.throws(()=>metadataControlArguments(target,op,v),/unqualified/)
 const r={sessionId:target.sessionId,isArchived:false,title:'same',titleSource:'auto'}
 assert.equal(metadataStateMatches(r,false,'set_session_title',{session_id:target.sessionId,title:'same'}),false)
 r.titleSource='tool';assert.equal(metadataStateMatches(r,false,'set_session_title',{session_id:target.sessionId,title:'same'}),true)
})
test('metadata target must remain exact owned idle bypass epoch with no PR or worktree',()=>{
 const make=()=>({target,record:{sessionId:target.sessionId,cwd:target.cwd,isArchived:false,permissionMode:'bypassPermissions'},peer:{hostSessionId:target.sessionId,cwd:target.cwd,pid:42,procStart:'epoch',status:'idle',entrypoint:'claude-desktop',version:'2.1.299'},registered:true,openPrCount:0})
 assert.equal(metadataTargetPreflightMatches(make()),true)
 for(const change of [x=>x.peer.pid=43,x=>x.peer.procStart='reused',x=>x.peer.status='working',x=>x.record.permissionMode='acceptEdits',x=>x.record.isArchived=true,x=>x.record.worktreePath='/work',x=>x.registered=false,x=>x.openPrCount=1]){const x=make();change(x);assert.equal(metadataTargetPreflightMatches(x),false)}
})
test('historical postcondition binds exact request, original target epoch and receipt bytes',()=>{
 const config={id:'a'.repeat(32),metadataTarget:target},request={id:'rpeer'+'b'.repeat(32),ops:[{op:'set_session_title',args:metadataControlArguments(target,'set_session_title','new')}]},receipt={receivedAt:new Date(100).toISOString(),content:[{type:'text',text:'native title acknowledgement'}]},o={schemaVersion:1,serviceId:config.id,requestId:request.id,sessionId:target.sessionId,cwd:target.cwd,pid:42,procStart:'epoch',operation:'set_session_title',postcondition:{title:'new',titleSource:'tool'},observedAt:110,nativeTextSha256:createHash('sha256').update(receipt.content[0].text).digest('hex')},args={config,request,receipt,now:120}
 assert.equal(metadataObservationMatches(o,args),true)
 for(const patch of [{pid:43},{operation:'set_pinned'},{postcondition:{title:'new',titleSource:'auto'}},{postcondition:{title:'new',titleSource:'tool',extra:true}},{observedAt:99},{nativeTextSha256:'foreign'},{extra:true}])assert.equal(metadataObservationMatches({...o,...patch},args),false)
})

test('private service namespace never substitutes for the explicit parent registry',async()=>{
 const {mkdtempSync,mkdirSync,writeFileSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{execFileSync}=await import('node:child_process')
 const root=mkdtempSync(join(tmpdir(),'metadata-registry-')),cwd=join(root,'probe/target'),privateState=join(cwd,'.claude-driver-services','a'.repeat(32)),t={...target,cwd};mkdirSync(privateState,{recursive:true});writeFileSync(join(root,'registry.json'),JSON.stringify({sessions:{[t.sessionId]:{kind:'create',cwd}}}));writeFileSync(join(privateState,'registry.json'),JSON.stringify({sessions:{}}))
 try{
  const code=`import {metadataTargetRegistered} from ${JSON.stringify(new URL('../src/lib/native-metadata-control.mjs',import.meta.url).href)};console.log(JSON.stringify(metadataTargetRegistered(${JSON.stringify(t)})))`
  const env={...process.env,CLAUDE_DRIVER_STATE_DIR:privateState,CLAUDE_DRIVER_CONTROL_STATE_DIR:root}
  assert.equal(execFileSync(process.execPath,['--input-type=module','-e',code],{env,encoding:'utf8'}).trim(),'true')
  delete env.CLAUDE_DRIVER_CONTROL_STATE_DIR;assert.equal(execFileSync(process.execPath,['--input-type=module','-e',code],{env,encoding:'utf8'}).trim(),'false')
  assert.equal(metadataTargetRegistered(t,{controlStateDir:root,read:()=>JSON.stringify({sessions:{[t.sessionId]:{kind:'create',cwd:'/foreign'}}})}),false)
 }finally{rmSync(root,{recursive:true,force:true})}
})

test('unresolved predecessors block new metadata while its own reserved pre-send slot does not',()=>{
 const current='rpeer'+'a'.repeat(32),old='rpeer'+'b'.repeat(32)
 assert.equal(metadataPriorAttemptsClear({unresolvedRequestIds:[]},current),true)
 assert.equal(metadataPriorAttemptsClear({unresolvedRequestIds:[current]},current),true)
 assert.equal(metadataPriorAttemptsClear({unresolvedRequestIds:[old]},current),false)
 assert.equal(metadataPriorAttemptsClear({unresolvedRequestIds:[current,old]},current),false)
 assert.equal(metadataPriorAttemptsClear({},current),false)
})

test('model postcondition requires the explicit capability and exact persisted model, never an acknowledgement alone',()=>{
 const config={id:'a'.repeat(32),metadataTarget:target},request={id:'rpeer'+'b'.repeat(32),ops:[{op:'set_session_model',args:metadataControlArguments(target,'set_session_model','claude-opus-5-5')}]},receipt={receivedAt:new Date(100).toISOString(),content:[{type:'text',text:'native model acknowledgement'}]},o={schemaVersion:1,serviceId:config.id,requestId:request.id,sessionId:target.sessionId,cwd:target.cwd,pid:42,procStart:'epoch',operation:'set_session_model',postcondition:{model:'claude-opus-5-5'},observedAt:110,nativeTextSha256:createHash('sha256').update(receipt.content[0].text).digest('hex')}
 assert.equal(metadataObservationMatches(o,{config,request,receipt,now:120}),false);config.metadataModelControl=true;assert.equal(metadataObservationMatches(o,{config,request,receipt,now:120}),true)
 assert.equal(metadataObservationMatches({...o,postcondition:{model:'claude-haiku-5-5'}},{config,request,receipt,now:120}),false)
 for(const model of ['opus','claude','x'.repeat(200),'claude-opus-5-5\0'])assert.throws(()=>metadataControlArguments(target,'set_session_model',model))
 assert.equal(metadataStateMatches({sessionId:target.sessionId,isArchived:false,model:'claude-opus-5-5'},false,'set_session_model',request.ops[0].args),true)
})
