import {test,after} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,existsSync,utimesSync,statSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import childProcess,{spawn} from 'node:child_process'
import {syncBuiltinESMExports} from 'node:module'
const root=mkdtempSync(join(tmpdir(),'claude-kernel-lock-'))
process.env.CLAUDE_DRIVER_STATE_DIR=root
const module=process.env.CLAUDE_DRIVER_TEST_LOCK_MODULE||fileURLToPath(new URL('../lib/state.mjs',import.meta.url))
const {withLock,LOCK_DIR,writeJsonAtomic}=await import(module)
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function until(fn){const end=Date.now()+4000;while(!fn()){if(Date.now()>end)throw Error('owned lock fixture failed to start');await sleep(10)}}
const start=code=>{
 const child=spawn(process.execPath,['--input-type=module','-e',code],{env:{...process.env,LOCK_MODULE:module},stdio:['pipe','ignore','pipe']})
 let stderr='';child.stderr.on('data',x=>stderr+=x)
 const done=new Promise(resolve=>child.once('exit',code=>resolve({code,stderr})))
 return {child,done}
}
test('a paused live reaper cannot be age-reclaimed by another current client',async()=>{
 const name='paused-reaper',dir=join(LOCK_DIR,name+'.lock'),reaper=join(LOCK_DIR,name+'.reap')
 mkdirSync(dir,{recursive:true});writeJsonAtomic(join(dir,'owner'),{pid:2147483647,token:'dead synthetic owner'})
 const ready=join(root,'paused'),entered=join(root,'first-entered')
 const {child,done}=start(`
 import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
 const original=fs.rmSync;let paused=false;
 fs.rmSync=(path,options)=>{if(path===${JSON.stringify(dir)}&&fs.existsSync(${JSON.stringify(reaper)})&&!paused){paused=true;fs.writeFileSync(${JSON.stringify(ready)},'ready');process.kill(process.pid,'SIGSTOP')}return original(path,options)};
 syncBuiltinESMExports();const {withLock}=await import(process.env.LOCK_MODULE);
 await withLock(${JSON.stringify(name)},()=>new Promise(resolve=>{fs.writeFileSync(${JSON.stringify(entered)},'entered');process.stdin.once('data',resolve)}));
 `)
 let release,secondEntered=false,second
 try {
  await until(()=>existsSync(ready));process.kill(child.pid,0)
  utimesSync(reaper,new Date(0),new Date(0))
  second=withLock(name,()=>new Promise(resolve=>{secondEntered=true;release=resolve}),{timeoutMs:200}).then(()=>({ok:true}),e=>({ok:false,category:e.category}))
  await sleep(250)
  // Resume while a legacy contender would still be in its callback: the
  // original dead-owner snapshot then removes that contender's new directory.
  child.kill('SIGCONT');await until(()=>existsSync(entered))
  assert.equal(secondEntered,false,'two current callbacks must not overlap across a paused reaper')
  assert.equal((await second).category,'lock_timeout')
 }finally {
  release?.();child.kill('SIGCONT');child.stdin.end('release\n')
  const timer=setTimeout(()=>child.kill('SIGKILL'),2000);await done;clearTimeout(timer)
  if(second)await second
 }
 assert.equal(await withLock(name,()=>42,{timeoutMs:2000}),42)
 const inode=statSync(join(LOCK_DIR,name+'.mutex')).ino
 await withLock(name,()=>{});assert.equal(statSync(join(LOCK_DIR,name+'.mutex')).ino,inode)
})
test('kernel ownership releases after an actual holder process dies',async()=>{
 const ready=join(root,'crash-ready')
 const {child,done}=start(`import {writeFileSync} from 'node:fs';setInterval(()=>{},1000);const {withLock}=await import(process.env.LOCK_MODULE);await withLock('crash',()=>{writeFileSync(${JSON.stringify(ready)},'held');return new Promise(()=>{})})`)
 try {
  await until(()=>existsSync(ready));process.kill(child.pid,0);child.kill('SIGKILL');await done
  assert.equal(await withLock('crash',()=> 'recovered',{timeoutMs:2000}),'recovered')
 }finally {child.kill('SIGKILL');await done}
})
test('abort while queued at kernel ownership never enters the callback or retains a lease',async()=>{
 let release,entered=false
 const held=withLock('abort',()=>new Promise(resolve=>{release=resolve}))
 await until(()=>release)
 const controller=new AbortController()
 const pending=withLock('abort',()=>{entered=true},{signal:controller.signal,timeoutMs:2000})
 await sleep(50);controller.abort()
 await assert.rejects(pending,e=>e.category==='cancelled');assert.equal(entered,false)
 release();await held
 assert.equal(await withLock('abort',()=> 'available',{timeoutMs:2000}),'available')
})
test('kernel helper failure refuses the callback without directory-only fallback',async()=>{
 const original=childProcess.spawn
 let entered=false
 childProcess.spawn=(_command,_args,options)=>original('/usr/bin/false',[],options)
 syncBuiltinESMExports()
 try {
  await assert.rejects(withLock('helper-failure',()=>{entered=true}),e=>e.category==='lock_unavailable')
  assert.equal(entered,false);assert.equal(existsSync(join(LOCK_DIR,'helper-failure.lock')),false)
 }finally {childProcess.spawn=original;syncBuiltinESMExports()}
 assert.equal(await withLock('helper-failure',()=> 'available',{timeoutMs:2000}),'available')
})
after(()=>rmSync(root,{recursive:true,force:true}))
