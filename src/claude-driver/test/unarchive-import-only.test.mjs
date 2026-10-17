import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
test('public import-only unarchive refuses unsupported mechanism before broker publication',()=>{
 const root=mkdtempSync(join(tmpdir(),'unarchive-import-only-')),app=join(root,'app'),state=join(root,'state'),session='local_11111111-1111-4111-8111-111111111111',records=join(app,'claude-code-sessions','fixture','fixture');mkdirSync(records,{recursive:true,mode:0o700});mkdirSync(state,{mode:0o700});writeFileSync(join(records,session+'.json'),JSON.stringify({sessionId:session,cliSessionId:session.slice(6),title:'OWNED_FIXTURE',cwd:root,isArchived:true}),{mode:0o600})
 const driver=new URL('../lib/driver.mjs',import.meta.url).href,paths=new URL('../lib/paths.mjs',import.meta.url).href
 const script=`import assert from 'node:assert/strict';import {writeFileSync,existsSync} from 'node:fs';import {join} from 'node:path';import {versions} from ${JSON.stringify(paths)};import {OPS,validateOp} from ${JSON.stringify(driver)};const v=versions();writeFileSync(join(${JSON.stringify(state)},'capabilities.json'),JSON.stringify({[v.app+'|'+v.cli]:{mechanisms:{unarchive_link:{ok:false}}}}));const args={session:${JSON.stringify(session)},import_only:true};validateOp('unarchive_session',args);await assert.rejects(OPS.find(o=>o.name==='unarchive_session').run(args,{args,notes:[],harness:'cli'}),e=>e.category==='unarchive_import_unverified'&&e.detail.brokerFallback===false);assert.equal(existsSync(join(${JSON.stringify(state)},'broker','requests')),false);`
 const r=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,CLAUDE_DRIVER_STATE_DIR:state,CLAUDE_DRIVER_APP_SUPPORT:app,CLAUDE_DRIVER_PROJECTS_DIR:join(root,'projects'),CLAUDE_DRIVER_PEER_SESSIONS_DIR:join(root,'peers')},encoding:'utf8',timeout:5000});assert.equal(r.status,0,r.stderr)
})
