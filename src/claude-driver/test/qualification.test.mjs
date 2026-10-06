import {test} from 'node:test'
import assert from 'node:assert/strict'
import {validateBrokerFixture,nativeQualification} from '../lib/qualification.mjs'
const good=()=>({session:'local_fixture',record:{sessionId:'local_fixture',title:'claude-driver v2 pressure fixture',cwd:'/private/state/probe/fixture'},registry:{kind:'create',cwd:'/private/state/probe/fixture'},stateDir:'/private/state',broker:{live:{pid:1},resident:{resident:true},templateCurrent:true},policy:{blocked:true},currentSession:'local_user'})
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
})
