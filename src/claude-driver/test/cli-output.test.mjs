import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
test('actual CLI drains a large UTF-8 observation through a captured pipe',()=>{
 const root=mkdtempSync(join(tmpdir(),'claude-cli-output-')),app=join(root,'app'),sid='local_00000000-0000-4000-8000-000000000005',title='界'.repeat(90000)
 try{
  const dir=join(app,'claude-code-sessions','fixture','fixture');mkdirSync(dir,{recursive:true});writeFileSync(join(dir,sid+'.json'),JSON.stringify({sessionId:sid,cliSessionId:sid.slice(6),title,cwd:root,isArchived:false}))
  const r=spawnSync(process.execPath,[fileURLToPath(new URL('../cli.mjs',import.meta.url)),'get_session','--session',sid],{env:{PATH:'/usr/bin:/bin',HOME:root,CLAUDE_DRIVER_STATE_DIR:join(root,'state'),CLAUDE_DRIVER_APP_SUPPORT:app,CLAUDE_DRIVER_PEER_SESSIONS_DIR:join(root,'peers'),CLAUDE_DRIVER_PROJECTS_DIR:join(root,'projects')},encoding:'utf8',timeout:10000,maxBuffer:2*1024*1024})
  assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).title,title);assert.ok(Buffer.byteLength(r.stdout)>256*1024)
 }finally{rmSync(root,{recursive:true,force:true})}
})
