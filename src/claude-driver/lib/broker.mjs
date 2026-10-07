// Tier B: a desktop session the driver owns ("claude-driver-broker") runs the
// app's own ccd_* tools on request. Only desktop-hosted sessions have those
// tools, so every non-desktop harness goes through here.
//
// Request path: write requests/<id>.json → send a compatible loop wake if
// needed → poll results/<id>.json
// (bounded) → the caller verifies against disk ground truth.

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DriverError, sleep } from './paths.mjs'
import { getRecord, liveByHost } from './sessions.mjs'
import { BROKER_DIR, ensureDir, readJson, withLock, writeJsonAtomic } from './state.mjs'
import { deliver } from './peer.mjs'
import { cancelRequest, control, enqueue, validatedResult, nativeResultFile, inspectRequest, safeUndispatchedRetry } from './requests.mjs'
import { observeNativeReceipts } from './native-receipts.mjs'
import { assertUiAvailable } from './ui-policy.mjs'
import { assertInputHealthy } from './input-health.mjs'
import { validateWarmBroker, warmOnlyRecovery, nativeWarmFailure } from './warm-recovery.mjs'
import {brokerResidencyProtection} from './broker-residency.mjs'
import {activeRelease,commitRelease,HANDOFF_OWNER,releaseStatus,entryEpochEvidence,loadEntryEvidence} from './releases.mjs'
import {stopRescuePolicy,armStopRescue,disarmStopRescue} from './stop-rescue.mjs'
import {quietHookStatus} from './quiet-hook.mjs'
import {verifyWaiterReadiness,waitForNativeAvailability} from './waiter-readiness.mjs'
import {requestTrigger} from '../scripts/broker-stop-rescue.mjs'
import {indexedCheckpointEvidence,validateBatchAdmission} from './batch-admission.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const TEMPLATE = join(HERE, '..', 'broker-template', 'CLAUDE.md')
export const BROKER_TITLE = 'claude-driver-broker'
export const BROKER_MODEL = process.env.CLAUDE_DRIVER_BROKER_MODEL || 'claude-haiku-4-5-20251001'
// A long-lived context can ignore a version bump even after reading the file.
// The v6 wake alias is supported by v7; queued requests keep the current protocol.
const BROKER_WAKE = 'claude-driver wake v6'
const BROKER_FILE = join(BROKER_DIR, 'broker.json')
const REQ_DIR = join(BROKER_DIR, 'requests')
const RES_DIR = join(BROKER_DIR, 'results')

export const BROKER_OPS = [
  'set_session_title', 'archive_session', 'unarchive_session', 'set_session_model', 'set_session_effort', 'set_session_permission_mode',
  'send_message', 'stop_session', 'get_session', 'list_sessions', 'delete_session', 'export_transcript',
  'set_pinned', 'list_groups', 'create_group', 'rename_group', 'move_sessions', 'set_unread', 'mark_completed', 'get_window_layout',
]

export function protocolVersion() {
  const active=activeRelease()
  return active ? String(active.protocol) : readFileSync(TEMPLATE, 'utf8').match(/^Protocol version: (\d+)/m)?.[1] || '1'
}

// The template names absolute paths so the broker's Bash never depends on PATH.
function renderTemplate() {
  const active=activeRelease()
  const stable = join(homedir(), 'dotfiles', 'src', 'claude-driver', 'scripts', 'broker-wait.mjs')
  const wait = active ? join(active.root,'scripts','broker-wait.mjs') : existsSync(stable) ? stable : join(HERE, '..', 'scripts', 'broker-wait.mjs')
  const node = existsSync('/opt/homebrew/bin/node') ? '/opt/homebrew/bin/node' : process.execPath
  const check = join(dirname(wait), 'broker-check.mjs')
  return readFileSync(active ? join(active.root,'broker-template','CLAUDE.md') : TEMPLATE, 'utf8').replaceAll('{{NODE}}', node).replaceAll('{{WAIT}}', wait).replaceAll('{{CHECK}}', check).replaceAll('{{DIR}}', BROKER_DIR)
}

