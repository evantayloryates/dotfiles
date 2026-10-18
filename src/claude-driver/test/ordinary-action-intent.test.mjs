import test from 'node:test'
import assert from 'node:assert/strict'
import {captureOrdinaryActionIntent,prepareOrdinaryActionIntent,validateOrdinaryActionIntent,assertOrdinaryActionRecipient,ordinaryOperationIntentSha256} from '../lib/ordinary-action-intent.mjs'
const target='local_22222222-2222-4222-8222-222222222222',controller='local_11111111-1111-4111-8111-111111111111'
function fixture(){
 const row={controllerSession:controller,receiverCwd:'/controller'},record={sessionId:target,cliSessionId:target.slice(6),cwd:'/ordinary',_file:'/account/org/'+target+'.json',isArchived:false},peer={pid:42,procStart:'original',hostSessionId:target,sessionId:target.slice(6),cwd:record.cwd,entrypoint:'claude-desktop',version:'2.1.299',status:'busy'}
 const f={row,record,peer,processes:[{...peer}],metadata:null};f.d={enrollment:()=>f.row,record:()=>f.record,peer:()=>f.peer,processes:()=>f.processes,metadata:()=>f.metadata};return f
}
test('all ordinary action kinds freeze original binding, epoch and private message hash at admission',()=>{
 for(const [op,args] of [['send_message',{session:target,message:'private message'}],['steer_session',{session:target,message:'private message',mode:'queue'}],['steer_session',{session:target,message:'private message',mode:'interrupt'}],['stop_session',{session:target}]]){
  const f=fixture(),snapshot=captureOrdinaryActionIntent(op,args,f.d)
  assert.equal(snapshot.recipient.epoch.pid,42);assert.equal(snapshot.intentSha256,ordinaryOperationIntentSha256(op,args));assert.equal(JSON.stringify(snapshot).includes('private message'),false)
  assert.strictEqual(prepareOrdinaryActionIntent(op,args,snapshot,f.d),snapshot)
  f.peer.status='idle';assert.doesNotThrow(()=>assertOrdinaryActionRecipient(snapshot,{},f.d))
  for(const mutate of [x=>x.peer.pid++,x=>x.peer.procStart='replacement',x=>x.record.cwd='/different',x=>x.record._file='/other/org/'+target+'.json',x=>x.record.isArchived=true,x=>x.row.receiverCwd='/changed',x=>x.row=null,x=>x.processes.push({...x.peer,pid:43})]){
   const g=fixture();mutate(g);assert.throws(()=>assertOrdinaryActionRecipient(snapshot,{},g.d),e=>e.category==='ordinary_recipient_changed'&&e.detail.targetDispatched===false)
  }
  const changed={...args,...args.message?{message:'different message'}:{session:controller}};assert.throws(()=>validateOrdinaryActionIntent(snapshot,op,changed))
 }
})
test('only sends allow no observed peer and preserve absence through later admission',()=>{
 const f=fixture();f.peer=null;f.processes=[];const args={session:target,message:'hello'},snapshot=captureOrdinaryActionIntent('send_message',args,f.d)
 assert.deepEqual(snapshot.recipient,{kind:'no-peer'});assert.doesNotThrow(()=>assertOrdinaryActionRecipient(snapshot,{},f.d))
 for(const op of ['stop_session','steer_session'])assert.throws(()=>captureOrdinaryActionIntent(op,{...args,mode:'interrupt'},f.d))
 f.processes=[{hostSessionId:target,pid:42,procStart:'old'}];assert.throws(()=>captureOrdinaryActionIntent('send_message',args,f.d));assert.throws(()=>assertOrdinaryActionRecipient(snapshot,{},f.d))
 f.processes=Array(2049).fill({hostSessionId:'other'});assert.throws(()=>captureOrdinaryActionIntent('send_message',args,f.d))
})
test('scope cannot silently change from nonordinary to ordinary or to a different controller',()=>{
 const f=fixture(),args={session:target,message:'hello'},snapshot=captureOrdinaryActionIntent('send_message',args,f.d)
 assert.throws(()=>prepareOrdinaryActionIntent('send_message',args,null,f.d),e=>e.category==='ordinary_action_scope_changed')
 f.metadata={};assert.equal(captureOrdinaryActionIntent('send_message',args,f.d),null);assert.throws(()=>prepareOrdinaryActionIntent('send_message',args,snapshot,f.d),e=>e.category==='ordinary_action_scope_changed')
 for(const extra of [{transport:'peer-direct'},{controller_session:controller},{via_broker:true}])assert.equal(captureOrdinaryActionIntent('send_message',{...args,...extra},fixture().d),null)
 assert.equal(captureOrdinaryActionIntent('pin_session',{session:target,pinned:true},f.d),null)
})
test('snapshots reject extra text, malformed epochs, action changes and mismatched phase messages',()=>{
 const f=fixture(),args={session:target,message:'original',mode:'interrupt'},snapshot=captureOrdinaryActionIntent('steer_session',args,f.d)
 for(const patch of [{message:'untrusted'},{action:'send'},{recipient:{kind:'epoch',epoch:{pid:42,procStart:'original',extra:true}}},{schemaVersion:2},{messageSha256:'a'.repeat(64)}])assert.throws(()=>validateOrdinaryActionIntent({...snapshot,...patch},'steer_session',args))
 assert.doesNotThrow(()=>assertOrdinaryActionRecipient(snapshot,{action:'stop'},f.d));assert.doesNotThrow(()=>assertOrdinaryActionRecipient(snapshot,{action:'send',message:'original'},f.d));assert.throws(()=>assertOrdinaryActionRecipient(snapshot,{action:'send',message:'changed'},f.d))
})
