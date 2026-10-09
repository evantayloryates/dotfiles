import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const cli = new URL('../evidence.mjs', import.meta.url).pathname
const reply = { schema:'record-screen-action/v1', action_token:'act_12345678-1234-1234-1234-123456789abc',
  action_id:'authored-cli', session_id:'authored-session', caller:'test', provider:'authored', intent:'Authored CLI import',
  target:{bundle_id:'authored.fixture',pid:123,window_id:456}, clock_domain:'CLOCK_UPTIME_RAW',
  clock_provenance:'recorder_service_stamped', start_ns:'9007199254740993', end_ns:'9007199254741001',
  deadline_ns:'9007199255740993', state:'closed', result:'dispatched', context:{purpose:'Authored check'},
  engine_instance:'authored-instance',engine_build:'authored-build',engine_pid:123,
  end_kind:'service_observed_end_request',evidence_refs:[] }
function isolated(run) {
  const root=mkdtempSync(join(tmpdir(),'evidence-cli-'))
  const invoke=(...args)=>spawnSync(process.execPath,[cli,...args],{
    encoding:'utf8',timeout:5000,env:{...process.env,CODEX_BRIDGE_STATE_DIR:join(root,'state')},
  })
  try { return run(root,invoke) } finally { rmSync(root,{recursive:true,force:true}) }
}
test('terminal reply CLI preserves exact service stamps, idempotency and unknown verification',()=>isolated((root,run)=>{
  const file=join(root,'reply.json');writeFileSync(file,JSON.stringify(reply))
  const first=run('recorded-action',file),again=run('recorded-action',file)
  assert.equal(first.status,0,first.stderr);assert.equal(again.status,0,again.stderr)
  const saved=JSON.parse(first.stdout);assert.equal(JSON.parse(again.stdout).id,saved.id)
  assert.equal(saved.value.start_ns,reply.start_ns);assert.equal(saved.value.end_ns,reply.end_ns)
  assert.equal(saved.value.provenance,'recorder_reply_imported')
  const audit=run('audit',reply.session_id);assert.equal(audit.status,0,audit.stderr)
  const report=JSON.parse(audit.stdout)
  assert.equal(report.coverage.stored_receipts,1);assert.equal(report.counts.verification.unknown,1)
}))
test('active replies refuse; restart interruptions preserve null end without fabricating bounds',()=>isolated((root,run)=>{
  const file=join(root,'reply.json');writeFileSync(file,JSON.stringify({...reply,state:'active',end_ns:null,result:'unknown'}))
  assert.notEqual(run('recorded-action',file).status,0)
  writeFileSync(file,JSON.stringify({...reply,state:'interrupted',end_ns:null,result:'interrupted',end_kind:'unknown_after_engine_restart'}))
  const result=run('recorded-action',file);assert.equal(result.status,0,result.stderr)
  const saved=JSON.parse(result.stdout);assert.equal(saved.value.end_ns,null);assert.equal(saved.value.result,'interrupted')
}))
test('unsafe or malformed file requests refuse before publication without echoing body data',()=>isolated((root,run)=>{
  const file=join(root,'bad.json');const secret='AUTHORED_DO_NOT_ECHO_925'
  for(const content of [`{${secret}`,Buffer.alloc(64001,65),Buffer.from([0xff,0xfe])]){
    writeFileSync(file,content);const r=run('recorded-action',file)
    assert.notEqual(r.status,0);assert.equal(r.stdout,'');assert.ok(!r.stderr.includes(secret))
  }
  const link=join(root,'link.json');symlinkSync(file,link)
  assert.notEqual(run('recorded-action',link).status,0)
  assert.notEqual(run('recorded-action',root).status,0)
  assert.equal(readdirSync(root).includes('state'),false)
}))
