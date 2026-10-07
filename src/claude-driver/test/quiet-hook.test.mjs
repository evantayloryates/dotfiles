import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawn,execFileSync} from 'node:child_process'
import {eligibleQuietRequest,quietEntryTrusted,requestRescueReason,PEER_PREFIX,PEER_SUFFIX} from '../scripts/broker-stop-rescue.mjs'
import {verifyQuietHookEvidence} from '../lib/quiet-hook.mjs'

const sid='00000000-0000-4000-8000-000000000001',msgId='00000000-0000-4000-8000-000000000002'
const script=fileURLToPath(new URL('../scripts/broker-stop-rescue.mjs',import.meta.url))
const hash=b=>createHash('sha256').update(b).digest('hex')
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const save=(p,v)=>writeFileSync(p,JSON.stringify(v),{mode:0o600})
const wake='<cross-session-message from-name="claude-driver" from-mode="bypass">\nclaude-driver wake v6\n</cross-session-message>'
async function until(fn){const end=Date.now()+4000;while(Date.now()<end){if(fn())return;await sleep(20)}throw Error('isolated hook did not reach expected state')}
function setup(){
 const home=mkdtempSync(join(tmpdir(),'claude-quiet-hook-')),dir=join(home,'state','broker'),sessionId='local_'+sid
 const procStart=execFileSync('/bin/ps',['-p',String(process.pid),'-o','lstart='],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',LC_ALL:'C',TZ:'UTC'}}).trim()
 for(const d of [dir,join(dir,'.claude'),join(dir,'requests'),join(dir,'controls'),join(home,'.claude','sessions'),join(home,'.claude','projects',dir.replace(/[^A-Za-z0-9]/g,'-'))])mkdirSync(d,{recursive:true})
 const settings=join(dir,'.claude','settings.json');save(settings,{hooks:{}})
 const policy={schemaVersion:1,nativeEffectAdmissionVersion:1,sessionId,pid:process.pid,procStart,sha256:hash(readFileSync(script)),settingsHash:hash(readFileSync(settings)),quietWait:{version:1,maxMs:2000}}
 const pointer={sessionId,pid:process.pid,procStart,build:'a'.repeat(64),generation:1}
 save(join(dir,'stop-rescue-policy.json'),policy);save(join(dir,'runtime.json'),pointer)
 save(join(home,'.claude','sessions',process.pid+'.json'),{...pointer,sessionId:sid,hostSessionId:sessionId,version:'2.1.289',entrypoint:'claude-desktop',cwd:dir})
 save(join(dir,'quiet-last-wake.json'),{requestId:'rwake',pid:process.pid,procStart,msgId})
 const transcript=join(home,'.claude','projects',dir.replace(/[^A-Za-z0-9]/g,'-'),sid+'.jsonl')
 const latest=()=>writeFileSync(transcript,JSON.stringify({type:'user',origin:{kind:'peer',msg_id:msgId},message:{content:PEER_PREFIX+wake+PEER_SUFFIX}})+'\n')
 latest()
 const request=id=>({id,createdAt:new Date().toISOString(),expiresAt:Date.now()+10000,protocol:7,ops:[{op:'get_session',args:{session_id:sessionId}}],nativeObservation:{brokerSessionId:sessionId},nativeEffectAdmissionPolicy:{version:1,handlerSha256:policy.sha256,settingsHash:policy.settingsHash}})
 const enqueue=(id,patch={})=>{save(join(dir,'requests',id+'.json'),{...request(id),...patch});save(join(dir,'controls',id+'.json'),{id,state:'pending',dispatched:[]});save(join(dir,'quiet-request.json'),{requestId:id})}
 const children=[]
 const run=(continued=false)=>{
  const c=spawn(process.execPath,[script,dir,'Stop'],{env:{PATH:'/usr/bin:/bin',HOME:home},stdio:['pipe','pipe','pipe']});children.push(c)
  let out='',err='';c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b)
  const done=new Promise((resolve,reject)=>{c.on('error',reject);c.on('close',code=>resolve({code,out,err}))})
  c.stdin.end(JSON.stringify({hook_event_name:'Stop',stop_hook_active:continued,cwd:dir,session_id:sid,last_assistant_message:'never copy this private content'}))
  return {c,done,output:()=>out}
 }
 const cleanup=()=>{for(const c of children)if(c.exitCode===null)c.kill();rmSync(home,{recursive:true,force:true})}
 return {home,dir,policy,pointer,request,enqueue,run,transcript,cleanup}
}

