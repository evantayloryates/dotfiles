// Client for the local ZDR harness (OpenCode server on 127.0.0.1:4096). Lets
// non-ZDR agents (Claude Code, Codex) ask questions without loading raw
// Amplitude/BugSnag/production data into their own context: only the harness's
// de-identified final answer comes back. See apps/zdr-agent/README.md.

import { execFile } from 'node:child_process'

const BASE_URL = process.env.ZDR_HARNESS_URL || 'http://127.0.0.1:4096'
const PASSWORD = process.env.ZDR_HARNESS_PASSWORD
const WORK_DIR = process.env.ZDR_HARNESS_WORK_DIR || `${process.env.HOME}/.zdr-harness/work`
// How long zdr_ask or zdr_read stays on the line. Under Codex's 600 s tool
// limit, so the caller gets "still running" rather than a dead tool call.
const ASK_TIMEOUT_MS = Number(process.env.ZDR_ASK_TIMEOUT_MS || 9 * 60 * 1000)
const REQUEST_TIMEOUT_MS = Number(process.env.ZDR_REQUEST_TIMEOUT_MS || 60 * 1000)
const POLL_MS = Number(process.env.ZDR_POLL_MS || 2000)
// A run can read as idle just before its messages land, or just after a step.
const SETTLE_MS = Number(process.env.ZDR_SETTLE_MS || 30 * 1000)
// The harness runs two agents. `zdr` de-identifies its answer to HIPAA Safe
// Harbor because this bridge hands it to a context with no BAA; `analyst`
// answers in full for the app UI. Only `zdr` output may cross this boundary.
export const ZDR_AGENT = 'zdr'
export const SESSION_ID = /^ses_[A-Za-z0-9]+$/
const deepLink = (id) => `open -a "ZDR Harness" --args --session ${id}`

const log = (...args) => console.error('[zdr-agent]', ...args)


const AUTH = `Basic ${Buffer.from(`opencode:${PASSWORD}`).toString('base64')}`

// ---------------------------------------------------------------------------
// Harness HTTP client

export class HarnessError extends Error {
  expected = true
}

