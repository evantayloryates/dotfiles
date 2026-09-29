// Runs one Codex turn to completion and turns the event stream into something
// Claude can read in a few hundred tokens.
//
// While the turn runs, the runner is the thread's handler: it answers
// server requests (app elicitations, command/file approvals, user-input
// questions, dynamic tool calls) from the policy, and folds items into a
// step log. Screenshots that Codex emits are written to disk rather than
// stuffed into the transcript.
//
// Every hop is timestamped into a per-turn timeline
// (~/.local/state/codex-bridge/timelines/<turnId>.jsonl) with a metrics
// summary beside it, so the channel itself can be studied: where the
// seconds go (boot, Computer Use calls, model time, approvals) and what the
// result cost to carry back.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { decideApp, decideCommand, decideFileChange } from './policy.mjs'
import { existsSync, unlinkSync } from 'node:fs'
import { STOP_FILE, ensureScreenshotDir, ensureTimelineDir } from './state.mjs'

// Codex reports this when a human moved, focused or typed into the app it
// was driving. Two agents on one keyboard is a collision, not a retry.
const USER_TOOK_OVER = /The user changed ['"]?[^'"]*\.app|user changed the (?:app|window)/i

const now = () => Date.now()

export class TurnTimeout extends Error {}

export async function runTurn(app, opts) {
  const {
    threadId,
    input,
    outputSchema,
    policy,
    grants = {},
    overrides = {},
    onProgress = () => {},
    timeoutMs = 15 * 60 * 1000,
    log = () => {},
    signal,
    receivedAt = now(),
    threadReadyAt = null,
    session = null,
    onTurnStarted = () => {},
  } = opts

  const started = now()
  const result = {
    threadId,
    turnId: null,
    status: 'unknown',
    error: null,
    durationMs: 0,
    finalText: '',
    steps: [],
    approvals: [],
    denied: [],
    questions: [],
    progressNotes: [],
    screenshots: [],
    usage: null,
    rateLimit: null,
    disconnected: null,
    timeline: [],
    metrics: null,
    timelinePath: null,
    receivedAt,
  }
  const shotDir = ensureScreenshotDir()
  const mark = (ev, extra = {}) => {
    result.timeline.push({ t: now() - receivedAt, ev, ...extra })
  }
  result.timeline.push({ t: 0, ev: 'call_received', session, threadId })
  if (threadReadyAt) result.timeline.push({ t: threadReadyAt - receivedAt, ev: 'thread_ready' })
  mark('turn_runner_start')

  let stepCount = 0
  let resolveDone
  let requestInterrupt = null
  const done = new Promise((r) => (resolveDone = r))

  const handler = {
    onNotification(method, params) {
      switch (method) {
        case 'turn/started':
          result.turnId ||= params.turn?.id || null
          mark('turn_started', { turnId: result.turnId })
          return
        case 'item/started': {
          const it = params.item
          mark('item_started', { type: it?.type, title: it?.arguments?.title || it?.tool || (it?.type === 'commandExecution' ? String(it.command).slice(0, 60) : undefined), server: it?.server })
          if (it?.type === 'mcpToolCall') onProgress(`${++stepCount}. ${it.arguments?.title || it.tool}`)
          else if (it?.type === 'commandExecution') onProgress(`${++stepCount}. $ ${String(it.command).slice(0, 80)}`)
          return
        }
        case 'item/completed': {
          const it = params.item
          mark('item_completed', { type: it?.type, title: it?.arguments?.title || it?.tool, server: it?.server, status: it?.status, durationMs: it?.durationMs ?? null, failed: it?.status === 'failed' || !!it?.error })
          recordItem(it, params.completedAtMs)
          return
        }
        case 'turn/completed': {
          const t = params.turn || {}
          // A timeout or cancel we initiated ends the turn as "interrupted"
          // on Codex's side; keep our own reason, it is the one Claude needs.
          if (!['timeout', 'cancelled', 'needs_input', 'user_took_over', 'stopped'].includes(result.status)) result.status = t.status || 'completed'
          if (t.error) result.error = t.error.message || JSON.stringify(t.error)
          mark('turn_completed', { status: result.status })
          resolveDone()
          return
        }
        case 'thread/tokenUsage/updated': {
          result.usage = params.tokenUsage?.total || params.total || result.usage
          const last = params.tokenUsage?.last || params.last
          if (last) {
            // `total` is the thread's lifetime count; `last` is this model call.
            // Sum the calls of this turn so the result shows what the turn cost.
            const t = (result.turnUsage ||= { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, calls: 0 })
            t.inputTokens += last.inputTokens || 0
            t.cachedInputTokens += last.cachedInputTokens || 0
            t.outputTokens += last.outputTokens || 0
            t.calls += 1
          }
          mark('token_usage', { total: result.usage, last })
          return
        }
        case 'account/rateLimits/updated': {
          const p = params.rateLimits?.primary
          if (p) result.rateLimit = { usedPercent: p.usedPercent, resetsAt: p.resetsAt, windowMins: p.windowDurationMins }
          return
        }
        case 'error':
          result.error = params.message || JSON.stringify(params)
          mark('error', { message: result.error })
          return
        case 'thread/compacted':
          result.compacted = (result.compacted || 0) + 1
          mark('thread_compacted', { params: JSON.stringify(params).slice(0, 300) })
          return
        case 'model/rerouted':
        case 'thread/status/changed':
          mark(method.replace(/\//g, '_'), { detail: JSON.stringify(params).slice(0, 160) })
          return
        default:
          return
      }
    },
    onRequest(req) {
      const t0 = now()
      try {
        answerRequest(req, t0)
      } catch (err) {
        log(`server request ${req.method} failed: ${err.message}`)
        mark('server_answered', { method: req.method, decision: 'error', answerMs: now() - t0, error: err.message })
        req.fail(-32000, `codex-bridge: ${err.message}`)
      }
    },
    onDisconnect(why) {
      result.disconnected = why
      result.status = 'disconnected'
      mark('disconnected', { why })
      resolveDone()
    },
  }

  function recordItem(it, completedAtMs) {
    if (!it) return
    switch (it.type) {
      case 'agentMessage':
        if (it.text) result.finalText = it.text
        if (Array.isArray(it.questions) && it.questions.length) {
          // Codex asked the user and the turn now waits for a reply nobody
          // here can give. Record the questions, end the turn, and hand them
          // to Claude; the answer comes back as the next call on this session.
          for (const q of it.questions) result.questions.push({ id: q.id || null, header: q.header || null, question: q.question || q.text || JSON.stringify(q).slice(0, 200), options: (q.options || []).map((o) => o.label || o) })
          result.status = 'needs_input'
          mark('needs_input', { questions: result.questions.length })
          requestInterrupt?.('needs_input')
        }
        return
      case 'mcpToolCall': {
        const step = {
          kind: 'tool',
          title: it.arguments?.title || `${it.server}/${it.tool}`,
          tool: `${it.server}/${it.tool}`,
          status: it.status,
          durationMs: it.durationMs ?? null,
          error: null,
        }
        const content = it.result?.content || []
        if (it.status === 'failed' || it.error) {
          const firstText = content.find((c) => c?.type === 'text')?.text || ''
          step.error = (it.error?.message || it.error || firstText || 'failed').toString().slice(0, 300)
          if (USER_TOOK_OVER.test(step.error) && !['user_took_over', 'stopped', 'timeout', 'cancelled'].includes(result.status)) {
            result.status = 'user_took_over'
            result.error = `a human is using the app Codex was driving (${step.error.slice(0, 120)}); the turn was stopped`
            mark('user_took_over', { error: step.error.slice(0, 160) })
            onProgress('stopping: a human is using the app')
            requestInterrupt?.('user_took_over')
          }
        }
        for (const c of content) {
          if (c?.type === 'image' && c.data) {
            const bytes = Buffer.from(c.data, 'base64')
            // Trust the bytes over the declared type: Computer Use labels JPEG screenshots as PNG.
            const { ext, mimeType } = sniffImage(bytes, c.mimeType)
            const file = join(shotDir, `${threadId.slice(0, 8)}-${completedAtMs || now()}-${result.screenshots.length + 1}.${ext}`)
            writeFileSync(file, bytes)
            result.screenshots.push({ path: file, mimeType, step: result.steps.length + 1, data: c.data, bytes: bytes.length })
            step.screenshot = file
            mark('screenshot_saved', { path: file, bytes: bytes.length })
          }
        }
        result.steps.push(step)
        return
      }
      case 'commandExecution':
        result.steps.push({
          kind: 'command',
          title: String(it.command).slice(0, 120),
          status: it.status,
          exitCode: it.exitCode ?? null,
          durationMs: it.durationMs ?? null,
          output: (it.aggregatedOutput || '').slice(-400),
        })
        return
      case 'dynamicToolCall':
        return // recorded when answered
      case 'fileChange':
        result.steps.push({ kind: 'fileChange', title: `${(it.changes || []).length} file change(s)`, status: it.status })
        return
      default:
        return
    }
  }

  function answerRequest(req, t0) {
    const { method, params } = req
    const answered = (decision, extra = {}) => mark('server_answered', { method, decision, answerMs: now() - t0, ...extra })
    switch (method) {
      case 'mcpServer/elicitation/request': {
        const d = decideApp(policy, grants, params)
        mark('server_request', { method, app: d.app.displayName, bundleId: d.app.bundleId, tool: d.app.tool, risk: d.app.risk })
        const entry = { app: d.app.displayName, bundleId: d.app.bundleId, tool: d.app.tool, risk: d.app.risk, decision: d.decision, scope: d.persist || null, reason: d.reason }
        if (d.decision === 'accept') {
          result.approvals.push(entry)
          onProgress(`approved ${d.app.displayName} (${d.persist})`)
          req.respond({ action: 'accept', content: {}, _meta: { persist: d.persist } })
          answered('accept', { app: d.app.displayName, scope: d.persist })
        } else {
          result.denied.push(entry)
          onProgress(`denied ${d.app.displayName}`)
          req.respond({ action: 'decline' })
          answered('decline', { app: d.app.displayName })
        }
        return
      }
      case 'item/commandExecution/requestApproval':
      case 'execCommandApproval': {
        mark('server_request', { method, command: String(params.command || '').slice(0, 120) })
        const d = decideCommand(policy, overrides, params)
        result[d.decision === 'accept' ? 'approvals' : 'denied'].push({ command: String(params.command || '').slice(0, 160), decision: d.decision, reason: d.reason, codexReason: params.reason || null })
        req.respond({ decision: d.decision })
        answered(d.decision)
        return
      }
      case 'item/fileChange/requestApproval':
      case 'applyPatchApproval': {
        mark('server_request', { method })
        const d = decideFileChange(policy, overrides, params)
        result[d.decision === 'accept' ? 'approvals' : 'denied'].push({ fileChange: true, decision: d.decision, reason: d.reason })
        req.respond({ decision: d.decision })
        answered(d.decision)
        return
      }
      case 'item/permissions/requestApproval':
        mark('server_request', { method })
        result.denied.push({ permissions: true, decision: 'decline', reason: 'permission escalations are never granted by the bridge' })
        req.fail(-32000, 'codex-bridge: permission escalation declined')
        answered('decline')
        return
      case 'item/tool/requestUserInput': {
        // Claude is blocked inside the tool call, so nobody can answer live.
        // Record the questions and tell Codex to proceed on its own judgment.
        mark('server_request', { method, questions: (params.questions || []).length })
        const answers = {}
        for (const q of params.questions || []) {
          result.questions.push({ id: q.id, header: q.header, question: q.question, options: (q.options || []).map((o) => o.label) })
          answers[q.id] = { answers: ['No live answer is available. Proceed with your best judgment, state the assumption in your final message, and stop before any irreversible action.'] }
        }
        req.respond({ answers })
        answered('canned')
        return
      }
      case 'item/tool/call': {
        mark('server_request', { method, tool: params.tool })
        if (params.tool === 'report_progress') {
          const msg = String(params.arguments?.message || '').slice(0, 300)
          result.progressNotes.push(msg)
          onProgress(`codex: ${msg}`)
          req.respond({ success: true, contentItems: [{ type: 'inputText', text: 'noted' }] })
          answered('noted', { note: msg })
        } else {
          req.respond({ success: false, contentItems: [{ type: 'inputText', text: `unknown tool ${params.tool}` }] })
          answered('unknown-tool')
        }
        return
      }
      default:
        log(`unhandled server request ${method}`)
        mark('server_request', { method })
        req.fail(-32601, `codex-bridge does not handle ${method}`)
        answered('unhandled')
    }
  }

  const detach = app.attachThread(threadId, handler)
  let timer = null
  let stopPoll = null
  let abortListener = null
  try {
    const turnParams = { threadId, input }
    if (outputSchema) turnParams.outputSchema = outputSchema
    if (overrides.model) turnParams.model = overrides.model
    if (overrides.effort) turnParams.effort = overrides.effort
    if (overrides.sandbox) turnParams.sandboxPolicy = sandboxPolicy(overrides.sandbox)
    if (overrides.disabledPluginIds) turnParams.disabledPluginIds = overrides.disabledPluginIds
    if (overrides.allowCommands) turnParams.approvalPolicy = { granular: { mcp_elicitations: true, rules: false, sandbox_approval: true } }
    mark('turn_start_sent', { inputChars: input.reduce((n, i) => n + (i.text?.length || 0), 0), images: input.filter((i) => i.type === 'localImage').length })
    const startResp = await app.turnStart(turnParams)
    result.turnId = startResp?.turn?.id || result.turnId
    mark('turn_start_ack', { turnId: result.turnId })
    onTurnStarted(result.turnId)

    const interrupt = async (why) => {
      mark('interrupt_sent', { why })
      try {
        await app.turnInterrupt({ threadId, turnId: result.turnId })
      } catch (err) {
        log(`interrupt after ${why} failed: ${err.message}`)
      }
    }
    requestInterrupt = (why) => {
      interrupt(why).catch(() => {})
    }
    timer = setTimeout(() => {
      result.status = 'timeout'
      result.error = `turn exceeded ${Math.round(timeoutMs / 1000)}s; interrupted`
      interrupt('timeout').finally(resolveDone)
    }, timeoutMs)
    // A human kill switch that needs no Claude turn: `codex-bridge stop`
    // writes STOP_FILE; every running turn on a current server sees it
    // within a second. (The CLI also interrupts through the daemon, which
    // reaches turns on older server processes too.)
    stopPoll = setInterval(() => {
      if (!existsSync(STOP_FILE)) return
      if (['stopped', 'timeout', 'cancelled'].includes(result.status)) return
      result.status = 'stopped'
      result.error = 'stopped by codex-bridge stop (human kill switch)'
      mark('stop_file_seen')
      onProgress('stopping: kill switch')
      interrupt('stop-file').finally(resolveDone)
    }, 1000)
    if (signal) {
      abortListener = () => {
        result.status = 'cancelled'
        result.error = 'cancelled by the caller'
        interrupt('cancel').finally(resolveDone)
      }
      if (signal.aborted) abortListener()
      else signal.addEventListener('abort', abortListener, { once: true })
    }
    await done
  } finally {
    clearTimeout(timer)
    clearInterval(stopPoll)
    if (signal && abortListener) signal.removeEventListener('abort', abortListener)
    detach()
    result.durationMs = now() - started
    result.metrics = computeMetrics(result)
  }
  return result
}

// Where the time went, from the timeline. All ms.
export function computeMetrics(r) {
  const tl = r.timeline
  const at = (ev, pred = () => true) => tl.find((e) => e.ev === ev && pred(e))?.t
  const received = 0
  const threadReady = at('thread_ready')
  const turnSent = at('turn_start_sent')
  const turnStarted = at('turn_started')
  const firstEcho = at('item_started', (e) => e.type === 'userMessage')
  const firstAction = at('item_started', (e) => e.type !== 'userMessage')
  const completed = at('turn_completed') ?? at('disconnected') ?? tl[tl.length - 1]?.t ?? 0
  const cua = tl.filter((e) => e.ev === 'item_completed' && e.type === 'mcpToolCall' && e.server === 'cua_repl')
  const cuaMs = cua.reduce((n, e) => n + (e.durationMs || 0), 0)
  const cmds = tl.filter((e) => e.ev === 'item_completed' && e.type === 'commandExecution')
  const cmdMs = cmds.reduce((n, e) => n + (e.durationMs || 0), 0)
  const answers = tl.filter((e) => e.ev === 'server_answered')
  const approvalMs = answers.reduce((n, e) => n + (e.answerMs || 0), 0)
  const bootMs = turnStarted != null && firstEcho != null ? firstEcho - turnStarted : null
  const total = completed - received
  const setupMs = (turnSent ?? 0) - received
  const modelMs = total - setupMs - (bootMs || 0) - cuaMs - cmdMs - approvalMs
  const usage = r.usage || {}
  return {
    total_ms: total,
    setup_ms: setupMs, // tool call received → turn/start sent (thread start/resume, state)
    thread_ready_ms: threadReady != null ? threadReady : null,
    boot_ms: bootMs, // turn/started → user message echoed (Codex booting MCP servers)
    first_action_ms: firstAction != null && turnStarted != null ? firstAction - turnStarted : null,
    cua_calls: cua.length,
    cua_ms: cuaMs,
    cua_failed: cua.filter((e) => e.failed).length,
    command_calls: cmds.length,
    command_ms: cmdMs,
    approvals: answers.length,
    approval_ms: approvalMs,
    model_ms: Math.max(0, modelMs), // everything not accounted for above: Codex thinking and streaming
    steps: r.steps.length,
    screenshots: r.screenshots.length,
    screenshot_bytes: r.screenshots.reduce((n, s) => n + (s.bytes || 0), 0),
    tokens_in: usage.inputTokens ?? null, // thread lifetime
    tokens_cached: usage.cachedInputTokens ?? null,
    tokens_out: usage.outputTokens ?? null,
    turn_tokens_in: r.turnUsage?.inputTokens ?? null,
    turn_tokens_cached: r.turnUsage?.cachedInputTokens ?? null,
    turn_tokens_out: r.turnUsage?.outputTokens ?? null,
    model_calls: r.turnUsage?.calls ?? null,
    rate_limit_pct: r.rateLimit?.usedPercent ?? null,
    status: r.status,
  }
}

// Called by the bridge once the result text exists, so the timeline records
// what it cost to carry the result back. Writes <turnId>.jsonl (events) and
// <turnId>.json (metrics + summary).
export function finalizeTimeline(r, { resultBytes = 0, imagesReturned = 0, session = null } = {}) {
  const dir = ensureTimelineDir()
  r.timeline.push({ t: now() - r.receivedAt, ev: 'result_formatted', resultBytes, imagesReturned })
  r.metrics = { ...computeMetrics(r), result_bytes: resultBytes, images_returned: imagesReturned }
  const id = r.turnId || `noturn-${r.receivedAt}`
  const jsonl = join(dir, `${id}.jsonl`)
  writeFileSync(jsonl, r.timeline.map((e) => JSON.stringify(e)).join('\n') + '\n')
  const json = join(dir, `${id}.json`)
  writeFileSync(json, JSON.stringify(summarize(r, { session }), null, 2))
  r.timelinePath = jsonl
  return jsonl
}

// Machine-readable companion to formatResult, returned as structuredContent.
export function summarize(r, { session = null } = {}) {
  return {
    status: r.status,
    error: r.error,
    session,
    threadId: r.threadId,
    turnId: r.turnId,
    durationMs: r.durationMs,
    finalText: r.finalText,
    steps: r.steps.map((s) => ({ kind: s.kind, title: s.title, tool: s.tool, status: s.status, durationMs: s.durationMs, error: s.error, exitCode: s.exitCode, screenshot: s.screenshot })),
    approvals: r.approvals,
    denied: r.denied,
    questions: r.questions,
    progressNotes: r.progressNotes,
    screenshots: r.screenshots.map((s) => ({ path: s.path, mimeType: s.mimeType, bytes: s.bytes, step: s.step })),
    usage: r.usage,
    turnUsage: r.turnUsage || null,
    rateLimit: r.rateLimit,
    disconnected: r.disconnected,
    metrics: r.metrics,
    timelinePath: r.timelinePath,
    compacted: r.compacted || 0,
  }
}

export function sniffImage(bytes, declared) {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: 'jpg', mimeType: 'image/jpeg' }
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { ext: 'png', mimeType: 'image/png' }
  if (bytes.length > 12 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return { ext: 'webp', mimeType: 'image/webp' }
  if (bytes.length > 6 && bytes.subarray(0, 3).toString() === 'GIF') return { ext: 'gif', mimeType: 'image/gif' }
  const mimeType = declared || 'image/png'
  return { ext: mimeType.split('/')[1]?.split('+')[0] || 'png', mimeType }
}

export function sandboxPolicy(mode) {
  switch (mode) {
    case 'danger-full-access':
      return { type: 'dangerFullAccess' }
    case 'workspace-write':
      return { type: 'workspaceWrite', networkAccess: false, writableRoots: [] }
    default:
      return { type: 'readOnly', networkAccess: false }
  }
}

const secs = (ms) => (ms == null ? '?' : `${(ms / 1000).toFixed(1)}s`)

// The compact report Claude reads. Screenshots are referenced by path; the
// caller decides whether to attach any as image content.
export function formatResult(r, { session } = {}) {
  const lines = []
  const toolSteps = r.steps.filter((s) => s.kind === 'tool').length
  lines.push(`status: ${r.status}${r.error ? ` — ${r.error}` : ''} (${secs(r.durationMs)}, ${toolSteps} tool call${toolSteps === 1 ? '' : 's'})`)
  lines.push(`session: ${session || '-'}  thread: ${r.threadId}  turn: ${r.turnId || '-'}`)
  lines.push('')
  lines.push(r.finalText ? r.finalText.trim() : '(Codex produced no final message)')
  if (r.steps.length) {
    lines.push('', 'steps:')
    r.steps.forEach((s, i) => {
      const dur = s.durationMs != null ? ` ${secs(s.durationMs)}` : ''
      const tail = s.error ? ` FAILED: ${s.error}` : s.kind === 'command' && s.exitCode != null ? ` exit ${s.exitCode}` : ''
      const shot = s.screenshot ? ` [screenshot]` : ''
      lines.push(`  ${i + 1}. ${s.kind === 'command' ? '$ ' : ''}${s.title}${dur}${shot}${tail}`)
    })
  }
  if (r.progressNotes.length) lines.push('', 'codex progress notes:', ...r.progressNotes.map((n) => `  - ${n}`))
  if (r.approvals.length) {
    lines.push('', 'approved:')
    for (const a of r.approvals) lines.push(`  - ${a.app ? `${a.app} (${a.scope})` : a.command ? `command: ${a.command}` : 'file changes'} — ${a.reason}`)
  }
  if (r.denied.length) {
    lines.push('', 'denied:')
    for (const d of r.denied) {
      if (d.app) lines.push(`  - app ${d.app}${d.bundleId ? ` [${d.bundleId}]` : ''} — ${d.reason}. Re-run with apps=["${d.app}"] to grant it for this session, or codex_approve_app for a lasting grant.`)
      else if (d.command) lines.push(`  - command ${d.command} — ${d.reason}${d.codexReason ? ` (Codex: ${d.codexReason})` : ''}`)
      else lines.push(`  - ${d.fileChange ? 'file changes' : 'permission escalation'} — ${d.reason}`)
    }
  }
  if (r.questions.length) {
    lines.push('', r.status === 'needs_input' ? 'Codex stopped to ask (answer in the next call on this session; the thread keeps its context):' : 'Codex asked questions nobody could answer live (it was told to proceed on best judgment):')
    for (const q of r.questions) lines.push(`  - ${q.question}${q.options.length ? ` [${q.options.join(' / ')}]` : ''}`)
    if (r.status !== 'needs_input') lines.push('  Answer them in a follow-up call on the same session.')
  }
  if (r.screenshots.length) lines.push('', `screenshots (${r.screenshots.length}): ${r.screenshots.map((s) => s.path).join(', ')}`)
  const u = r.usage
  const tu = r.turnUsage
  const m = r.metrics
  const tail = []
  if (tu) tail.push(`tokens this turn: ${tu.inputTokens} in (${tu.cachedInputTokens} cached, ${tu.inputTokens - tu.cachedInputTokens} new) / ${tu.outputTokens} out over ${tu.calls} model call${tu.calls === 1 ? '' : 's'}; thread lifetime ${u?.inputTokens ?? '?'} in${r.rateLimit ? `; codex weekly limit ${r.rateLimit.usedPercent}% used` : ''}`)
  else if (u) tail.push(`tokens: ${u.inputTokens ?? '?'} in (${u.cachedInputTokens ?? 0} cached) / ${u.outputTokens ?? '?'} out${r.rateLimit ? `; codex weekly limit ${r.rateLimit.usedPercent}% used` : ''}`)
  if (m) tail.push(`timing: setup ${secs(m.setup_ms)} + boot ${secs(m.boot_ms)} + computer-use ${secs(m.cua_ms)} over ${m.cua_calls} call${m.cua_calls === 1 ? '' : 's'}${m.command_calls ? ` + shell ${secs(m.command_ms)}` : ''} + model ${secs(m.model_ms)}`)
  if (tail.length) lines.push('', ...tail)
  if (r.timelinePath) lines.push(`timeline: ${r.timelinePath}`)
  if (r.disconnected) lines.push('', `NOTE: connection to app-server dropped (${r.disconnected}). The turn may still be running on the daemon; call codex_status.`)
  return lines.join('\n')
}
