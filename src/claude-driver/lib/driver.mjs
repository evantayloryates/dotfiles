// The op layer shared by the MCP server and the CLI. Every op: validate →
// pick a tier (A disk/CLI/deep link, B broker ccd_* tools, C computer use) →
// act under the focus policy → verify against disk → one ledger row.

import {auditRequests} from './request-audit.mjs'
import {randomUUID} from 'node:crypto'
import {lifecycleEvent,withLifecycleContext,lifecycleContext} from './lifecycle-log.mjs'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { APP_SUPPORT, DriverError, SCRATCH_RE, sleep, versions } from './paths.mjs'
import {
  allRecords, callerHostSession, getRecord, liveByHost, openPrs, readGroups, readPins, resolveSession, summarize, waitForPins, waitForRecord,
} from './sessions.mjs'
import { FOCUS_MODES, currentMain, frontApp, withFocus } from './focus.mjs'
import { DEFAULT_MODEL, createSession, forkSession, openSession, unarchiveViaLink } from './tiera.mjs'
import { BROKER_OPS, brokerInfo, brokerRequest, reviveBroker } from './broker.mjs'
import {
  BROKER_DIR, CAPABILITIES, LEDGER, PENDING_LEARNINGS, STATE_DIR, appendJsonl, loadRegistry, readJson, readJsonl, redactArgs, updateRegistry,
} from './state.mjs'
import { cleanupCliLeftovers } from './cleanup.mjs'
import { BYPASS, RECYCLE_WAIT_MS, claim, defaultPermissionMode, poolGate, poolOf, poolTitle, reconcile, recycleMessage, setEntry } from './pool.mjs'
import { submitJob, inspectJob, waitJob, cancelJob } from './jobs.mjs'
import { operationMemory, queryMemory, recordMemory } from './memory.mjs'
import { sessionEvents, waitSession } from './events.mjs'
import { withSessionControl } from './controls.mjs'
import { RUNTIME_BUILD,runtimeState } from './build.mjs'
import { uiPolicy } from './ui-policy.mjs'
import { inspectRequest } from './requests.mjs'
import { deliveryReceipt } from './delivery.mjs'
import { stopReceipt } from './stop-receipt.mjs'
import { nativeQualification } from './qualification.mjs'
import { peerRecord } from './peer-direct.mjs'
import { waitNativePeer } from './wait-native-peer.mjs'
import { sendDirectRecipient } from './direct-recipient.mjs'
import { reconcilePeerSend } from './peer-send-ledger.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(HERE, '..')
export const DRIVER_VERSION = (() => {
  try {
    return execFileSync('/usr/bin/git', ['-C', ROOT, 'log', '-1', '--format=%h', '--', '.'], { encoding: 'utf8',stdio:['ignore','pipe','ignore'] }).trim() || 'dev'
  } catch {
    return 'dev'
  }
})()

// ---------------------------------------------------------------- helpers

const txt = (obj) => (typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2))

function isDesktopCaller() {
  return !!callerHostSession()
}

// A desktop-hosted caller has the app's ccd_* tools itself; for Tier B ops
// it should call them directly instead of going through the broker.
const OWN_TOOL = {
  set_session_title: 'mcp__ccd_session_mgmt__set_session_title',
  archive_session: 'mcp__ccd_session_mgmt__archive_session',
  unarchive_session: 'mcp__ccd_session_mgmt__unarchive_session',
  set_session_model: 'mcp__ccd_session_mgmt__set_session_model',
  set_session_effort: 'mcp__ccd_session_mgmt__set_session_effort',
  set_session_permission_mode: 'mcp__ccd_session_mgmt__set_session_permission_mode',
  send_message: 'mcp__ccd_session_mgmt__send_message',
  stop_session: 'mcp__ccd_session_mgmt__stop_session',
  delete_session: 'mcp__ccd_session_mgmt__delete_session',
  set_pinned: 'mcp__ccd_sidebar__set_pinned',
  create_group: 'mcp__ccd_sidebar__create_group',
  move_sessions: 'mcp__ccd_sidebar__move_sessions',
  get_window_layout: 'mcp__ccd_window__get_window_layout',
}

function ownToolsResult(calls, verifyHint) {
  return {
    tier: 'B-own',
    handedBack: true,
    message:
      'You are a Claude desktop session: you have the app\'s own ccd_* tools, so make these calls yourself (the broker is only for harnesses without them). ' +
      'Load them with ToolSearch if deferred. Then verify with claude-driver get_session (disk ground truth).' + (verifyHint ? ` Expect: ${verifyHint}` : ''),
    calls: calls.map(({ op, args }) => ({ tool: OWN_TOOL[op], args })),
  }
}

// Run Tier B ops through the broker; revive once if it is dead.
async function viaBroker(ops, ctx) {
  try {
    return await brokerRequest(ops, { progress: ctx.progress, signal: ctx.signal })
  } catch (err) {
    if (err.category !== 'broker_dead') throw err
    ctx.progress?.('broker is dead; reviving')
    const rv = await reviveBroker({ progress: ctx.progress, signal: ctx.signal })
    ctx.notes.push(`broker revived via ${rv.method} in ${rv.ms} ms (${rv.focus})`)
    ctx.tier = 'B+revive'
    return brokerRequest(ops, { progress: ctx.progress, signal: ctx.signal })
  }
}

function checkResults(r) {
  const bad = r.results.filter((x) => !x.ok)
  if (bad.length) throw new DriverError(`broker op failed: ${bad.map((b) => `${b.op}: ${b.error}`).join('; ')}`, { category: 'tier_b_failed', detail: { requestId:r.id, receiptSource:r.receiptSource, results:r.results, partial:r.results.some(x=>x.ok), dispatched:true, retrySafe:false } })
  return r.results
}

async function tierB(ctx, ops, verifyHint) {
  // Desktop callers get handed back (MCP, or the CLI run from a desktop session's shell); the probe and a plain CLI use the broker.
  if (isDesktopCaller() && !['cli', 'probe'].includes(ctx.harness) && !ctx.args.via_broker) return { handback: ownToolsResult(ops, verifyHint) }
  ctx.tier = ctx.tier || 'B'
  const r = await viaBroker(ops, ctx)
  return { results: checkResults(r), requestId:r.id, receiptSource:r.receiptSource, deliveredVia: r.deliveredVia, ms: r.ms }
}

function focusArg(args, dflt = 'restore') {
  const f = args.focus || dflt
  if (!FOCUS_MODES.includes(f)) throw new DriverError(`focus must be one of ${FOCUS_MODES.join(', ')}`, { category: 'bad_args' })
  return f
}

function matrix() {
  const v = versions()
  const all = readJson(CAPABILITIES, {})
  return { key: `${v.app}|${v.cli}`, current: all[`${v.app}|${v.cli}`] || null, versions: v, all }
}

// True unless the probe for the current versions marked the mechanism broken.
function mechanismOk(name) {
  const m = matrix().current
  return !m || m.mechanisms?.[name]?.ok !== false
}

function underFolder(p, folder) {
  if (!p) return false
  const a = resolve(p)
  return a === folder || a.startsWith(folder + sep)
}

// ---------------------------------------------------------------- guide

export function guideText() {
  return readFileSync(join(ROOT, 'docs', 'guide.md'), 'utf8')
}

// ---------------------------------------------------------------- ops

const S = { type: 'string', description: 'Session: local_<id>, a bare uuid, "self" (the desktop session hosting you), or an exact title.' }
const FOCUS = { type: 'string', enum: FOCUS_MODES, description: 'restore (default): put the main window and frontmost app back unless Taylor moved meanwhile; show: leave the result on screen; leave: do nothing after.' }
const VIA_BROKER = { type: 'boolean', description: 'Desktop callers only: go through the broker instead of being handed back your own ccd_* calls.' }