test('quiet wait emits no idle feedback; simultaneous helpers cannot consume two budgets',async()=>{
 const x=setup();try{
  const a=x.run();await until(()=>existsSync(join(x.dir,'quiet-hook.json')))
  assert.equal(a.output(),'');const marker=JSON.parse(readFileSync(join(x.dir,'quiet-hook.json')));assert.equal(marker.helperPid,a.c.pid);assert.equal(marker.nativePid,process.pid)
  const b=await x.run().done;assert.equal(b.out,'');assert.equal(b.code,0)
  x.enqueue('rone');const result=await a.done;assert.equal(result.code,0);assert.equal(result.err,'');assert.equal(JSON.parse(result.out).reason,requestRescueReason('rone'));assert.ok(!result.out.includes('private content'));assert.ok(!existsSync(join(x.dir,'quiet-hook.json')))
  // Same request, continued Stop: no second feedback. A distinct request owns
  // its own admission, regardless of the platform's continued-hook flag.
  writeFileSync(x.transcript,JSON.stringify({type:'user',isMeta:true,message:{content:'Stop hook feedback:\n'+requestRescueReason('rone')}})+'\n')
  const next=x.run(true);await until(()=>existsSync(join(x.dir,'quiet-hook.json')));await sleep(100);assert.equal(next.output(),'')
  x.enqueue('rtwo');const second=await next.done;assert.equal(JSON.parse(second.out).reason,requestRescueReason('rtwo'));assert.equal(JSON.parse(readFileSync(join(x.dir,'stop-rescue-rone.json'))).attempts,1)
 }finally{x.cleanup()}
})

test('STOP terminates an actual quiet helper without inference or consumption',async()=>{
 const x=setup();try{const a=x.run();await until(()=>existsSync(join(x.dir,'quiet-hook.json')));save(join(x.dir,'STOP'),{owner:'test'});x.enqueue('rone');const r=await a.done;assert.equal(r.out,'');assert.equal(r.code,0);assert.ok(!existsSync(join(x.dir,'stop-rescue-rone.json')));assert.ok(!existsSync(join(x.dir,'quiet-hook.json')))}finally{x.cleanup()}
})

test('cancelled and expired work are ignored; policy drift ends waiting',async()=>{
 const x=setup();try{
  x.enqueue('rone');save(join(x.dir,'controls','rone.json'),{id:'rone',state:'pending',dispatched:[],cancelRequested:true})
  const a=x.run();await until(()=>existsSync(join(x.dir,'quiet-hook.json')));await sleep(100);assert.equal(a.output(),'')
  x.enqueue('rtwo',{expiresAt:Date.now()-1});await sleep(250);assert.equal(a.output(),'')
  save(join(x.dir,'stop-rescue-policy.json'),{...x.policy,sha256:'b'.repeat(64)});const r=await a.done;assert.equal(r.out,'');assert.ok(!existsSync(join(x.dir,'stop-rescue-rone.json')));assert.ok(!existsSync(join(x.dir,'stop-rescue-rtwo.json')))
 }finally{x.cleanup()}
})

