// flock ownership is shared by duplicated descriptors, not the helper PID.
// Node holds its descriptor for the callback; kernel close/process exit releases
// it even if the parent dies. Lock files must stay at one inode: never unlink.
import {openSync,closeSync,fstatSync,constants} from 'node:fs'
import {spawn} from 'node:child_process'
const helper='import fcntl; fcntl.flock(3, fcntl.LOCK_EX)'
const failure=(category,message)=>Object.assign(new Error(message),{expected:true,category})
export async function acquireKernelLock(file,{timeoutMs=120000,signal}={}) {
 if(signal?.aborted)throw failure('cancelled','cancelled before dispatch')
 const fd=openSync(file,constants.O_CREAT|constants.O_RDWR|constants.O_NOFOLLOW|constants.O_NONBLOCK,0o600)
 let retained=false
 try {
  if(!fstatSync(fd).isFile())throw failure('lock_unavailable','kernel lock requires a regular file')
  await new Promise((resolve,reject)=>{
   const child=spawn('/usr/bin/python3',['-I','-c',helper],{stdio:['ignore','ignore','ignore',fd],env:{PATH:'/usr/bin:/bin'}})
   let refusal
   const stop=category=>{refusal??=category;child.kill('SIGKILL')}
   const abort=()=>stop('cancelled')
   const timer=setTimeout(()=>stop('lock_timeout'),timeoutMs)
   signal?.addEventListener('abort',abort,{once:true})
   if(signal?.aborted)abort()
   const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
   child.once('error',()=>{cleanup();reject(failure('lock_unavailable','kernel lock helper unavailable; no directory-only fallback'))})
   child.once('exit',code=>{
    cleanup()
    if(refusal)reject(failure(refusal,refusal==='cancelled'?'cancelled before dispatch':`kernel lock busy for ${timeoutMs} ms`))
    else if(code!==0)reject(failure('lock_unavailable','kernel lock acquisition failed; no directory-only fallback'))
    else resolve()
   })
  })
  if(signal?.aborted)throw failure('cancelled','cancelled before dispatch')
  retained=true
  let released=false
  return ()=>{if(!released){released=true;closeSync(fd)}}
 }finally {if(!retained)closeSync(fd)}
}
