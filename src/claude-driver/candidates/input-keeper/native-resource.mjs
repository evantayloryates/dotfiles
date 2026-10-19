// Remote-only adapter candidate. No native work occurs on import. The child
// exposes fixed inventory/probe/close operations, never arbitrary JS or tasks.
import {spawn} from 'node:child_process'
import {hostname,homedir} from 'node:os'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
const root='/Users/theo/.local/state/claude-driver/input-teardown-20261018'
const host=fileURLToPath(new URL('./resource-host.mjs',import.meta.url))
const fail=reason=>Object.assign(new Error('Native keeper candidate: '+reason),{category:'input_keeper_native_failed'})
export async function openNativeKeeperResource({dir,uiLock}){
 if(process.platform!=='darwin'||hostname().split('.')[0]!=='theo-air'||homedir()!=='/Users/theo'||!process.env.SSH_CONNECTION||JSON.parse(readFileSync(join(root,'owner.json'))).threadId!=='01a112b1-fbf6-7cb0-8228-ce3e6cb6112d'||!dir.startsWith(root+'/evidence/keeper-native-')||!Number.isSafeInteger(uiLock?.dev)||!Number.isSafeInteger(uiLock?.ino))throw fail('exact remote owner/spec refused')
 const child=spawn(process.execPath,[host],{cwd:dir,detached:true,env:{HOME:homedir(),USER:'theo',LOGNAME:'theo',PATH:'/usr/bin:/bin:/usr/sbin:/sbin',TMPDIR:join(root,'tmp'),SSH_CONNECTION:process.env.SSH_CONNECTION,CODEX_HOME:join(root,'codex-home'),CLAUDE_DRIVER_STATE_DIR:join(dir,'policy')},stdio:['ignore','ignore','pipe','ipc']})
 let exit,stderrBytes=0,sequence=0
 const pending=new Map(),done=new Promise(resolve=>{child.once('exit',(code,signal)=>{exit={code,signal};for(const {reject,timer}of pending.values()){clearTimeout(timer);reject(fail('resource host exited'))}pending.clear();resolve(exit)});child.once('error',()=>{for(const {reject,timer}of pending.values()){clearTimeout(timer);reject(fail('resource host spawn failed'))}pending.clear();resolve({code:null,signal:null,spawnError:true})})})
 child.stderr.on('data',b=>stderrBytes+=b.length)
 child.on('message',m=>{const p=pending.get(m?.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(fail(m.error)):p.resolve(m.result)})
 const request=(type,extra={},timeoutMs=15000)=>new Promise((resolve,reject)=>{
  if(exit||!child.connected)return reject(fail('resource host unavailable'))
  const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(fail('bounded resource request timeout'))},timeoutMs)
  pending.set(id,{resolve,reject,timer});child.send({id,type,...extra},error=>{if(error){clearTimeout(timer);pending.delete(id);reject(fail('resource lifetime channel failed'))}})
 })
 const resource={pid:child.pid,group:child.pid,done,probe:()=>request('probe'),close:async()=>{
  const receipt=await request('close',{},25000)
  let timer;const result=await Promise.race([done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail('normal host exit timeout')),5000)})]).finally(()=>clearTimeout(timer))
  if(result.code!==0||result.signal!==null)throw fail('resource host did not exit normally')
  return {...receipt,hostExit:result,stderrBytes}
 },status:()=>({pid:child.pid,exit:exit??null,stderrBytes})}
 // Return the exact handle even on failed start so the caller retains a
 // supported cleanup channel. A timeout never authorizes a replacement wake.
 try{resource.ready=await request('start',{dir,uiLock},45000)}catch(error){resource.startError=error.message}
 return resource
}
