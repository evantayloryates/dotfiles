import test from 'node:test'
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {installedModuleContaining,cutInstalledFunction,installedWindowContaining} from '../lib/installed-source.mjs'
import {resolveClaudeBinary,cliVersionFromPath} from '../lib/paths.mjs'
test('installed peer receiver consumes mod-handled delivery before queueing and skips slash parsing otherwise',async()=>{
 const binary=resolveClaudeBinary();assert.equal(cliVersionFromPath(binary),'2.1.299','unqualified peer symbol profile')
 const source=installedWindowContaining(binary,'let w=irt(e.priority)??"next",h=UZo(s)',{before:1600,after:2700}).text
 const code=cutInstalledFunction(source,'async function ze(','function Oe(').replace('using E=D.queueing','const E=D.queueing')
 for(const consumed of [true,false]){
  const received=[],queued=[]
  const receive=runInNewContext(`(()=>{${code};return ze})()`,{Ie:()=>true,qe:()=> 'synthetic-id',tbt:()=>undefined,irt:x=>x,UZo:x=>x,Mft:()=>undefined,hAt:async x=>{received.push(x);return consumed?{consumed:'synthetic-owned-probe'}:{content:x.content,queueing:{queued(){}}}},ce:async()=>false,Iie:x=>x,qWt:()=> 'accept',DA:x=>queued.push(x),o:()=>({}),Oe:()=>{},Bg:String,t:()=>{},Ze:()=>undefined,Klt:()=>false,eBe:()=>({})},{timeout:1000})
  await receive({type:'user',session_id:'synthetic',priority:'next',message:{content:'/claude-driver-native-read-check'}})
  assert.equal(received.length,1);assert.equal(received[0].origin.kind,'peer')
  assert.equal(queued.length,consumed?0:1)
  if(!consumed)assert.equal(queued[0].skipSlashCommands,true)
 }
})
test('installed peer envelope adapter retains a direct envelope without a hop chain',()=>{
 const binary=resolveClaudeBinary();assert.equal(cliVersionFromPath(binary),'2.1.299','unqualified envelope symbol profile')
 const source=installedModuleContaining(binary,'function UZo(e){return h(e,!0)}').text
 const code=source.slice(source.indexOf('var d='),source.indexOf('export{u9,UZo}'))
 const encoded=[]
 const transform=runInNewContext(`(()=>{${code};return UZo})()`,{Eq:'cross-session-message',l6n:/^<cross-session-message /,Cft:x=>{encoded.push(x);return x},EPr:()=>[],tfe:'synthetic'})
 const wire='<cross-session-message from-name="claude-driver" from-mode="bypass">\nsynthetic\n</cross-session-message>'
 assert.equal(transform(wire),wire)
 assert.equal(encoded.length,1);assert.equal(encoded[0].startsWith('cross-session-message '),true)
 assert.equal(transform(wire.replace('from-name=', 'from-plugin="foreign" from-name=')),wire)
})
