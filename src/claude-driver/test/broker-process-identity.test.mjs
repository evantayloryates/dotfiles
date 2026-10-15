import {test,after} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {join} from 'node:path'
const root=mkdtempSync('/tmp/driver-broker-identity-'),state=join(root,'state'),peers=join(root,'peers'),app=join(root,'app'),sid='local_00000000-0000-4000-8000-000000000001',store=join(app,'claude-code-sessions','a','o')
Object.assign(process.env,{CLAUDE_DRIVER_STATE_DIR:state,CLAUDE_DRIVER_APP_SUPPORT:app,CLAUDE_DRIVER_PEER_SESSIONS_DIR:peers})
for(const d of [peers,store])mkdirSync(d,{recursive:true})
writeFileSync(join(store,sid+'.json'),JSON.stringify({sessionId:sid,cliSessionId:sid.slice(6),cwd:join(state,'broker'),title:'claude-driver-broker',permissionMode:'bypassPermissions'}))
const epoch=pid=>execFileSync('/bin/ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',LC_ALL:'C',TZ:'UTC'}}).trim(),rec={pid:process.pid,hostSessionId:sid,sessionId:sid.slice(6),entrypoint:'claude-desktop',procStart:epoch(process.pid),status:'idle'},file=join(peers,process.pid+'.json')
const {saveBrokerInfo,brokerInfo}=await import('../lib/broker.mjs');saveBrokerInfo({sessionId:sid})
after(()=>rmSync(root,{recursive:true,force:true}))
test('native broker health refuses reused PID, foreign CLI identity, duplicate workers and linked metadata',()=>{
 const write=r=>writeFileSync(file,JSON.stringify(r))
 write(rec);assert.equal(brokerInfo().live.pid,process.pid);assert.equal(brokerInfo().nativeProcessEvidence.verified,true)
 for(const patch of [{procStart:'old epoch'},{sessionId:'foreign'},{spare:true},{parkedJobId:'job'}]){write({...rec,...patch});assert.equal(brokerInfo().live,null);assert.equal(brokerInfo().nativeProcessEvidence.verified,false)}
 write(rec);const other=join(peers,process.ppid+'.json');writeFileSync(other,JSON.stringify({...rec,pid:process.ppid,procStart:epoch(process.ppid)}));assert.equal(brokerInfo().live,null);rmSync(other)
 rmSync(file);const target=join(root,'linked-peer.json');writeFileSync(target,JSON.stringify(rec));symlinkSync(target,file);assert.equal(brokerInfo().live,null)
})
