import {test,after} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,cpSync,appendFileSync,existsSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawn,spawnSync} from 'node:child_process'
const root=mkdtempSync(join(tmpdir(),'claude-worker-'))
process.env.CLAUDE_DRIVER_STATE_DIR=join(root,'state')
process.env.CLAUDE_DRIVER_APP_SUPPORT=join(root,'app')
process.env.CLAUDE_DRIVER_PROJECTS_DIR=join(root,'projects')
process.env.CLAUDE_DRIVER_PEER_SESSIONS_DIR=join(root,'peers')
const {jobFile,cancelJob}=await import('../lib/jobs.mjs')
const {writeJsonAtomic,readJson}=await import('../lib/state.mjs')
const {RUNTIME_BUILD}=await import('../lib/build.mjs')
const worker=fileURLToPath(new URL('../scripts/job-worker.mjs',import.meta.url))
const sid='local_00000000-0000-4000-8000-000000000777'
const dir=join(root,'app','claude-code-sessions','a','o');mkdirSync(dir,{recursive:true})
writeJsonAtomic(join(dir,sid+'.json'),{sessionId:sid,title:'synthetic worker ownership',cwd:root})
const queued=(id,operation,args,runtimeBuild=RUNTIME_BUILD)=>({id,operation,args,runtimeBuild,state:'queued',harness:'synthetic',createdAt:Date.now(),expiresAt:Date.now()+30000})

test('a duplicate worker launch cannot reclaim an operation already running in another process',async()=>{
 const id='j'+'d'.repeat(32)
 writeJsonAtomic(jobFile(id),queued(id,'session_wait',{session:sid,timeout_sec:20}))
 const child=spawn(process.execPath,[worker,id],{env:process.env,stdio:'ignore'})
 const finished=new Promise(resolve=>child.once('exit',resolve))
 try {
  const end=Date.now()+5000
  while(!readJson(jobFile(id),{}).startedAt&&Date.now()<end)await new Promise(r=>setTimeout(r,20))
  assert.equal(readJson(jobFile(id),{}).workerPid,child.pid)
  const second=spawnSync(process.execPath,[worker,id],{env:process.env,encoding:'utf8',timeout:2000})
  assert.equal(second.status,0,'duplicate worker must exit without entering the operation')
  assert.equal(readJson(jobFile(id),{}).workerPid,child.pid,'original claimant must retain ownership')
  assert.equal(readJson(jobFile(id),{}).state,'running')
 } finally {
  await cancelJob(id)
  const timer=setTimeout(()=>child.kill('SIGTERM'),2000)
  await finished;clearTimeout(timer)
 }
})

test('a queued operation cannot cross a source revision before worker startup',()=>{
 const memory=join(root,'state','memory.jsonl'),before=existsSync(memory)?readFileSync(memory,'utf8'):''
 const clone=join(root,'clone');cpSync(new URL('..',import.meta.url),clone,{recursive:true})
 const id='j'+'e'.repeat(32)
 writeJsonAtomic(jobFile(id),queued(id,'driver_record_learning',{learning:'must never execute on a different revision',evidence:'synthetic'}))
 appendFileSync(join(clone,'scripts/broker-wait.mjs'),'\n// synthetic update after submission\n')
 const result=spawnSync(process.execPath,[join(clone,'scripts/job-worker.mjs'),id],{env:process.env,encoding:'utf8',timeout:5000})
 assert.equal(result.status,0,result.stderr)
 const job=readJson(jobFile(id),{})
 assert.equal(job.state,'failed');assert.equal(job.error.category,'runtime_stale')
 assert.equal(job.error.detail.dispatched,false);assert.equal(job.error.detail.retrySafe,true)
 assert.equal(job.startedAt,undefined)
 assert.equal(existsSync(memory)?readFileSync(memory,'utf8'):'',before,'rejected worker must not execute a memory write')
})
after(()=>rmSync(root,{recursive:true,force:true}))