export function prepareBrokerDir() {
  ensureDir(REQ_DIR)
  ensureDir(RES_DIR)
  writeFileSync(join(BROKER_DIR, 'CLAUDE.md'), renderTemplate())
  return BROKER_DIR
}

// Resident = the broker's wait loop wrote a heartbeat in the last few seconds.
export function heartbeat({native=true}={}) {
  const hb = readJson(join(BROKER_DIR, 'heartbeat.json'), null)
  if (!hb) return { resident: false }
  const age = Date.now() - hb.at
  // Pickup ends the wait. Neither finishing old work nor a rearm hint is a
  // live pickup channel; never suppress a fresh request wake on those states.
  const resident = Number.isFinite(age) && age >= 0 && (hb.state === 'waiting' && age < 6000 || !native && (hb.state==='rearming'&&age<6000||hb.state==='working'&&age<180000))
  return { resident, state: hb.state, ageMs: age }
}

export function brokerInfo() {
  const info = readJson(BROKER_FILE, null)
  if (!info?.sessionId) return { configured: false }
  const rec = getRecord(info.sessionId)
  const live = liveByHost().get(info.sessionId)
  const runtime=releaseStatus()
  if(runtime.pinned&&runtime.integrity){
    const pointer=activeRelease().pointer
    const entries=['broker-wait','broker-check'].map(kind=>loadEntryEvidence(join(BROKER_DIR,kind+'-entry.json')))
    runtime.dependencyEvidence=entryEpochEvidence({pointer,runtime,live,entries,sessionId:info.sessionId,brokerDir:BROKER_DIR})
    runtime.dependencyPathsObserved=runtime.dependencyEvidence.verified
  }
  const templateCurrent = runtime.integrity && existsSync(join(BROKER_DIR, 'CLAUDE.md')) && readFileSync(join(BROKER_DIR, 'CLAUDE.md'), 'utf8') === renderTemplate()
  const native=live?.entrypoint==='claude-desktop',hb=heartbeat({native})
  const quiet=quietHookStatus({sessionId:info.sessionId,live})
  const waiter=verifyWaiterReadiness({sessionId:info.sessionId,live,runtime,pointer:loadEntryEvidence(join(BROKER_DIR,'runtime.json')),selected:loadEntryEvidence(join(BROKER_DIR,'broker-wait-entry-selected.json')),completed:loadEntryEvidence(join(BROKER_DIR,'broker-wait-entry.json')),heartbeat:loadEntryEvidence(join(BROKER_DIR,'heartbeat.json')),brokerDir:BROKER_DIR})
  const batch=indexedCheckpointEvidence({sessionId:info.sessionId,live,runtime,entry:loadEntryEvidence(join(BROKER_DIR,'broker-check-entry.json'))})
  return {
    configured: true,
    sessionId: info.sessionId,
    exists: !!rec,
    archived: rec?.isArchived ?? null,
    title: rec?.title ?? null,
    titleSource: rec?.titleSource ?? null,
    model: rec?.model ?? null,
    permissionMode: rec?.permissionMode ?? null,
    live: live ? { pid: live.pid, status: live.status, socket: live.messagingSocketPath, entrypoint:live.entrypoint,procStart:live.procStart } : null,
    resident: live ? { ...hb, resident: native?quiet.verified||waiter.verified:['busy','working'].includes(live.status)&&hb.resident, evidenceSource:native?'native-pickup-channel':'legacy-non-native-heartbeat' } : { resident: false },
    waiterReadiness:waiter,
    batchAdmission:batch,
    quietHook:quiet,
    templateCurrent,
    runtime,
    handoffStopped:readJson(join(BROKER_DIR,'STOP'),null)?.owner===HANDOFF_OWNER,
    residencyProtection:brokerResidencyProtection(info.sessionId,live),
  }
}

