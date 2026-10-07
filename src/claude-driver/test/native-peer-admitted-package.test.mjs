import test from 'node:test'
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {buildAdmittedNativePeerPackage} from '../lib/native-peer-admitted-package.mjs'
import {installedWindowContaining,cutInstalledFunction} from '../lib/installed-source.mjs'
import {resolveClaudeBinary} from '../lib/paths.mjs'
const id='11111111-1111-4111-8111-111111111111',cwd='/Users/taylor/.local/state/claude-driver/broker',probe={id,token:'claude-driver native-check '+'a'.repeat(32),brokerSession:'local_11111111-1111-4111-8111-111111111111',targetSession:'local_22222222-2222-4222-8222-222222222222',brokerCwd:cwd,ready:'/Users/taylor/Desktop/temp_reports/native-peer-ready-'+id+'.json',intent:cwd+'/.native-peer-read-'+id+'.started.json',report:'/Users/taylor/Desktop/temp_reports/native-peer-read-'+id+'.report.json',notBefore:1000,deadline:2000},config={probe,requestId:'rpeer'+id.replaceAll('-',''),build:'a'.repeat(64)}
test('installed public native tool API requires object input and preserves Bash command',async()=>{
 const s=installedWindowContaining(resolveClaudeBinary(),'var gk=(e,t,o)=>Ny({call:',{after:14000}).text,code=cutInstalledFunction(s,'var nw=','var sw=')
 const api=runInNewContext(`(()=>{${code};return nw})()`,{Ny:x=>x,N:x=>!!x&&typeof x==='object',Ie:Error}),calls=[],tool=api('synthetic',(event,input)=>calls.push({event,input}))
 const input={tool:'Bash',command:buildAdmittedNativePeerPackage(config).command,timeout:5000,run_in_background:false};await tool.call(input)
 assert.equal(calls[0].event,'tool.call');assert.equal(calls[0].input,input);await assert.rejects(tool.call('Bash'));assert.equal(calls.length,1)
})
test('generated admitted probe checks exact helper output before native read and consumes any refusal once',async()=>{
 for(const scenario of ['valid','deny','wrong-target','extra-key','malformed']){
  const pkg=buildAdmittedNativePeerPackage(config),hooks=new Map(),writes=[],calls=[]
  const register=runInNewContext(pkg.files['hooks/register.js'].replace('export function register','function register')+';register',{Object,JSON,Date,Error,Number})
  register((event,fn)=>hooks.set(event,fn))
  const $={session:{id:async()=>probe.brokerSession,cwd:async()=>cwd},clock:{now:async()=>1000},fs:{exists:async()=>false,write:async(p,text)=>writes.push({p,data:JSON.parse(text)})},tool:{call:async input=>{calls.push(input.tool);assert.equal(input.command,pkg.command);const checked={dispatch:true,op:'get_session',args:{session_id:probe.targetSession}};if(scenario==='wrong-target')checked.args.session_id='foreign';if(scenario==='extra-key')checked.extra=true;return scenario==='deny'?{deny:'synthetic'}:{text:scenario==='malformed'?'non-json':JSON.stringify(checked)}}},mcp:{call:async()=>{calls.push('MCP');return {isError:false}}}}
  const receive=hooks.get('session.receive'),event={origin:{kind:'peer'},text:probe.token},next=()=>assert.fail('queued')
  await receive($,event,next);await receive($,event,next)
  assert.deepEqual(calls,scenario==='valid'?['Bash','MCP']:['Bash']);assert.equal(writes.length,2);assert.equal(writes[1].data.nativeCallReturned,scenario==='valid')
 }
 assert.throws(()=>buildAdmittedNativePeerPackage({...config,requestId:'rpeer'+'b'.repeat(32)}))
})
