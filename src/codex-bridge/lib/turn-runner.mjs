// Runs one Codex turn to completion and turns the event stream into something
// Claude can read in a few hundred tokens.
//
// While the turn runs, the runner is the thread's handler: it answers
// server requests (app elicitations, command/file approvals, user-input
// questions, dynamic tool calls) from the policy, and folds items into a
// step log. Screenshots that Codex emits are written to disk rather than
// stuffed into the transcript.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { decideApp, decideCommand, decideFileChange } from './policy.mjs'
import { ensureScreenshotDir } from './state.mjs'

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
    label = '',
    signal,
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
  }
  const shotDir = ensureScreenshotDir()
  let stepCount = 0
  let resolveDone
  const done = new Promise((r) => (resolveDone = r))

  const handler = {
    onNotification(method, params) {
      switch (method) {
        case 'turn/started':
          result.turnId ||= params.turn?.id || null
          return
        case 'item/started': {
          const it = params.item
          if (it?.type === 'mcpToolCall') onProgress(`${++stepCount}. ${it.arguments?.title || it.tool}`)
          else if (it?.type === 'commandExecution') onProgress(`${++stepCount}. $ ${String(it.command).slice(0, 80)}`)
          return
        }
        case 'item/completed':
          recordItem(params.item, params.completedAtMs)
          return
        case 'turn/completed': {
          const t = params.turn || {}
          result.status = t.status || 'completed'
          if (t.error) result.error = t.error.message || JSON.stringify(t.error)
          resolveDone()
          return
        }
        case 'thread/tokenUsage/updated':
          result.usage = params.tokenUsage?.total || params.total || result.usage
          return
        case 'account/rateLimits/updated': {
          const p = params.rateLimits?.primary
          if (p) result.rateLimit = { usedPercent: p.usedPercent, resetsAt: p.resetsAt, windowMins: p.windowDurationMins }
          return
        }
        case 'error':
          result.error = params.message || JSON.stringify(params)
          return
        default:
          return
      }
    },
    onRequest(req) {
      try {
        answerRequest(req)
      } catch (err) {
        log(`server request ${req.method} failed: ${err.message}`)
        req.fail(-32000, `codex-bridge: ${err.message}`)
      }
    },
    onDisconnect(why) {
      result.disconnected = why
      result.status = 'disconnected'
      resolveDone()
    },
  }

  function recordItem(it, completedAtMs) {
    if (!it) return
    switch (it.type) {
      case 'agentMessage':
        if (it.text) result.finalText = it.text
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
        }
        for (const c of content) {
          if (c?.type === 'image' && c.data) {
            const bytes = Buffer.from(c.data, 'base64')
            // Trust the bytes over the declared type: Computer Use labels JPEG screenshots as PNG.
            const { ext, mimeType } = sniffImage(bytes, c.mimeType)
            const file = join(shotDir, `${threadId.slice(0, 8)}-${completedAtMs || now()}-${result.screenshots.length + 1}.${ext}`)
            writeFileSync(file, bytes)
            result.screenshots.push({ path: file, mimeType, step: result.steps.length + 1, data: c.data })
            step.screenshot = file
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

  function answerRequest(req) {
    const { method, params } = req
    switch (method) {
      case 'mcpServer/elicitation/request': {
        const d = decideApp(policy, grants, params)
        const entry = { app: d.app.displayName, bundleId: d.app.bundleId, tool: d.app.tool, risk: d.app.risk, decision: d.decision, scope: d.persist || null, reason: d.reason }
        if (d.decision === 'accept') {
          result.approvals.push(entry)
          onProgress(`approved ${d.app.displayName} (${d.persist})`)
          req.respond({ action: 'accept', content: {}, _meta: { persist: d.persist } })
        } else {
          result.denied.push(entry)
          onProgress(`denied ${d.app.displayName}`)
          req.respond({ action: 'decline' })
        }
        return
      }
      case 'item/commandExecution/requestApproval':
      case 'execCommandApproval': {
        const d = decideCommand(policy, overrides, params)
        result[d.decision === 'accept' ? 'approvals' : 'denied'].push({ command: String(params.command || '').slice(0, 160), decision: d.decision, reason: d.reason, codexReason: params.reason || null })
        req.respond({ decision: d.decision })
        return
      }
      case 'item/fileChange/requestApproval':
      case 'applyPatchApproval': {
        const d = decideFileChange(policy, overrides, params)
        result[d.decision === 'accept' ? 'approvals' : 'denied'].push({ fileChange: true, decision: d.decision, reason: d.reason })
        req.respond({ decision: d.decision })
        return
      }
      case 'item/permissions/requestApproval':
        result.denied.push({ permissions: true, decision: 'decline', reason: 'permission escalations are never granted by the bridge' })
        req.fail(-32000, 'codex-bridge: permission escalation declined')
        return
      case 'item/tool/requestUserInput': {
        // Claude is blocked inside the tool call, so nobody can answer live.
        // Record the questions and tell Codex to proceed on its own judgment.
        const answers = {}
        for (const q of params.questions || []) {
          result.questions.push({ id: q.id, header: q.header, question: q.question, options: (q.options || []).map((o) => o.label) })
          answers[q.id] = { answers: ['No live answer is available. Proceed with your best judgment, state the assumption in your final message, and stop before any irreversible action.'] }
        }
        req.respond({ answers })
        return
      }
      case 'item/tool/call': {
        if (params.tool === 'report_progress') {
          const msg = String(params.arguments?.message || '').slice(0, 300)
          result.progressNotes.push(msg)
          onProgress(`codex: ${msg}`)
          req.respond({ success: true, contentItems: [{ type: 'inputText', text: 'noted' }] })
        } else {
          req.respond({ success: false, contentItems: [{ type: 'inputText', text: `unknown tool ${params.tool}` }] })
        }
        return
      }
      default:
        log(`unhandled server request ${method}`)
        req.fail(-32601, `codex-bridge does not handle ${method}`)
    }
  }

  const detach = app.attachThread(threadId, handler)
  let timer = null
  let abortListener = null
  try {
    const turnParams = { threadId, input }
    if (outputSchema) turnParams.outputSchema = outputSchema
    if (overrides.model) turnParams.model = overrides.model
    if (overrides.effort) turnParams.effort = overrides.effort
    if (overrides.sandbox) turnParams.sandboxPolicy = sandboxPolicy(overrides.sandbox)
    const startResp = await app.turnStart(turnParams)
    result.turnId = startResp?.turn?.id || result.turnId

    const interrupt = async (why) => {
      try {
        await app.turnInterrupt({ threadId, turnId: result.turnId })
      } catch (err) {
        log(`interrupt after ${why} failed: ${err.message}`)
      }
    }
    timer = setTimeout(() => {
      result.status = 'timeout'
      result.error = `turn exceeded ${Math.round(timeoutMs / 1000)}s; interrupted`
      interrupt('timeout').finally(resolveDone)
    }, timeoutMs)
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
    if (signal && abortListener) signal.removeEventListener('abort', abortListener)
    detach()
    result.durationMs = now() - started
  }
  return result
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
      return { type: 'workspaceWrite', networkAccess: false }
    default:
      return { type: 'readOnly', networkAccess: false }
  }
}

// The compact report Claude reads. Screenshots are referenced by path; the
// caller decides whether to attach any as image content.
export function formatResult(r, { session, label } = {}) {
  const lines = []
  const secs = (r.durationMs / 1000).toFixed(1)
  const toolSteps = r.steps.filter((s) => s.kind === 'tool').length
  lines.push(`status: ${r.status}${r.error ? ` — ${r.error}` : ''} (${secs}s, ${toolSteps} tool call${toolSteps === 1 ? '' : 's'})`)
  lines.push(`session: ${session || '-'}  thread: ${r.threadId}  turn: ${r.turnId || '-'}`)
  lines.push('')
  lines.push(r.finalText ? r.finalText.trim() : '(Codex produced no final message)')
  if (r.steps.length) {
    lines.push('', 'steps:')
    r.steps.forEach((s, i) => {
      const dur = s.durationMs != null ? ` ${(s.durationMs / 1000).toFixed(1)}s` : ''
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
    lines.push('', 'Codex asked questions nobody could answer live (it was told to proceed on best judgment):')
    for (const q of r.questions) lines.push(`  - ${q.question}${q.options.length ? ` [${q.options.join(' / ')}]` : ''}`)
    lines.push('  Answer them in a follow-up call on the same session.')
  }
  if (r.screenshots.length) lines.push('', `screenshots (${r.screenshots.length}): ${r.screenshots.map((s) => s.path).join(', ')}`)
  const u = r.usage
  if (u) lines.push('', `tokens: ${u.inputTokens ?? '?'} in (${u.cachedInputTokens ?? 0} cached) / ${u.outputTokens ?? '?'} out${r.rateLimit ? `; codex weekly limit ${r.rateLimit.usedPercent}% used` : ''}`)
  if (r.disconnected) lines.push('', `NOTE: connection to app-server dropped (${r.disconnected}). The turn may still be running on the daemon; call codex_status.`)
  return lines.join('\n')
}