export function validateReleaseAdmission({info,record,stop,nonce,pid,unresolved}) {
  validateWarmBroker(info,record,BROKER_DIR)
  if(!info.live||info.live.pid!==pid||typeof info.live.procStart!=='string'||!info.live.procStart||info.live.entrypoint!=='claude-desktop'||info.live.status!=='idle'||
     stop?.owner!==HANDOFF_OWNER||!nonce||stop.nonce!==nonce||unresolved.length||
     info.residencyProtection.uncertain||info.residencyProtection.pendingCalls||info.residencyProtection.jobs.length)
    throw new DriverError('release handoff requires the exact stopped, idle broker with settled requests and maintenance cleanup',{category:'broker_handoff_refused'})
}
function releaseAdmission(nonce,pid) {
 const info=brokerInfo(),stop=readJson(join(BROKER_DIR,'STOP'),null)
 const unresolved=readdirSync(ensureDir(REQ_DIR)).filter(f=>/^[A-Za-z0-9_-]+\.json$/.test(f)).map(f=>inspectRequest(f.slice(0,-5)))
   .filter(r=>!r.receiptVerified&&!r.retrySafe)
 validateReleaseAdmission({info,record:getRecord(info.sessionId),stop,nonce,pid,unresolved})
 return info
}
export async function activateBrokerRelease(build,{nonce,pid}={}) {
 return withLock('broker',()=>{const info=releaseAdmission(nonce,pid);return commitRelease(build,{sessionId:info.sessionId,pid,procStart:info.live.procStart,nonce},renderTemplate)})
}
export async function resumeBrokerRelease({nonce,pid}={}) {
 return withLock('broker',()=>{
  const info=releaseAdmission(nonce,pid),active=activeRelease()
  if(!active||active.pointer.sessionId!==info.sessionId||active.pointer.pid!==pid||active.pointer.procStart!==info.live.procStart||active.pointer.handoffNonce!==nonce||!info.templateCurrent)
   throw new DriverError('release pointer does not match this settled handoff',{category:'broker_handoff_refused'})
  rmSync(join(BROKER_DIR,'STOP'))
  return {build:active.build,pid,stopped:false,nativePathsVerified:false,wakeRequired:true}
 })
}

export function saveBrokerInfo(info) {
  writeJsonAtomic(BROKER_FILE, info)
}

export function newRequestId() {
  return `r${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`
}

