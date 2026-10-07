import test from 'node:test'
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {buildNativePeerServicePackage} from '../lib/native-peer-service-package.mjs'
import {screenNativeServiceMarker} from '../lib/native-service-marker.mjs'
const config={id:'a'.repeat(32),token:'claude-driver service-read '+'b'.repeat(32),brokerSession:'local_11111111-1111-4111-8111-111111111111',brokerCwd:'/Users/taylor/.local/state/claude-driver/broker',build:'c'.repeat(64),notBefore:1000,deadline:2000,maxRequests:2,marker:true,observeRetiredServiceId:'d'.repeat(32)}
function setup({commands=[],now=1000,owner=config.brokerSession}={}){
 const pkg=buildNativePeerServicePackage(config),files=new Map();let registrations=0,lists=0,nexts=0,timer
 const record=runInNewContext(pkg.files['hooks/register.js'].replace('export function register','function register')+';recordServiceReady',{Set,Object,JSON,Date,Number,Array})
 const $={session:{id:async()=>owner,cwd:async()=>config.brokerCwd},clock:{now:async()=>now,after:(ms,fn)=>{assert.equal(ms,250);timer=fn}},plugin:{name:'desktop-bridge-native-peer-service',root:'/Users/taylor/.claude/dev-mods/'+config.brokerSession.slice(6)+'/desktop-bridge-native-peer-service'},command:{register:async spec=>{registrations++;commands.push({name:spec.name,source:'plugin',plugin:'desktop-bridge-native-peer-service'});return {command:spec.name}},list:async()=>{lists++;return commands}},fs:{exists:async p=>files.has(p),write:async(p,text)=>files.set(p,JSON.parse(text))}}
 return {files,run:async()=>{const result=await record($,{},()=>{nexts++;return 'next'});await timer?.();return result},counts:()=>({registrations,lists,nexts})}
}
test('native marker captures only scoped presence and never executes or requests model',async()=>{
 const s=setup({commands:[{name:'private-command',description:'PRIVATE'}]});assert.equal(await s.run(),'next')
 const evidence=[...s.files.values()].find(x=>x.scope==='owned-native-service-marker')
 assert.equal(screenNativeServiceMarker({config,marker:evidence,now:1000}),true);assert.equal(evidence.previousMarkerPresent,false);assert.equal(evidence.ownMarkerPresent,true)
 assert.equal(JSON.stringify(evidence).includes('PRIVATE'),false);assert.equal(JSON.stringify(evidence).includes('private-command'),false)
 assert.deepEqual(s.counts(),{registrations:1,lists:1,nexts:1})
 for(const change of [{ownMarkerPresent:false},{previousMarkerPresent:null},{brokerSession:'foreign'},{observedAt:'invalid'},{observedAt:new Date(999).toISOString()},{modelCallsRequested:1},{extra:true}])assert.equal(screenNativeServiceMarker({config,marker:{...evidence,...change},now:1000}),false)
})
test('prior marker still present is preserved as negative evidence',async()=>{
 const s=setup({commands:[{name:'claude-driver-service-marker-'+config.observeRetiredServiceId,source:'plugin',plugin:'desktop-bridge-native-peer-service'}]});await s.run();const marker=[...s.files.values()].find(x=>x.scope==='owned-native-service-marker')
 assert.equal(marker.previousMarkerPresent,true);assert.equal(screenNativeServiceMarker({config,marker,now:1000}),true)
})
test('foreign and expired sessions do not register marker',async()=>{
 for(const options of [{now:2001},{owner:'foreign'}]){const s=setup(options);await s.run();assert.deepEqual(s.counts(),{registrations:0,lists:0,nexts:1});assert.equal(s.files.size,0)}
})
test('marked package refuses injected, self or missing prior identities',()=>{
 for(const change of [{observeRetiredServiceId:config.id},{observeRetiredServiceId:'$(unsafe)'},{observeRetiredServiceId:undefined},{marker:false}])assert.throws(()=>buildNativePeerServicePackage({...config,...change}))
})
