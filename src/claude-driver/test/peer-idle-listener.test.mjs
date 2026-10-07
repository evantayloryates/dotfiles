import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer,createConnection} from 'node:net'
import {spawn} from 'node:child_process'
import {mkdtempSync,rmSync,existsSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
const python=fileURLToPath(new URL('../scripts/peer-idle-listener.py',import.meta.url))
async function run(change={},expectedPid=process.pid,{cancel=false}={}){
 const dir=mkdtempSync(join(tmpdir(),'idle-ipc-')),target=join(dir,'target.sock'),reply=join(dir,'reply.sock'),id='11111111-1111-4111-8111-111111111111';let calls=0
 let child
 const server=createServer(s=>{calls++;let b='';s.on('data',x=>b+=x);s.on('end',()=>{
  if(cancel){child.kill('SIGTERM');return}
  const c=createConnection(reply);c.on('error',()=>{});c.on('connect',()=>c.end(JSON.stringify({type:'control',action:'peer_idle_notice',from:'uds:'+target,orig_msg_id:id,state:'idle',detail:'PRIVATE_CONTENT',...change})+'\n'))
 })})
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(target,resolve)})
 child=spawn('/usr/bin/python3',[python,reply,String(expectedPid),String(process.getuid())],{stdio:['pipe','pipe','ignore']});let buffer='',result
 child.stdout.on('data',x=>{buffer+=x;for(;;){const at=buffer.indexOf('\n');if(at<0)break;const r=JSON.parse(buffer.slice(0,at));buffer=buffer.slice(at+1);if(r.ready)child.stdin.end(JSON.stringify({socket:target,lines:'synthetic request\n',msgId:id})+'\n');else result=r}})
 try{await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve)});return {result,calls,removed:!existsSync(reply)}}finally{server.close();rmSync(dir,{recursive:true,force:true})}
}
test('macOS kernel-bound idle reply accepts matching nonce and excludes private detail', {skip:process.platform!=='darwin'},async()=>{
 const r=await run();assert.equal(r.result.ok,true);assert.equal(r.result.kernelPeerPid,process.pid);assert.equal(r.result.releaseAuthorized,false);assert.equal(r.result.detailPresent,true);assert.ok(!JSON.stringify(r).includes('PRIVATE_CONTENT'));assert.equal(r.removed,true)
})
test('macOS reply refuses foreign nonce/address/state/time and always removes its listener', {skip:process.platform!=='darwin'},async()=>{
 for(const change of [{orig_msg_id:'foreign'},{from:'uds:/foreign'},{state:'running'},{finished_at:Date.now()+60000}]){const r=await run(change);assert.equal(r.result.ok,false);assert.equal(r.removed,true)}
 const foreign=await run({},process.pid+100000);assert.equal(foreign.result.ok,false);assert.equal(foreign.calls,1);assert.equal(foreign.removed,true)
})
test('listener cancellation cleans up owned socket but never claims native subscription cancellation', {skip:process.platform!=='darwin'},async()=>{
 const r=await run({},process.pid,{cancel:true});assert.equal(r.result.ok,false);assert.equal(r.result.failure,'listener_cancelled');assert.equal(r.result.nativeSubscriptionCancelled,false);assert.equal(r.removed,true)
})
test('service receiver survives publisher pipe closure before subscription acknowledgment', {skip:process.platform!=='darwin'},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'idle-service-ipc-')),target=join(dir,'target.sock'),reply=join(dir,'reply.sock'),receipt=join(dir,'notice.json'),id='11111111-1111-4111-8111-111111111111'
 const server=createServer(s=>{s.resume();s.on('end',()=>setTimeout(()=>{const c=createConnection(reply);c.on('error',()=>{});c.on('connect',()=>c.end(JSON.stringify({type:'control',action:'peer_idle_notice',from:'uds:'+target,orig_msg_id:id,state:'idle',detail:'PRIVATE_CONTENT'})+'\n'))},150))})
 await new Promise(resolve=>server.listen(target,resolve))
 const child=spawn('/usr/bin/python3',[python,reply,String(process.pid),String(process.getuid()),'2','--service'],{detached:true,stdio:['pipe','pipe','pipe']});let ready='';const closed=new Promise(resolve=>child.on('close',resolve))
 child.stdout.on('data',x=>{ready+=x;if(ready.includes('\n')){child.stdin.end(JSON.stringify({socket:target,lines:'synthetic request\n',msgId:id,receiptPath:receipt})+'\n');child.stdout.destroy()}})
 try{
  const code=await closed;assert.equal(code,0)
  const result=JSON.parse(readFileSync(receipt));assert.equal(result.ok,true);assert.equal(result.kernelPeerPid,process.pid);assert.equal(result.listenerRemoved,true);assert.equal(existsSync(reply),false);assert.equal(JSON.stringify(result).includes('PRIVATE_CONTENT'),false)
 }finally{child.kill('SIGTERM');server.close();rmSync(dir,{recursive:true,force:true})}
})
test('detached service receiver records a notice after its publishing harness exits', {skip:process.platform!=='darwin'},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'idle-harness-exit-')),target=join(dir,'target.sock'),reply=join(dir,'reply.sock'),receipt=join(dir,'notice.json'),id='11111111-1111-4111-8111-111111111111'
 let publisherClosed,calls=0
 const server=createServer(s=>{calls++;s.resume();s.on('end',async()=>{await publisherClosed;const c=createConnection(reply);c.on('error',()=>{});c.on('connect',()=>c.end(JSON.stringify({type:'control',action:'peer_idle_notice',from:'uds:'+target,orig_msg_id:id,state:'idle'})+'\n'))})})
 await new Promise(resolve=>server.listen(target,resolve))
 const code=`import {spawn} from 'node:child_process'; const [script,reply,target,receipt,pid,uid,id]=process.argv.slice(1); const c=spawn('/usr/bin/python3',[script,reply,pid,uid,'2','--service'],{detached:true,stdio:['pipe','pipe','ignore']});let b='';c.stdout.on('data',x=>{b+=x;if(b.includes('\\n')){c.stdin.end(JSON.stringify({socket:target,lines:'synthetic request\\n',msgId:id,receiptPath:receipt})+'\\n');c.stdout.destroy();c.unref();process.exit(0)}})`
 const publisher=spawn(process.execPath,['--input-type=module','-e',code,python,reply,target,receipt,String(process.pid),String(process.getuid()),id],{stdio:'ignore'})
 publisherClosed=new Promise(resolve=>publisher.on('close',resolve))
 try{
  assert.equal(await publisherClosed,0)
  const deadline=Date.now()+3000;while(!existsSync(receipt)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20))
  const result=JSON.parse(readFileSync(receipt));assert.equal(result.ok,true);assert.equal(result.listenerRemoved,true);assert.equal(calls,1);assert.equal(existsSync(reply),false)
 }finally{server.close();rmSync(dir,{recursive:true,force:true})}
})