// ops: [{ op, args }]. Returns the broker's results array.
export async function brokerRequest(ops, { timeoutMs = 90_000, progress = () => {}, signal, idleWake=true } = {}) {
  const deadline = Date.now() + timeoutMs
  let publishedRequest=null
  try{
  if(!Array.isArray(ops)||!ops.length)throw new DriverError('broker request requires operations',{category:'bad_args'})
  for (const o of ops) if (!BROKER_OPS.includes(o.op)) throw new DriverError(`op ${o.op} is not on the broker allowlist`, { category: 'bad_args' })
  return await withLock('broker', async () => {
    let info = brokerInfo()
    info=await waitForNativeAvailability(info,{observe:brokerInfo,deadline,signal,sleep,progress})
    const rescuePolicy=stopRescuePolicy()
    if(typeof idleWake!=='boolean')throw new DriverError('invalid idle wake policy',{category:'bad_args',detail:{dispatched:false,retrySafe:true}})
    if(info.handoffStopped)throw new DriverError('broker deployment handoff is stopped; requests cannot clear its STOP',{category:'broker_handoff_refused',detail:{dispatched:false,retrySafe:true}})
    if(info.runtime?.integrity===false)throw new DriverError('broker runtime integrity failed; no request admitted',{category:'broker_runtime_invalid',detail:{dispatched:false,retrySafe:true}})
    if(info.runtime?.dependencyEvidence?.reason==='native-process-epoch-mismatch')throw new DriverError('active release belongs to a different native process; a settled handoff is required before requests',{category:'broker_runtime_epoch_mismatch',detail:{dispatched:false,retrySafe:true}})
    if (!info.configured || !info.exists) throw new DriverError('no broker session; run `claude-driver broker init`', { category: 'broker_missing' })
    if (!info.templateCurrent) prepareBrokerDir()
    if (!info.live) throw new DriverError(`broker ${info.sessionId} has no live process (app restarted?); run \`claude-driver broker revive\``, { category: 'broker_dead' })
    validateBatchAdmission(ops,{native:info.live.entrypoint==='claude-desktop',indexed:info.batchAdmission?.verified===true})
    if(info.live.entrypoint==='claude-desktop'&&ops.some(o=>!['get_session','list_sessions','list_groups','get_window_layout'].includes(o.op))&&rescuePolicy?.nativeEffectAdmissionVersion!==1)throw new DriverError('native effect admission policy is missing or legacy; no effect enqueued',{category:'broker_native_admission_required',detail:{dispatched:false,retrySafe:true}})
    const id = newRequestId(),pulse=requestTrigger(id,Number(protocolVersion()))
    rmSync(join(BROKER_DIR, 'STOP'), { force: true })
    if (signal?.aborted || Date.now() >= deadline) throw new DriverError('cancelled or expired before enqueue', { category: signal?.aborted ? 'cancelled' : 'broker_timeout' })
    const request = { id, ops, createdAt: new Date().toISOString(), expiresAt: deadline, protocol: Number(protocolVersion()) }
    const observe = info.live.entrypoint==='claude-desktop' ? observeNativeReceipts(info.sessionId,request) : null
    if(info.live.entrypoint==='claude-desktop'&&!observe)throw new DriverError('native broker receipt journal unavailable; no request dispatched',{category:'broker_receipt_unavailable',detail:{retrySafe:true,dispatched:false}})
    if(observe) request.nativeObservation=observe.start
    if(observe&&rescuePolicy?.nativeEffectAdmissionVersion===1)request.nativeEffectAdmissionPolicy={version:1,handlerSha256:rescuePolicy.sha256,settingsHash:rescuePolicy.settingsHash}
    enqueue(request)
    publishedRequest=request
    if(rescuePolicy?.quietWait?.version===1)writeJsonAtomic(join(BROKER_DIR,'quiet-request.json'),{requestId:id})
    const wakeOptions=target=>{const priority=idleWake&&target.live?.status==='idle'?'now':'next';return {signal,...(rescuePolicy?{method:'direct',priority,onPrepared:w=>{
      // Metadata survives arm disarming, so an unaccepted socket write remains
      // independently correlatable after a timeout. No keys or prompt bodies.
      writeJsonAtomic(join(BROKER_DIR,'wake-'+id+'.json'),{requestId:id,protocol:request.protocol,...w,priority,preparedAt:Date.now(),acceptance:'unverified'})
      if(rescuePolicy?.quietWait?.version===1)writeJsonAtomic(join(BROKER_DIR,'quiet-last-wake.json'),{requestId:id,protocol:request.protocol,...w})
      armStopRescue(rescuePolicy,request,w)
    }}:{})}}
    progress(`broker request ${id}: ${ops.map((o) => o.op).join(', ')}`)
    const t0 = Date.now()
    let via = { method: info.quietHook?.verified?'native-quiet-hook':'resident' }
    let lastWake = 0
    let wakeAttempts = info.quietHook?.verified?1:0 // one native hook continuation, no additional peer wake
    let terminalWakeAt = null
    // Persist abort intent while the delivery helper is still shutting down.
    // Waiting for helper exit first leaves an avoidable dispatch window.
    let abortCancellation
    const cancelOnAbort=()=>{abortCancellation??=cancelRequest(id,'cancelled').catch(()=>null)}
    signal?.addEventListener('abort',cancelOnAbort,{once:true})
    if(signal?.aborted)cancelOnAbort()
    // A resident broker picks the file up itself; otherwise wake it into its loop.
    try {
    if (!info.resident?.resident) {
      via = await deliver(info, pulse, { ...wakeOptions(info),timeoutMs:Math.max(1,deadline-Date.now()) })
      if(via.msgId)observe?.watchWake(via.msgId)
      lastWake = Date.now()
      wakeAttempts++
      progress(`delivered via ${via.method} in ${Date.now() - t0} ms; awaiting native serving evidence`)
    }
    while (Date.now() < deadline) {
      if (signal?.aborted) throw new DriverError('cancelled', { category: 'cancelled' })
      if(rescuePolicy&&via.msgId)observe?.watchRescue(loadEntryEvidence(join(BROKER_DIR,'stop-rescue-'+id+'.json')),{pid:info.live.pid,procStart:info.live.procStart})
      const actual = observe?.()
      if(actual) writeJsonAtomic(nativeResultFile(id),actual)
      // When the native journal is available, never settle from a relay's
      // shortened/revised Write result. Synthetic/older brokers retain the
      // explicitly weaker relay receipt path.
      const res = observe ? actual && validatedResult(request) : validatedResult(request)
      if(res&&['cancelled','expired'].includes(res.state))throw new DriverError(`${res.state} before dispatch`,{category:res.state==='expired'?'broker_timeout':'cancelled'})
      if (res) return { id, results: res.results, receiptSource:res.source||'broker-relay', deliveredVia: via.method, ms: Date.now() - t0 }
      const wake=via.msgId&&observe?.wakeStatus(via.msgId)
      if(wake?.terminalWithoutTools&&control(id).state==='pending'){
        const hook=rescuePolicy&&loadEntryEvidence(join(BROKER_DIR,'stop-rescue-hook-invocation-'+id+'.json'))
        const declined=hook?.requestId===id&&hook.msgId===via.msgId&&hook.ancestor===true&&hook.stop===true&&hook.continued===false&&hook.eligible===false&&Number.isFinite(hook.at)&&hook.at>=Date.parse(request.createdAt)&&hook.at<=Date.now()
        // An initial end_turn precedes native Stop hooks. Until this request's
        // own hook declines or its owned continuation actually ends, waiting
        // for the bounded outcome is not permission for another wake/retry.
        if(rescuePolicy&&!wake.rescueLanded&&!declined){await sleep(100);continue}
        terminalWakeAt??=Date.now()
        const now=brokerInfo()
        if(now.live?.status==='idle'&&now.live.pid===via.pid&&now.live.procStart===via.procStart&&Date.now()-terminalWakeAt>=750)
          throw new DriverError('native broker ended the correlated wake without tool calls; request remains unclaimed, no additional wake sent',{category:'broker_not_serving',detail:{wake:{msgId:via.msgId,pid:via.pid,procStart:via.procStart,...wake}}})
        await sleep(100)
        continue // settle the native end-turn race before considering another wake
      }
      terminalWakeAt=null
      // A broker can end its turn between our heartbeat check and enqueue.
      // Wake the SAME durable request, bounded, only while still unclaimed.
      // The pickup/checkpoint guards make duplicate triggers harmless.
      if (control(id).state === 'pending' && Date.now() - lastWake > 2000 && wakeAttempts < (rescuePolicy?1:3)) {
        const now = brokerInfo()
        if (!now.live) throw new DriverError('broker process disappeared while request was pending', { category: 'broker_dead' })
        if (!['busy', 'working'].includes(now.live.status)) {
          via = await deliver(now, pulse, { ...wakeOptions(now),timeoutMs:Math.max(1,deadline-Date.now()) })
          if(via.msgId)observe?.watchWake(via.msgId)
          lastWake = Date.now()
          wakeAttempts++
          progress(`re-woke idle broker for ${id} via ${via.method} (attempt ${wakeAttempts})`)
        }
      }
      await sleep(300)
    }
    throw new DriverError(`broker did not answer request ${id} within ${timeoutMs / 1000} s (delivered via ${via.method})`, { category: 'broker_timeout' })
    } catch (err) {
      if(abortCancellation)await abortCancellation
      if(!signal?.aborted&&err.category==='cli_timeout'&&Date.now()>=deadline)err.category='broker_timeout'
      const state = await cancelRequest(id, err.category === 'broker_timeout' ? 'expired' : 'cancelled')
      // Completion can race cancellation between the polling check and the
      // durable cancellation lock. The correlated completed result wins.
      if (state.resultAvailable) {
        const res = validatedResult(request)
        if (res&&!['cancelled','expired'].includes(res.state)) return { id, results: res.results, receiptSource:res.source||'broker-relay', deliveredVia: via.method, ms: Date.now() - t0 }
      }
      err.detail = { ...err.detail, requestId: id, ...(via.msgId?{wake:{method:via.method,msgId:via.msgId,pid:via.pid,procStart:via.procStart}}:{}), state: state.state, dispatched: state.dispatched, retrySafe: !state.dispatched && (!state.resultAvailable||['cancelled','expired'].includes(state.state))&&safeUndispatchedRetry(request) }
      if (state.dispatched||!safeUndispatchedRetry(request)) err.category = 'outcome_unknown'
      throw err
    } finally {
      signal?.removeEventListener('abort',cancelOnAbort)
      if(rescuePolicy)disarmStopRescue(id)
      if(abortCancellation)await abortCancellation
    }
  }, { signal, timeoutMs: Math.max(1, deadline - Date.now()) })
  }catch(error){
    // Lock contention, abort and validation can fail before any durable work
    // exists. Preserve that stronger evidence without changing the retry
    // contract for any request already published to the native broker.
    if(error&&typeof error==='object'&&!error.detail?.requestId){
      error.category??='broker_client_failure'
      if(!publishedRequest)error.detail={...error.detail,dispatched:false,retrySafe:true}
      else{
        // Publication precedes progress/notice setup. A callback or local I/O
        // failure there still leaves durable work which a native waiter could
        // claim; settle it and preserve the request identity before handback.
        let state
        try{state=await cancelRequest(publishedRequest.id,'cancelled')}catch{}
        disarmStopRescue(publishedRequest.id)
        const receiptAvailable=!!state?.resultAvailable&&!['cancelled','expired'].includes(state.state)
        error.detail={...error.detail,requestId:publishedRequest.id,state:state?.state??'outcome_unknown',dispatched:state?.dispatched??false,receiptAvailable,retrySafe:!!state&&!receiptAvailable&&!state.dispatched&&['cancelled','expired'].includes(state.state)&&safeUndispatchedRetry(publishedRequest)}
        if(receiptAvailable)error.category='broker_client_failure'
        else if(!state||state.dispatched||!safeUndispatchedRetry(publishedRequest))error.category='outcome_unknown'
      }
    }
    throw error
  }
}

