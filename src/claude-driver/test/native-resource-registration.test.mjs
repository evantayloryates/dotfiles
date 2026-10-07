import test from 'node:test'
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {buildNativePeerServicePackage} from '../lib/native-peer-service-package.mjs'
const config={id:'a'.repeat(32),token:'claude-driver service-read '+'b'.repeat(32),brokerSession:'local_11111111-1111-4111-8111-111111111111',brokerCwd:'/Users/taylor/.local/state/claude-driver/broker',build:'c'.repeat(64),notBefore:1000,deadline:61000,maxRequests:1,marker:true,observeRetiredServiceId:null,resourceProbe:true}
function fixture(){
 const pkg=buildNativePeerServicePackage(config),files=new Map(),timers=[]
 const record=runInNewContext(pkg.files['hooks/register.js'].replace('export function register','function register')+';recordServiceReady',{Set,Object,JSON,Date,Number,Array})
 let now=1000,owner=config.brokerSession,spawns=0,nexts=0
 const $={session:{id:async()=>owner,cwd:async()=>config.brokerCwd},clock:{now:async()=>now,after:(ms,fn)=>timers.push(fn)},plugin:{name:'desktop-bridge-native-peer-service',root:''},command:{register:async spec=>({command:spec.name}),list:async()=>[]},fs:{exists:async p=>files.has(p),write:async(p,text)=>files.set(p,JSON.parse(text))},process:{spawn:async function*(spec){spawns++;assert.equal(spec.argv[0],'/opt/homebrew/bin/node');assert.equal(spec.cwd,config.brokerCwd);yield {stream:'stdout',text:'owned-resource-alive\n'}}}}
 return {files,timers,run:()=>record($,{},()=>{nexts++;return 'next'}),set:(time,identity)=>{now=time;owner=identity},counts:()=>({spawns,nexts})}
}
test('native resource schedules once with durable intent before launch and no model call',async()=>{
 const f=fixture();await f.run()
 assert.equal(f.counts().spawns,0)
 const intent=[...f.files.values()].find(x=>x.selfDeadline)
 assert.equal(intent.selfDeadline,91000);assert.equal(intent.modelCallsRequested,0)
 await f.timers[0]();await f.timers[1]();assert.equal(f.counts().spawns,1)
 await f.run();assert.equal(f.timers.length,2,'durable intent prevents another resource launch')
})
test('foreign or expired owner refuses resource scheduling; changed owner refuses delayed launch',async()=>{
 for(const [time,owner]of [[61001,config.brokerSession],[1000,'foreign']]){const f=fixture();f.set(time,owner);await f.run();assert.equal(f.timers.length,0);assert.equal(f.files.size,0)}
 const f=fixture();await f.run();f.set(1001,'foreign');await f.timers[1]();assert.equal(f.counts().spawns,0)
})
test('resource variant requires marker and at most 120 seconds',()=>{
 assert.throws(()=>buildNativePeerServicePackage({...config,marker:false}))
 assert.throws(()=>buildNativePeerServicePackage({...config,deadline:121001}))
 assert.equal(JSON.parse(buildNativePeerServicePackage(config).files['.claude-plugin/plugin.json']).version,'0.3.0')
})