test('request identity, deadline, policy, cancellation and epoch are all required',()=>{
 const x=setup();try{
  const base={request:x.request('rone'),control:{id:'rone',state:'pending',dispatched:[]},policy:x.policy,pointer:x.pointer}
  assert.equal(eligibleQuietRequest(base),true)
  for(const change of [r=>r.id='../escape',r=>r.protocol=8,r=>r.expiresAt=NaN,r=>r.expiresAt=0,r=>r.createdAt='future?',r=>r.nativeObservation.brokerSessionId='foreign',r=>r.nativeEffectAdmissionPolicy.settingsHash='foreign',r=>r.ops=[]]){const request=structuredClone(base.request);change(request);assert.equal(eligibleQuietRequest({...base,request}),false)}
  for(const patch of [{state:'dispatched'},{dispatched:[0]},{cancelRequested:true},{id:'foreign'}])assert.equal(eligibleQuietRequest({...base,control:{...base.control,...patch}}),false)
  const trusted={latest:{origin:{kind:'peer',msg_id:msgId},content:wake},wake:{pid:x.policy.pid,procStart:x.policy.procStart,msgId,requestId:'rwake'},policy:x.policy}
  assert.equal(quietEntryTrusted(trusted),true);assert.equal(quietEntryTrusted({...trusted,latest:{...trusted.latest,content:wake+' injected'}}),false)
  assert.equal(quietEntryTrusted({...trusted,latest:{content:'Stop hook feedback:\n'+requestRescueReason('rone'),isMeta:true},consumption:{pid:x.policy.pid,procStart:x.policy.procStart,requestId:'rone',attempts:1}}),true)
  assert.equal(quietEntryTrusted({...trusted,latest:{content:'Stop hook feedback:\n'+requestRescueReason('rone'),isMeta:false},consumption:{pid:x.policy.pid,procStart:x.policy.procStart,requestId:'rone',attempts:1}}),false)
 }finally{x.cleanup()}
})

test('foreign human messages cannot start a mechanical wait',async()=>{
 const x=setup();try{writeFileSync(x.transcript,JSON.stringify({type:'user',message:{content:'please stay running'}})+'\n');x.enqueue('rone');const r=await x.run().done;assert.equal(r.out,'');assert.ok(!existsSync(join(x.dir,'quiet-hook.json')));assert.ok(!existsSync(join(x.dir,'stop-rescue-rone.json')))}finally{x.cleanup()}
})

test('real helper ancestry establishes readiness; death, stale metadata and epoch drift revoke it',async()=>{
 const x=setup();try{
  const a=x.run();await until(()=>existsSync(join(x.dir,'quiet-hook.json')))
  const m=JSON.parse(readFileSync(join(x.dir,'quiet-hook.json'))),owner=JSON.parse(readFileSync(join(x.dir,'quiet-hook-owner.json')))
  const base={sessionId:x.policy.sessionId,live:{...x.pointer,entrypoint:'claude-desktop'},p:x.policy,pointer:x.pointer,m,owner}
  assert.equal(verifyQuietHookEvidence(base).verified,true)
  for(const patch of [{nativeStart:'old'},{helperPid:process.pid},{deadline:Date.now()-1},{at:Date.now()-4000},{generation:2},{helperStart:'reused'}])assert.equal(verifyQuietHookEvidence({...base,m:{...m,...patch}}).verified,false)
  assert.equal(verifyQuietHookEvidence({...base,owner:{...owner,token:'foreign'}}).verified,false)
  a.c.kill();await a.done;assert.equal(verifyQuietHookEvidence(base).verified,false)
 }finally{x.cleanup()}
})

test('idle timeout exits without output; an owned handoff retains its separate settlement path',async()=>{
 const x=setup();try{
  save(join(x.dir,'stop-rescue-policy.json'),{...x.policy,quietWait:{version:1,maxMs:1000}})
  const a=x.run();await until(()=>existsSync(join(x.dir,'quiet-hook.json')));const r=await a.done;assert.equal(r.out,'');assert.ok(!existsSync(join(x.dir,'quiet-hook.json')))
  const arm={schemaVersion:1,mode:'settle-handoff',nonce:'owned',sessionId:x.policy.sessionId,brokerDir:x.dir,pid:process.pid,procStart:x.policy.procStart,msgId,requestId:'rhandoff-owned',expiresAt:Date.now()+10000}
  save(join(x.dir,'stop-rescue-arm.json'),arm);save(join(x.dir,'STOP'),{owner:'claude-driver-qualified-runtime-handoff',nonce:'owned',sessionId:x.policy.sessionId,pid:process.pid,procStart:x.policy.procStart})
  const stopped=await x.run().done;assert.ok(JSON.parse(stopped.out).reason.includes('explicitly owned claude-driver runtime handoff STOP'));assert.ok(!existsSync(join(x.dir,'quiet-hook.json')))
 }finally{x.cleanup()}
})
