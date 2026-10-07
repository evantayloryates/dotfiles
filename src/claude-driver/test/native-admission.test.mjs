import test from 'node:test'
import assert from 'node:assert/strict'
import {nativeAdmissionIndex} from '../scripts/broker-stop-rescue.mjs'
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {execFileSync,spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const sid='00000000-0000-4000-8000-000000000090',tool='mcp__ccd_session_mgmt__get_session'
function fixture(){const now=Date.now(),pointer={build:'b'.repeat(64),bootstrapHash:'c'.repeat(64),generation:6,pid:10,procStart:'epoch',sessionId:'local_'+sid,activatedAt:new Date(now-1000).toISOString()},entry={phase:'completed',requestId:'rnative',index:0,build:pointer.build,bootstrapHash:pointer.bootstrapHash,generation:6,at:now-10,nativeBinding:{ancestorVerified:true,brokerPid:10,brokerProcStart:'epoch',brokerSessionId:pointer.sessionId}},request={id:'rnative',expiresAt:now+30000,ops:[{op:'get_session',args:{session_id:'owned-fixture'}}]},control={id:'rnative',state:'dispatched',dispatched:[0]},input={hook_event_name:'PreToolUse',tool_name:tool,tool_use_id:'toolu_native_test',tool_input:{session_id:'owned-fixture'},session_id:sid};return {now,pointer,entry,request,control,input,tools:{get_session:tool}}}
test('native boundary admits one exact checkpoint and refuses cancelled, expired, foreign or ambiguous work',()=>{
 assert.equal(nativeAdmissionIndex(fixture()),0)
 for(const change of [x=>x.request.expiresAt=x.now,x=>x.control.cancelRequested=true,x=>x.control.state='cancelled',x=>x.control.dispatched=[],x=>x.entry.phase='selected',x=>x.entry.requestId='other',x=>x.entry.nativeBinding.brokerPid=11,x=>x.entry.generation=5,x=>x.input.tool_name='mcp__ccd_unknown',x=>x.input.tool_input.session_id='foreign',x=>x.entry.index=-1,x=>x.input.tool_use_id='../unsafe']){const x=fixture();change(x);assert.equal(nativeAdmissionIndex(x),-1)}
 const x=fixture();x.request.ops.push(x.request.ops[0]);x.control.dispatched.push(1);delete x.entry.index;assert.equal(nativeAdmissionIndex(x),-1);x.entry.index=1;assert.equal(nativeAdmissionIndex(x),1)
})
test('actual command hook explicitly denies malformed and oversized PreToolUse input without rescuing Stop',()=>{
 const script=fileURLToPath(new URL('../scripts/broker-stop-rescue.mjs',import.meta.url))
 for(const input of ['not-json','null','[]',JSON.stringify({hook_event_name:'Stop'}),'x'.repeat(65537)]){
  const out=execFileSync(process.execPath,[script,'/service-owned-broker','PreToolUse'],{input,encoding:'utf8'})
  assert.equal(JSON.parse(out).hookSpecificOutput.permissionDecision,'deny');assert.equal(JSON.parse(out).hookSpecificOutput.hookEventName,'PreToolUse')
 }
 assert.equal(execFileSync(process.execPath,[script,'/service-owned-broker','Stop'],{input:'not-json',encoding:'utf8'}),'')
})
test('actual hook denies dispatch:false and consumes native admission once even under concurrent invocations',async()=>{
 const home=mkdtempSync(join(tmpdir(),'claude-native-gate-')),state=join(home,'state'),dir=join(state,'broker'),x=fixture(),epoch=execFileSync('/bin/ps',['-p',String(process.pid),'-o','lstart='],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',LC_ALL:'C',TZ:'UTC'}}).trim(),root=join(state,'releases',x.pointer.build)
 const save=(p,v)=>writeFileSync(p,JSON.stringify(v),{mode:0o600}),run=()=>new Promise((done,fail)=>{const c=spawn(process.execPath,[fileURLToPath(new URL('../scripts/broker-stop-rescue.mjs',import.meta.url)),dir],{env:{HOME:home,PATH:'/usr/bin:/bin'},stdio:['pipe','pipe','pipe']});let out='',err='';c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.on('error',fail);c.on('close',code=>{try{assert.equal(code,0);assert.equal(err,'');done(JSON.parse(out).hookSpecificOutput)}catch(e){fail(e)}});c.stdin.end(JSON.stringify(x.input))})
 try{
  for(const p of [dir,join(dir,'requests'),join(dir,'controls'),join(root,'broker-template'),join(home,'.claude','sessions')])mkdirSync(p,{recursive:true})
  x.pointer.pid=process.pid;x.pointer.procStart=epoch;x.entry.nativeBinding={ancestorVerified:true,brokerPid:process.pid,brokerProcStart:epoch,brokerSessionId:x.pointer.sessionId};x.input.cwd=dir
  const body=`| get_session | ${tool} |\n`;writeFileSync(join(root,'broker-template','CLAUDE.md'),body,{mode:0o444});save(join(root,'release.json'),{files:{'broker-template/CLAUDE.md':createHash('sha256').update(body).digest('hex')}})
  save(join(dir,'runtime.json'),x.pointer);save(join(dir,'broker-check-entry.json'),x.entry);save(join(dir,'requests','rnative.json'),x.request);const controlFile=join(dir,'controls','rnative.json');save(controlFile,{...x.control,dispatched:[]})
  mkdirSync(join(dir,'.claude'));const settings='{}';writeFileSync(join(dir,'.claude','settings.json'),settings)
  const policy={nativeEffectAdmissionVersion:1,sha256:createHash('sha256').update(readFileSync(fileURLToPath(new URL('../scripts/broker-stop-rescue.mjs',import.meta.url)))).digest('hex'),settingsHash:createHash('sha256').update(settings).digest('hex')};save(join(dir,'stop-rescue-policy.json'),policy);x.request.nativeEffectAdmissionPolicy={version:1,handlerSha256:policy.sha256,settingsHash:policy.settingsHash};save(join(dir,'requests','rnative.json'),x.request)
  save(join(home,'.claude','sessions',process.pid+'.json'),{pid:process.pid,procStart:epoch,sessionId:sid,hostSessionId:'local_'+sid,version:'2.1.289',entrypoint:'claude-desktop',cwd:dir})
  assert.equal((await run()).permissionDecision,'deny')
  save(controlFile,{...x.control,cancelRequested:true});assert.equal((await run()).permissionDecision,'deny')
  save(controlFile,x.control)
  const settingsFile=join(dir,'.claude','settings.json'),policyFile=join(dir,'stop-rescue-policy.json'),requestFile=join(dir,'requests','rnative.json'),peerFile=join(home,'.claude','sessions',process.pid+'.json'),peer=JSON.parse(readFileSync(peerFile))
  for(const change of [()=>save(policyFile,{...policy,nativeEffectAdmissionVersion:0}),()=>save(policyFile,{...policy,sha256:'a'.repeat(64)}),()=>save(requestFile,{...x.request,nativeEffectAdmissionPolicy:undefined}),()=>writeFileSync(settingsFile,'{ }'),()=>save(peerFile,{...peer,version:'unknown'}),()=>{x.input.cwd=state},()=>save(join(dir,'STOP'),{owner:'owned-test'})]){
   change();assert.equal((await run()).permissionDecision,'deny');assert.equal(existsSync(join(dir,'native-admission-rnative-0.json')),false)
   save(policyFile,policy);save(requestFile,x.request);writeFileSync(settingsFile,settings);save(peerFile,peer);x.input.cwd=dir;rmSync(join(dir,'STOP'),{force:true})
  }
  save(controlFile,x.control);const outputs=await Promise.all([run(),run(),run()]);assert.equal(outputs.filter(x=>x.permissionDecision===undefined).length,1);assert.equal(outputs.filter(x=>x.permissionDecision==='deny').length,2)
  const receipt=JSON.parse(readFileSync(join(dir,'native-admission-rnative-0.json')));assert.equal(receipt.toolUseId,x.input.tool_use_id);assert.equal(receipt.pid,process.pid)
 }finally{rmSync(home,{recursive:true,force:true})}
})
