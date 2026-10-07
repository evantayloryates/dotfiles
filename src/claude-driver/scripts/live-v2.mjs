#!/usr/bin/env node
// Live qualification uses a driver-owned synthetic session only. It never
// restarts the user's app, deletes sessions, or changes permission modes.
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { runOp } from '../lib/driver.mjs'
import { recordMemory } from '../lib/memory.mjs'
import { STATE_DIR, writeJsonAtomic, loadRegistry } from '../lib/state.mjs'
import { cancelJob } from '../lib/jobs.mjs'
import { assertUiAvailable, uiPolicy } from '../lib/ui-policy.mjs'
import { brokerInfo, brokerOp } from '../lib/broker.mjs'
import { getRecord, liveByHost, waitForRecord } from '../lib/sessions.mjs'
import { currentMain,snapshot } from '../lib/focus.mjs'
import { validateBrokerFixture,validateInputFreeOperation,LIVE_BOOTSTRAP,hasCompletionMarker } from '../lib/qualification.mjs'
import { assertInputHealthy } from '../lib/input-health.mjs'
import { runtimeFingerprint } from '../lib/build.mjs'
import { withSessionControl } from '../lib/controls.mjs'
if (!process.argv.includes('--live')) throw new Error('Live qualification is stopped pending physical typing verification. Run with --live only after that incident is resolved.')
const brokerOnly = process.argv.includes('--broker-only')
const inputFree = process.argv.includes('--input-free')
if(brokerOnly&&inputFree)throw new Error('choose one qualification scope')
let session = brokerOnly ? process.argv[process.argv.indexOf('--session') + 1] : undefined
if (brokerOnly) {
  if (!process.argv.includes('--session')) throw new Error('--broker-only requires --session <owned fixture id>')
  validateBrokerFixture({session,record:getRecord(session),registry:loadRegistry().sessions[session],stateDir:STATE_DIR,broker:brokerInfo(),policy:uiPolicy(),currentSession:currentMain().sessionId,allowArchived:process.argv.includes('--restore-fixture')})
  if (getRecord(session).isArchived) {
    await brokerOp('unarchive_session',{session_id:session})
    assert.equal((await waitForRecord(session,r=>r.isArchived===false,{timeoutMs:8000})).ok,true)
  }
  if (['busy','working'].includes(liveByHost().get(session)?.status)) throw new Error('owned fixture is busy; reconcile it before qualification')
} else if(!inputFree) assertUiAvailable()
const sourceBefore = runtimeFingerprint()
const brokerRuntimeBefore=brokerInfo().runtime
const rows = []
const observed=[]
const controller = new AbortController()
const ownedJobs = new Set()
process.once('SIGTERM', () => controller.abort())
process.once('SIGINT', () => controller.abort())
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const folder = join(STATE_DIR, 'probe', `v2-${stamp}`)
const fixtureTitle = `claude-driver v2 pressure ${stamp}`
if (!brokerOnly) mkdirSync(folder, {recursive: true})
let cursor
const nativeOps = new Set(['get_session','session_events','session_wait','driver_submit','driver_wait','driver_cancel','send_message','steer_session','stop_session','rename_session','pin_session','set_session_config','archive_session'])
const op = async (name,args={})=>{
  if(inputFree)validateInputFreeOperation({name,args,session,folder,title:fixtureTitle,stateDir:STATE_DIR,broker:brokerInfo(),policy:uiPolicy(),ownedJobs})
  if (brokerOnly) {
    if (!uiPolicy().blocked || !nativeOps.has(name) || args.session && args.session !== session ||
        args.permission_mode || args.operation && (args.operation !== 'send_message' || args.arguments?.session !== session))
      throw new Error('broker-only scope changed; refusing operation')
    // The shared guard prevents dead-broker recovery before navigation.
    // Do not attempt recovery or bootstrap while qualifying native controls.
    if (!brokerInfo().live) throw new Error('broker unavailable; native qualification stopped without recovery')
  }
  const result=await runOp(name,args,{harness:'v2-live-pressure',signal:controller.signal,progress:message=>console.log(JSON.stringify({progress:message}))})
  if(name==='driver_submit'&&result.jobId){ownedJobs.add(result.jobId);if(controller.signal.aborted)await cancelJob(result.jobId)}
  return result
}
async function step(name, fn) {
  const at = Date.now()
  try { const evidence = await fn(); const r={name,ok:true,ms:Date.now()-at,evidence};rows.push(r);console.log(JSON.stringify(r));return evidence }
  catch(e){ const r={name,ok:false,ms:Date.now()-at,category:e.category,error:e.message};rows.push(r);console.log(JSON.stringify(r));throw e }
}
async function observeUntil(predicate, seconds=30) {
  const end=Date.now()+seconds*1000; const seen=[]
  while(Date.now()<end){ const r=await op('session_wait',{session,cursor,include_text:true,timeout_sec:Math.min(5,Math.max(0,(end-Date.now())/1000))});cursor=r.cursor;seen.push(...r.events);observed.push(...r.events);if(predicate(seen,r))return seen }
  throw new Error('expected session evidence did not arrive')
}
async function waitJob(jobId,seconds=180){
  const end=Date.now()+seconds*1000
  let job
  do{job=await op('driver_wait',{job_id:jobId,timeout_sec:Math.min(30,Math.max(0,(end-Date.now())/1000))});if(!['queued','running'].includes(job.state))return job}while(Date.now()<end)
  throw new Error(`owned job ${jobId} remains ${job.state}; reconcile before replay`)
}
try {
  if(inputFree)await step('input-resource-audit-before',async()=>{const r=await assertInputHealthy({phase:'before-input-free-qualification',evidence:join(STATE_DIR,'pressure',`input-free-${stamp}-before.json`)});return {filters:r.filters.length,inputAutomation:false}})
  if (brokerOnly) await step('adopt-owned-fixture',async()=>({session,navigation:false,inputAutomation:false,uiQuarantine:uiPolicy().blocked}))
  else await step('create-and-restore-focus',async()=>{
    const before=await snapshot()
    const r=await op('create_session',{folder,title:fixtureTitle,model:'claude-haiku-4-5-20251001',permission_mode:'acceptEdits',bootstrap_prompt:LIVE_BOOTSTRAP})
    session=r.sessionId;assert.equal(r.verified,true)
    const after=await snapshot()
    assert.equal(r.focus.includes('(not confirmed)'),false,'focus restoration must be confirmed')
    if(r.focus.startsWith('main window →'))assert.equal(after.mainSession,before.mainSession,'independent focus readback')
    if(r.focus.includes('front app →'))assert.equal(after.frontApp,before.frontApp,'independent front-app readback')
    return {session,focus:r.focus,before,after,ms:r.bootMs,inputAutomation:false}
  })
  cursor=(await op('session_events',{session})).cursor
  await step('durable-submit-and-recipient-reply',async()=>{
    const args={operation:'send_message',arguments:{session,message:'Synthetic bridge fixture. Reply exactly V2_INITIAL_OK. Do not use tools, change files or message others.'},idempotency_key:`live-${stamp}-initial`}
    const at=Date.now(), j=await op('driver_submit',args);const submitMs=Date.now()-at
    const again=await op('driver_submit',args);assert.equal(again.jobId,j.jobId);assert.equal(again.reused,true)
    const done=await waitJob(j.jobId);assert.equal(done.state,'completed',JSON.stringify(done.error||{jobId:j.jobId,state:done.state}));assert.ok(['delivered','queued'].includes(done.result.delivery))
    assert.equal(done.result.receiptSource,'native-tool-result')
    const seen=await observeUntil(e=>e.some(x=>x.type==='assistant'&&x.text==='V2_INITIAL_OK'))
    return {jobId:j.jobId,submitMs,receipt:done.result.messageId,replyVerified:true,events:seen.length}
  })
  await step('cancellation-before-native-dispatch',async()=>withSessionControl(session,async()=>{
    const j=await op('driver_submit',{operation:'send_message',arguments:{session,message:'Cancelled synthetic probe. Do not act.'},idempotency_key:`live-${stamp}-cancel`,timeout_sec:30})
    await op('driver_cancel',{job_id:j.jobId})
    const done=await op('driver_wait',{job_id:j.jobId,timeout_sec:10})
    assert.equal(done.state,'cancelled');assert.equal(done.progress.some(x=>x.message.includes('broker request')),false)
    return {jobId:j.jobId,cancelled:true,nativeDispatch:false}
  }))
  await step('three-concurrent-native-controls',async()=>{
    const out=await Promise.all([op('rename_session',{session,title:`claude-driver v2 pressure ${stamp} locked`}),op('pin_session',{session,pinned:true}),op('set_session_config',{session,effort:'low'})]);assert.ok(out.every(x=>x.verified));
    await op('pin_session',{session,pinned:false});return {operations:3,allVerified:true}
  })
  await step('batched-native-controls',async()=>{
    const r=await op('set_session_config',{session,title:`claude-driver v2 pressure ${stamp} batched`,pinned:true,effort:'low'})
    assert.equal(r.verified,true);assert.equal(r.titleSource,'tool');assert.equal(r.pinned,true)
    assert.equal(r.receiptSource,'native-tool-result');assert.equal(r.broker.length,3);assert.ok(r.requestId)
    await op('pin_session',{session,pinned:false})
    return {operations:3,requests:1,allVerified:true,requestId:r.requestId,brokerMs:r.ms}
  })
  await step('queue-is-not-interrupt',async()=>{
    await op('send_message',{session,message:'Synthetic streaming controllability fixture. Generate the integers 1 through 6000, in order, one per line, as plain assistant text. Start immediately at 1, without explanation. After the last integer write OLD_PLAN_FINISHED. Do not use any tools, edit files, ask for approval, or message others. This bounded generation is the workload the bridge will interrupt.'})
    // Confirm a tool-free running turn. Native send receipts plus a live busy
    // process are sufficient here because this fixture requests no tool/consent.
    const start=Date.now()
    while(!['busy','working'].includes((await op('get_session',{session})).live?.status)){
      if(Date.now()-start>10000)throw new Error('streaming fixture did not become busy')
      await new Promise(r=>setTimeout(r,250))
    }
    const active=await op('get_session',{session});assert.ok(['busy','working'].includes(active.live?.status),'fixture must still be running before queue test');
    const r=await op('steer_session',{session,mode:'queue',message:'Queued synthetic follow-up. When you reach this message, reply exactly QUEUED_PLAN_RECEIVED. Do not run tools or message others.'})
    assert.equal(r.delivery,'queued');assert.equal(r.applied,false)
    const s=await op('get_session',{session});assert.ok(['busy','working'].includes(s.live?.status));return {delivery:r.delivery,recipientStillBusy:true}
  })
  await step('interrupt-then-replacement-is-applied',async()=>{
    assert.ok(['busy','working'].includes((await op('get_session',{session})).live?.status),'recipient must be busy immediately before interruption')
    const r=await op('steer_session',{session,mode:'interrupt',message:'Replacement synthetic plan. Discard the old fixture plan. Reply exactly NEW_PLAN_APPLIED. Do not use tools, edit files or message anyone.'});assert.equal(r.stopped,true)
    const seen=await observeUntil(e=>e.some(x=>x.type==='assistant'&&x.text==='NEW_PLAN_APPLIED'),30)
    assert.equal(hasCompletionMarker(seen,'OLD_PLAN_FINISHED'),false,'old completion marker must be a final line, never a quotation')
    assert.equal(seen.some(x=>x.tools?.length),false,'tool-free fixture must not wait on permission')
    assert.equal(r.queueDisposition,'existing queued messages are preserved by native stop')
    return {stopVerified:true,replacementReplyVerified:true,oldPlanFinished:false,delivery:r.delivery}
  })
  await step('single-native-recipient-replies',async()=>{
    const tail=await op('session_events',{session,cursor,include_text:true});cursor=tail.cursor;observed.push(...tail.events)
    for(const marker of ['V2_INITIAL_OK','NEW_PLAN_APPLIED'])assert.equal(observed.filter(x=>x.type==='assistant'&&x.text===marker).length,1)
    return {initialReplies:1,replacementReplies:1,duplicateReply:false}
  })
} catch(e) { process.exitCode=1 }
finally {
  // A nonterminal owned job can still dispatch after a failed assertion.
  // Cancel it before fixture cleanup; uncertain native effects stay recorded.
  await Promise.all([...ownedJobs].map(id=>cancelJob(id)))
  if(controller.signal.aborted){
    await Promise.all([...ownedJobs].map(id=>cancelJob(id)))
    rows.push({name:'interrupted',ok:false,session,remainingCleanup:!!session})
  }
  if(session&&!controller.signal.aborted) await step('cleanup-archive',async()=>{
    const s=await op('get_session',{session})
    if(['busy','working'].includes(s.live?.status))await op('stop_session',{session})
    if(s.pinned) await op('pin_session',{session,pinned:false})
    const r=await op('archive_session',{session});assert.equal(r.verified,true);return {session,archived:true}
  }).catch(()=>{process.exitCode=1})
  if(inputFree)await step('input-resource-audit-after',async()=>{const r=await assertInputHealthy({phase:'after-input-free-qualification',evidence:join(STATE_DIR,'pressure',`input-free-${stamp}-after.json`)});return {filters:r.filters.length,inputAutomation:false,uiQuarantine:uiPolicy().blocked}}).catch(()=>{process.exitCode=1})
  const report=join(STATE_DIR,'pressure',`live-v2-${stamp}.json`)
  const required=[brokerOnly?'adopt-owned-fixture':'create-and-restore-focus','durable-submit-and-recipient-reply','cancellation-before-native-dispatch','three-concurrent-native-controls','batched-native-controls','queue-is-not-interrupt','interrupt-then-replacement-is-applied','single-native-recipient-replies','cleanup-archive']
  if(inputFree)required.push('input-resource-audit-before','input-resource-audit-after')
  const sourceAfter = runtimeFingerprint()
  const brokerRuntimeAfter=brokerInfo().runtime
  const brokerUnchanged=brokerRuntimeBefore?.build===brokerRuntimeAfter?.build&&brokerRuntimeBefore?.bootstrapHash===brokerRuntimeAfter?.bootstrapHash&&brokerRuntimeBefore?.generation===brokerRuntimeAfter?.generation
  const pinnedObserved=!brokerRuntimeAfter?.pinned||brokerRuntimeAfter.integrity&&brokerRuntimeAfter.dependencyPathsObserved
  const ok=sourceBefore===sourceAfter&&brokerUnchanged&&pinnedObserved&&rows.every(r=>r.ok)&&required.every(name=>rows.some(r=>r.name===name&&r.ok))
  writeJsonAtomic(report,{scope:inputFree?'input-free-live':brokerOnly?'native-broker-only':'full-live',session,rows,required,ok,sourceBefore,sourceAfter,brokerRuntimeBefore,brokerRuntimeAfter})
  recordMemory({kind:'test_result',topic:inputFree?'v2-input-free-pressure':brokerOnly?'v2-native-broker-pressure':'v2-live-pressure',source:'live-v2',status:ok?'passed':'failed',brokerBuild:brokerRuntimeAfter?.build??null,bootstrapHash:brokerRuntimeAfter?.bootstrapHash??null,evidence:report,lesson:`${inputFree?'Input-free live':brokerOnly?'Native broker only':'Full live'}: ${rows.filter(r=>r.ok).length}/${required.length} required checks passed; interrupted=${controller.signal.aborted}; sourceUnchanged=${sourceBefore===sourceAfter}; brokerUnchanged=${brokerUnchanged}; pinnedDependenciesObserved=${pinnedObserved}`})
  console.log(JSON.stringify({report,ok}))
}
