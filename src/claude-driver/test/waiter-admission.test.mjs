import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,openSync,closeSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync,spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const script=fileURLToPath(new URL('../scripts/broker-wait.mjs',import.meta.url))
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'claude-waiter-admission-')),dir=join(root,'broker')
 for(const name of ['requests','controls','results'])mkdirSync(join(dir,name),{recursive:true})
 writeFileSync(join(dir,'requests','synthetic.json'),JSON.stringify({id:'synthetic',ops:[{op:'get_session',args:{session_id:'local_fixture'}}],expiresAt:Date.now()+60000}))
 const control=join(dir,'controls','synthetic.json');writeFileSync(control,JSON.stringify({id:'synthetic',state:'pending',dispatched:[]}))
 return {root,dir,control}
}
test('a waiter whose output goes to dev-null cannot claim a request',()=>{
 const f=fixture()
 try{
  const r=spawnSync(process.execPath,[script,'--dir',f.dir,'--max-sec','1'],{stdio:['ignore','ignore','pipe'],encoding:'utf8',timeout:3000})
  console.log(JSON.stringify({boundary:'silent-waiter',exit:r.status,state:JSON.parse(readFileSync(f.control)).state}))
  assert.notEqual(r.status,0);assert.equal(JSON.parse(readFileSync(f.control)).state,'pending')
 }finally{rmSync(f.root,{recursive:true,force:true})}
})
test('invalid wait budgets refuse before touching queued work',()=>{
 const f=fixture()
 try{
  for(const seconds of ['NaN','-1','Infinity','601']){
   const r=spawnSync(process.execPath,[script,'--dir',f.dir,'--max-sec',seconds],{encoding:'utf8',timeout:3000})
   assert.notEqual(r.status,0);assert.equal(JSON.parse(readFileSync(f.control)).state,'pending')
  }
 }finally{rmSync(f.root,{recursive:true,force:true})}
})
test('native-style owned regular output capture remains supported',()=>{
 const f=fixture(),out=join(f.root,'captured.log'),fd=openSync(out,'w',0o600)
 try{
  const r=spawnSync(process.execPath,[script,'--dir',f.dir,'--max-sec','1'],{stdio:['ignore',fd,'pipe'],encoding:'utf8',timeout:3000})
  assert.equal(r.status,0,r.stderr);assert.match(readFileSync(out,'utf8'),/^REQUEST /)
  assert.equal(JSON.parse(readFileSync(f.control)).state,'picked_up')
 }finally{closeSync(fd);rmSync(f.root,{recursive:true,force:true})}
})
test('one captured foreground waiter owns pickup while a second is refused',async()=>{
 const f=fixture();rmSync(join(f.dir,'requests','synthetic.json'))
 const first=spawn(process.execPath,[script,'--dir',f.dir,'--max-sec','4'],{stdio:['ignore','pipe','pipe']})
 let output='';first.stdout.on('data',x=>output+=x);first.stderr.resume()
 const exited=new Promise((resolve,reject)=>{first.once('error',reject);first.once('exit',code=>resolve(code))})
 try{
  const heartbeat=join(f.dir,'heartbeat.json'),end=Date.now()+2000
  while(!readFileSyncSafe(heartbeat)&&Date.now()<end)await new Promise(r=>setTimeout(r,10))
  assert.equal(JSON.parse(readFileSync(heartbeat)).pid,first.pid)
  const second=spawnSync(process.execPath,[script,'--dir',f.dir,'--max-sec','1'],{encoding:'utf8',timeout:2000})
  assert.notEqual(second.status,0,'second waiter must not scan or claim the queue')
  writeFileSync(join(f.dir,'requests','synthetic.json'),JSON.stringify({id:'synthetic',ops:[{op:'get_session',args:{session_id:'local_fixture'}}],expiresAt:Date.now()+60000}))
  assert.equal(await exited,0);assert.match(output,/^REQUEST /)
  assert.equal(JSON.parse(readFileSync(f.control)).pickedUpBy,first.pid)
 }finally{if(first.exitCode===null)first.kill('SIGTERM');await exited;rmSync(f.root,{recursive:true,force:true})}
})
function readFileSyncSafe(path){try{return readFileSync(path)}catch{return null}}
