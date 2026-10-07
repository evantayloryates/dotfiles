import {test} from 'node:test'
import assert from 'node:assert/strict'
import {validateBrokerFixture,validateInputFreeOperation,nativeQualification,LIVE_BOOTSTRAP,hasCompletionMarker,qualificationMarkers,recipientReplyEvidence} from '../lib/qualification.mjs'
test('new qualification tokens and exact peer ancestry exclude stale or unrelated replies',()=>{
 const a=qualificationMarkers('a'.repeat(32)),b=qualificationMarkers('b'.repeat(32))
 assert.notEqual(a.initial,b.initial)
 for(const bad of ['',null,'nonce','g'.repeat(32)])assert.throws(()=>qualificationMarkers(bad),e=>e.category==='qualification_gate')
 const root={id:'peer',parentId:'old',type:'user',peerMessageId:'receipt'},thinking={id:'think',parentId:'peer',type:'assistant',tools:[]},reply={id:'reply',parentId:'think',type:'assistant',text:a.initial,tools:[],stopReason:'end_turn'}
 const check=events=>recipientReplyEvidence(events,{messageId:'receipt',marker:a.initial}).verified
 assert.equal(check([root,thinking,reply]),true)
 assert.equal(check([root,thinking,reply,reply]),true,'duplicate journal envelopes of one UUID are one logical reply')
 const attachment={id:'reminder',parentId:'peer',type:'metadata',sourceType:'attachment'}
 assert.equal(check([root,attachment,{...reply,parentId:'reminder'}]),true)
 for(const node of [{...attachment,sourceType:'system'},{...attachment,sidechain:true},{...attachment,type:'user'}])assert.equal(check([root,node,{...reply,parentId:'reminder'}]),false)
 for(const events of [[reply],[root,reply],[{...root,peerMessageId:'other'},thinking,reply],[root,thinking,{...reply,text:b.initial}],[root,thinking,{...reply,sidechain:true}],[root,thinking,{...reply,tools:['Bash']}],[root,thinking,{...reply,stopReason:null}],[root,thinking,{...reply,textTruncated:true}],[root,thinking,reply,{...reply,id:'duplicate'}],[root,{id:'human',type:'user',parentId:'peer'}, {...reply,parentId:'human'}],[root,{...thinking,parentId:null},reply]])assert.equal(check(events),false)
 assert.equal(recipientReplyEvidence([root,thinking,reply],{marker:a.initial}).verified,false)
 assert.equal(recipientReplyEvidence(null,{messageId:'receipt',marker:a.initial}).verified,false)
 assert.equal(check([null,root,thinking,reply]),true)
 assert.equal(JSON.stringify(recipientReplyEvidence([root,thinking,reply],{messageId:'receipt',marker:a.initial})).includes(a.initial),false)
})
const good=()=>({session:'local_fixture',record:{sessionId:'local_fixture',title:'claude-driver v2 pressure fixture',cwd:'/private/state/probe/fixture'},registry:{kind:'create',cwd:'/private/state/probe/fixture'},stateDir:'/private/state',broker:{live:{pid:1},resident:{resident:true},templateCurrent:true},policy:{blocked:true},currentSession:'local_user'})
test('completion evidence uses a final assistant line, including the bounded tail, never a quoted marker',()=>{
 assert.equal(hasCompletionMarker([{type:'assistant',text:'The request says `OLD_PLAN_FINISHED`. Is this authorized?'}],'OLD_PLAN_FINISHED'),false)
 assert.equal(hasCompletionMarker([{type:'user',text:'OLD_PLAN_FINISHED'}],'OLD_PLAN_FINISHED'),false)
 assert.equal(hasCompletionMarker([{type:'assistant',text:'1\n2\nOLD_PLAN_FINISHED\n'}],'OLD_PLAN_FINISHED'),true)
 assert.equal(hasCompletionMarker([{type:'assistant',text:'prefix',textTruncated:true,textTail:'5999\n6000\nOLD_PLAN_FINISHED'}],'OLD_PLAN_FINISHED'),true)
})
test('native qualification accepts only a proven disposable fixture under active UI quarantine',()=>{
  assert.equal(validateBrokerFixture(good()),'local_fixture')
  for(const alter of [x=>x.policy.blocked=false,x=>x.broker.live=null,x=>x.broker.templateCurrent=false,x=>x.record.isArchived=true,x=>x.currentSession=x.session,x=>x.registry.kind='fork',x=>x.registry.cwd='/other',x=>x.record.title='user work',x=>{x.record.cwd=x.registry.cwd='/private/state/probe-other/fixture'},x=>x.record.sessionId='other']){
    const x=good();alter(x);assert.throws(()=>validateBrokerFixture(x),e=>e.category==='qualification_gate')
  }
  const idle=good();idle.broker.resident.resident=false;assert.equal(validateBrokerFixture(idle),'local_fixture')
})
test('native qualification is scoped to passing evidence on identical source and versions',()=>{
 const v={app:'1',cli:'2'},r={kind:'test_result',status:'passed',runtimeBuild:'build',versions:v}
 assert.equal(nativeQualification(r,'build',v).qualified,true)
 for(const x of [null,{...r,status:'failed'},{...r,kind:'lesson'},{...r,runtimeBuild:'old'},{...r,versions:{...v,cli:'3'}}])assert.equal(nativeQualification(x,'build',v).qualified,false)
 assert.ok(nativeQualification(r,'build',v).excluded.includes('UI-recovery'))
 const full=nativeQualification({...r,topic:'v2-live-pressure'},'build',v)
 assert.equal(full.scope,'full-live');assert.equal(full.qualified,true)
 assert.equal(full.excluded.includes('session-import'),false)
 assert.ok(full.excluded.includes('UI-recovery'))
 const inputFree=nativeQualification({...r,topic:'v2-input-free-pressure'},'build',v)
 assert.equal(inputFree.scope,'input-free-live');assert.equal(inputFree.qualified,true)
 assert.deepEqual(inputFree.excluded,['physical-typing','UI-recovery'])
})
test('pinned broker qualification also binds the executed dependency and bootstrap builds',()=>{
 const versions={app:'1',cli:'2'},runtime={pinned:true,integrity:true,dependencyPathsObserved:true,build:'broker-build',bootstrapHash:'bootstrap-build'}
 const row={kind:'test_result',status:'passed',runtimeBuild:'host-build',versions,brokerBuild:runtime.build,bootstrapHash:runtime.bootstrapHash}
 assert.equal(nativeQualification(row,'host-build',versions,runtime).qualified,true)
 for(const altered of [{...runtime,build:'other'},{...runtime,bootstrapHash:'other'},{...runtime,integrity:false},{...runtime,dependencyPathsObserved:false}])
  assert.equal(nativeQualification(row,'host-build',versions,altered).qualified,false)
 assert.equal(nativeQualification({...row,brokerBuild:undefined},'host-build',versions,runtime).qualified,false)
})
const inputFree=()=>({name:'create_session',args:{folder:'/private/state/probe/fixture',title:'claude-driver v2 pressure fixture',model:'claude-haiku-4-5-20251001',permission_mode:'acceptEdits',bootstrap_prompt:LIVE_BOOTSTRAP},folder:'/private/state/probe/fixture',title:'claude-driver v2 pressure fixture',stateDir:'/private/state',broker:{live:{pid:1},templateCurrent:true},policy:{blocked:true},ownedJobs:new Set(['owned'])})
test('input-free creation retains quarantine and refuses every escape before import',()=>{
 assert.doesNotThrow(()=>validateInputFreeOperation(inputFree()))
 for(const alter of [x=>x.policy.blocked=false,x=>x.broker.live=null,x=>x.broker.templateCurrent=false,x=>x.session='already-created',x=>x.folder=x.args.folder='/private/state/probe-other/fixture',x=>x.args.title='user task',x=>x.args.model='other',x=>x.args.permission_mode='bypassPermissions',x=>x.args.first_message='task',x=>x.args.bootstrap_prompt='task',x=>x.args.focus='show',x=>x.args.group='user group',x=>x.name='window_manage']){
  const x=inputFree();alter(x);assert.throws(()=>validateInputFreeOperation(x),e=>e.category==='qualification_gate')
 }
})
test('input-free controls bind the fixture and owned jobs and prohibit navigation or recovery',()=>{
 const x=inputFree();x.session='local_owned'
 for(const [name,args] of [['get_session',{session:x.session}],['set_session_config',{session:x.session,title:'fixture',pinned:false,effort:'low'}],['driver_submit',{operation:'send_message',arguments:{session:x.session,message:'synthetic'}}],['driver_wait',{job_id:'owned'}]])assert.doesNotThrow(()=>validateInputFreeOperation({...x,name,args}))
 for(const [name,args] of [['open_session',{session:x.session}],['broker_status',{revive:true}],['get_session',{session:'local_user'}],['set_session_config',{session:x.session,permission_mode:'plan'}],['driver_submit',{operation:'create_session',arguments:{session:x.session}}],['driver_submit',{operation:'send_message',arguments:{session:'local_user'}}],['driver_wait',{job_id:'user-job'}],['driver_cancel',{job_id:'user-job'}]])assert.throws(()=>validateInputFreeOperation({...x,name,args}),e=>e.category==='qualification_gate')
})
