import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {spawnSync} from 'node:child_process'
test('archive admission cooperates with activation lock, isolates targets and cancels queued work',()=>{
 const state=mkdtempSync(join(tmpdir(),'archive-admission-'))
 try{
 const script=`
 import assert from 'node:assert/strict';
 import {withLock} from ${JSON.stringify(new URL('../lib/state.mjs',import.meta.url).href)};
 import {withIndependentArchiveTarget} from ${JSON.stringify(new URL('../lib/independent-archive-admission.mjs',import.meta.url).href)};
 const target='local_11111111-1111-4111-8111-111111111111',other='local_22222222-2222-4222-8222-222222222222';let release,entered,calls=0;
 const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r),holder=withLock('independent-activation-'+target,async()=>{entered();await gate});await ready;
 const controller=new AbortController(),cancelled=withIndependentArchiveTarget(target,()=>{throw Error('cancelled work ran')},{signal:controller.signal}).catch(e=>e);
 const queued=withIndependentArchiveTarget(target,()=>{calls++});await withIndependentArchiveTarget(other,()=>{assert.equal(calls,0)});
 controller.abort();const failure=await cancelled;assert.equal(failure.category,'cancelled');assert.equal(calls,0);release();await holder;await queued;assert.equal(calls,1);
 assert.throws(()=>withIndependentArchiveTarget('../foreign',()=>{}));console.log('qualified');`
 const r=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,CLAUDE_DRIVER_STATE_DIR:state},encoding:'utf8',timeout:15000,maxBuffer:65536});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/qualified/)
 }finally{rmSync(state,{recursive:true})}
})
