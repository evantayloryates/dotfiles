// The op layer shared by the MCP server and the CLI. Every op: validate →
// pick a tier (A disk/CLI/deep link, B broker ccd_* tools, C computer use) →
// act under the focus policy → verify against disk → one ledger row.

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
import { nativeQualification } from './qualification.mjs'

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
    schema: { properties: { session: S, cursor: { type: 'string' }, include_text: { type: 'boolean' }, limit: { type: 'number', minimum: 1, maximum: 100 } }, required: ['session'] }, run: sessionEvents,
  },
  {
    name: 'session_wait', title: 'Wait for new Claude session events', readOnly: true,
    description: 'Wait up to 60 s for new events or live status changes using a session_events cursor. Status changes do not prove task success; observe the reply. A timed-out wait leaves Claude running.',
    schema: { properties: { session: S, cursor: { type: 'string' }, include_text: { type: 'boolean' }, limit: { type: 'number', minimum: 1, maximum: 100 }, timeout_sec: { type: 'number', minimum: 0, maximum: 60 } }, required: ['session'] }, run: waitSession,
  },
  {
    name: 'steer_session', title: 'Steer a Claude session explicitly',
    description: 'Queue a follow-up (mode:queue), or stop the active turn, verify idle, then send the replacement instruction (mode:interrupt). Queuing is not immediate steering. Capture a session_events cursor beforehand and read back the response. Refuses the broker and caller.',
    schema: { properties: { session: S, message: { type: 'string' }, mode: { type: 'string', enum: ['queue', 'interrupt'] }, via_broker: VIA_BROKER }, required: ['session', 'message', 'mode'] },
    run: async (args, ctx) => {
      const rec = resolveSession(args.session)
      if ([brokerInfo().sessionId, callerHostSession()].includes(rec.sessionId)) throw new DriverError('refusing to steer the broker or caller', { category: 'gate' })
      let stopped
      if (args.mode === 'interrupt') stopped = await runOp('stop_session', { session: rec.sessionId, ...(args.via_broker !== undefined ? { via_broker: args.via_broker } : {}) }, ctx)
      if (stopped?.handedBack) return { ...stopped, message: `${stopped.message} Then call send_message with the replacement instruction; do not send it before the stop is verified.` }
      if (stopped?.verified && ctx.signal?.aborted) throw new DriverError('recipient stopped; replacement was cancelled before sending', {
        category: 'partial_effect', detail: { sessionId: rec.sessionId, stopped: true, replacementSent: false },
      })
      const sent = await runOp('send_message', { session: rec.sessionId, message: args.message, ...(args.via_broker !== undefined ? { via_broker: args.via_broker } : {}) }, ctx)
      return { ...sent, steeringMode: args.mode, stopped: stopped?.verified === true, applied: false,
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
      const b = await tierB(ctx, [{ op: 'stop_session', args: { session_id: rec.sessionId } }])
      if (b.handback) return b.handback
      const deadline = Date.now() + 8000
      while (Date.now() < deadline) {
        const live = liveByHost().get(rec.sessionId)
        if (!live || !['busy', 'working'].includes(live.status)) return { sessionId: rec.sessionId, stopped: true, verified: true, status: live?.status || 'offline' }
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
      const m = matrix(),runtime=runtimeState()
      const recent = readJsonl(LEDGER, { tail: 200 })
      return {
        driver: DRIVER_VERSION,
        apiVersion: 2,
        ...runtime,
        nativeQualification:{...nativeQualification(['v2-native-broker-pressure','v2-live-pressure','v2-input-free-pressure'].map(topic=>queryMemory({topic,kind:'test_result',limit:1})[0]).filter(Boolean).sort((a,b)=>b.at.localeCompare(a.at))[0],RUNTIME_BUILD,m.versions),...(runtime.restartRequired?{qualified:false,reason:'runtime_stale'}:{})},
        uiAutomation: uiPolicy(),
        versions: m.versions,
        stateDir: STATE_DIR,
        desktopCaller: callerHostSession(),
        broker: brokerInfo(),
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
    schema: { properties: { session: S, focus: FOCUS }, required: ['session'] },
    navigates: true,
    run: async (args, ctx) => {
      ctx.tier = 'A'
      const rec = resolveSession(args.session)
      const { result, focus } = await withFocus(focusArg(args, 'show'), () => openSession(rec))
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
      'Deliver a message to a desktop session as a user turn (labelled as coming from the broker or you). Wakes an idle session even with no running process. The result says delivered (turn started) or queued (behind current work).',
    schema: { properties: { session: S, message: { type: 'string' }, via_broker: VIA_BROKER }, required: ['session', 'message'] },
    run: async (args, ctx) => {
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
    if (!types.includes(type) || (type === 'number' && !Number.isFinite(value))) throw new DriverError(`invalid type for ${key}`, { category: 'bad_args' })
    if (rule.enum && !rule.enum.includes(value)) throw new DriverError(`invalid value for ${key}`, { category: 'bad_args' })
    if (type === 'string' && ((rule.minLength !== undefined && value.length < rule.minLength) || (rule.maxLength !== undefined && value.length > rule.maxLength))) throw new DriverError(`invalid length for ${key}`, { category: 'bad_args' })
    if (type === 'number' && ((rule.minimum !== undefined && value < rule.minimum) || (rule.maximum !== undefined && value > rule.maximum))) throw new DriverError(`out of range: ${key}`, { category: 'bad_args' })
    if (type === 'array' && rule.items?.type && value.some(x=>typeof x !== rule.items.type)) throw new DriverError(`invalid array entries for ${key}`, { category: 'bad_args' })
  }
  return op
}

export async function runOp(name, args = {}, { harness = 'cli', progress = () => {}, signal } = {}) {
  const op = validateOp(name, args)
  if (signal?.aborted) throw new DriverError('cancelled before operation', { category: 'cancelled' })
  const ctx = { args, harness, progress, signal, notes: [], tier: null }
  const t0 = Date.now()
  const row = { ts: new Date().toISOString(), harness, op: name, args: redactArgs(args), versions: versions(), driver: DRIVER_VERSION }
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
      out = await withSessionControl(session, () => {checkRuntime();return op.run(boundArgs, ctx)}, { signal })
    } else out = await op.run(args, ctx)
    const handedBack = out && typeof out === 'object' && out.handedBack
    if (!op.readOnly) {
      const event = { ...row, tier: ctx.tier || (handedBack ? 'B-own' : 'A'), ms: Date.now() - t0, outcome: handedBack ? 'handed_back' : out?.verified === false ? 'unverified' : 'ok', verified: out?.verified ?? null, notes: ctx.notes }
      appendJsonl(LEDGER, event)
      operationMemory(event)
    }
    if (ctx.notes.length && out && typeof out === 'object' && !Array.isArray(out)) out.notes = ctx.notes
    return out
  } catch (err) {
    appendJsonl(LEDGER, { ...row, tier: ctx.tier, ms: Date.now() - t0, outcome: 'error', error: String(err.message).slice(0, 500), errorCategory: err.category || 'internal', notes: ctx.notes })
    operationMemory({ ...row, outcome: 'error', errorCategory: err.category || 'internal', ms: Date.now() - t0 })
    throw err
  }
}

export { txt, isDesktopCaller, BROKER_OPS, BROKER_DIR }
