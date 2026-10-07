import {test,after} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const root=mkdtempSync(join(tmpdir(),'claude-cli-supervision-'))
const fake=join(root,'fake-cli.mjs'),pidFile=join(root,'pid')
Object.assign(process.env,{CLAUDE_DRIVER_CLI:fake,DOTFILES_DIR:root})
writeFileSync(join(root,'.env'),'KICKOFF_CLAUDE_CODE_LONG_LIVED_SUBSCRIPTION_OAUTH_TOKEN=synthetic-fixture\n')
writeFileSync(fake,`#!${process.execPath}
import {writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
if(process.argv.includes('--ok')){console.log('synthetic-success');process.exit(0)}
if(process.argv.includes('--held-pipe')){
 const child=spawn(process.execPath,['-e','setTimeout(()=>{},1200)'],{stdio:['ignore',1,2]});
 writeFileSync(${JSON.stringify(join(root,'descendant'))},String(child.pid));process.exit(0);
}
process.on('SIGTERM',()=>{});
writeFileSync(${JSON.stringify(pidFile)},String(process.pid));
setInterval(()=>{},1000);
`,{mode:0o700})
const {runCli}=await import('../lib/paths.mjs')
const alive=pid=>{try{process.kill(pid,0);return true}catch{return false}}
function fixturePid(){return existsSync(pidFile)?Number(readFileSync(pidFile)):null}
const cleanup=()=>{const pid=fixturePid();if(pid&&alive(pid))process.kill(pid,'SIGKILL');rmSync(pidFile,{force:true})}
after(()=>{cleanup();rmSync(root,{recursive:true,force:true})})
test('timeout settles only after an owned SIGTERM-resistant helper has exited',async()=>{
 const start=Date.now();const guard=setTimeout(cleanup,2200)
 try{
  await assert.rejects(runCli([],{cwd:root,timeoutMs:500}),e=>e.category==='cli_timeout')
  assert.ok(Date.now()-start<1500,'deadline must not wait for an uncooperative helper')
  assert.equal(alive(fixturePid()),false,'owned child must be gone before settlement')
 }finally{clearTimeout(guard);cleanup()}
})
test('abort settles only after the exact owned helper exits',async()=>{
 const controller=new AbortController();const pending=runCli([],{cwd:root,timeoutMs:5000,signal:controller.signal})
 const guard=setTimeout(cleanup,1800)
 try{
  const end=Date.now()+1000;while(!existsSync(pidFile)&&Date.now()<end)await new Promise(r=>setTimeout(r,10))
  assert.ok(existsSync(pidFile),'fake helper reached signal handler')
  controller.abort()
  await assert.rejects(pending,e=>e.category==='cancelled'||e.name==='AbortError')
  assert.equal(alive(fixturePid()),false,'abort must not detach a live helper')
 }finally{clearTimeout(guard);cleanup()}
})
test('normal helper completion preserves exit status and output',async()=>{
 const r=await runCli(['--ok'],{cwd:root,timeoutMs:2000})
 assert.equal(r.code,0);assert.equal(r.stdout.trim(),'synthetic-success')
})
test('an exited CLI with descendant-held output pipes remains deadline bounded',async()=>{
 const start=Date.now()
 await assert.rejects(runCli(['--held-pipe'],{cwd:root,timeoutMs:300}),e=>e.category==='cli_timeout')
 assert.ok(Date.now()-start<900,'inherited pipes must not extend the helper budget')
 const pid=Number(readFileSync(join(root,'descendant')))
 assert.equal(alive(pid),true,'only local readers close; descendant is not signalled')
 const end=Date.now()+2000;while(alive(pid)&&Date.now()<end)await new Promise(r=>setTimeout(r,20))
 assert.equal(alive(pid),false,'private fixture descendant exits naturally')
})
