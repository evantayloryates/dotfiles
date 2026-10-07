import test from 'node:test'
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {buildNativePeerResultPackage} from '../lib/native-peer-result-package.mjs'
import {screenNativePeerResult} from '../lib/native-peer-result.mjs'
import {OPS} from '../lib/driver.mjs'
test('shared callback reconciliation interface requires opt-in and refuses invalid enrollment without execution',async()=>{
 const op=OPS.find(x=>x.name==='broker_peer_result_reconcile')
 assert.equal(op.readOnly,false)
 await assert.rejects(op.run({id:'invalid'}),/experimental opt-in/)
 await assert.rejects(op.run({id:'invalid',experimental:true}),/evidence refused/)
})
const id='11111111-1111-4111-8111-111111111111',cwd='/Users/taylor/.local/state/claude-driver/broker',requestId='rpeer'+id.replaceAll('-',''),config={id,token:'claude-driver native-check '+'a'.repeat(32),brokerSession:'local_11111111-1111-4111-8111-111111111111',targetSession:'local_22222222-2222-4222-8222-222222222222',brokerCwd:cwd,ready:'/Users/taylor/Desktop/temp_reports/native-peer-ready-'+id+'.json',intent:cwd+'/.native-peer-read-'+id+'.started.json',report:'/Users/taylor/Desktop/temp_reports/native-peer-read-'+id+'.report.json',notBefore:1000,deadline:2000},input={probe:config,requestId,build:'a'.repeat(64)}
const metadataText=JSON.stringify({sessionId:config.targetSession,isArchived:false,isRunning:false,pinned:false,title:'PRIVATE synthetic metadata'})
test('native response channel preserves local tool content without putting it into diagnostic report or repeating calls',async()=>{
 for(const isError of [false,true]){
  const pkg=buildNativePeerResultPackage(input),hooks=new Map(),files=new Map();let calls=0
  const register=runInNewContext(pkg.files['hooks/register.js'].replace('export function register','function register')+';register',{Object,JSON,Date,Error,Number,Array});register((event,fn)=>hooks.set(event,fn))
  const payload=isError?'PRIVATE synthetic error':metadataText
  const $={session:{id:async()=>config.brokerSession,cwd:async()=>cwd},clock:{now:async()=>1000},fs:{exists:async p=>files.has(p),write:async(p,text)=>files.set(p,JSON.parse(text))},tool:{call:async()=>({text:JSON.stringify({dispatch:true,op:'get_session',args:{session_id:config.targetSession}})})},mcp:{call:async()=>{calls++;return {isError,content:[{type:'text',text:payload}]}}}}
  const event={origin:{kind:'peer'},text:config.token},next=()=>assert.fail('queued');await hooks.get('session.receive')($,event,next);await hooks.get('session.receive')($,event,next)
  assert.equal(calls,1);assert.equal(files.get(pkg.resultFile).content[0].text,payload);assert.ok(!JSON.stringify(files.get(config.report)).includes('PRIVATE'))
  const result=screenNativePeerResult({config,requestId,report:files.get(config.report),receipt:files.get(pkg.resultFile),admission:{singleReadAdmissionObserved:true}})
  assert.equal(result.ok,!isError);assert.equal(isError?result.error:result.result,payload)
 }
})
test('receipt screen refuses identity, payload, chronology and admission drift',()=>{
 const report={startedAt:new Date(1000).toISOString(),completedAt:new Date(1100).toISOString(),resultWasError:false},receipt={schemaVersion:1,scope:'owned-native-peer-result',probeId:id,requestId,brokerSession:config.brokerSession,targetSession:config.targetSession,startedAt:report.startedAt,receivedAt:new Date(1050).toISOString(),isError:false,content:[{type:'text',text:metadataText}]},base={config,requestId,report,receipt,admission:{singleReadAdmissionObserved:true}}
 assert.equal(screenNativePeerResult(base).ok,true)
 for(const partial of [undefined,{}, {...base,config:null},{...base,report:null},{...base,admission:null},{...base,report:{...report,startedAt:'invalid'}},{...base,report:{...report,completedAt:'invalid'}},{...base,config:{...config,deadline:NaN}}])assert.equal(screenNativePeerResult(partial),null)
 for(const change of [x=>x.receipt.extra=true,x=>x.receipt.requestId='foreign',x=>x.receipt.targetSession='foreign',x=>x.receipt.receivedAt=new Date(1200).toISOString(),x=>x.receipt.isError=true,x=>x.receipt.content[0].type='image',x=>x.receipt.content[0].extra=true,x=>x.receipt.content[0].text='x'.repeat(65537),x=>x.admission.singleReadAdmissionObserved=false]){const x=structuredClone(base);change(x);assert.equal(screenNativePeerResult(x),null)}
})

test('successful transport cannot settle foreign or malformed session metadata',()=>{
 const report={startedAt:new Date(1000).toISOString(),completedAt:new Date(1100).toISOString(),resultWasError:false}
 const receipt={schemaVersion:1,scope:'owned-native-peer-result',probeId:id,requestId,brokerSession:config.brokerSession,targetSession:config.targetSession,startedAt:report.startedAt,receivedAt:new Date(1050).toISOString(),isError:false,content:[]}
 const base={config,requestId,report,receipt,admission:{singleReadAdmissionObserved:true}}
 for(const payload of ['', 'null', '[]', '{}', JSON.stringify({sessionId:'foreign',isArchived:false,isRunning:false}),JSON.stringify({sessionId:config.targetSession,isArchived:false,isRunning:'false'}),JSON.stringify({sessionId:config.targetSession,isArchived:false,isRunning:false,pinned:null})]){
  receipt.content=[{type:'text',text:payload}];assert.equal(screenNativePeerResult(base),null)
 }
 // Blocks join with a newline; use a JSON whitespace boundary.
 const split=metadataText.indexOf(',')+1
 receipt.content=[{type:'text',text:metadataText.slice(0,split)},{type:'text',text:metadataText.slice(split)}]
 assert.equal(screenNativePeerResult(base).ok,true)
})