// One op, unwrapped: throws when the broker reports ok:false.
export async function brokerOp(op, args, opts) {
  const r = await brokerRequest([{ op, args }], opts)
  const first = r.results?.[0]
  if (!first) throw new DriverError(`broker returned no result for ${op}`, { category: 'broker_bad_result' })
  if (!first.ok) throw new DriverError(`${op} failed in the broker: ${first.error}`, { category: 'tier_b_failed', detail: first })
  return { result: first.result, deliveredVia: r.deliveredVia, ms: r.ms, requestId: r.id }
}

// Revive a dead broker. 1) Focus it by deep link: the app warm-spawns a
// focused session's process unless its CLI governor is at cap. 2) Otherwise
// Tier C types the wake line into its composer (a real send always spawns).
// Focus is restored right after each navigation; liveness is polled after.
export async function reviveBroker(opts = {}) {
  return withLock('broker-revive', async () => {
    const info = brokerInfo()
    if(info.handoffStopped)throw new DriverError('broker release handoff owns STOP; recovery must stand down',{category:'broker_handoff_refused'})
    if(info.runtime?.integrity===false)throw new DriverError('broker runtime integrity failed; recovery refused',{category:'broker_runtime_invalid'})
    if (info.live) return { method: 'already_live', live: info.live }
    // Recovery itself navigates the app before Tier C. Stand down before
    // any snapshot/deep link and don't turn quarantine into a cooldown.
    if(!opts.warmOnly)assertUiAvailable()
    const file = join(BROKER_DIR, 'recovery.json')
    const last = readJson(file, null)
    if (!opts.forceRecovery && last?.retryAfter > Date.now()) throw new DriverError('broker recovery is cooling down after failure; inspect driver_status or run broker revive explicitly', { category: 'recovery_cooldown', detail: { retryAfter: last.retryAfter } })
    try {
      const result = opts.warmOnly ? await reviveBrokerWarmOnly(opts) : await reviveBrokerUnlocked(opts)
      writeJsonAtomic(file, { at: Date.now(), outcome: 'ok', method: result.method })
      return result
    } catch (err) {
      if (err.category !== 'cancelled') writeJsonAtomic(file, { at: Date.now(), outcome: 'failed', category: err.category, retryAfter: Date.now() + 30_000 })
      throw err
    }
  }, { signal: opts.signal })
}

