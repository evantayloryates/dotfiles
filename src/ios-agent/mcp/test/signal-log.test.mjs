import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const modulePath = fileURLToPath(new URL('../signal-log.mjs', import.meta.url));
const pyPath = fileURLToPath(new URL('../../signals.py', import.meta.url));
const state = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-signals-test-'));
const env = {...process.env, IOS_AGENT_SIGNAL_STATE_DIR:state};
function run(command,args) {
  const r=spawnSync(command,args,{env,encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  return r.stdout.trim();
}
test('JS and Python emit compatible bounded private rows; reader filters and pages', () => {
  try {
    const js=`import {emitSignal,withSignalContext,readSignals} from ${JSON.stringify(modulePath)};
      await withSignalContext({requestId:'abcdef0123456789abcdef0123456789'},async()=>{
        if(!emitSignal('mcp','input.dispatch',{tool:'ios_action',action:'tap',dispatched:true,trace:'0123456789abcdef0123456789abcdef',lease:'live-capability',sourceAtMs:1781212345678,sourceSeq:3,routeName:'paired',previousRouteName:'waiting',operationName:'tap',fromState:'admitted',toState:'sent',statusCode:202,errorCount:0,url:'https://example.com/users/123?token=secret',ignored:{body:'private'}})) process.exit(2);
        if(!emitSignal('mcp','input.result',{outcome:'unknown',reason:'provider_deadline',message:'Bearer very-secret',inputSent:true})) process.exit(3);
      });
      console.log(JSON.stringify(readSignals({scope:'mcp',limit:1})));`;
    const first=JSON.parse(run(process.execPath,['--input-type=module','-e',js]));
    assert.equal(first.count,1);
    assert.equal(first.truncated,true);
    assert.ok(first.nextCursor);
    assert.match(first.text,/input.result/);
    const py=`import importlib.util; s=importlib.util.spec_from_file_location('signals',${JSON.stringify(pyPath)}); m=importlib.util.module_from_spec(s); s.loader.exec_module(m)
with m.signal_context(trace='1234567890abcdef1234567890abcdef'):
 assert m.emit_signal('host','input.verified',verified=True,count=2,stage='readback',state='connected',strategy='paired',present=True,enabled=True,muted=False,visible=True,participants=2,sent=10,received=9,drops=1,gaps=0,detail='password=hunter2',url='https://example.com/users/123?sig=private')`;
    run('python3',['-B','-c',py]);
    const dir=path.join(state,'signals');
    assert.equal(fs.statSync(dir).mode & 0o777,0o700);
    const names=fs.readdirSync(dir);
    assert.equal(names.length,2);
    const rows=names.flatMap(n=>{
      assert.equal(fs.statSync(path.join(dir,n)).mode & 0o777,0o600);
      return fs.readFileSync(path.join(dir,n),'utf8').trim().split('\n').map(JSON.parse);
    });
    assert.equal(rows.length,3);
    assert.ok(rows.every(r=>r.v===1 && r.time.endsWith('Z') && r.id.length===16));
    assert.equal(rows.find(r=>r.event==='input.dispatch').url,'public:/users/:id');
    assert.equal(rows.find(r=>r.event==='input.dispatch').traceId,'0123456789abcdef0123456789abcdef');
    assert.equal(rows.find(r=>r.event==='input.dispatch').sourceAtMs,1781212345678);
    assert.equal(rows.find(r=>r.event==='input.dispatch').route,'paired');
    assert.equal(rows.find(r=>r.event==='input.dispatch').previousRoute,'waiting');
    assert.equal(rows.find(r=>r.event==='input.dispatch').statusCode,202);
    assert.equal(rows.find(r=>r.event==='input.dispatch').count,0);
    assert.match(rows.find(r=>r.event==='input.dispatch').leaseFingerprint,/^[a-f0-9]{12}$/);
    assert.doesNotMatch(JSON.stringify(rows),/live-capability/);
    assert.equal(rows.find(r=>r.event==='input.verified').traceId,'1234567890abcdef1234567890abcdef');
    assert.equal(rows.find(r=>r.event==='input.verified').state,'connected');
    assert.equal(rows.find(r=>r.event==='input.verified').strategy,'paired');
    assert.equal(rows.find(r=>r.event==='input.verified').muted,false);
    assert.equal(rows.find(r=>r.event==='input.verified').participants,2);
    assert.equal(rows.find(r=>r.event==='input.verified').sent,10);
    assert.equal(rows.find(r=>r.event==='input.verified').gaps,0);
    assert.equal(rows.find(r=>r.event==='input.dispatch').ignored,undefined);
    assert.equal(rows.find(r=>r.event==='input.result').message,'[redacted]');
    assert.equal(rows.find(r=>r.event==='input.verified').detail,'[redacted]');
    const read=`import {readSignals} from ${JSON.stringify(modulePath)};
      console.log(JSON.stringify(readSignals({scope:'mcp',after:${JSON.stringify(first.nextCursor)},limit:2})));`;
    const second=JSON.parse(run(process.execPath,['--input-type=module','-e',read]));
    assert.equal(second.count,1);
    assert.match(second.text,/input.dispatch/);
    assert.doesNotMatch(second.text,/secret|hunter2|example\.com|private/);
    const hostRead=JSON.parse(run(process.execPath,['--input-type=module','-e',`import {readSignals} from ${JSON.stringify(modulePath)}; console.log(JSON.stringify(readSignals({scope:'host'})));`]));
    assert.equal(hostRead.count,1);
    assert.match(hostRead.text,/state=connected/);
    assert.match(hostRead.text,/muted=false/);
    assert.match(hostRead.text,/participants=2/);
    const stale=path.join(dir,names.find(n=>fs.readFileSync(path.join(dir,n),'utf8').includes('input.verified')));
    fs.utimesSync(stale,0,0);
    const symlink=path.join(dir,'signal-aaaaaaaaaaaaaaaa-1.jsonl');
    fs.symlinkSync(stale,symlink);
    const pruned=JSON.parse(run(process.execPath,['--input-type=module','-e',`import {readSignals} from ${JSON.stringify(modulePath)}; console.log(JSON.stringify(readSignals({scope:'host'})));`]));
    assert.equal(pruned.count,0);
    assert.equal(fs.existsSync(stale),false);
  } finally { fs.rmSync(state,{recursive:true,force:true}); }
});
