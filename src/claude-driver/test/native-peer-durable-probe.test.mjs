import test from 'node:test'
import assert from 'node:assert/strict'
import {createDurableReadProbe} from '../candidates/native-peer-trigger/probe.js'
const config={id:'11111111-1111-4111-8111-111111111111',intent:'/synthetic/intent',report:'/synthetic/report',brokerSession:'local_owned',targetSession:'local_fixture',notBefore:1,deadline:100}
test('durable peer probe records before exact read, preserves uncertainty and refuses replay',async()=>{
 for(const scenario of ['success','native-error','intent-error','report-error','prior','expired']){
  const effects=[]
  const $={fs:{exists:async()=>scenario==='prior',write:async(p,t)=>{effects.push({kind:'write',p,data:JSON.parse(t)});if(scenario==='intent-error'&&p===config.intent||scenario==='report-error'&&p===config.report)throw Error('private filesystem detail')}},clock:{now:async()=>scenario==='expired'?101:10},mcp:{call:async(...args)=>{effects.push({kind:'call',args});if(scenario==='native-error')throw Error('private native detail');return {isError:false,content:'private metadata'}}}}
  const run=createDurableReadProbe(config)
  let first;try{first=await run($)}catch{first={status:'preflight-error'}}
  assert.equal((await run($)).status,'already-attempted')
  const calls=effects.filter(x=>x.kind==='call')
  assert.equal(calls.length,['prior','expired','intent-error'].includes(scenario)?0:1)
  if(calls.length){assert.equal(effects[0].kind,'write');assert.equal(effects[0].data.complete,false);assert.deepEqual(calls[0].args,['ccd_session_mgmt','get_session',{session_id:'local_fixture'}])}
  assert.ok(!JSON.stringify({effects,first}).includes('private'))
  for(const x of effects.filter(x=>x.kind==='write')){assert.equal(x.data.gateQualified,false);assert.equal(x.data.releaseAuthorized,false);assert.equal(x.data.modelCallsRequested,0)}
 }
})
test('intent-write delay cannot dispatch beyond the fixed deadline',async()=>{
 const writes=[];let ticks=0,calls=0
 const $={fs:{exists:async()=>false,write:async(p,t)=>writes.push(JSON.parse(t))},clock:{now:async()=>ticks++===0?10:101},mcp:{call:async()=>calls++}}
 assert.equal((await createDurableReadProbe(config)($)).status,'report-written')
 assert.equal(calls,0);assert.equal(writes.length,2);assert.equal(writes[1].failureCategory,'dispatch-window-refused')
})