async function reviveBrokerWarmOnly({progress=()=>{},signal}={}) {
 const info=brokerInfo()
 validateWarmBroker(info,getRecord(info.sessionId),BROKER_DIR)
 if(!info.templateCurrent)prepareBrokerDir()
 const {snapshot,restoreFrom,logSince,sessionUrl}=await import('./focus.mjs')
 const {openUrl}=await import('./paths.mjs')
 const id=newRequestId(),started=Date.now()
 progress('revive: native warm recovery only; Computer Use is excluded')
 return warmOnlyRecovery({sessionId:info.sessionId,signal},{
  audit:phase=>assertInputHealthy({phase,evidence:join(BROKER_DIR,`${id}-${phase}.json`)}),
  snapshot,restore:restoreFrom,
  open:session=>openUrl(sessionUrl(session)),
  live:()=>brokerInfo().live,
  capped:()=>logSince(started,/CliGovernor\] at cap; yielding warm spawn/).length>0,
  failure:()=>nativeWarmFailure(logSince(started),info.sessionId,{capped:logSince(started,/CliGovernor\] at cap; yielding warm spawn/).length>0})
 })
}

async function reviveBrokerUnlocked({ focus = 'restore', allowTierC = true, progress = () => {}, signal } = {}) {
  const { snapshot, restoreFrom, logSince, sessionUrl } = await import('./focus.mjs')
  const { openUrl } = await import('./paths.mjs')
  const info = brokerInfo()
  if (!info.configured || !info.exists) throw new DriverError('no broker session; run `claude-driver broker init`', { category: 'broker_missing' })
  const checkCancel = () => { if (signal?.aborted) throw new DriverError('recovery cancelled', { category: 'cancelled' }) }
  const waitLive = async (ms, stopEarly = () => false) => {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
      checkCancel()
      if (brokerInfo().live) return true
      if (stopEarly()) return false
      await sleep(250)
    }
    return !!brokerInfo().live
  }
  checkCancel()
  const t0 = Date.now()
  const before = focus === 'leave' ? null : await snapshot()
  let result
  try {
    progress('revive: focusing broker to trigger a warm spawn')
    await openUrl(sessionUrl(info.sessionId))
    const atCap = () => logSince(t0, /CliGovernor\] at cap; yielding warm spawn/).length > 0
    if (await waitLive(12_000, atCap)) result = { method: 'warm_spawn', ms: Date.now() - t0 }
    else {
      const capped = atCap()
      if (!allowTierC) throw new DriverError(`broker did not warm-spawn${capped ? ' (app CLI governor at cap)' : ''}; Tier C disabled`, { category: 'broker_dead' })
      progress(`revive: warm spawn ${capped ? 'blocked (governor at cap)' : 'did not happen'}; typing wake line via Tier C`)
      const { typeIntoComposer } = await import('./tierc.mjs')
      const tc = await typeIntoComposer(BROKER_TITLE, `claude-driver wake v${protocolVersion()}`, { progress, signal, timeoutSec: 150 })
      checkCancel()
      if (tc.status !== 'completed') throw new DriverError(`broker wake did not complete: ${tc.status}; inspect the UI before retrying`, { category: 'broker_dead', detail: { tierCStatus: tc.status, evidence:tc.evidence } })
      if (tc.structured?.sent !== true) throw new DriverError(`broker wake was not sent: ${tc.structured?.reason||'no verified UI send'}; reconcile the composer before retrying`, { category:'broker_dead',detail:{evidence:tc.evidence,sent:false} })
      if (!await waitLive(30_000)) throw new DriverError('broker wake completed but no live process was verified', { category: 'broker_dead', detail:{evidence:tc.evidence} })
      result = { method: 'tier_c_wake', ms: Date.now() - t0, tierC: tc.status, evidence:tc.evidence, execution:tc.execution, metrics:tc.metrics }
    }
  } finally {
    const action = before && focus === 'restore' ? await restoreFrom(before, info.sessionId) : focus
    if (result) result.focus = action
  }
  return result
}
