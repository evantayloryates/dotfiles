import test from 'node:test'
import assert from 'node:assert/strict'
import {installedPeerReceiver,installedPeerEnvelope,evaluateWithStubs} from './installed-shape.mjs'
// Both tests read whichever CLI is installed and locate the code by shape, so
// a CLI upgrade is exercised as-is instead of failing on old minified names.
test('installed peer receiver consumes mod-handled delivery before queueing and skips slash parsing otherwise',async()=>{
 const receiver=installedPeerReceiver(),{hook,accept,enqueue,listeners}=receiver.roles
 for(const consumed of [true,false]){
  const received=[],queued=[]
  const receive=evaluateWithStubs(receiver.code,receiver.name,{
   [hook]:async x=>{received.push(x);return consumed?{consumed:'synthetic-owned-probe'}:{content:x.content,queueing:{queued(){}}}},
   [accept]:()=>'accept',[enqueue]:x=>queued.push(x),[listeners]:()=>({}),
  })
  await receive({type:'user',session_id:'synthetic',priority:'next',message:{content:'/claude-driver-native-read-check'}})
  assert.equal(received.length,1,`CLI ${receiver.version}`);assert.equal(received[0].origin.kind,'peer')
  assert.equal(queued.length,consumed?0:1)
  if(!consumed)assert.equal(queued[0].skipSlashCommands,true)
 }
})
test('installed peer envelope adapter retains a direct envelope without a hop chain',()=>{
 const envelope=installedPeerEnvelope(),{transform,tag,prefix,encode}=envelope.roles
 const encoded=[]
 const run=evaluateWithStubs(envelope.code,transform,{[tag]:'cross-session-message',[prefix]:/^<cross-session-message /,[encode]:x=>{encoded.push(x);return x}})
 const wire='<cross-session-message from-name="claude-driver" from-mode="bypass">\nsynthetic\n</cross-session-message>'
 assert.equal(run(wire),wire,`CLI ${envelope.version}`)
 assert.equal(encoded.length,1);assert.equal(encoded[0].startsWith('cross-session-message '),true)
 assert.equal(run(wire.replace('from-name=','from-plugin="foreign" from-name=')),wire)
})
