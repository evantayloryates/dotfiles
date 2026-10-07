import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer,createConnection} from 'node:net'
import {spawn} from 'node:child_process'
import {mkdtempSync,rmSync,existsSync} from 'node:fs'
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