export const OPS = [
  {
    name: 'driver_request', title: 'Reconcile a broker request', readOnly: true,
    description: 'Inspect a broker request ID from an outcome_unknown error. Accepts a correlated late receipt without replaying any action. Results opt-in; verify app state or recipient response separately.',
    schema: { properties: { request_id: { type: 'string' }, include_result: { type: 'boolean' } }, required: ['request_id'] },
    run: args=>inspectRequest(args.request_id,{includeResult:!!args.include_result}),
  },
  {
    name: 'driver_submit', title: 'Submit a durable operation',
    description: 'Start an operation and return a durable jobId immediately. Survives client disconnects; any harness can inspect/wait/cancel. Reuse an idempotency_key to reconcile an uncertain submission without replaying it. Existing operation safety gates still apply.',
    schema: { properties: { operation: { type: 'string' }, arguments: { type: 'object' }, idempotency_key: { type: 'string' }, timeout_sec: { type: 'number', minimum: 1, maximum: 600 } }, required: ['operation'] },
    run: submitJob,
  },
  {
    name: 'driver_job', title: 'Inspect a durable operation', readOnly: true,
    description: 'Read a durable operation from any harness. A lost worker reports outcome_unknown; never resubmit blindly. Raw result is opt-in.',
    schema: { properties: { job_id: { type: 'string' }, include_result: { type: 'boolean' } }, required: ['job_id'] },
    run: args => inspectJob(args.job_id, { includeResult: !!args.include_result }),
  },
  {
    name: 'driver_wait', title: 'Wait for a durable operation', readOnly: true,
    description: 'Bounded wait (0–60 s) on a jobId from any harness. Expiring/cancelling this wait does not cancel the job. Returns progress and the result when terminal.',
    schema: { properties: { job_id: { type: 'string' }, timeout_sec: { type: 'number', minimum: 0, maximum: 60 }, include_result: { type: 'boolean' } }, required: ['job_id'] },
    run: (args, ctx) => waitJob(args.job_id, { timeoutSec: args.timeout_sec ?? 30, includeResult: args.include_result !== false, signal: ctx.signal }),
  },
  {
    name: 'driver_cancel', title: 'Cancel a durable operation',
    description: 'Cancel a queued operation definitively, or request cancellation of a running one. A dispatched side effect may have happened: inspect its final state and reconcile. This does not stop the target Claude session; use stop_session for that.',
    schema: { properties: { job_id: { type: 'string' } }, required: ['job_id'] }, run: args => cancelJob(args.job_id),
  },
  {
    name: 'driver_memory_query', title: 'Read shared service memory', readOnly: true,
    description: 'Read technical lessons and sanitized operation/test outcomes shared by all harnesses. Exact topic/kind filters; newest first. Candidate lessons are not verified facts.',
    schema: { properties: { topic: { type: 'string' }, kind: { type: 'string', enum: ['lesson', 'observation', 'test_result'] }, limit: { type: 'number', minimum: 1, maximum: 100 } } }, run: queryMemory,
  },
  {
    name: 'driver_memory_record', title: 'Record a shared technical lesson',
    description: 'Record a candidate service-level lesson with evidence. Supply sanitized technical observations only; never prompts, credentials or client data. The service labels harness assertions as candidates; test evidence is recorded separately.',
    schema: { properties: { topic: { type: 'string', minLength: 1, maxLength: 100 }, lesson: { type: 'string', minLength: 1, maxLength: 4000 }, evidence: { type: 'string', minLength: 1, maxLength: 2000 } }, required: ['topic', 'lesson', 'evidence'] },
    run: (args, ctx) => recordMemory({ ...args, source: ctx.harness, status: 'candidate' }),
  },
  {
    name: 'session_events', title: 'Observe a Claude session incrementally', readOnly: true,
    description: 'Capture a cursor before sending work, then read new user/assistant events. No historical messages on first call. Byte-bounded; excludes thinking and tool inputs/results; text opt-in. end_turn is evidence of a turn end, not proof of task success.',
    schema: { properties: { session: S, cursor: { type: 'string' }, include_text: { type: 'boolean' }, include_causality: { type: 'boolean', description: 'Include bounded parent/peer message IDs and metadata-only ancestors for reply correlation. No user text or thinking.' }, limit: { type: 'number', minimum: 1, maximum: 100 } }, required: ['session'] }, run: sessionEvents,
  },
  {
    name: 'session_wait', title: 'Wait for new Claude session events', readOnly: true,
    description: 'Wait up to 60 s for new events or live status changes using a session_events cursor. Status changes do not prove task success; observe the reply. A timed-out wait leaves Claude running.',
    schema: { properties: { session: S, cursor: { type: 'string' }, include_text: { type: 'boolean' }, include_causality: { type: 'boolean', description: 'Include bounded parent/peer message IDs and metadata-only ancestors for reply correlation.' }, limit: { type: 'number', minimum: 1, maximum: 100 }, timeout_sec: { type: 'number', minimum: 0, maximum: 60 } }, required: ['session'] }, run: waitSession,
  },
  {
    name: 'steer_session', title: 'Steer a Claude session explicitly',
    description: 'Queue a follow-up (mode:queue), or stop the active turn, verify idle, then send the replacement instruction (mode:interrupt). Queuing is not immediate steering. Capture a session_events cursor beforehand and read back the response. Refuses the broker and caller.',
    schema: { properties: { session: S, message: { type: 'string' }, mode: { type: 'string', enum: ['queue', 'interrupt'] }, via_broker: VIA_BROKER,
      transport:{type:'string',enum:['native','peer-direct'],description:'Explicit experimental peer-direct supports queue only; interrupt still requires native stop.'},
      operation_id:{type:'string',description:'Stable single-publication identity required for peer-direct queue.'},
      receipt_timeout_sec:{type:'number',minimum:0.1,maximum:60,description:'Absolute peer-direct queue admission/receipt budget, default15 seconds.'} }, required: ['session', 'message', 'mode'] },
    run: async (args, ctx) => {
      const rec = resolveSession(args.session)
      if ([brokerInfo().sessionId, callerHostSession()].includes(rec.sessionId)) throw new DriverError('refusing to steer the broker or caller', { category: 'gate' })
      if(args.transport==='peer-direct'){
        if(args.mode!=='queue'||args.via_broker!==undefined)throw new DriverError('peer-direct steering supports queue only and cannot combine via_broker',{category:'bad_args'})
        ctx.tier='peer-direct'
        const sent=await sendDirectRecipient({operationId:args.operation_id,session:rec.sessionId,message:args.message,timeoutMs:Math.ceil((args.receipt_timeout_sec??15)*1000)},{signal:ctx.signal,absoluteDeadline:ctx.directDeadline})
        return {...sent,steeringMode:'queue',stopped:false,verified:true,experimental:true,applied:false,verification:'Exact native user receipt only; ordinary next-priority delivery does not interrupt. Observe the causal response before claiming application.'}
      }
      if(args.operation_id!==undefined||args.receipt_timeout_sec!==undefined)throw new DriverError('direct recipient options require transport:peer-direct',{category:'bad_args'})
      let stopped
      if (args.mode === 'interrupt') stopped = await runOp('stop_session', { session: rec.sessionId, ...(args.via_broker !== undefined ? { via_broker: args.via_broker } : {}) }, ctx)
      if (stopped?.handedBack) return { ...stopped, message: `${stopped.message} Then call send_message with the replacement instruction; do not send it before the stop is verified.` }
      if (stopped?.stopped && ctx.signal?.aborted) throw new DriverError('recipient stopped; replacement was cancelled before sending', {
        category: 'partial_effect', detail: { sessionId: rec.sessionId, stopped: true, replacementSent: false },
      })
      const sent = await runOp('send_message', { session: rec.sessionId, message: args.message, ...(args.via_broker !== undefined ? { via_broker: args.via_broker } : {}) }, ctx)
      return { ...sent, steeringMode: args.mode, stopped: stopped?.stopped === true, applied: false,
        ...(args.mode==='interrupt'?{queueDisposition:'existing queued messages are preserved by native stop'}:{}),
        verification: 'delivery is confirmed; observe the recipient response before claiming the new instruction was applied' }
    },
  },
  {
    name: 'stop_session', title: 'Interrupt a Claude session turn',
    description: 'Use the app native stop_session control and verify the live process becomes non-busy. Refuses the broker and the caller. Stopping is separate from cancelling a driver job.',
    schema: { properties: { session: S, via_broker: VIA_BROKER }, required: ['session'] },
    run: async (args, ctx) => {
      const rec = resolveSession(args.session)
      if ([brokerInfo().sessionId, callerHostSession()].includes(rec.sessionId)) throw new DriverError('refusing to stop the broker or caller', { category: 'gate' })
      const before = peerRecord(rec.sessionId)
      if (!before || before.sessionId !== (rec.cliSessionId || rec.sessionId.replace(/^local_/, ''))) throw new DriverError('stop requires a verified native recipient epoch', { category: 'verify_mismatch' })
      const b = await tierB(ctx, [{ op: 'stop_session', args: { session_id: rec.sessionId } }])
      if (b.handback) return b.handback
      const receipt=stopReceipt(b.results?.[0]?.result,rec.sessionId)
      if(receipt.state==='requested')throw new DriverError('native interrupt is pending reconnection; replacement must not be sent',{category:'outcome_unknown',detail:{requestId:b.requestId,retrySafe:false}})
      if(receipt.state==='unknown')throw new DriverError('native stop did not return a recognized accepted receipt; replacement must not be sent',{category:'verify_mismatch',detail:{requestId:b.requestId,retrySafe:false}})
      const deadline = Date.now() + 8000
      while (Date.now() < deadline) {
        const live = peerRecord(rec.sessionId, before.pid)
        if (!live || live.procStart !== before.procStart || live.sessionId !== before.sessionId) throw new DriverError('recipient epoch disappeared or changed after stop; replacement must not be sent', { category: 'verify_mismatch' })
        if (live.status === 'idle') return { sessionId: rec.sessionId, stopped: receipt.state!=='already_idle', stopReceipt:receipt.state, verified: true, status: 'idle', nativeProcess: { pid: live.pid, procStart: live.procStart } }
        if (!['busy', 'working', 'running'].includes(live.status)) throw new DriverError('recipient status after stop is unknown; replacement must not be sent', { category: 'verify_mismatch' })
        await sleep(200)
      }
      throw new DriverError('stop was requested but idle state was not verified', { category: 'verify_mismatch' })
    },
  },
  // ---------------- guidance and learning
  {
    name: 'driver_guide',
    title: 'How to use claude-driver',
    description: 'Read first. Tiers, which op to use, the focus policy, safety gates, what verification means, and how to record a learning.',
    schema: { properties: {} },
    readOnly: true,
    run: async () => guideText(),
  },
  {
    name: 'driver_status',
    title: 'Driver status',
    description: 'App and CLI versions, whether you are a desktop caller, broker liveness, the capability matrix for these versions, the main window\'s current session, and recent failures from the ledger.',
    schema: { properties: {} },
    readOnly: true,
    run: async () => {
      const m = matrix(),runtime=runtimeState(),broker=brokerInfo()
      const recent = readJsonl(LEDGER, { tail: 200 })
      return {
        driver: DRIVER_VERSION,
        apiVersion: 2,
        ...runtime,
        nativeQualification:{...nativeQualification(['v2-native-broker-pressure','v2-live-pressure','v2-input-free-pressure'].map(topic=>queryMemory({topic,kind:'test_result',limit:1})[0]).filter(Boolean).sort((a,b)=>b.at.localeCompare(a.at))[0],RUNTIME_BUILD,m.versions,broker.runtime),...(runtime.restartRequired?{qualified:false,reason:'runtime_stale'}:{})},
        uiAutomation: uiPolicy(),
        versions: m.versions,
        stateDir: STATE_DIR,
        desktopCaller: callerHostSession(),
        broker,
        capabilities: m.current ? { probedAt: m.current.probedAt, mechanisms: m.current.mechanisms } : `not probed for ${m.key}; run \`claude-driver probe\``,
        mainWindow: currentMain(),
        frontApp: await frontApp(),
        recentFailures: recent.filter((r) => ['error', 'unverified'].includes(r.outcome)).slice(-8).map(r => ({ ts: r.ts, harness: r.harness, op: r.op, args: redactArgs(r.args), tier: r.tier, ms: r.ms, outcome: r.outcome, category: r.errorCategory, verified: r.verified })),
        sharedMemory: { file: join(STATE_DIR, 'memory.jsonl'), queryTool: 'driver_memory_query', recent: queryMemory({ limit: 5 }) },
        ops24h: recent.filter((r) => Date.parse(r.ts) > Date.now() - 86400_000).length,
      }
    },
  },
  {
    name: 'driver_learnings',
    title: 'Read curated and pending learnings',
    description: 'The curated findings log (docs/findings.md, re-verified) plus pending candidate learnings any harness recorded. Read before working around a surprise.',
    schema: { properties: { pending_only: { type: 'boolean' } } },
    readOnly: true,
    run: async (args) => {
      const shared = queryMemory({ kind: 'lesson', limit: 100 }).map(r => ({ id: r.id, ts: r.at, harness: r.source, learning: r.lesson, evidence: r.evidence, status: r.status }))
      const pending = [...readJsonl(PENDING_LEARNINGS), ...shared]
      if (args.pending_only) return { pending }
      return `${readFileSync(join(ROOT, 'docs', 'findings.md'), 'utf8')}\n\n## Pending (unverified)\n\n${pending.map((p) => `- ${p.ts} [${p.harness || '?'}] ${p.learning} — evidence: ${p.evidence}`).join('\n') || '(none)'}`
    },
  },
  {
    name: 'driver_record_learning',
    title: 'Record a candidate learning',
    description: 'Append a candidate finding about how the app or driver behaves, with evidence (versions, ids, log lines). It stays pending until someone re-verifies it and promotes it into docs/findings.md.',
    schema: { properties: { learning: { type: 'string', minLength: 1, maxLength: 4000 }, evidence: { type: 'string', minLength: 1, maxLength: 2000 } }, required: ['learning', 'evidence'] },
    run: async (args, ctx) => {
      recordMemory({ topic: 'legacy-learning', lesson: args.learning, evidence: args.evidence, source: ctx.harness, status: 'candidate' })
      return 'recorded as pending'
    },
  },
  // ---------------- reads (Tier A, disk)
  {
    name: 'list_sessions',
    title: 'List sessions (disk)',
    description: 'Session records from disk across every account store, newest activity first. Filter by title substring, folder (cwd or origin under it), archived, live.',
    schema: {
      properties: {
        query: { type: 'string', description: 'Case-insensitive substring of the title.' },
        folder: { type: 'string', description: 'Absolute folder; matches sessions whose cwd or originCwd is under it.' },
        include_archived: { type: 'boolean' },
        live_only: { type: 'boolean' },
        limit: { type: 'number', description: 'Default 30.' },
      },
    },
    readOnly: true,
    run: async (args) => {
      const pins = readPins()
      const live = liveByHost()
      const groups = readGroups()
      const gname = new Map(groups.groups.map((g) => [g.id, g.name]))
      let recs = allRecords({ includeArchived: !!args.include_archived })
      if (args.query) recs = recs.filter((r) => (r.title || '').toLowerCase().includes(args.query.toLowerCase()))
      if (args.folder) recs = recs.filter((r) => underFolder(r.cwd, resolve(args.folder)) || underFolder(r.originCwd, resolve(args.folder)))
      if (args.live_only) recs = recs.filter((r) => live.has(r.sessionId))
      recs.sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0))
      return recs.slice(0, args.limit || 30).map((r) => ({
        sessionId: r.sessionId, title: r.title, cwd: r.cwd, archived: r.isArchived, pinned: pins.has(r.sessionId), live: live.get(r.sessionId)?.status || null,
        group: gname.get(groups.assignments[r.sessionId]) || null, model: r.model, lastActivity: r.lastActivityAt ? new Date(r.lastActivityAt).toISOString() : null, openPrs: openPrs(r),
      }))
    },
  },
  {
    name: 'get_session',
    title: 'Get one session (disk)',
    description: 'Full disk record summary for one session: title and titleSource, cwd, archived, model, effort, permission mode, pinned, group, live process, PRs.',
    schema: { properties: { session: S }, required: ['session'] },
    readOnly: true,
    run: async (args) => {
      const rec = resolveSession(args.session)
      const groups = readGroups()
      const s = summarize(rec, { live: liveByHost() })
      s.group = groups.groups.find((g) => g.id === groups.assignments[rec.sessionId])?.name || null
      s.driverCreated = !!loadRegistry().sessions[rec.sessionId]
      return s
    },
  },
  {
    name: 'live_sessions',
    title: 'Live Claude Code processes',
    description: 'Every live Claude Code process (desktop-hosted and CLI) with pid, status, cwd, name and the desktop session it hosts.',
    schema: { properties: {} },
    readOnly: true,
    run: async () => {
      const { liveProcesses } = await import('./sessions.mjs')
      return liveProcesses().map((p) => ({ pid: p.pid, status: p.status, kind: p.kind, entrypoint: p.entrypoint, name: p.name, cwd: p.cwd, hostSessionId: p.hostSessionId || null, sessionId: p.sessionId, waitingFor: p.waitingFor }))
    },
  },
  {
    name: 'window_state',
    title: 'What the main window shows',
    description: 'The main window\'s focused session (main.log / disk, no LLM) and the frontmost macOS app. precise:true also asks the broker for get_window_layout (panes, pop-outs).',
    schema: { properties: { precise: { type: 'boolean' }, via_broker: VIA_BROKER } },
    readOnly: true,
    navigates: false,
    run: async (args, ctx) => {
      const out = { mainWindow: currentMain(), frontApp: await frontApp() }
      if (args.precise) {
        const b = await tierB(ctx, [{ op: 'get_window_layout', args: {} }])
        if (b.handback) return { ...out, ...b.handback }
        out.layout = b.results[0].result
      }
      return out
    },
  },
  // ---------------- Tier A
  {
    name: 'create_session',
    title: 'Create a desktop session',
    description:
      'Create a Claude desktop Code session with an exact title and model, in an absolute folder or with no folder (no_project). Headless bootstrap turn + deep-link import, verified on disk (~4 s). ' +
      'Optional follow-ups through Tier B: lock_title (so the auto-titler never renames it), first_message (runs visibly in the desktop), group. ' +
      'permission_mode defaults to the folder\'s / Taylor\'s configured default. For bypassPermissions the driver claims a session parked in that folder from the bypass pool (pool_release fills it; no import, no approval card, title locked, model and effort set); ' +
      'when the pool has none for that folder it falls back to an import, which the app always starts in acceptEdits, and says so (verified:false, permissionGap). Other modes are imported in that mode. An import shows the trivial bootstrap turn as the first exchange.',
    schema: {
      properties: {
        folder: { type: 'string', description: 'Absolute path of an existing folder.' },
        no_project: { type: 'boolean', description: 'Create a "no folder" session (the app\'s scratch workspace).' },
        title: { type: 'string' },
        model: { type: 'string', description: 'Model id, default claude-opus-5-5.' },
        effort: { type: 'string', enum: ['low', 'medium', 'high', 'xhigh', 'max'] },
        permission_mode: { type: 'string', enum: ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'], description: 'Default: permissions.defaultMode from the folder\'s .claude settings, else ~/.claude/settings.json.' },
        bootstrap_prompt: { type: 'string', description: 'The headless first turn. Keep it trivial; default asks for "ready".' },
        first_message: { type: 'string', description: 'Sent via Tier B send_message after import, so the real task runs visibly in the desktop.' },
        lock_title: { type: 'boolean', description: 'Tier B set_session_title so titleSource becomes "tool". Default false.' },
        require_pool: { type: 'boolean', description: 'Require a previously approved pool member; fail before import/navigation if unavailable. Requires folder and bypassPermissions.' },
        group: { type: 'string', description: 'Sidebar group name or id to file it under (created if missing).' },
        focus: FOCUS,
        via_broker: VIA_BROKER,
      },
      required: ['title'],
    },
    navigates: true,
    run: async (args, ctx) => {
      const f = focusArg(args)
      const want = args.permission_mode || defaultPermissionMode(args.folder)
      if(args.require_pool&&(want!==BYPASS||!args.folder||args.no_project))throw new DriverError('require_pool needs a folder and bypassPermissions',{category:'bad_args'})
      if (args.group && !args.require_pool) await ensureGroupId(args.group, ctx) // pool-only work claims before any optional group mutation
      if (want === BYPASS && args.folder && !args.no_project) {
        const pooled = await createFromPool(args, ctx)
        if (pooled) return pooled
        if(args.require_pool)throw new DriverError('no approved pool session in this folder; no import or navigation attempted',{category:'pool_empty',detail:{retrySafe:true,dispatched:false}})
        ctx.notes.push('bypass pool is empty; fell back to an import')
      }
      ctx.tier = 'A'
      const { result, focus } = await withFocus(f, () => createSession({ ...args, permission_mode: want }, ctx))
      const out = { ...result, focus: focus.action, intendedPermissionMode: want }
      out.observationCursor=sessionEvents({session:result.sessionId}).cursor
      if (out.permissionMode !== want) {
        out.verified = false
        out.permissionGap = `started in ${out.permissionMode}, not ${want}: ${want === BYPASS ? 'the bypass pool had no session parked in this folder and an import can never be bypass. Fill the pool with pool_release on finished bypass sessions (pool_status {suggest:true} lists candidates), or raise this one with set_session_config (Taylor approves a card).' : 'the app did not keep the requested mode on import.'}`
      }
      delete out.navigatedTo
      const follow = []
      if (args.lock_title) follow.push({ op: 'set_session_title', args: { session_id: result.sessionId, title: args.title } })
      if (args.group) follow.push(...(await groupOps(args.group, [result.sessionId], ctx)))
      if (args.first_message) follow.push({ op: 'send_message', args: { session_id: result.sessionId, message: args.first_message } })
      if (follow.length) {
        const b = await tierB(ctx, follow, 'titleSource "tool", group set, first turn started')
        if (b.handback) out.followUps = b.handback
        else {
          ctx.tier = 'A+B'
          out.followUps = b.results
          if (args.lock_title) {
            const w = await waitForRecord(result.sessionId, (r) => r.titleSource === 'tool' && r.title === args.title, { timeoutMs: 5000 })
            out.titleLocked = w.ok
          }
        }
      }
      return out
    },
    verified: true,
  },
  {
    name: 'fork_session',
    title: 'Fork a session',
    description: 'Fork a session with its full history into a new desktop session (default title "<title> (fork)"), in the source\'s folder. The fork gets one trivial extra turn.',
    schema: { properties: { session: S, title: { type: 'string' }, focus: FOCUS }, required: ['session'] },
    navigates: true,
    run: async (args, ctx) => {
      ctx.tier = 'A'
      const { result, focus } = await withFocus(focusArg(args), () => forkSession(args, ctx))
      delete result.navigatedTo
      return { ...result, focus: focus.action }
    },
  },
  {
    name: 'open_session',
    title: 'Open / focus a session',
    description: 'Bring a session into the main window by deep link. Default focus "show" (that is the point); "restore" just touches it (e.g. to warm-spawn its process) and puts things back.',
    schema: { properties: { session: S, focus: FOCUS, wait_native_sec:{type:'number',minimum:0,maximum:30,description:'Optional bounded native peer identity wait before focus restoration; not serving/inference proof.'} }, required: ['session'] },
    navigates: true,
    run: async (args, ctx) => {
      ctx.tier = 'A'
      const rec = resolveSession(args.session)
      const { result, focus } = await withFocus(focusArg(args, 'show'), async () => {
        const opened=await openSession(rec)
        if(args.wait_native_sec>0)opened.nativeProcess=await waitNativePeer(rec,{timeoutMs:Math.ceil(args.wait_native_sec*1000),signal:ctx.signal})
        return opened
      })
      delete result.navigatedTo
      return { ...result, focus: focus.action, nowShowing: currentMain() }
    },
  },
  {
    name: 'unarchive_session',
    title: 'Unarchive a session',
    description: 'Restore an archived session. Tier A (re-import deep link) first, which works for sessions the driver or a CLI created; Tier B unarchive_session otherwise. Verified on disk.',
    schema: { properties: { session: S, focus: FOCUS, via_broker: VIA_BROKER }, required: ['session'] },
    navigates: true,
    run: async (args, ctx) => {
      const rec = resolveSession(args.session)
      if (!rec.isArchived) return { sessionId: rec.sessionId, alreadyActive: true }
      const imported = rec.cliSessionId && rec.sessionId === `local_${rec.cliSessionId}`
      if (imported && mechanismOk('unarchive_link')) {
        ctx.tier = 'A'
        const { result, focus } = await withFocus(focusArg(args), () => unarchiveViaLink(rec))
        if (result.ok) return { sessionId: rec.sessionId, unarchived: true, via: 'deep link', focus: focus.action }
        ctx.notes.push('deep-link unarchive did not take; falling back to Tier B')
      }
      const b = await tierB(ctx, [{ op: 'unarchive_session', args: { session_id: rec.sessionId } }], 'isArchived false')
      if (b.handback) return b.handback
      const w = await waitForRecord(rec.sessionId, (r) => r.isArchived === false, { timeoutMs: 8000 })
      if (!w.ok) throw new DriverError('broker reported success but the record is still archived', { category: 'verify_mismatch' })
      return { sessionId: rec.sessionId, unarchived: true, via: 'broker' }
    },
  },
  // ---------------- Tier B
  {
    name: 'rename_session',
    title: 'Rename a session (locks the title)',
    description: 'Set a session\'s title through the app\'s set_session_title, which marks it titleSource "tool" so the auto-titler never overwrites it. Verified on disk.',
    schema: { properties: { session: S, title: { type: 'string' }, via_broker: VIA_BROKER }, required: ['session', 'title'] },
    run: async (args, ctx) => {
      const rec = resolveSession(args.session)
      const b = await tierB(ctx, [{ op: 'set_session_title', args: { session_id: rec.sessionId, title: args.title } }], `title "${args.title}", titleSource "tool"`)
      if (b.handback) return b.handback
      const w = await waitForRecord(rec.sessionId, (r) => r.title === args.title, { timeoutMs: 8000 })
      if (!w.ok) throw new DriverError(`title did not change on disk (still "${w.record?.title}")`, { category: 'verify_mismatch' })
      return { sessionId: rec.sessionId, title: w.record.title, titleSource: w.record.titleSource, verified: true, ms: b.ms }
    },
  },
  {
    name: 'pin_session',
    title: 'Pin or unpin a session',
    description: 'Pin (or pinned:false to unpin) a session in the sidebar. Verified against the app\'s pin list on disk.',
    schema: { properties: { session: S, pinned: { type: 'boolean' }, via_broker: VIA_BROKER }, required: ['session', 'pinned'] },
    run: async (args, ctx) => {
      const rec = resolveSession(args.session)
      if(rec.isArchived)throw new DriverError('unarchive this session before changing its pin state',{category:'session_archived',detail:{dispatched:false,retrySafe:true}})
      const b = await tierB(ctx, [{ op: 'set_pinned', args: { session_id: rec.sessionId, pinned: !!args.pinned } }], `pinned ${!!args.pinned}`)
      if (b.handback) return b.handback
      const ok = await waitForPins((p) => p.has(rec.sessionId) === !!args.pinned)
      if (!ok) throw new DriverError('pin state on disk did not change', { category: 'verify_mismatch' })
      return { sessionId: rec.sessionId, pinned: !!args.pinned, verified: true, ms: b.ms }
    },
  },
  {
    name: 'archive_session',
    title: 'Archive a session',
    description:
      'Archive a session (reversible; stops its process). The app skips sessions that are working, pinned, or open on screen. Archiving "self" ENDS YOUR OWN CONVERSATION: it requires confirm_self:true. Verified on disk.',
    schema: { properties: { session: S, confirm_self: { type: 'boolean' }, reason: { type: 'string' }, via_broker: VIA_BROKER }, required: ['session'] },
    run: async (args, ctx) => {
      const rec = resolveSession(args.session)
      const self = rec.sessionId === callerHostSession()
      if (self && !args.confirm_self) throw new DriverError('that is your own session: archiving it ends this conversation. Pass confirm_self:true only if that is the intent.', { category: 'gate_self' })
      if (rec.isArchived) return { sessionId: rec.sessionId, alreadyArchived: true }
      if (brokerInfo().sessionId === rec.sessionId) throw new DriverError('refusing to archive the broker; use `claude-driver broker` commands', { category: 'gate' })
      const b = await tierB(ctx, [{ op: 'archive_session', args: { session_id: self ? 'self' : rec.sessionId, reason: args.reason || 'claude-driver archive_session' } }], 'isArchived true')
      if (b.handback) return b.handback
      const w = await waitForRecord(rec.sessionId, (r) => r.isArchived === true, { timeoutMs: 8000 })
      if (!w.ok) throw new DriverError(`still not archived on disk; broker said: ${txt(b.results[0].result).slice(0, 300)}`, { category: 'verify_mismatch' })
      return { sessionId: rec.sessionId, archived: true, verified: true, ms: b.ms }
    },
  },
  {
    name: 'set_session_config',
    title: 'Configure a session in one verified batch',
    description:
      'Batch title, pin state, model, effort and/or permission mode through one broker request and recipient lock. Model/effort apply from the next turn. Title is locked against auto-renaming. Raising permissions shows Taylor an approval card; changing permission mode ends the idle process. Fields are independently verified on disk; partial failures include receipts and must not be replayed wholesale.',
    schema: {
      properties: {
        session: S,
        title: { type: 'string' },
        pinned: { type: 'boolean' },
        model: { type: 'string' },
        effort: { type: 'string', enum: ['low', 'medium', 'high', 'xhigh', 'max'] },
        permission_mode: { type: 'string', enum: ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'] },
        via_broker: VIA_BROKER,
      },
      required: ['session'],
    },
    run: async (args, ctx) => {
      const rec = resolveSession(args.session)
      // Native pin/effort reject archived sessions. Reject the entire batch
      // before a valid title change can create a known avoidable partial effect.
      if(rec.isArchived&&(args.pinned!==undefined||args.effort))throw new DriverError('unarchive this session before a pin/effort configuration batch',{category:'session_archived',detail:{dispatched:false,retrySafe:true}})
      const ops = []
      if(args.title!==undefined){
        if(!args.title.trim())throw new DriverError('title must not be empty',{category:'bad_args'})
        ops.push({op:'set_session_title',args:{session_id:rec.sessionId,title:args.title}})
      }
      if(args.pinned!==undefined)ops.push({op:'set_pinned',args:{session_id:rec.sessionId,pinned:args.pinned}})
      if (args.model) ops.push({ op: 'set_session_model', args: { session_id: rec.sessionId, model: args.model } })
      if (args.effort) ops.push({ op: 'set_session_effort', args: { session_id: rec.sessionId, effort: args.effort } })
      if (args.permission_mode) ops.push({ op: 'set_session_permission_mode', args: { session_id: rec.sessionId, mode: args.permission_mode } })
      if (!ops.length) throw new DriverError('pass title, pinned, model, effort and/or permission_mode', { category: 'bad_args' })
      const b = await tierB(ctx, ops)
      if (b.handback) return b.handback
      const [w,pinsOk] = await Promise.all([waitForRecord(
        rec.sessionId,
        (r) => (args.title===undefined||r.title===args.title&&r.titleSource==='tool') && (!args.model || r.model === args.model) && (!args.effort || r.effort === args.effort) && (!args.permission_mode || r.permissionMode === args.permission_mode),
        { timeoutMs: 8000 }
      ),args.pinned===undefined?true:waitForPins(p=>p.has(rec.sessionId)===args.pinned,{timeoutMs:8000})])
      return { sessionId: rec.sessionId, title:w.record?.title, titleSource:w.record?.titleSource, ...(args.pinned!==undefined?{pinned:readPins().has(rec.sessionId)}:{}), model: w.record?.model, effort: w.record?.effort, permissionMode: w.record?.permissionMode, verified: w.ok&&pinsOk, requestId:b.requestId,receiptSource:b.receiptSource,ms:b.ms, broker: b.results.map((r) => r.result) }
    },
  },
  {
    name: 'send_message',
    title: 'Send a message into a session',
    description:
      'Deliver a message to a desktop session as a user turn (labelled as coming from the broker or you). Wakes an idle session even with no running process. Native transport reports delivered or queued. Explicit experimental peer-direct requires a live qualified peer and reports received only after its exact native user receipt; application remains unverified.',
    schema: { properties: { session: S, message: { type: 'string' }, via_broker: VIA_BROKER,
      transport: { type:'string',enum:['native','peer-direct'],description:'Default native broker route. Experimental peer-direct requires operation_id and a qualified live peer; never wakes or falls back.' },
      operation_id:{type:'string',description:'Stable single-publication identity required for peer-direct. Reuse to reconcile; never change it to retry an unknown send.'},
      receipt_timeout_sec:{type:'number',minimum:0.1,maximum:60,description:'Peer-direct receipt budget, default15 seconds. Timeout preserves uncertainty.'} }, required: ['session', 'message'] },
    run: async (args, ctx) => {
      if(args.transport==='peer-direct'){
        if(args.via_broker!==undefined)throw new DriverError('peer-direct cannot be combined with via_broker',{category:'bad_args'})
        ctx.tier='peer-direct'
        const result=await sendDirectRecipient({operationId:args.operation_id,session:args.session,message:args.message,timeoutMs:Math.ceil((args.receipt_timeout_sec??15)*1000)},{signal:ctx.signal,absoluteDeadline:ctx.directDeadline})
        return {...result,verified:true,experimental:true,verification:'Exact native user receipt only; applied:false. Observe recipient response separately.'}
      }
      if(args.operation_id!==undefined||args.receipt_timeout_sec!==undefined)throw new DriverError('direct recipient options require transport:peer-direct',{category:'bad_args'})
      const rec = resolveSession(args.session)
      if (rec.isArchived) throw new DriverError('session is archived; unarchive it first', { category: 'bad_state' })
      const b = await tierB(ctx, [{ op: 'send_message', args: { session_id: rec.sessionId, message: args.message } }])
      if (b.handback) return b.handback
      const res = txt(b.results[0].result)
      const receipt = deliveryReceipt(b.results[0].result)
      if (receipt.delivery === 'unknown') throw new DriverError('native send returned an unrecognized receipt; reconcile before retrying', { category: 'outcome_unknown', detail:{requestId:b.requestId,dispatched:true,retrySafe:false} })
      return { sessionId: rec.sessionId, ...receipt, requestId:b.requestId, receiptSource:b.receiptSource, detail: res, ms: b.ms }
    },
  },
  {
    name:'peer_send_status',title:'Reconcile one direct peer send',readOnly:true,
    description:'Observe one persisted peer-direct publication without resending. Unknown remains unsafe to retry. Received proves a native user record, never application or model completion.',
    schema:{properties:{operation_id:{type:'string'}},required:['operation_id']},
    run:async args=>{const out=await reconcilePeerSend(args.operation_id);return {operationId:args.operation_id,state:out.record.phase,receiptVerified:out.record.phase==='received',retrySafe:false,canPublish:false,sessionId:out.record.target.hostSessionId,...(out.record.receipt?{receipt:out.record.receipt}:{}),hasMore:out.hasMore===true}},
  },
  {
    name: 'manage_groups',
    title: 'Sidebar groups',
    description: 'List groups (disk), or file sessions under a group by name or id (created if missing), or group:null to ungroup. Moving a pinned session into a group unpins it (app behaviour).',
    schema: {
      properties: {
        action: { type: 'string', enum: ['list', 'move'] },
        sessions: { type: 'array', items: { type: 'string' } },
        group: { type: ['string', 'null'], description: 'Group name or id; null = Ungrouped.' },
        via_broker: VIA_BROKER,
      },
      required: ['action'],
    },
    run: async (args, ctx) => {
      if (args.action === 'list') {
        const g = readGroups()
        return g.groups.map((x) => ({ ...x, sessions: Object.entries(g.assignments).filter(([, v]) => v === x.id).map(([k]) => k) }))
      }
      const ids = (args.sessions || []).map((s) => resolveSession(s).sessionId)
      if (!ids.length) throw new DriverError('sessions is required for move', { category: 'bad_args' })
      const ops = args.group === null ? [{ op: 'move_sessions', args: { session_ids: ids, group_id: null } }] : await groupOps(args.group, ids, ctx)
      const b = await tierB(ctx, ops)
      if (b.handback) return b.handback
      const want = args.group === null ? null : readGroups().groups.find((g) => g.id === args.group || g.name === args.group)?.id
      await sleep(500)
      const got = readGroups().assignments
      return { moved: ids, group: want, verified: ids.every((i) => (got[i] || null) === (want || null)), broker: b.results.map((r) => r.result) }
    },
  },
  {
    name: 'delete_sessions',
    title: 'Delete sessions (Taylor approves on a card)',
    description:
      'Permanently delete sessions. ALWAYS shows Taylor one approval card (never bypassable; never click it yourself). Default to archive_session instead. The driver refuses pinned, running or open-PR sessions unless override:true, and afterwards removes the CLI\'s leftover files for sessions it created. ' +
      'Use queue:true to add candidates to the delete queue instead, and from_queue:true to present the whole queue on one card.',
    schema: {
      properties: {
        sessions: { type: 'array', items: { type: 'string' } },
        reason: { type: 'string' },
        queue: { type: 'boolean', description: 'Only add these to the delete-candidates queue.' },
        from_queue: { type: 'boolean', description: 'Delete everything in the queue (one card).' },
        cleanup_only: { type: 'boolean', description: 'No delete: remove CLI leftovers for driver-created sessions whose records are already gone (run after making a handed-back delete call yourself).' },
        override: { type: 'boolean', description: 'Allow pinned / running / open-PR sessions.' },
        via_broker: VIA_BROKER,
      },
    },
    run: async (args, ctx) => {
      const reg = loadRegistry()
      if (args.cleanup_only) {
        const cleaned = {}
        for (const id of Object.keys(reg.sessions)) {
          if (getRecord(id)) continue
          cleaned[id] = cleanupCliLeftovers(id.replace(/^local_/, '')).removed.length
        }
        await updateRegistry((r) => {
          for (const id of Object.keys(cleaned)) {
            delete r.sessions[id]
            if (r.deleteQueue) delete r.deleteQueue[id]
          }
        })
        return { cleaned, filesRemoved: Object.values(cleaned).reduce((a, b) => a + b, 0) }
      }
      if (args.queue) {
        const ids = (args.sessions || []).map((s) => resolveSession(s).sessionId)
        await updateRegistry((r) => {
          r.deleteQueue = { ...(r.deleteQueue || {}) }
          for (const id of ids) r.deleteQueue[id] = { reason: args.reason || '', at: new Date().toISOString() }
        })
        return { queued: ids, queueSize: Object.keys(loadRegistry().deleteQueue).length }
      }
      const refs = args.from_queue ? Object.keys(reg.deleteQueue || {}) : args.sessions || []
      if (!refs.length) return args.from_queue ? { nothing: 'delete queue is empty' } : Promise.reject(new DriverError('sessions is required', { category: 'bad_args' }))
      const pins = readPins()
      const live = liveByHost()
      const ok = []
      const refused = []
      for (const ref of refs) {
        let rec
        try {
          rec = resolveSession(ref)
        } catch (err) {
          refused.push({ ref, why: err.message })
          continue
        }
        const why = []
        if (rec.sessionId === callerHostSession()) why.push('is you')
        if (rec.sessionId === brokerInfo().sessionId) why.push('is the broker')
        if (!args.override && pins.has(rec.sessionId)) why.push('pinned')
        if (!args.override && live.get(rec.sessionId)?.status === 'busy') why.push('running')
        if (!args.override && openPrs(rec).length) why.push(`open PR ${openPrs(rec).join(', ')}`)
        if (why.length) refused.push({ sessionId: rec.sessionId, title: rec.title, why: why.join('; ') })
        else ok.push(rec)
      }
      if (!ok.length) return { deleted: [], refused }
      const result = { refused, cleanup: {} }
      const b = await tierB(ctx, [{ op: 'delete_session', args: { session_ids: ok.map((r) => r.sessionId), reason: args.reason || 'claude-driver delete_sessions' } }], 'records gone')
      if (b.handback) return { ...b.handback, refused, afterwards: 'Once Taylor approves the card, call delete_sessions {cleanup_only: true} to remove the CLI files the app leaves behind.' }
      result.broker = b.results[0].result
      await sleep(1000)
      result.deleted = ok.filter((r) => !getRecord(r.sessionId)).map((r) => r.sessionId)
      result.notDeleted = ok.filter((r) => getRecord(r.sessionId)).map((r) => r.sessionId)
      for (const id of result.deleted) {
        if (reg.sessions[id]) result.cleanup[id] = cleanupCliLeftovers(id.replace(/^local_/, '')).removed.length
      }
      await updateRegistry((r) => {
        for (const id of result.deleted) {
          delete r.sessions[id]
          if (r.deleteQueue) delete r.deleteQueue[id]
        }
      })
      return result
    },
  },
  {
    name: 'archive_project',
    title: 'Archive a folder\'s sessions (gated)',
    description:
      'Archive every session whose cwd or originCwd is under a folder. Dry run by default (dry_run:false to act). Allowed automatically only for scratch-workspaces folders, the driver\'s state dir and folders the driver created. ' +
      'Otherwise refused when the folder is a git repo with commits, has more than 3 sessions, or has sessions with open PRs, unless override:true, which requires Taylor\'s explicit say-so. Folder contents are never deleted, except a driver-created temporary folder with delete_folder:true.',
    schema: {
      properties: { folder: { type: 'string' }, dry_run: { type: 'boolean' }, override: { type: 'boolean' }, delete_folder: { type: 'boolean' }, via_broker: VIA_BROKER },
      required: ['folder'],
    },
    run: async (args, ctx) => {
      const folder = resolve(args.folder)
      const reg = loadRegistry()
      const stateDir = resolve(STATE_DIR)
      const scratch = SCRATCH_RE.test(folder) || underFolder(folder, join(APP_SUPPORT, 'scratch-workspaces'))
      const mine = !!reg.folders[folder] || underFolder(folder, stateDir)
      const recs = allRecords({ includeArchived: false }).filter((r) => underFolder(r.cwd, folder) || underFolder(r.originCwd, folder))
      const brokerId = brokerInfo().sessionId
      const targets = recs.filter((r) => r.sessionId !== brokerId && r.sessionId !== callerHostSession())
      const gate = []
      if (!scratch && !mine) {
        if (existsSync(join(folder, '.git'))) {
          let commits = 0
          try {
            commits = Number(execFileSync('/usr/bin/git', ['-C', folder, 'rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).trim())
          } catch {}
          if (commits > 0) gate.push(`git repo with ${commits} commits`)
        }
        if (targets.length > 3) gate.push(`${targets.length} sessions`)
        const withPr = targets.filter((r) => openPrs(r).length)
        if (withPr.length) gate.push(`${withPr.length} sessions with open PRs`)
        gate.push('not a scratch, driver-state or driver-created folder')
      }
      const plan = { folder, class: scratch ? 'scratch' : mine ? 'driver' : 'user', sessions: targets.map((r) => ({ sessionId: r.sessionId, title: r.title })), gate }
      if (args.dry_run !== false) return { dryRun: true, ...plan, wouldProceed: !gate.length || !!args.override }
      if (gate.length && !args.override) throw new DriverError(`refused: ${gate.join('; ')}. Ask Taylor; pass override:true only with his explicit approval.`, { category: 'gate_project', detail: plan })
      const ops = targets.map((r) => ({ op: 'archive_session', args: { session_id: r.sessionId, reason: `claude-driver archive_project ${folder}` } }))
      if (!ops.length) return { ...plan, archived: [] }
      const b = await tierB(ctx, ops)
      if (b.handback) return b.handback
      await sleep(1000)
      const archived = targets.filter((r) => getRecord(r.sessionId)?.isArchived).map((r) => r.sessionId)
      let folderDeleted = false
      if (args.delete_folder) {
        if (!(reg.folders[folder]?.kind === 'temp' || reg.folders[folder]?.kind === 'probe')) throw new DriverError('delete_folder only applies to driver-created temporary folders', { category: 'gate_project' })
        const { rmSync } = await import('node:fs')
        rmSync(folder, { recursive: true, force: true })
        await updateRegistry((r) => delete r.folders[folder])
        folderDeleted = true
      }
      return { ...plan, archived, notArchived: targets.map((r) => r.sessionId).filter((i) => !archived.includes(i)), folderDeleted }
    },
  },
  // ---------------- bypass pool
  {
    name: 'pool_status',
    title: 'Bypass pool status',
    description:
      'The bypass pool: finished sessions already in bypassPermissions, cleared and parked so create_session can hand one out with no import and no approval card. Reconciles the registry against disk, lists members and ready counts per folder. ' +
      'suggest:true also lists archived bypass sessions whose PRs are all merged or closed (pool_release candidates).',
    schema: { properties: { folder: { type: 'string', description: 'Only members / candidates in this folder.' }, suggest: { type: 'boolean' } } },
    readOnly: true,
    run: async (args) => {
      const folder = args.folder ? resolve(args.folder) : null
      const members = (await reconcile()).filter((m) => !folder || !m.folder || resolve(m.folder) === folder)
      const ready = {}
      for (const m of members) if (m.status === 'ready') ready[m.folder] = (ready[m.folder] || 0) + 1
      const out = { ready, members }
      if (args.suggest) {
        const pool = poolOf()
        const pins = readPins()
        out.candidates = allRecords()
          .filter((r) => r.isArchived && r.permissionMode === BYPASS && !r.scheduledTaskId && !r.worktreePath && !pool[r.sessionId] && !pins.has(r.sessionId))
          .filter((r) => Array.isArray(r.prs) && r.prs.length && !openPrs(r).length)
          .filter((r) => !folder || resolve(r.cwd || '') === folder)
          .sort((a, b) => (a.completedTurns || 0) - (b.completedTurns || 0))
          .slice(0, 12)
          .map((r) => ({ sessionId: r.sessionId, title: r.title, cwd: r.cwd, turns: r.completedTurns, lastActivity: r.lastActivityAt ? new Date(r.lastActivityAt).toISOString() : null }))
      }
      return out
    },
  },
  {
    name: 'pool_release',
    title: 'Return a finished bypass session to the pool',
    description:
      'Recycle a finished session that is already in bypassPermissions into the bypass pool, instead of only archiving it: the session unbinds its PR and clears its own conversation (the old one stays on disk and under "Resume previous session"), then it is retitled "pool · <folder> · idle" and archived. ' +
      'Two phases from a desktop caller: the first call hands back the recycle message to send; call again once that session is idle to park it. Refuses sessions that are not bypass (the pool never raises a mode), pinned, working, unattended, yours, the broker, or with an open PR (override:true allows that one gate).',
    schema: { properties: { session: S, override: { type: 'boolean', description: 'Allow a session whose PR is still open.' }, via_broker: VIA_BROKER }, required: ['session'] },
    run: async (args, ctx) => {
      let rec = resolveSession(args.session)
      const id = rec.sessionId
      const why = poolGate(rec, { self: callerHostSession(), brokerId: brokerInfo().sessionId, live: liveByHost(), override: !!args.override })
      if (why.length) throw new DriverError(`refused: ${rec.title || id} ${why.join('; ')}`, { category: 'gate_pool' })
      const entry = poolOf()[id]
      if (rec.cliSessionId) {
        if (entry?.state === 'recycling' && entry.cliAtRequest === rec.cliSessionId && Date.now() - entry.requestedAt < RECYCLE_WAIT_MS) {
          return { sessionId: id, pending: true, message: 'recycle was requested and the session has not cleared yet; call pool_release again when it is idle' }
        }
        const ops = []
        if (rec.isArchived) ops.push({ op: 'unarchive_session', args: { session_id: id } })
        ops.push({ op: 'send_message', args: { session_id: id, message: recycleMessage() } })
        await setEntry(id, { state: 'recycling', folder: rec.cwd, priorTitle: entry?.priorTitle || rec.title, cliAtRequest: rec.cliSessionId, requestedAt: Date.now() })
        const b = await tierB(ctx, ops, 'the session replies "recycled: …" and goes idle').catch(async (err) => {
          if (err.detail?.retrySafe) await setEntry(id, entry || null)
          throw err
        })
        if (b.handback) return { ...b.handback, sessionId: id, phase: 'recycle', next: 'When that session is idle, call pool_release again with the same session to park it.' }
        const w = await waitForRecord(id, (r) => !r.cliSessionId, { timeoutMs: RECYCLE_WAIT_MS, intervalMs: 1000 })
        if (!w.ok) throw new DriverError('the session did not clear itself within 180 s; read its transcript and call pool_release again', { category: 'verify_mismatch' })
        rec = w.record
      }
      const title = poolTitle(rec.cwd)
      const ops = []
      if (rec.title !== title) ops.push({ op: 'set_session_title', args: { session_id: id, title } })
      if (!rec.isArchived) ops.push({ op: 'archive_session', args: { session_id: id, reason: 'claude-driver pool_release: parked in the bypass pool' } })
      const parkedEntry = { state: 'parked', folder: rec.cwd, priorTitle: entry?.priorTitle || rec.title, parkedAt: Date.now(), cliAtRequest: undefined, requestedAt: undefined }
      await setEntry(id, { ...parkedEntry, state: 'parking' })
      const out = { sessionId: id, parked: true, folder: rec.cwd, permissionMode: rec.permissionMode }
      if (!ops.length) { await setEntry(id, parkedEntry); return { ...out, verified: true } }
      const b = await tierB(ctx, ops, `title "${title}", isArchived true`)
      if (b.handback) return { ...b.handback, ...out, parked: false, phase: 'park', next: 'After making the native calls, call pool_release again to verify and publish availability.' }
      const w = await waitForRecord(id, (r) => r.isArchived === true && r.title === title, { timeoutMs: 8000 })
      if (w.ok) await setEntry(id, parkedEntry)
      return { ...out, verified: w.ok, ms: b.ms }
    },
  },
  // ---------------- Tier C
  {
    name: 'window_manage',
    title: 'Window management via computer use',
    description:
      'Tier C: have Codex Computer Use do something in the Claude app\'s windows that no API reaches (pop out a session, "New Session in New Window", arrange windows). Describe the goal; it never clicks approval or delete cards. Slow (20-60 s) and visible; verify with window_state afterwards.',
    schema: { properties: { task: { type: 'string' }, timeout_sec: { type: 'number' } }, required: ['task'] },
    navigates: true,
    run: async (args, ctx) => {
      ctx.tier = 'C'
      const { computerUse } = await import('./tierc.mjs')
      const r = await computerUse(args.task, { timeoutSec: args.timeout_sec || 180, progress: ctx.progress, signal: ctx.signal })
      return { status: r.status, report: r.text, evidence:r.evidence, execution:r.execution, metrics:r.metrics, after: { mainWindow: currentMain() } }
    },
  },
  // ---------------- broker
  {
    name:'broker_service_resource_review',title:'Review owned native resource disposition',readOnly:true,
    description:'Experimental metadata-only review of an exact owned stream child after native service retirement. Binds saved process ownership, exit chronology and fresh PID absence to unchanged broker epoch and enrolled bytes. Does not load, send, retry, terminate or qualify general hook/environment unload.',
    schema:{required:['service_id','evidence_report'],properties:{service_id:{type:'string',pattern:'^[a-f0-9]{32}$'},evidence_report:{type:'string',pattern:'^native-resource-trial-[0-9]{13}\\.json$'}}},
    run:async args=>(await import('./native-service-ownership.mjs')).nativeServiceResourceReview(args.service_id,args.evidence_report),
  },
  {
    name:'broker_service_marker_review',title:'Review native service command inventory',readOnly:true,
    description:'Experimental local review of native own/prior marker observations, exact enrolled bytes and retirement chronology. No commands executed or tokens sent. Native command removal is narrower than hook/environment unload; returns metadata only.',
    schema:{required:['service_id'],properties:{service_id:{type:'string',pattern:'^[a-f0-9]{32}$'}}},
    run:async args=>(await import('./native-service-ownership.mjs')).nativeServiceMarkerReview(args.service_id),
  },
  {
    name:'broker_service_status',title:'Inspect owned native receiver metadata',readOnly:true,
    description:'Experimental bounded enrollment, filesystem and existing settlement metadata inspection. Does not send, reconcile, install or infer native unload from missing files.',
    schema:{required:['service_id'],properties:{offline:{type:'boolean',description:'Read-only installed-source inventory after exact predecessor PID absence. Requires session; exclusive with historical. Never proves crash cause or grants replay/recovery.'},historical:{type:'boolean',description:'Explicit read-only retired-source history; requires session and does not inspect current app version or native peer.'},service_id:{type:'string',pattern:'^[a-f0-9]{32}$'},session:{type:'string',description:'Explicit independent receiver UUID; omitted for the legacy route.'}}},
    run:async(args,ctx)=>{if((args.historical===true||args.offline===true)&&args.session===undefined)throw new DriverError('historical inspection requires explicit independent receiver',{category:'bad_args'});return args.session!==undefined?(await import('./independent-service-result.mjs')).inspectIndependentService(args.session,args.service_id,{signal:ctx.signal,historical:args.historical===true,offline:args.offline===true}):(await import('./native-service-ownership.mjs')).nativeServiceStatus(args.service_id)},
  },
  {
    name:'broker_service_plan',title:'Plan the next stable receiver action',readOnly:true,
    description:'Read-only exact selected-generation decision: read, renew, probe, wait, stop or inspect. Verifies stable selector before/after live status. STOP and unresolved attempts override expiry/capacity; missing native evidence never grants recovery. Uses a90second renewal margin. No dispatch, reservation, restart, prompt, repair or background scheduling; read admission is rechecked by the actual read operation.',
    schema:{required:['session','service_id'],properties:{session:{type:'string'},service_id:{type:'string',pattern:'^[a-f0-9]{32}$'},read_timeout_sec:{type:'integer',minimum:1,maximum:60}}},
    run:async(args,ctx)=>(await import('./independent-service-plan.mjs')).inspectIndependentServicePlan(args.session,args.service_id,{signal:ctx.signal,readTimeoutMs:(args.read_timeout_sec??20)*1000}),
  },
  {
    name:'broker_service_retire',title:'Retire an owned native receiver',readOnly:false,
    description:'Experimental exact-owner atomic filesystem retirement after legacy expiry/settlement, or independent scoped STOP and terminal review when session is explicit. Preserves bytes and evidence outside watched folder. Refuses epoch, baseline, controls, added files or unresolved requests. Filesystem retirement never proves native unload; no send, restart or permission change.',
    schema:{required:['service_id','experimental'],properties:{offline:{type:'boolean',description:'Explicit independent-only absent-process retirement; refuses any live peer and preserves unresolved attempts. Never kills/restarts.'},retire_settings:{type:'boolean',description:'Independent only: preserve exact owned settings in retired state without overwriting any successor settings.'},session:{type:'string',description:'Explicit independent receiver; requires verified scoped STOP and terminal attempt review instead of legacy expiry.'},service_id:{type:'string',pattern:'^[a-f0-9]{32}$'},experimental:{type:'boolean',enum:[true]}}},
    run:async(args,ctx)=>{
      if(args.experimental!==true)throw new DriverError('native service retirement requires explicit experimental opt-in',{category:'bad_args'})
      if(args.session!==undefined)return (await import('./independent-service-retire.mjs')).retireIndependentService(args.session,args.service_id,{signal:ctx.signal,retireSettings:args.retire_settings===true,offline:args.offline===true})
      if(args.retire_settings===true||args.offline===true)throw new DriverError('settings retirement requires explicit independent receiver',{category:'bad_args'})
      return (await import('./native-service-ownership.mjs')).retireNativeService(args.service_id,{signal:ctx.signal})
    },
  },
  {
    name:'broker_service_quiesce',title:'Stop independent receiver admission',readOnly:false,
    description:'Experimental scoped admission stop under the native-read lifecycle lock. Waits for existing read transaction, verifies exact installed epoch, preserves owned STOP and reviews terminal attempts. Never clears STOP, dispatches, cancels effects, moves modules, changes permissions or claims native unload/process retirement. Interrupted work requires inspection.',
    schema:{required:['session','service_id','experimental'],properties:{offline:{type:'boolean',description:'Explicit absent-process admission stop; no live peer may exist. Does not settle unknowns.'},session:{type:'string'},service_id:{type:'string',pattern:'^[a-f0-9]{32}$'},experimental:{type:'boolean',enum:[true]}}},
    run:async(args,ctx)=>{if(args.experimental!==true)throw new DriverError('independent quiescence requires experimental opt-in',{category:'bad_args'});return (await import('./independent-service-quiesce.mjs')).quiesceIndependentService(args.session,args.service_id,{signal:ctx.signal,offline:args.offline===true})},
  },
  {
    name:'broker_service_activate',title:'Activate a prepared independent receiver',readOnly:false,
    description:'Experimental activation of a prepared generation on an empty idle driver-owned bypass scratch receiver. Explicit cold_rebind (stable_hook required) additionally requires the retired predecessor PID to be absent and independently verified new epoch; it never restarts or changes consent. Optional stable_hook installs the sealed receiver entry/selector or turns over an exactly verified retired stopped terminal predecessor while retaining identical anchor/settings. Refuses occupied module/runtime and unrelated or partial stable state. Preserves phase records before effects; no send, wake, restart, permission change or automatic retry. Installation never proves readiness or serving.',
    schema:{required:['session','service_id','experimental'],properties:{session:{type:'string'},service_id:{type:'string',pattern:'^[a-f0-9]{32}$'},experimental:{type:'boolean',enum:[true]},stable_hook:{type:'boolean'},cold_rebind:{type:'boolean'}}},
    run:async(args,ctx)=>{if(args.experimental!==true)throw new DriverError('independent activation requires experimental opt-in',{category:'bad_args'});return (await import('./independent-service-activate.mjs')).activateIndependentService(args.session,args.service_id,{signal:ctx.signal,stableHook:args.stable_hook??false,coldRebind:args.cold_rebind??false})},
  },
  {
    name:'broker_service_renew',title:'Renew one owned stable receiver generation',readOnly:false,
    description:'Experimental durable one-shot renewal: prepare successor, quiesce and terminally review predecessor, preserve retired module/selector, activate on unchanged stable settings, await bounded native readiness, run one durable negative policy probe and verify read admission. Requires installed stable predecessor, same idle native epoch and a durable driver_submit job. Consumes one successor slot for the policy probe. No model message, restart, permission change, uncertain replay or positive serving claim from installation. Failed phases require original-job inspection.',
    schema:{required:['session','service_id','experimental'],properties:{session:{type:'string'},service_id:{type:'string',pattern:'^[a-f0-9]{32}$'},experimental:{type:'boolean',enum:[true]},lifetime_sec:{type:'integer',minimum:60,maximum:3600},max_requests:{type:'integer',minimum:2,maximum:128}}},
    run:async(args,ctx)=>{if(args.experimental!==true)throw new DriverError('independent renewal requires experimental opt-in',{category:'bad_args'});return (await import('./independent-service-renew.mjs')).renewIndependentService(args.session,args.service_id,{jobId:ctx.jobId,signal:ctx.signal,lifetimeSec:args.lifetime_sec??300,maxRequests:args.max_requests??8})},
  },
  {
    name:'broker_service_prepare',title:'Prepare an independent native receiver generation',readOnly:false,
    description:'Experimental preparation only in an idle driver-owned bypass scratch receiver. Creates a fresh private namespace, sealed release and native-validated candidate. Never publishes/replaces a module, changes settings, sends, wakes or raises permissions. Reattach durable jobs with the same key.',
    schema:{required:['session','experimental'],properties:{archive_target:{type:'string',description:'Optional exact distinct owned idle bypass scratch UUID to seal as the sole archive target for a scoped recovery controller.'},session:{type:'string'},experimental:{type:'boolean',enum:[true]},lifetime_sec:{type:'integer',minimum:60,maximum:3600},max_requests:{type:'integer',minimum:1,maximum:128}}},
    run:async(args,ctx)=>{if(args.experimental!==true)throw new DriverError('independent preparation requires experimental opt-in',{category:'bad_args'});return (await import('./independent-service-prepare.mjs')).prepareIndependentService(args.session,{lifetimeSec:args.lifetime_sec??300,maxRequests:args.max_requests??8,signal:ctx.signal,jobId:ctx.jobId,archiveTargetSession:args.archive_target})},
  },
  {
    name:'broker_service_enroll',title:'Enroll a bounded owned native receiver',readOnly:false,
    description:'Experimental enrollment in the exact previously consented owned native session. Validates candidate and epoch, publishes exclusively, and observes readiness. Never dispatches reads, wakes, restarts, replaces modules or changes permissions. Uncertain installation requires inspection; readiness does not qualify serving.',
    schema:{required:['experimental'],properties:{experimental:{type:'boolean',enum:[true]},lifetime_sec:{type:'integer',minimum:60,maximum:3600},max_requests:{type:'integer',minimum:1,maximum:128},marker:{type:'boolean'},resource_probe:{type:'boolean'},control_check:{type:'boolean'},observe_retired_service_id:{type:'string',pattern:'^[a-f0-9]{32}$'}}},
    run:async(args,ctx)=>{
      if(args.experimental!==true)throw new DriverError('native service enrollment requires explicit experimental opt-in',{category:'bad_args'})
      return (await import('./native-service-enroll.mjs')).enrollNativeService({lifetimeSec:args.lifetime_sec??300,maxRequests:args.max_requests??8,marker:args.marker??false,resourceProbe:args.resource_probe??false,controlCheck:args.control_check??false,observeRetiredServiceId:args.observe_retired_service_id??null,signal:ctx.signal})
    },
  },
  {
    name:'broker_service_policy_probe',title:'Qualify one native receiver policy path',readOnly:false,
    description:'Experimental durable missing-request negative probe on an already loaded exact owned independent receiver. Consumes one permanent slot, sends once, creates no protocol request/control, and verifies native policy audit/helper/refusal with no native MCP request. Requires driver_submit identity. No model instruction, restart, permission change, automatic retry or positive serving claim. Timeout preserves original attempt for inspection.',
    schema:{required:['session','service_id','experimental'],properties:{session:{type:'string'},service_id:{type:'string',pattern:'^[a-f0-9]{32}$'},experimental:{type:'boolean',enum:[true]},timeout_sec:{type:'integer',minimum:1,maximum:60}}},
    run:async(args,ctx)=>{if(args.experimental!==true)throw new DriverError('policy probe requires experimental opt-in',{category:'bad_args'});return (await import('./independent-service-policy-probe.mjs')).probeIndependentServicePolicy(args.session,args.service_id,{jobId:ctx.jobId,signal:ctx.signal,timeoutMs:(args.timeout_sec??20)*1000})},
  },
  {
    name:'broker_service_read_current',title:'Read through the selected stable receiver',readOnly:false,
    description:'Experimental durable on-demand metadata read through the currently selected owned stable receiver. Planner may perform at most one renewal and one policy probe, each as a distinct retained child job, then one read. STOP/input/busy/unknown or changed selection stops the route without replay. Requires driver_submit; no daemon, wake, app restart or permission changes. Queue admission defaults60seconds, configurable1-120seconds; timeout/cancellation before admission proves no child started. Parent cancellation after admission does not prove child cancellation: inspect retained child job IDs.',
    schema:{required:['session','session_id','experimental'],properties:{session:{type:'string'},session_id:{type:'string'},experimental:{type:'boolean',enum:[true]},timeout_sec:{type:'integer',minimum:1,maximum:60},queue_timeout_sec:{type:'integer',minimum:1,maximum:120}}},
    run:async(args,ctx)=>{if(args.experimental!==true)throw new DriverError('current read route requires experimental opt-in',{category:'bad_args'});return (await import('./independent-service-route.mjs')).routeIndependentRead(args.session,args.session_id,{jobId:ctx.jobId,signal:ctx.signal,timeoutMs:(args.timeout_sec??20)*1000,queueTimeoutMs:(args.queue_timeout_sec??60)*1000})},
  },
  {
    name:'broker_service_archive',title:'Archive one sealed scratch recovery target',readOnly:false,
    description:'Experimental durable scoped archive through an independent controller sealed to one distinct owned scratch target epoch. Requires target generation already stopped/files-retired with terminal attempts and a verified empty native caller-family receipt. One native call, no replay, settings changes or permission elevation. Success additionally requires persisted archive and original PID absence. Never deletes. Native approval rules remain intact.',
    schema:{required:['session','service_id','session_id','target_service_id','family_request_id','experimental'],properties:{session:{type:'string'},service_id:{type:'string',pattern:'^[a-f0-9]{32}$'},session_id:{type:'string'},target_service_id:{type:'string',pattern:'^[a-f0-9]{32}$'},family_request_id:{type:'string',pattern:'^rpeer[a-f0-9]{32}$'},experimental:{type:'boolean',enum:[true]},timeout_sec:{type:'integer',minimum:1,maximum:60}}},
    run:async(args,ctx)=>{if(args.experimental!==true||!ctx.jobId)throw new DriverError('scoped archive requires experimental durable submission',{category:'bad_args'});return (await import('./independent-service-result.mjs')).readIndependentService(args.session,args.service_id,args.session_id,{archiveControl:{serviceId:args.target_service_id,familyRequestId:args.family_request_id},timeoutMs:(args.timeout_sec??20)*1000,signal:ctx.signal,jobId:ctx.jobId,progress:ctx.progress})},
  },
  {
    name:'broker_service_wake_target',title:'Wake one sealed retired scratch target',readOnly:false,
    description:'Experimental one-shot fixed tool-free message to the exact sealed retired scratch target. Requires original PID absent, no current peer, unarchived bypass record and unchanged retired terminal generation with empty family receipt. Native receipt is distinct from new process, applied reply or serving readiness. No arbitrary messages, retries, permission changes or consent bypass.',
    schema:{required:['session','service_id','session_id','target_service_id','family_request_id','experimental'],properties:{session:{type:'string'},service_id:{type:'string',pattern:'^[a-f0-9]{32}$'},session_id:{type:'string'},target_service_id:{type:'string',pattern:'^[a-f0-9]{32}$'},family_request_id:{type:'string',pattern:'^rpeer[a-f0-9]{32}$'},experimental:{type:'boolean',enum:[true]},timeout_sec:{type:'integer',minimum:1,maximum:60}}},
    run:async(args,ctx)=>{if(args.experimental!==true||!ctx.jobId)throw new DriverError('scoped wake requires experimental durable submission',{category:'bad_args'});return (await import('./independent-service-result.mjs')).readIndependentService(args.session,args.service_id,args.session_id,{wakeControl:{serviceId:args.target_service_id,familyRequestId:args.family_request_id},timeoutMs:(args.timeout_sec??20)*1000,signal:ctx.signal,jobId:ctx.jobId,progress:ctx.progress})},
  },
  {
    name:'broker_service_family',title:'Read the independent receiver native family',readOnly:false,
    description:'Experimental durable fixed list_sessions linked:true/include_archived:true/limit:100 through an exact loaded independent receiver. Native receipt qualification and settlement metadata only; a full-limit result cannot establish complete family scope. Never archives, signals, restarts, changes permissions or retries. Use driver_submit for a retained identity.',
    schema:{required:['session','service_id','experimental'],properties:{session:{type:'string'},service_id:{type:'string',pattern:'^[a-f0-9]{32}$'},experimental:{type:'boolean',enum:[true]},timeout_sec:{type:'integer',minimum:1,maximum:60}}},
    run:async(args,ctx)=>{if(args.experimental!==true||!ctx.jobId)throw new DriverError('family read requires experimental durable submission',{category:'bad_args'});return (await import('./independent-service-result.mjs')).readIndependentService(args.session,args.service_id,args.session,{family:true,timeoutMs:(args.timeout_sec??20)*1000,signal:ctx.signal,jobId:ctx.jobId,progress:ctx.progress})},
  },
  {
    name:'broker_service_read',title:'Read metadata through an enrolled native receiver',readOnly:false,
    description:'Experimental serialized get_session read through an already loaded owned receiver. Checks exact epoch/bytes/readiness and controls, enqueues one request, records one peer delivery and reconciles native result. Never installs, wakes, restarts or retries. Returns settlement metadata only; cancelled or uncertain work requires request inspection.',
    schema:{required:['service_id','session_id','experimental'],properties:{service_id:{type:'string',pattern:'^[a-f0-9]{32}$'},session_id:{type:'string'},session:{type:'string',description:'Explicit independent receiver UUID; session_id remains the metadata target.'},experimental:{type:'boolean',enum:[true]},timeout_sec:{type:'number',minimum:1,maximum:60}}},
    run:async(args,ctx)=>{
      if(args.experimental!==true)throw new DriverError('native service read requires explicit experimental opt-in',{category:'bad_args'})
      if(args.session!==undefined)return (await import('./independent-service-result.mjs')).readIndependentService(args.session,args.service_id,args.session_id,{timeoutMs:(args.timeout_sec??20)*1000,signal:ctx.signal,jobId:ctx.jobId,progress:ctx.progress})
      return (await import('./native-service-read.mjs')).nativeServiceRead(args.service_id,args.session_id,{timeoutMs:(args.timeout_sec??20)*1000,signal:ctx.signal})
    },
  },
  {
    name:'broker_service_result_reconcile',title:'Settle a reusable native receiver result',readOnly:false,
    description:'Experimental local receipt publication for one captured reusable receiver read. Requires exact enrollment, loaded bytes, original epoch, baseline and native admission. Never sends or replays. Settle before the next shared helper checkpoint; returns metadata only and preserves control history.',
    schema:{required:['service_id','request_id','experimental'],properties:{service_id:{type:'string',pattern:'^[a-f0-9]{32}$'},request_id:{type:'string',pattern:'^rpeer[a-f0-9]{32}$'},session:{type:'string',description:'Explicit receiver UUID for an independent bound namespace; omit for the legacy enrollment route.'},experimental:{type:'boolean',enum:[true]}}},
    run:async(args,ctx)=>{
      if(args.experimental!==true)throw new DriverError('native service reconciliation requires explicit experimental opt-in',{category:'bad_args'})
      if(args.session!==undefined)return (await import('./independent-service-result.mjs')).reconcileIndependentServiceResult(args.session,args.service_id,args.request_id,{signal:ctx.signal})
      return (await import('./native-peer-service-result.mjs')).reconcileNativeServiceResult(args.service_id,args.request_id)
    },
  },
  {
    name:'broker_peer_result_reconcile',title:'Settle an admitted native callback result',readOnly:false,
    description:'Experimental local receipt publication for one existing native peer result enrollment. Verifies exact owned runtime, module bytes, admission and captured response; never sends, executes, replays or changes permissions. Returns settlement metadata only. Retired or changed modules are refused.',
    schema:{required:['id','experimental'],properties:{id:{type:'string',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'},experimental:{type:'boolean',enum:[true]}}},
    run:async args=>{
      if(args.experimental!==true)throw new DriverError('native peer reconciliation requires explicit experimental opt-in',{category:'bad_args'})
      return (await import('./native-peer-result.mjs')).reconcileNativePeerResult(args.id)
    },
  },
  {
    name:'broker_read_reconcile',title:'Recover original native metadata receipts',readOnly:true,
    description:'Reconcile bounded original metadata receipts after exact settings restoration, without replay or inference. Requires original intact idle native epoch and host finish. Returns historical metadata and preserves the original job outcome; never release authority.',
    schema:{required:['id','experimental'],properties:{id:{type:'string'},experimental:{type:'boolean',enum:[true]}}},
    run:async(args,ctx)=>(await import('./native-read-batch.mjs')).reconcileNativeReadBatch(args.id,{signal:ctx.signal}),
  },
  {
    name:'broker_read_recover',title:'Restore an expired native metadata transaction',readOnly:false,
    description:'Explicit zero-inference cleanup for one expired service-owned metadata batch in its original intact idle broker epoch. Restores exact owned settings only; never wakes, restarts or replays native reads and never completes the original job.',
    schema:{required:['id','experimental'],properties:{id:{type:'string'},experimental:{type:'boolean',enum:[true]}}},
    run:async args=>(await import('./native-read-batch.mjs')).recoverNativeReadBatch(args.id),
  },
  {
    name:'broker_read_status',title:'Inspect a native metadata batch',readOnly:true,
    description:'Inspect bounded durable batch phase and cleanup bookkeeping without inference or replay. Publication is not a native effect receipt; recorded restoration is historical evidence, not current serving readiness.',
    schema:{required:['id'],properties:{id:{type:'string'}}},
    run:async args=>(await import('./native-read-batch.mjs')).nativeReadStatus(args.id),
  },
  {
    name: 'broker_read_batch', title: 'Experimental deterministic native metadata batch', readOnly: false,
    description: 'Opt-in metadata-only native hook execution, using one short broker diagnostic turn per batch. Does not rely on model tool selection. Exact IDs only; duplicate targets share one read receipt. Preserves core hooks and restores exact settings. Mutations, recovery and full serving qualification are excluded.',
    schema: {required:['sessions','experimental'],properties:{sessions:{type:'array',items:{type:'string'},minItems:1,maxItems:8},experimental:{type:'boolean',enum:[true]},timeout_sec:{type:'number',minimum:5,maximum:60}}},
    run: async(args,ctx)=>{
      if(args.experimental!==true)throw new DriverError('native metadata batch requires explicit experimental opt-in',{category:'bad_args'})
      const {nativeReadBatch}=await import('./native-read-batch.mjs')
      return nativeReadBatch(args.sessions,{timeoutSec:args.timeout_sec??20,signal:ctx.signal,progress:ctx.progress})
    },
  },
  {
    name: 'broker_idle', title: 'Observe native broker host idle', readOnly: true,
    description: 'Observe the configured broker through a native idle control subscription without model input or recovery. Shared durable ownership prevents duplicate subscriptions. Reports host state and historical finish time; never task success, full queue quiescence or release authority. Cancellation ends the local wait, not the native subscription.',
    schema: { properties: { timeout_sec: {type:'number',minimum:0.1,maximum:30}, not_before: {type:'number',description:'Optional Unix milliseconds boundary; an older finishedAt cannot be fresh completion.'}, cache_ms: {type:'number',minimum:0,maximum:3000} } },
    run: async (args, ctx) => {
      const i=brokerInfo(),record=i.sessionId?getRecord(i.sessionId):null
      if(!i.live||i.live.entrypoint!=='claude-desktop'||!i.runtime?.integrity||record?.cwd!==BROKER_DIR||record.isArchived)throw new DriverError('native idle observation requires the intact configured desktop broker',{category:'peer_unqualified'})
      const {observeNativeIdle}=await import('./native-idle.mjs')
      return observeNativeIdle(i,{timeoutSec:args.timeout_sec??12,notBefore:args.not_before,cacheMs:args.cache_ms??1000,signal:ctx.signal})
    },
  },
  {
    name:'action_health',title:'Check selected action route',readOnly:true,
    description:'Dependency-specific eligibility for local, desktop, native-sidecar or inference routes. Does not execute, invoke inference or grant authorization. Unknown required dependencies refuse eligibility.',
    schema:{properties:{type:{type:'string',enum:['local','desktop','native-sidecar','inference']}},required:['type']},
    run:async args=>{
      const {assessActionHealth}=await import('./action-health.mjs')
      if(args.type==='local')return assessActionHealth('local')
      const {execFileSync}=await import('node:child_process')
      let appRunning
      try{appRunning=execFileSync('/bin/ps',['-axo','comm='],{encoding:'utf8',timeout:2000,maxBuffer:1048576}).split('\n').some(x=>x.trim()==='/Applications/Claude.app/Contents/MacOS/Claude')}catch{}
      if(args.type==='desktop')return assessActionHealth(args.type,{appRunning})
      if(args.type==='inference')return assessActionHealth(args.type,{appRunning,inference:'unknown'})
      const {serviceHealth}=await import('./service-health.mjs')
      return assessActionHealth(args.type,{appRunning,...serviceHealth(brokerInfo())})
    },
  },
  {
    name:'service_health', title:'Service health diagnostics', readOnly:true,
    description:'Observe broker liveness, runtime integrity and serving evidence without inference; persist bounded metadata-only diagnostic history. Never authorizes dispatch.',
    schema:{properties:{}},
    run:async()=>{const {captureServiceDiagnostics}=await import('./service-diagnostics.mjs');return captureServiceDiagnostics()},
  },
  {
    name: 'broker_recovery_status',
    title: 'Broker recovery prerequisites',
    description: 'Read-only broker identity and bounded durable request audit. May reconcile late native receipts without replay. No wake, epoch renewal, permission change or recovery authority.',
    readOnly: true,
    schema: { properties: {} },
    run: async () => ({ broker: brokerInfo(), requests: auditRequests(), recoveryAttempted: false, replayAuthorized: false }),
  },
  {
    name: 'broker_status',
    title: 'Broker status / revive',
    description: 'Show the broker session\'s state; revive:true brings its process back (focus warm-spawn, then Tier C typing a wake line) when the app reaped it (30 min idle, app restart, mode change).',
    schema: { properties: { revive: { type: 'boolean' }, warm_only: { type: 'boolean', description: 'Recover only through a native deep link with focus restoration and input-filter audits; never load Computer Use. May run while input automation is quarantined.' } } },
    run: async (args, ctx) => {
      if (!args.revive) return brokerInfo()
      ctx.tier = 'A/C'
      return { ...(await reviveBroker({ warmOnly:args.warm_only===true, progress: ctx.progress, signal: ctx.signal })), broker: brokerInfo() }
    },
  },
]

// create_session for bypass: hand out a parked pool session instead of
// importing. Returns null when the pool has none for this folder.
async function createFromPool(args, ctx) {
  if (!args.title || typeof args.title !== 'string') throw new DriverError('title is required', { category: 'bad_args' })
  if (!existsSync(args.folder)) throw new DriverError(`folder does not exist: ${args.folder}`, { category: 'bad_args' })
  const folder = realpathSync(args.folder)
  const pick = await claim(folder, { title: args.title })
  if (!pick) return null
  const id = pick.sessionId
  const observationCursor=sessionEvents({session:id}).cursor
  const model = args.model || DEFAULT_MODEL
  const effort = args.effort || 'high'
  const ops = []
  if (pick.archived) ops.push({ op: 'unarchive_session', args: { session_id: id } })
  ops.push({ op: 'set_session_title', args: { session_id: id, title: args.title } })
  ops.push({ op: 'set_session_model', args: { session_id: id, model } })
  ops.push({ op: 'set_session_effort', args: { session_id: id, effort } })
  if (args.group) ops.push(...(await groupOps(args.group, [id], ctx)))
  if (args.first_message) ops.push({ op: 'send_message', args: { session_id: id, message: args.first_message } })
  const out = { sessionId: id, via: 'pool', cwd: folder, title: args.title, model, effort, permissionMode: BYPASS, intendedPermissionMode: BYPASS, pooledFrom: pick.priorTitle || null, observationCursor }
  const b = await tierB(ctx, ops, `title "${args.title}" (titleSource "tool"), model ${model}, effort ${effort}, permissionMode bypassPermissions, isArchived false`).catch(async (err) => {
    // A multi-op request may have partially landed. Keep an uncertain claim
    // reserved; only proven pre-dispatch failure can return it to the pool.
    if (err.detail?.retrySafe) await setEntry(id, { state: 'parked', claimedAt: undefined, claimedTitle: undefined })
    throw err
  })
  if (b.handback) return { ...b.handback, ...out, calls: b.handback.calls }
  ctx.tier = 'B'
  const w = await waitForRecord(id, (r) => r.title === args.title && r.model === model && r.isArchived === false && r.permissionMode === BYPASS, { timeoutMs: 8000 })
  return { ...out, cwd:w.record?.cwd||out.cwd, requestedFolder:args.folder, verified: w.ok, followUps: b.results, ms: b.ms }
}

// Resolve a group name/id to an id, creating it when missing. A desktop
// caller cannot be handed a create_group whose id the next op needs, so it is
// told to create the group itself first; this runs BEFORE any import so a
// missing group never strands a half-made session (2026-10-03 finding).
async function ensureGroupId(group, ctx) {
  const find = () => {
    const groups=readGroups().groups
    const exact=groups.find(x=>x.id===group)
    if(exact)return exact.id
    const matches=groups.filter(x=>x.name===group)
    if(matches.length>1)throw new DriverError(`group name "${group}" is ambiguous; use its id`,{category:'bad_args'})
    return matches[0]?.id
  }
  const existing=find()
  if(existing)return existing
  if (isDesktopCaller() && !['cli', 'probe'].includes(ctx?.harness) && !ctx?.args?.via_broker) {
    throw new DriverError(
      `group "${group}" does not exist. You are a desktop session: create it first with mcp__ccd_sidebar__create_group {name: "${group}"}, then call this op again (nothing was created or imported).`,
      { category: 'bad_args' },
    )
  }
  // Native receipts preserve tool text. Read the persisted ID rather than
  // expecting the model relay to manufacture a parsed result object.
  const r = await viaBroker([{ op: 'create_group', args: { name: group } }], { progress: () => {}, notes: [] })
  checkResults(r)
  const deadline=Date.now()+8000
  while(Date.now()<deadline){const id=find();if(id)return id;await sleep(150)}
  throw new DriverError(`group creation returned but its persisted id was not verified: ${group}`,{category:'outcome_unknown',detail:{requestId:r.id,dispatched:true,retrySafe:false}})
}

async function groupOps(group, sessionIds, ctx) {
  const id = await ensureGroupId(group, ctx)
  return [{ op: 'move_sessions', args: { session_ids: sessionIds, group_id: id } }]
}

// ---------------------------------------------------------------- dispatch

export function validateOp(name, args) {
  const op = OPS.find(o => o.name === name)
  if (!op) throw new DriverError(`unknown op ${name}`, { category: 'bad_args' })
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new DriverError('arguments must be an object', { category: 'bad_args' })
  for (const key of op.schema.required || []) if (args[key] === undefined) throw new DriverError(`missing required argument: ${key}`, { category: 'bad_args' })
  const props = op.schema.properties || {}
  for (const [key, value] of Object.entries(args)) {
    const rule = props[key]
    if (!rule) throw new DriverError(`unknown argument: ${key}`, { category: 'bad_args' })
    const types = Array.isArray(rule.type) ? rule.type : [rule.type]
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
    if (!(types.includes(type) || (type === 'number' && types.includes('integer') && Number.isInteger(value))) || (type === 'number' && !Number.isFinite(value))) throw new DriverError(`invalid type for ${key}`, { category: 'bad_args' })
    if (rule.enum && !rule.enum.includes(value)) throw new DriverError(`invalid value for ${key}`, { category: 'bad_args' })
    if (type === 'string' && ((rule.minLength !== undefined && value.length < rule.minLength) || (rule.maxLength !== undefined && value.length > rule.maxLength))) throw new DriverError(`invalid length for ${key}`, { category: 'bad_args' })
    if (type === 'number' && ((rule.minimum !== undefined && value < rule.minimum) || (rule.maximum !== undefined && value > rule.maximum))) throw new DriverError(`out of range: ${key}`, { category: 'bad_args' })
    if (type === 'array' && rule.items?.type && value.some(x=>typeof x !== rule.items.type)) throw new DriverError(`invalid array entries for ${key}`, { category: 'bad_args' })
  }
  return op
}

export async function runOp(name,args={},options={}){
 return withLifecycleContext({operationId:randomUUID(),operation:name,build:RUNTIME_BUILD},()=>runOpInner(name,args,options))
}
async function runOpInner(name, args = {}, { harness = 'cli', progress = () => {}, signal,jobId } = {}) {
  if(jobId!==undefined&&!/^j[a-f0-9]{32}$/.test(jobId))throw new DriverError('invalid operation job context',{category:'bad_args'})
  const op = validateOp(name, args)
  if (signal?.aborted) throw new DriverError('cancelled before operation', { category: 'cancelled' })
  const ctx = { args, harness, progress, signal,jobId, notes: [], tier: null }
  const t0 = Date.now(),operationId=lifecycleContext().operationId
  if(['send_message','steer_session'].includes(name)&&args.transport==='peer-direct')ctx.directDeadline=t0+Math.ceil((args.receipt_timeout_sec??15)*1000)
  const trace=(event,extra={})=>lifecycleEvent(event,{operationId,operation:name,build:RUNTIME_BUILD,versions:row.versions,...extra})
  const row = { ts: new Date().toISOString(), harness, op: name, args: redactArgs(args), versions: name==='broker_service_status'&&args.historical===true?{app:null,cli:null,assessment:'not-assessed-historical'}:versions(), driver: DRIVER_VERSION }
  trace('operation-start')
  const checkRuntime=()=>{
    const safeObservation=op.readOnly&&!(name==='window_state'&&args.precise)||name==='broker_status'&&!args.revive
    if(!safeObservation&&name!=='driver_cancel'){
      const runtime=runtimeState()
      if(runtime.restartRequired)throw new DriverError('Driver source changed after this process started; reconnect MCP or use the current CLI before another operation',{category:'runtime_stale',detail:{...runtime,retrySafe:true,dispatched:false}})
    }
  }
  try {
    checkRuntime()
    const controlled = ['steer_session', 'stop_session', 'send_message', 'set_session_config', 'rename_session', 'pin_session', 'archive_session', 'unarchive_session', 'pool_release'].includes(name)
    let out
    if (controlled) {
      const session = resolveSession(args.session).sessionId
      const boundArgs = { ...args, session }
      ctx.args = boundArgs
      row.targetSession = session
      out = await withSessionControl(session, () => {checkRuntime();return op.run(boundArgs, ctx)}, { signal,...(['send_message','steer_session'].includes(name)&&args.transport==='peer-direct'?{timeoutMs:Math.max(1,ctx.directDeadline-Date.now())}:{}) })
    } else out = await op.run(args, ctx)
    trace('operation-end',{outcome:out?.handedBack?'handed-back':out?.verified===false?'unverified':'returned',ms:Date.now()-t0})
    if(name==='broker_status')trace('broker-observed',{info:out?.broker||out})
    const handedBack = out && typeof out === 'object' && out.handedBack
    if (!op.readOnly) {
      const event = { ...row, tier: ctx.tier || (handedBack ? 'B-own' : 'A'), ms: Date.now() - t0, outcome: handedBack ? 'handed_back' : out?.verified === false ? 'unverified' : 'ok', verified: out?.verified ?? null, notes: ctx.notes }
      appendJsonl(LEDGER, event)
      operationMemory(event)
    }
    if (ctx.notes.length && out && typeof out === 'object' && !Array.isArray(out)) out.notes = ctx.notes
    return out
  } catch (err) {
    trace('operation-error',{category:err.category||'internal',outcome:'error',ms:Date.now()-t0})
    try{trace('broker-at-failure',{info:brokerInfo()})}catch{}
    try{const {captureServiceDiagnostics}=await import('./service-diagnostics.mjs');captureServiceDiagnostics({trigger:'operation-failure'})}catch{} // Never replace the original operation failure.
    appendJsonl(LEDGER, { ...row, tier: ctx.tier, ms: Date.now() - t0, outcome: 'error', error: String(err.message).slice(0, 500), errorCategory: err.category || 'internal', notes: ctx.notes })
    operationMemory({ ...row, outcome: 'error', errorCategory: err.category || 'internal', ms: Date.now() - t0 })
    throw err
  }
}

export { txt, isDesktopCaller, BROKER_OPS, BROKER_DIR }
