#!/usr/bin/env node
// Live qualification uses a driver-owned synthetic session only. It never
// restarts the user's app, deletes sessions, or changes permission modes.
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { runOp } from '../lib/driver.mjs'
import { recordMemory } from '../lib/memory.mjs'
import { STATE_DIR, writeJsonAtomic } from '../lib/state.mjs'
import { sleep } from '../lib/paths.mjs'
const rows = []
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const folder = join(STATE_DIR, 'probe', `v2-${stamp}`)
mkdirSync(folder, {recursive: true})
let session, cursor
const op = (name,args={})=>runOp(name,args,{harness:'v2-live-pressure',progress:message=>console.log(JSON.stringify({progress:message}))})
async function step(name, fn) {
  const at = Date.now()
  try { const evidence = await fn(); const r={name,ok:true,ms:Date.now()-at,evidence};rows.push(r);console.log(JSON.stringify(r));return evidence }
  catch(e){ const r={name,ok:false,ms:Date.now()-at,category:e.category,error:e.message};rows.push(r);console.log(JSON.stringify(r));throw e }
}
async function observeUntil(predicate, seconds=30) {
  const end=Date.now()+seconds*1000; const seen=[]
  while(Date.now()<end){ const r=await op('session_wait',{session,cursor,include_text:true,timeout_sec:Math.min(5,Math.max(0,(end-Date.now())/1000))});cursor=r.cursor;seen.push(...r.events);if(predicate(seen,r))return seen }
  throw new Error('expected session evidence did not arrive')
}
try {
  await step('create-and-restore-focus',async()=>{ const r=await op('create_session',{folder,title:`claude-driver v2 pressure ${stamp}`,model:'claude-haiku-4-5-20251001',permission_mode:'acceptEdits'});session=r.sessionId;assert.equal(r.verified,true);return {session,focus:r.focus,ms:r.bootMs} })
  cursor=(await op('session_events',{session})).cursor
  await step('durable-submit-and-recipient-reply',async()=>{
    const args={operation:'send_message',arguments:{session,message:'Synthetic bridge fixture. Reply exactly V2_INITIAL_OK. Do not use tools, change files or message others.'},idempotency_key:`live-${stamp}-initial`}
    const at=Date.now(), j=await op('driver_submit',args);const submitMs=Date.now()-at
    const again=await op('driver_submit',args);assert.equal(again.jobId,j.jobId);assert.equal(again.reused,true)
    const done=await op('driver_wait',{job_id:j.jobId,timeout_sec:30});assert.equal(done.state,'completed');assert.equal(done.result.delivery,'delivered')
    const seen=await observeUntil(e=>e.some(x=>x.type==='assistant'&&x.text==='V2_INITIAL_OK'))
    return {jobId:j.jobId,submitMs,receipt:done.result.messageId,replyVerified:true,events:seen.length}
  })
  await step('three-concurrent-native-controls',async()=>{
    const out=await Promise.all([op('rename_session',{session,title:`claude-driver v2 pressure ${stamp} locked`}),op('pin_session',{session,pinned:true}),op('set_session_config',{session,effort:'low'})]);assert.ok(out.every(x=>x.verified));
    await op('pin_session',{session,pinned:false});return {operations:3,allVerified:true}
  })
  await step('queue-is-not-interrupt',async()=>{
    await op('send_message',{session,message:`Synthetic controllability fixture. Use Bash to run this purpose-built, bounded, read-only work fixture in the FOREGROUND, timeout 180000, never background: ${process.execPath} ${fileURLToPath(new URL('./control-fixture.mjs', import.meta.url))} 120 . It prints CONTROL_FIXTURE_STARTED then performs bounded synthetic work. After it finishes reply exactly OLD_PLAN_FINISHED. Do not modify files or message others.`})
    await observeUntil(e=>e.some(x=>x.tools?.includes('Bash')),30)
    const active=await op('get_session',{session});assert.ok(['busy','working'].includes(active.live?.status),'fixture must still be running before queue test');
    const r=await op('steer_session',{session,mode:'queue',message:'Queued synthetic follow-up. When you reach this message, reply exactly QUEUED_PLAN_RECEIVED. Do not run tools or message others.'})
    assert.equal(r.delivery,'queued');assert.equal(r.applied,false)
    const s=await op('get_session',{session});assert.ok(['busy','working'].includes(s.live?.status));return {delivery:r.delivery,recipientStillBusy:true}
  })
  await step('interrupt-then-replacement-is-applied',async()=>{
    const r=await op('steer_session',{session,mode:'interrupt',message:'Replacement synthetic plan. Discard the old sleep plan. Reply exactly NEW_PLAN_APPLIED. Do not use tools, edit files or message anyone.'});assert.equal(r.stopped,true)
    const seen=await observeUntil(e=>e.some(x=>x.type==='assistant'&&x.text==='NEW_PLAN_APPLIED'),30)
    assert.equal(seen.some(x=>x.text==='OLD_PLAN_FINISHED'),false)
    return {stopVerified:true,replacementReplyVerified:true,oldPlanFinished:false,delivery:r.delivery}
  })
} catch(e) { process.exitCode=1 }
finally {
  if(session) await step('cleanup-archive',async()=>{
    const deadline=Date.now()+15000
    while(Date.now()<deadline){const s=await op('get_session',{session});if(!['busy','working'].includes(s.live?.status))break;await sleep(250)}
    const r=await op('archive_session',{session});assert.equal(r.verified,true);return {session,archived:true}
  }).catch(()=>{process.exitCode=1})
  const report=join(STATE_DIR,'pressure',`live-v2-${stamp}.json`)
  writeJsonAtomic(report,{session,rows,ok:rows.every(r=>r.ok)})
  recordMemory({kind:'test_result',topic:'v2-live-pressure',source:'live-v2',status:rows.every(r=>r.ok)?'passed':'failed',evidence:report,lesson:`${rows.filter(r=>r.ok).length}/${rows.length} live qualification checks passed`})
  console.log(JSON.stringify({report,ok:rows.every(r=>r.ok)}))
}
