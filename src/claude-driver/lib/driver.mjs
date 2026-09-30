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
import { createSession, forkSession, openSession, unarchiveViaLink } from './tiera.mjs'
import { BROKER_OPS, brokerInfo, brokerRequest, reviveBroker } from './broker.mjs'
import {
  BROKER_DIR, CAPABILITIES, LEDGER, PENDING_LEARNINGS, STATE_DIR, appendJsonl, loadRegistry, readJson, readJsonl, redactArgs, updateRegistry,
} from './state.mjs'
import { cleanupCliLeftovers } from './cleanup.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(HERE, '..')
export const DRIVER_VERSION = (() => {
  try {
    return execFileSync('/usr/bin/git', ['-C', ROOT, 'log', '-1', '--format=%h', '--', '.'], { encoding: 'utf8' }).trim() || 'dev'
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
  if (bad.length) throw new DriverError(`broker op failed: ${bad.map((b) => `${b.op}: ${b.error}`).join('; ')}`, { category: 'tier_b_failed', detail: r.results })
  return r.results
}

async function tierB(ctx, ops, verifyHint) {
  // Only MCP callers get handed back; the CLI and probe always use the broker.
  if (isDesktopCaller() && !['cli', 'probe'].includes(ctx.harness) && !ctx.args.via_broker) return { handback: ownToolsResult(ops, verifyHint) }
  ctx.tier = ctx.tier || 'B'
  const r = await viaBroker(ops, ctx)
  return { results: checkResults(r), deliveredVia: r.deliveredVia, ms: r.ms }
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
      const m = matrix()
      const recent = readJsonl(LEDGER, { tail: 200 })
      return {
        driver: DRIVER_VERSION,
        versions: m.versions,
        stateDir: STATE_DIR,
        desktopCaller: callerHostSession(),
        broker: brokerInfo(),
        capabilities: m.current ? { probedAt: m.current.probedAt, mechanisms: m.current.mechanisms } : `not probed for ${m.key}; run \`claude-driver probe\``,
        mainWindow: currentMain(),
        frontApp: await frontApp(),
        recentFailures: recent.filter((r) => r.outcome !== 'ok').slice(-8),
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
      const pending = readJsonl(PENDING_LEARNINGS)
      if (args.pending_only) return { pending }
      return `${readFileSync(join(ROOT, 'docs', 'findings.md'), 'utf8')}\n\n## Pending (unverified)\n\n${pending.map((p) => `- ${p.ts} [${p.harness || '?'}] ${p.learning} — evidence: ${p.evidence}`).join('\n') || '(none)'}`
    },
  },
  {
    name: 'driver_record_learning',
    title: 'Record a candidate learning',
    description: 'Append a candidate finding about how the app or driver behaves, with evidence (versions, ids, log lines). It stays pending until someone re-verifies it and promotes it into docs/findings.md.',
    schema: { properties: { learning: { type: 'string' }, evidence: { type: 'string' } }, required: ['learning', 'evidence'] },
    run: async (args, ctx) => {
      appendJsonl(PENDING_LEARNINGS, { ts: new Date().toISOString(), harness: ctx.harness, versions: versions(), learning: args.learning, evidence: args.evidence })
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
      'Optional follow-ups through Tier B: lock_title (so the auto-titler never renames it), first_message (runs visibly in the desktop), group. Import side effects: the app starts it in acceptEdits even if your default is bypass; the trivial bootstrap turn shows as the first exchange.',
    schema: {
      properties: {
        folder: { type: 'string', description: 'Absolute path of an existing folder.' },
        no_project: { type: 'boolean', description: 'Create a "no folder" session (the app\'s scratch workspace).' },
        title: { type: 'string' },
        model: { type: 'string', description: 'Model id, default claude-opus-5-5.' },
        effort: { type: 'string', enum: ['low', 'medium', 'high', 'xhigh', 'max'] },
        bootstrap_prompt: { type: 'string', description: 'The headless first turn. Keep it trivial; default asks for "ready".' },
        first_message: { type: 'string', description: 'Sent via Tier B send_message after import, so the real task runs visibly in the desktop.' },
        lock_title: { type: 'boolean', description: 'Tier B set_session_title so titleSource becomes "tool". Default false.' },
        group: { type: 'string', description: 'Sidebar group name or id to file it under (created if missing).' },
        focus: FOCUS,
        via_broker: VIA_BROKER,
      },
      required: ['title'],
    },
    navigates: true,
    run: async (args, ctx) => {
      const f = focusArg(args)
      ctx.tier = 'A'
      const { result, focus } = await withFocus(f, () => createSession(args, ctx))
      const out = { ...result, focus: focus.action }
      delete out.navigatedTo
      const follow = []
      if (args.lock_title) follow.push({ op: 'set_session_title', args: { session_id: result.sessionId, title: args.title } })
      if (args.group) follow.push(...(await groupOps(args.group, [result.sessionId])))
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
    title: 'Set model, effort or permission mode',
    description:
      'Change another session\'s model, effort and/or permission mode (from its next turn). Raising permissions (toward bypassPermissions) shows Taylor an approval card every time, by design. Changing permission mode ends the session\'s idle process. Verified on disk.',
    schema: {
      properties: {
        session: S,
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
      if (args.model) ops.push({ op: 'set_session_model', args: { session_id: rec.sessionId, model: args.model } })
      if (args.effort) ops.push({ op: 'set_session_effort', args: { session_id: rec.sessionId, effort: args.effort } })
      if (args.permission_mode) ops.push({ op: 'set_session_permission_mode', args: { session_id: rec.sessionId, mode: args.permission_mode } })
      if (!ops.length) throw new DriverError('pass model, effort and/or permission_mode', { category: 'bad_args' })
      const b = await tierB(ctx, ops)
      if (b.handback) return b.handback
      const w = await waitForRecord(
        rec.sessionId,
        (r) => (!args.model || r.model === args.model) && (!args.effort || r.effort === args.effort) && (!args.permission_mode || r.permissionMode === args.permission_mode),
        { timeoutMs: 8000 }
      )
      return { sessionId: rec.sessionId, model: w.record?.model, effort: w.record?.effort, permissionMode: w.record?.permissionMode, verified: w.ok, broker: b.results.map((r) => r.result) }
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
      const delivery = res.match(/delivery: (\w+)/)?.[1] || 'unknown'
      if (!['delivered', 'queued'].includes(delivery)) throw new DriverError(`not delivered: ${res.slice(0, 300)}`, { category: 'not_delivered' })
      return { sessionId: rec.sessionId, delivery, detail: res, ms: b.ms }
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
      const ops = args.group === null ? [{ op: 'move_sessions', args: { session_ids: ids, group_id: null } }] : await groupOps(args.group, ids)
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
        updateRegistry((r) => {
          for (const id of Object.keys(cleaned)) {
            delete r.sessions[id]
            if (r.deleteQueue) delete r.deleteQueue[id]
          }
        })
        return { cleaned, filesRemoved: Object.values(cleaned).reduce((a, b) => a + b, 0) }
      }
      if (args.queue) {
        const ids = (args.sessions || []).map((s) => resolveSession(s).sessionId)
        updateRegistry((r) => {
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
      updateRegistry((r) => {
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
        updateRegistry((r) => delete r.folders[folder])
        folderDeleted = true
      }
      return { ...plan, archived, notArchived: targets.map((r) => r.sessionId).filter((i) => !archived.includes(i)), folderDeleted }
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
      return { status: r.status, report: r.text, after: { mainWindow: currentMain() } }
    },
  },
  // ---------------- broker
  {
    name: 'broker_status',
    title: 'Broker status / revive',
    description: 'Show the broker session\'s state; revive:true brings its process back (focus warm-spawn, then Tier C typing a wake line) when the app reaped it (30 min idle, app restart, mode change).',
    schema: { properties: { revive: { type: 'boolean' } } },
    run: async (args, ctx) => {
      if (!args.revive) return brokerInfo()
      ctx.tier = 'A/C'
      return { ...(await reviveBroker({ progress: ctx.progress, signal: ctx.signal })), broker: brokerInfo() }
    },
  },
]

async function groupOps(group, sessionIds) {
  const g = readGroups().groups.find((x) => x.id === group || x.name === group)
  if (g) return [{ op: 'move_sessions', args: { session_ids: sessionIds, group_id: g.id } }]
  // create_group returns the id; the broker cannot chain it, so create first.
  const r = await viaBroker([{ op: 'create_group', args: { name: group } }], { progress: () => {}, notes: [] })
  const id = checkResults(r)[0].result?.id
  if (!id) throw new DriverError(`could not create group ${group}`, { category: 'tier_b_failed' })
  return [{ op: 'move_sessions', args: { session_ids: sessionIds, group_id: id } }]
}

// ---------------------------------------------------------------- dispatch

export async function runOp(name, args = {}, { harness = 'cli', progress = () => {}, signal } = {}) {
  const op = OPS.find((o) => o.name === name)
  if (!op) throw new DriverError(`unknown op ${name}`, { category: 'bad_args' })
  const ctx = { args, harness, progress, signal, notes: [], tier: null }
  const t0 = Date.now()
  const row = { ts: new Date().toISOString(), harness, op: name, args: redactArgs(args), versions: versions(), driver: DRIVER_VERSION }
  try {
    const out = await op.run(args, ctx)
    const handedBack = out && typeof out === 'object' && out.handedBack
    if (!op.readOnly) appendJsonl(LEDGER, { ...row, tier: ctx.tier || (handedBack ? 'B-own' : 'A'), ms: Date.now() - t0, outcome: handedBack ? 'handed_back' : 'ok', verified: out?.verified ?? null, notes: ctx.notes })
    if (ctx.notes.length && out && typeof out === 'object' && !Array.isArray(out)) out.notes = ctx.notes
    return out
  } catch (err) {
    appendJsonl(LEDGER, { ...row, tier: ctx.tier, ms: Date.now() - t0, outcome: 'error', error: String(err.message).slice(0, 500), errorCategory: err.category || 'internal', notes: ctx.notes })
    throw err
  }
}

export { txt, isDesktopCaller, BROKER_OPS, BROKER_DIR }
