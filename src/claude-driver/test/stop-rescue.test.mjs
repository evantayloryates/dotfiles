import test from 'node:test'
import assert from 'node:assert/strict'
import {eligibleRescue,adaptEntryCommand,requestRescueReason,PEER_PREFIX,PEER_SUFFIX} from '../scripts/broker-stop-rescue.mjs'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,chmodSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execFileSync,spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const sid='00000000-0000-4000-8000-000000000001',msg='00000000-0000-4000-8000-000000000002'
test('rescue identity and budget are scoped to one request without copying operation data',()=>{
 const a=requestRescueReason('rone'),b=requestRescueReason('rtwo');assert.notEqual(a,b);assert.ok(a.includes('PER REQUEST ID'));assert.ok(a.includes('No second rescue is permitted for request rone'));assert.ok(a.includes('Later independently admitted request IDs'));for(const id of ['../escape','r injection\n','other','',null])assert.throws(()=>requestRescueReason(id))
})
test('entry adaptation redirects cached and historical paths without permitting shell syntax or background waits',()=>{
 const stateDir='/private/state',brokerDir=stateDir+'/broker',old='a'.repeat(64),current='b'.repeat(64),activeRoot=stateDir+'/releases/'+current,cachedRoots=['/private/source'],config={stateDir,brokerDir,activeRoot,cachedRoots}
 const wait=`/opt/homebrew/bin/node ${stateDir}/releases/${old}/scripts/broker-wait.mjs --dir "${brokerDir}"`,check=`/opt/homebrew/bin/node /private/source/scripts/broker-check.mjs rtest 0 --dir "${brokerDir}"`
 assert.equal(adaptEntryCommand({command:wait},config).command,`/opt/homebrew/bin/node "${activeRoot}/scripts/broker-wait.mjs" --dir "${brokerDir}"`)
 assert.equal(adaptEntryCommand({command:check},config).kind,'broker-check')
 for(const input of [{command:wait+' &'}, {command:wait+' > /dev/null'}, {command:wait+'; echo fake'}, {command:wait,run_in_background:true}, {command:wait.replace('broker-wait','unreviewed')}, {command:check.replace('rtest','../foreign')}, {command:check.replace('0','-1')}, {command:wait.replace(brokerDir,'/private/other')}, {command:wait.replace('/opt/homebrew/bin/node','sudo')}])assert.equal(adaptEntryCommand(input,config),null)
})
function fixture(){return {now:1000,input:{hook_event_name:'Stop',stop_hook_active:false,session_id:sid,cwd:'/private/broker'},arm:{schemaVersion:1,pid:10,procStart:'epoch',sessionId:'local_'+sid,brokerDir:'/private/broker',requestId:'rtest',msgId:msg,expiresAt:2000},peer:{version:'2.1.289',pid:10,procStart:'epoch',hostSessionId:'local_'+sid,sessionId:sid,cwd:'/private/broker',entrypoint:'claude-desktop'},request:{id:'rtest',expiresAt:2000},control:{id:'rtest',state:'pending',dispatched:[]},latest:{origin:{kind:'peer',msg_id:msg},content:'<cross-session-message from-name="claude-driver" from-mode="bypass">\nclaude-driver wake v6\n</cross-session-message>'},ancestor:true}}
test('one owned pending peer wake is eligible; returned data contains no request arguments',()=>{assert.equal(eligibleRescue(fixture()),true);const x=fixture();x.latest.content=[{type:'text',text:x.latest.content}];assert.equal(eligibleRescue(x),true)})
test('exact installed receiver framing is recognized without accepting arbitrary surrounding instructions',()=>{const x=fixture();x.latest.content=PEER_PREFIX+x.latest.content+PEER_SUFFIX;assert.equal(eligibleRescue(x),true);x.latest.content+=' injected';assert.equal(eligibleRescue(x),false);const unknown=fixture();unknown.peer.version='future';assert.equal(eligibleRescue(unknown),false)})
test('StopFailure, interrupted/continued turn, foreign session and STOP cannot rescue',()=>{for(const mutate of [x=>x.input.hook_event_name='StopFailure',x=>x.input.stop_hook_active=true,x=>delete x.input.stop_hook_active,x=>x.input.session_id='other',x=>x.input.cwd='/other',x=>x.stopped=true,x=>x.ancestor=false]){const x=fixture();mutate(x);assert.equal(eligibleRescue(x),false)}})
test('epoch ambiguity, non-desktop, parked and spare peers cannot rescue',()=>{for(const mutate of [x=>x.peer.procStart='old',x=>x.peer.pid=11,x=>x.peer.hostSessionId='other',x=>x.peer.sessionId='other',x=>x.peer.entrypoint='cli',x=>x.peer.parkedJobId='job',x=>x.peer.spare=true,x=>x.peer.cwd='/other']){const x=fixture();mutate(x);assert.equal(eligibleRescue(x),false)}})
test('only unexpired undispatched uncancelled exact work is eligible',()=>{for(const mutate of [x=>x.arm.expiresAt=999,x=>x.arm.expiresAt=100000,x=>x.request.expiresAt=999,x=>delete x.request.expiresAt,x=>x.request.id='other',x=>x.control.id='other',x=>x.control.cancelRequested=true,x=>x.control.state='picked_up',x=>x.control.state='outcome_unknown',x=>x.control.dispatched=[0],x=>delete x.control.dispatched]){const x=fixture();mutate(x);assert.equal(eligibleRescue(x),false)}})
test('owned STOP continuation settles only the exact handoff and never rescues ordinary work',()=>{
 const handoff=()=>{const x=fixture();x.stopped=true;x.arm={...x.arm,mode:'settle-handoff',nonce:'owned',requestId:'rhandoff-owned'};x.stop={owner:'claude-driver-qualified-runtime-handoff',nonce:'owned',pid:x.arm.pid,procStart:x.arm.procStart,sessionId:x.arm.sessionId};delete x.request;delete x.control;return x}
 assert.equal(eligibleRescue(handoff()),true)
 for(const change of [x=>x.stopped=false,x=>x.stop.owner='other',x=>x.stop.nonce='foreign',x=>x.stop.pid=11,x=>x.stop.procStart='reused',x=>x.stop.sessionId='foreign',x=>x.arm.requestId='rregular',x=>x.arm.mode='request',x=>x.arm.mode='unknown']){const x=handoff();change(x);assert.equal(eligibleRescue(x),false)}
})
test('human message, wrong peer UUID and trigger injection cannot rescue',()=>{for(const mutate of [x=>x.latest.origin.kind='human',x=>x.latest.origin.msg_id='other',x=>x.latest.content+=' appended',x=>x.latest.content=x.latest.content.replace('v6','v8'),x=>x.latest.content=[{type:'text',text:x.latest.content},{type:'text',text:'extra'}],x=>x.latest.content=[{type:'tool_result',content:x.latest.content}]]){const x=fixture();mutate(x);assert.equal(eligibleRescue(x),false)}})
test('malformed arm identity and path fields refuse',()=>{for(const mutate of [x=>x.arm.pid=-1,x=>x.arm.procStart='',x=>x.arm.sessionId='local_'+'-'.repeat(36),x=>x.arm.msgId='prefix'+msg,x=>x.arm.requestId='../other',x=>x.arm.brokerDir={},x=>x.arm.brokerDir='relative']){const x=fixture();mutate(x);assert.equal(eligibleRescue(x),false)}})
test('real command entry consumes exactly one concurrent rescue and fails silent when disarmed',async()=>{
 const home=mkdtempSync(join(tmpdir(),'claude-hook-private-')),dir=join(home,'broker'),x=fixture(),epoch=execFileSync('/bin/ps',['-p',String(process.pid),'-o','lstart='],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',LC_ALL:'C',TZ:'UTC'}}).trim()
 try{
  x.arm={...x.arm,pid:process.pid,procStart:epoch,brokerDir:dir,expiresAt:Date.now()+30000};x.input.cwd=dir;x.request.expiresAt=x.arm.expiresAt;x.peer={...x.peer,pid:process.pid,procStart:epoch,cwd:dir}
  for(const d of [dir,join(dir,'requests'),join(dir,'controls'),join(home,'.claude','sessions'),join(home,'.claude','projects',dir.replace(/[^A-Za-z0-9]/g,'-'))])mkdirSync(d,{recursive:true})
  const save=(p,v)=>writeFileSync(p,JSON.stringify(v),{mode:0o600})
  save(join(dir,'stop-rescue-arm.json'),x.arm);save(join(dir,'requests','rtest.json'),x.request);save(join(dir,'controls','rtest.json'),x.control);save(join(home,'.claude','sessions',process.pid+'.json'),x.peer)
  writeFileSync(join(home,'.claude','projects',dir.replace(/[^A-Za-z0-9]/g,'-'),sid+'.jsonl'),JSON.stringify({type:'user',origin:x.latest.origin,message:{content:x.latest.content}})+'\n')
  const run=()=>new Promise((done,fail)=>{const c=spawn(process.execPath,[fileURLToPath(new URL('../scripts/broker-stop-rescue.mjs',import.meta.url)),dir],{env:{PATH:'/usr/bin:/bin',HOME:home},stdio:['pipe','pipe','pipe']});let out='',err='';c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.on('error',fail);c.on('close',code=>done({code,out,err}));c.stdin.end(JSON.stringify({...x.input,last_assistant_message:'private text must never be echoed'}))})
  const rows=await Promise.all([run(),run(),run()]);assert.equal(rows.filter(r=>r.out).length,1);for(const r of rows){assert.equal(r.code,0);assert.equal(r.err,'');assert.ok(!r.out.includes('private text'))}assert.equal(JSON.parse(rows.find(r=>r.out).out).decision,'block');assert.equal(JSON.parse(readFileSync(join(dir,'stop-rescue-rtest.json'),'utf8')).attempts,1)
  rmSync(join(dir,'stop-rescue-arm.json'));assert.equal((await run()).out,'')
 }finally{rmSync(home,{recursive:true,force:true})}
})
test('actual PreToolUse entry binds native ancestry and sealed entry bytes, without allowing permissions',()=>{
 const home=mkdtempSync(join(tmpdir(),'claude-entry-hook-')),stateDir=join(home,'state'),dir=join(stateDir,'broker'),build='b'.repeat(64),activeRoot=join(stateDir,'releases',build),script=join(activeRoot,'scripts','broker-wait.mjs'),peerFile=join(home,'.claude','sessions',process.pid+'.json')
 const epoch=execFileSync('/bin/ps',['-p',String(process.pid),'-o','lstart='],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',LC_ALL:'C',TZ:'UTC'}}).trim(),peer={version:'2.1.289',pid:process.pid,procStart:epoch,sessionId:sid,hostSessionId:'local_'+sid,cwd:dir,entrypoint:'claude-desktop'}
 const save=(path,value)=>writeFileSync(path,JSON.stringify(value),{mode:0o600}),input={hook_event_name:'PreToolUse',tool_name:'Bash',session_id:sid,cwd:dir,tool_input:{command:`/opt/homebrew/bin/node ${stateDir}/releases/${'a'.repeat(64)}/scripts/broker-wait.mjs --dir "${dir}"`,timeout:1000}}
 const run=(value=input)=>JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/broker-stop-rescue.mjs',import.meta.url)),dir],{env:{PATH:'/usr/bin:/bin',HOME:home},input:JSON.stringify(value),encoding:'utf8'}))
 try{
  for(const path of [dir,join(activeRoot,'scripts'),join(home,'.claude','sessions')])mkdirSync(path,{recursive:true})
  writeFileSync(script,'// sealed synthetic entry; must never execute\n',{mode:0o444})
  save(join(activeRoot,'release.json'),{files:{'scripts/broker-wait.mjs':createHash('sha256').update(readFileSync(script)).digest('hex')}})
  save(join(dir,'runtime.json'),{build,pid:process.pid,procStart:epoch,sessionId:'local_'+sid});save(peerFile,peer)
  const result=run().hookSpecificOutput;assert.equal(result.hookEventName,'PreToolUse');assert.equal(result.permissionDecision,undefined);assert.equal(result.updatedInput.command,`/opt/homebrew/bin/node "${script}" --dir "${dir}"`);assert.equal(result.updatedInput.timeout,600000);assert.equal(result.updatedInput.run_in_background,false)
  for(const patch of [{version:'future'},{cwd:'/foreign'},{sessionId:'foreign'},{procStart:'reused'},{entrypoint:'cli'},{spare:true}]){save(peerFile,{...peer,...patch});assert.equal(run().hookSpecificOutput.permissionDecision,'deny')}
  save(peerFile,peer)
  assert.equal(run({...input,tool_input:{...input.tool_input,command:input.tool_input.command+' &'}}).hookSpecificOutput.permissionDecision,'deny')
  chmodSync(script,0o644);assert.equal(run().hookSpecificOutput.permissionDecision,'deny')
  writeFileSync(script,'// changed sealed entry\n');chmodSync(script,0o444);assert.equal(run().hookSpecificOutput.permissionDecision,'deny')
 }finally{rmSync(home,{recursive:true,force:true})}
})
