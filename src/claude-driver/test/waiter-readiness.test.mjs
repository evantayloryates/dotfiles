import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn,execFileSync} from 'node:child_process'
import {join} from 'node:path'
import {verifyWaiterReadiness,waitForNativeAvailability} from '../lib/waiter-readiness.mjs'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const epoch=()=>execFileSync('/bin/ps',['-p',String(process.pid),'-o','lstart='],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',LC_ALL:'C',TZ:'UTC'}}).trim()
const available=()=>({sessionId:'local_fixture',live:{entrypoint:'claude-desktop',pid:1,procStart:'epoch',status:'busy'},runtime:{integrity:true},resident:{resident:false}})

test('actual live native descendant and selected sealed entry prove a pickup channel; old work cannot',async()=>{
 const c=spawn(process.execPath,['-e','process.stdout.write("ready");setInterval(()=>{},1000)'],{stdio:['ignore','pipe','ignore']})
 const done=new Promise(resolve=>c.once('close',resolve))
 try{
  await new Promise(resolve=>c.stdout.once('data',resolve))
  const at=Date.now(),sessionId='local_fixture',brokerDir='/private/state/broker',pointer={sessionId,pid:process.pid,procStart:epoch(),build:'a'.repeat(64),bootstrapHash:'b'.repeat(64),generation:1,activatedAt:new Date(at-5000).toISOString()}
  const selected={...pointer,pid:c.pid,phase:'selected',at,script:join(brokerDir,'..','releases',pointer.build,'scripts','broker-wait.mjs'),nativeBinding:{ancestorVerified:true,brokerPid:process.pid,brokerProcStart:pointer.procStart,brokerSessionId:sessionId}}
  const base={sessionId,brokerDir,pointer,selected,live:{pid:process.pid,procStart:pointer.procStart,entrypoint:'claude-desktop'},runtime:{integrity:true},heartbeat:{pid:c.pid,ppid:process.pid,at:at+1,state:'waiting'},now:at+2}
  assert.equal(verifyWaiterReadiness(base).verified,true)
  for(const patch of [{state:'working'},{state:'rearming'},{state:'stopped'},{at:at-7000},{at:at+3000},{ppid:1},{pid:process.pid}])assert.equal(verifyWaiterReadiness({...base,heartbeat:{...base.heartbeat,...patch}}).verified,false)
  assert.equal(verifyWaiterReadiness({...base,completed:{...selected,phase:'completed',at:at+1}}).verified,false)
  assert.equal(verifyWaiterReadiness({...base,selected:{...selected,generation:2}}).verified,false)
  assert.equal(verifyWaiterReadiness({...base,live:{...base.live,procStart:'reused'}}).verified,false)
  for(const patch of [{activatedAt:'invalid'},{activatedAt:new Date(at+3000).toISOString()},{generation:undefined},{generation:0},{build:undefined},{bootstrapHash:'invalid'}])assert.equal(verifyWaiterReadiness({...base,pointer:{...pointer,...patch},selected:{...selected,...patch}}).verified,false)
  c.kill();await done;assert.equal(verifyWaiterReadiness(base).verified,false)
 }finally{if(c.exitCode===null)c.kill();await done}
})

test('finishing native turn is observed until stable idle, without a wake or queued request',async()=>{
 const info=available();let samples=0;const began=Date.now()
 const result=await waitForNativeAvailability(info,{deadline:began+2000,sleep,observe:()=>{samples++;return {...info,live:{...info.live,status:'idle'}}}})
 assert.equal(result.live.status,'idle');assert.ok(samples>=2);assert.ok(Date.now()-began>=500)
})

test('a real waiter can become available while native status remains busy',async()=>{
 const info=available();let n=0
 const result=await waitForNativeAvailability(info,{deadline:Date.now()+2000,sleep,observe:()=>{n++;return {...info,resident:{resident:true}}}})
 assert.equal(n,1);assert.equal(result.resident.resident,true)
})

test('deadline, cancellation and changed native epoch refuse before enqueue',async()=>{
 const info=available()
 await assert.rejects(waitForNativeAvailability(info,{deadline:Date.now()+25,sleep,observe:()=>info}),e=>e.category==='broker_busy'&&e.detail.retrySafe===true&&e.detail.dispatched===false)
 const signal=AbortSignal.abort()
 await assert.rejects(waitForNativeAvailability(info,{deadline:Date.now()+2000,sleep,signal,observe:()=>info}),e=>e.category==='cancelled'&&e.detail.dispatched===false)
 await assert.rejects(waitForNativeAvailability(info,{deadline:Date.now()+2000,sleep,observe:()=>({...info,live:{...info.live,pid:2}})}),e=>e.category==='broker_runtime_epoch_mismatch'&&e.detail.dispatched===false)
})