// Every request is short. Never hold one open for a whole run: fetch gives up
// on response headers after 300 s, whatever signal it was handed.
export async function harness(method, path, { body, signal } = {}) {
  let res
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: {
        authorization: AUTH,
        'x-opencode-directory': WORK_DIR,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (err) {
    if (signal?.aborted) throw err
    if (timeout.aborted) throw new HarnessError(`ZDR harness did not respond to ${method} ${path} within ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s.`)
    throw new HarnessError(
      `ZDR harness is not reachable at ${BASE_URL} (${err.cause?.code || err.message}). ` +
        'Check it with: zdr-harness status'
    )
  }
  const text = await res.text()
  if (res.status === 401) throw new HarnessError('ZDR harness rejected the password (401).')
  if (!res.ok) throw new HarnessError(`ZDR harness ${method} ${path} failed: HTTP ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

// Returns a note about degraded servers, or '' when everything is connected.
// A single broken server does not block the question: an Amplitude answer
// should not fail because CloudWatch is down. Only a harness with nothing
// connected is a hard failure.
async function ensureMcpConnected(signal) {
  let status = await harness('GET', '/mcp', { signal })
  const names = Object.keys(status || {})
  if (!names.length) throw new HarnessError('ZDR harness reports no MCP servers at all.')

  const isDown = (name) => status?.[name]?.status !== 'connected'
  const broken = names.filter(isDown)
  for (const name of broken) {
    if (status?.[name]?.status === 'needs_auth') continue
    await harness('POST', `/mcp/${name}/connect`, { signal }).catch((err) => log(`reconnect ${name} failed:`, err.message))
  }
  if (broken.length) status = await harness('GET', '/mcp', { signal })

  const down = names.filter(isDown).map(
    (name) => `${name}: ${status?.[name]?.status || 'missing'}${status?.[name]?.error ? ` (${status[name].error})` : ''}`
  )
  if (down.length === names.length) {
    throw new HarnessError(
      `No ZDR harness MCP server is connected — ${down.join('; ')}. ` +
        'Check with: zdr-harness reload-auth'
    )
  }
  if (down.length) {
    log(`degraded: ${down.join('; ')}`)
    return `[zdr-agent] Degraded harness: ${down.join('; ')}. Answer used the remaining servers.\n\n`
  }
  return ''
}

// Second layer behind the harness agent's answer rule. Only obvious contact
// details are scrubbed; issue/chart IDs are deliberately left intact.
export function scrub(text) {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[redacted-email]')
    .replace(/(?<![\w.])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\w.])/g, '[redacted-phone]')
}

export async function ask({ question, session_id, format }, signal) {
  const degraded = await ensureMcpConnected(signal)
  let sessionId = session_id

  // A session started in the app answers without de-identification. Refuse to
  // continue one here rather than relay its reply.
  if (sessionId) {
    if (!SESSION_ID.test(sessionId)) throw new HarnessError(`"${sessionId}" is not a session id`)
    const existing = await harness('GET', `/session/${encodeURIComponent(sessionId)}`, { signal })
    if (existing?.agent && existing.agent !== ZDR_AGENT) {
      throw new HarnessError(
        `Session ${sessionId} belongs to the "${existing.agent}" agent, which answers in full detail for the ` +
          'app and may contain client data. It cannot be relayed here. Read it yourself with:\n  ' +
          deepLink(sessionId) +
          '\nAsk a fresh question instead and a new de-identified session will be created.'
      )
    }
    if (await isBusy(sessionId, signal)) {
      throw new HarnessError(
        `Session ${sessionId} is still working on the last question. Collect that answer first with zdr_read and wait_seconds.`
      )
    }
  }

  if (!sessionId) {
    const session = await harness('POST', '/session', {
      body: { title: `zdr-agent: ${question.slice(0, 60)}` },
      signal,
    })
    sessionId = session.id
  }

  const text =
    format === 'json'
      ? `${question}\n\nReturn only a single JSON object, no prose around it, with keys: ` +
        '"answer" (string), "figures" (object of named numbers), "filters" (object: project, date range, ' +
        'any filters applied), "withheld" (array of field names you could not include under the answer rule).'
      : question
  const before = new Set((session_id ? await listMessages(sessionId, signal) : []).map((m) => m.info?.id))
  await harness('POST', `/session/${encodeURIComponent(sessionId)}/prompt_async`, {
    body: { agent: ZDR_AGENT, parts: [{ type: 'text', text }] },
    signal,
  })

  const reply = await waitForRun(sessionId, ASK_TIMEOUT_MS, signal, (messages) => {
    const asked = messages.find((m) => m.info?.role === 'user' && !before.has(m.info?.id))
    return asked && messages.findLast((m) => m.info?.role === 'assistant' && m.info?.parentID === asked.info.id)
  })
  if (!reply) return stillRunning(sessionId, ASK_TIMEOUT_MS)

  if (reply.info?.error) {
    const e = reply.info.error
    throw new HarnessError(`ZDR harness error (session ${sessionId}): ${e.data?.message || e.name || JSON.stringify(e)}`)
  }
  // Belt and braces: the reply itself records which agent wrote it.
  const wroteIt = reply.info?.agent
  if (wroteIt && wroteIt !== ZDR_AGENT) {
    return (
      `The harness answered with the "${wroteIt}" agent, whose replies are not de-identified, so the text is ` +
      `not relayed. Read it in the app:\n  ${deepLink(sessionId)}\n\nsession_id: ${sessionId}`
    )
  }

  return (
    `${degraded}${scrub(textOf(reply) || '(the harness returned no text)')}\n\n` +
    `session_id: ${sessionId}\nfull detail (unredacted, for Taylor only): ${deepLink(sessionId)}`
  )
}

const listMessages = async (sessionId, signal) =>
  (await harness('GET', `/session/${encodeURIComponent(sessionId)}/message`, { signal })) || []

async function isBusy(sessionId, signal) {
  const status = await harness('GET', '/session/status', { signal })
  const type = status?.[sessionId]?.type
  return Boolean(type && type !== 'idle')
}

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })

// Polls until the session is idle and `pick` finds its finished reply. Returns
// null when the budget runs out: the run lives in the harness, so running long
// or losing the harness for a moment is not a failure. Throws only when the run
// has clearly ended without an answer.
async function waitForRun(sessionId, budgetMs, signal, pick) {
  const deadline = Date.now() + budgetMs
  let idleSince = null
  while (Date.now() < deadline) {
    await sleep(POLL_MS, signal)
    let reply
    try {
      if (await isBusy(sessionId, signal)) {
        idleSince = null
        continue
      }
      reply = pick(await listMessages(sessionId, signal))
    } catch (err) {
      if (signal?.aborted) throw err
      log(`poll ${sessionId} failed:`, err.message)
      continue
    }
    if (reply?.info?.error || (reply?.info?.time?.completed && reply.info.finish !== 'tool-calls')) return reply
    idleSince ??= Date.now()
    if (Date.now() - idleSince >= SETTLE_MS) {
      throw new HarnessError(`ZDR harness session ${sessionId} stopped without a final answer. Ask again.`)
    }
  }
  return null
}

const stillRunning = (sessionId, waitedMs) =>
  `Still running after ${Math.round(waitedMs / 1000)}s. Nothing failed and there is no need to ask again. ` +
  `Collect the answer with zdr_read, session_id ${sessionId} and wait_seconds 300.\n\nsession_id: ${sessionId}`

export function openInApp(sessionId) {
  if (!SESSION_ID.test(sessionId)) throw new HarnessError(`"${sessionId}" is not a session id`)
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/open', ['-a', 'ZDR Harness', '--args', '--session', sessionId], (err) => {
      if (err) return reject(new HarnessError(`Could not open ZDR Harness.app: ${err.message}`))
      resolve(`Opened ${sessionId} in ZDR Harness.app. The full, unredacted session is on Taylor's screen.`)
    })
  })
}

