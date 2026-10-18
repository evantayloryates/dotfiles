import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,readFileSync,existsSync,mkdirSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawn,execFileSync} from 'node:child_process'
import {once} from 'node:events'
import {spawnStdioTransport} from '../../codex-bridge/lib/transport.mjs'

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const group=pid=>Number(execFileSync('/bin/ps',['-p',String(pid),'-o','pgid='],{encoding:'utf8'}).trim())
function alive(pid){
 try{return !execFileSync('/bin/ps',['-p',String(pid),'-o','stat='],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().startsWith('Z')}
 catch{return false}
}
async function waitFor(predicate){for(let i=0;i<100;i++){if(predicate())return;await sleep(25)}throw Error('owned process condition timed out')}

test('hard worker loss reaps its backend group and preserves an unrelated process',{timeout:12000},async()=>{
 const root=mkdtempSync(join(tmpdir(),'claude-ui-pgrp-')),state=join(root,'state'),ready=join(root,'ready.json'),bin=join(root,'backend')
 mkdirSync(state);writeFileSync(join(state,'ui-quarantine.json'),JSON.stringify({blocked:false}))
 writeFileSync(bin,`#!${process.execPath}
import{createInterface}from'node:readline';import{spawn,execFileSync}from'node:child_process';import{writeFileSync}from'node:fs';
if(process.argv.includes('--version')){console.log('codex-cli 0.160.0-fixture');process.exit(0)}
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
const pg=pid=>Number(execFileSync('/bin/ps',['-p',String(pid),'-o','pgid='],{encoding:'utf8'}).trim());
createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;
const result=r.method==='thread/start'?{thread:{id:'owned-thread'},model:'synthetic'}:r.method==='turn/start'?{turn:{id:'owned-turn'}}:{};
console.log(JSON.stringify({id:r.id,result}));
if(r.method==='turn/start')writeFileSync(${JSON.stringify(ready)},JSON.stringify({workerPid:process.ppid,backendPid:process.pid,descendantPid:child.pid,workerGroup:pg(process.ppid),backendGroup:pg(process.pid),descendantGroup:pg(child.pid)}));
});
`,{mode:0o700})
 const sentinel=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'})
 const worker=spawn(process.execPath,['src/claude-driver/scripts/tierc-worker.mjs'],{detached:true,stdio:['pipe','ignore','ignore'],env:{...process.env,CODEX_HOME:root,CODEX_BRIDGE_CODEX_PATH:bin,CODEX_BRIDGE_STATE_DIR:join(root,'backend-state'),CLAUDE_DRIVER_STATE_DIR:state}})
 worker.stdin.end(JSON.stringify({task:'synthetic pending turn',timeoutSec:30}))
 let identity
 try{
  await waitFor(()=>existsSync(ready));identity=JSON.parse(readFileSync(ready,'utf8'))
  assert.equal(identity.workerPid,worker.pid)
  assert.equal(identity.workerGroup,worker.pid)
  assert.equal(identity.backendGroup,worker.pid,'private backend must remain in the supervisor-owned worker group')
  assert.equal(identity.descendantGroup,worker.pid)
  assert.notEqual(group(sentinel.pid),worker.pid)
  process.kill(-worker.pid,'SIGKILL')
  await waitFor(()=>[identity.backendPid,identity.descendantPid].every(pid=>!alive(pid)))
  assert.equal(alive(sentinel.pid),true,'unrelated process must survive')
 }finally{
  try{process.kill(-worker.pid,'SIGKILL')}catch{}
  // Pre-fix failures can leave a separate fixture backend group. Its identity
  // came from this exact temporary backend, never a shared app/service.
  if(identity?.backendGroup===identity.backendPid&&identity.backendGroup!==worker.pid){try{process.kill(-identity.backendGroup,'SIGKILL')}catch{}}
  sentinel.kill('SIGTERM')
  if(worker.exitCode===null&&worker.signalCode===null)await once(worker,'exit')
  if(sentinel.exitCode===null&&sentinel.signalCode===null)await once(sentinel,'exit')
  rmSync(root,{recursive:true,force:true})
 }
})

test('ordinary bridge transports retain their private process-group default',async()=>{
 const root=mkdtempSync(join(tmpdir(),'bridge-default-pgrp-')),bin=join(root,'backend'),ready=join(root,'ready')
 writeFileSync(bin,`#!${process.execPath}\nimport{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(ready)},String(process.pid));setInterval(()=>{},1000);`,{mode:0o700})
 const transport=spawnStdioTransport(bin)
 try{await waitFor(()=>existsSync(ready));assert.equal(group(transport.pid),transport.pid)}
 finally{const closed=once(transport,'close');transport.close();await closed;rmSync(root,{recursive:true,force:true})}
})
