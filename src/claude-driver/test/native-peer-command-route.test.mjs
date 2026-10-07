import test from 'node:test'
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {installedModuleContaining,cutInstalledFunction} from '../lib/installed-source.mjs'
import {resolveClaudeBinary} from '../lib/paths.mjs'
test('installed peer receiver consumes mod-handled delivery before queueing and skips slash parsing otherwise',async()=>{
 const source=installedModuleContaining(resolveClaudeBinary(),'function en(e){e.setEncoding("utf8")').text
 const code=cutInstalledFunction(source,'async function ze(','function Oe(').replace('using v=w.queueing','const v=w.queueing')
 for(const consumed of [true,false]){
  const received=[],queued=[]
  const receive=runInNewContext(`(()=>{${code};return ze})()`,{Ie:()=>true,qe:()=> 'synthetic-id',$st:()=>undefined,a5e:x=>x,Wmo:x=>x,iet:()=>undefined,nft:async x=>{received.push(x);return consumed?{consumed:'synthetic-owned-probe'}:{content:x.content,queueing:{queued(){}}}},ce:async()=>false,gme:x=>x,Ve:()=>undefined,dOe:()=>({}),KRt:()=> 'accept',Nv:x=>queued.push(x),u:()=>({}),Oe:()=>{},Rm:String,t:()=>{},MXe:()=>false},{timeout:1000})
  await receive({type:'user',session_id:'synthetic',priority:'next',message:{content:'/claude-driver-native-read-check'}})
  assert.equal(received.length,1);assert.equal(received[0].origin.kind,'peer')
  assert.equal(queued.length,consumed?0:1)
  if(!consumed)assert.equal(queued[0].skipSlashCommands,true)
 }
})