export async function listSessions(signal) {
  const [sessions, status] = await Promise.all([
    harness('GET', '/session?limit=20', { signal }),
    harness('GET', '/session/status', { signal }).catch(() => ({})),
  ])
  if (!sessions?.length) return 'No ZDR harness sessions yet.'
  return sessions
    .map((s) => {
      const state = status?.[s.id]?.type && status[s.id].type !== 'idle' ? 'busy' : 'idle'
      return `${s.id}  ${new Date(s.time?.updated || s.time?.created).toISOString()}  ${state}  ${s.agent || '?'}  ${s.title || ''}`
    })
    .join('\n')
}

function checkId(sessionId) {
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) throw new HarnessError(`"${sessionId}" is not a session id`)
}

const textOf = (message) =>
  (message?.parts || [])
    .filter((part) => part.type === 'text' && !part.synthetic && !part.ignored)
    .map((part) => part.text)
    .join('\n')
    .trim()

// Only the question and the zdr agent's final answer leave the harness: never
// tool parts, never another agent's text.
export async function readSession(sessionId, signal, { waitSeconds = 0 } = {}) {
  checkId(sessionId)
  const session = await harness('GET', `/session/${encodeURIComponent(sessionId)}`, { signal })
  let messages = await listMessages(sessionId, signal)
  // Fail closed: the session must be positively owned by the zdr agent, and
  // every reply in it must be the zdr agent's. A missing field refuses.
  const refuseUnlessZdr = () => {
    const replies = messages.filter((m) => m.info?.role === 'assistant')
    if (session?.agent !== ZDR_AGENT || replies.some((m) => m.info?.agent !== ZDR_AGENT)) {
      throw new HarnessError(`Session ${sessionId} is not a de-identified zdr session and cannot be read here. Open it with zdr_open.`)
    }
    return replies
  }
  refuseUnlessZdr()

  const budgetMs = Math.min(Math.max(waitSeconds, 0) * 1000, ASK_TIMEOUT_MS)
  let busy = await isBusy(sessionId, signal)
  const deadline = Date.now() + budgetMs
  while (busy && Date.now() < deadline) {
    await sleep(POLL_MS, signal)
    busy = await isBusy(sessionId, signal).catch((err) => {
      if (signal?.aborted) throw err
      return true
    })
  }
  if (!busy) messages = await listMessages(sessionId, signal)
  const replies = refuseUnlessZdr()

  const question = textOf(messages.find((m) => m.info?.role === 'user'))
  // Text from a run still in progress is narration, not the answer.
  const answer = busy ? '(still running: call again with wait_seconds)' : textOf(replies.findLast((m) => textOf(m))) || '(no final answer)'
  return (
    `state: ${busy ? 'running' : 'finished'}\nquestion: ${scrub(question || '(none)')}\n\nanswer: ${scrub(answer)}\n\n` +
    `session_id: ${sessionId}\ntitle: ${scrub(session?.title || '')}`
  )
}

export async function abortSession(sessionId, signal) {
  checkId(sessionId)
  await harness('POST', `/session/${encodeURIComponent(sessionId)}/abort`, { signal })
  return `Asked the harness to stop session ${sessionId}.`
}
