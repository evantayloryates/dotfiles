// Client for the local ZDR harness (OpenCode server on 127.0.0.1:4096). Lets
// non-ZDR agents (Claude Code, Codex) ask questions without loading raw
// Amplitude/BugSnag/production data into their own context: only the harness's
// de-identified final answer comes back. See src/zdr-harness/README.md.

import { execFile } from 'node:child_process'

const BASE_URL = process.env.ZDR_HARNESS_URL || 'http://127.0.0.1:4096'
const PASSWORD = process.env.ZDR_HARNESS_PASSWORD
const WORK_DIR = process.env.ZDR_HARNESS_WORK_DIR || `${process.env.HOME}/.zdr-harness/work`
const ASK_TIMEOUT_MS = Number(process.env.ZDR_ASK_TIMEOUT_MS || 10 * 60 * 1000)
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

export async function harness(method, path, { body, signal } = {}) {
  let res
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      signal,
      headers: {
        authorization: AUTH,
        'x-opencode-directory': WORK_DIR,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') throw err
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
  }

  if (!sessionId) {
    const session = await harness('POST', '/session', {
      body: { title: `zdr-agent: ${question.slice(0, 60)}` },
      signal,
    })
    sessionId = session.id
  }

  const timeout = AbortSignal.timeout(ASK_TIMEOUT_MS)
  const combined = AbortSignal.any([signal, timeout])
  let reply
  try {
    const text =
      format === 'json'
        ? `${question}\n\nReturn only a single JSON object, no prose around it, with keys: ` +
          '"answer" (string), "figures" (object of named numbers), "filters" (object: project, date range, ' +
          'any filters applied), "withheld" (array of field names you could not include under the answer rule).'
        : question
    reply = await harness('POST', `/session/${encodeURIComponent(sessionId)}/message`, {
      body: { agent: ZDR_AGENT, parts: [{ type: 'text', text }] },
      signal: combined,
    })
  } catch (err) {
    if (timeout.aborted) {
      throw new HarnessError(
        `ZDR harness did not answer within ${Math.round(ASK_TIMEOUT_MS / 1000)}s. ` +
          `It may still be working; ask a follow-up with session_id ${sessionId}.`
      )
    }
    throw err
  }

  if (reply?.info?.error) {
    const e = reply.info.error
    throw new HarnessError(`ZDR harness error (session ${sessionId}): ${e.data?.message || e.name || JSON.stringify(e)}`)
  }
  // Belt and braces: the reply itself records which agent wrote it.
  const wroteIt = reply?.info?.agent
  if (wroteIt && wroteIt !== ZDR_AGENT) {
    return (
      `The harness answered with the "${wroteIt}" agent, whose replies are not de-identified, so the text is ` +
      `not relayed. Read it in the app:\n  ${deepLink(sessionId)}\n\nsession_id: ${sessionId}`
    )
  }

  const answer = (reply?.parts || [])
    .filter((part) => part.type === 'text' && !part.synthetic && !part.ignored)
    .map((part) => part.text)
    .join('\n')
    .trim()
  return (
    `${degraded}${scrub(answer || '(the harness returned no text)')}\n\n` +
    `session_id: ${sessionId}\nfull detail (unredacted, for Taylor only): ${deepLink(sessionId)}`
  )
}

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
      const state = status?.[s.id]?.type === 'busy' ? 'busy' : 'idle'
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
export async function readSession(sessionId, signal) {
  checkId(sessionId)
  const session = await harness('GET', `/session/${encodeURIComponent(sessionId)}`, { signal })
  const messages = (await harness('GET', `/session/${encodeURIComponent(sessionId)}/message`, { signal })) || []
  // Fail closed: the session must be positively owned by the zdr agent, and
  // every reply in it must be the zdr agent's. A missing field refuses.
  const replies = messages.filter((m) => m.info?.role === 'assistant')
  if (session?.agent !== ZDR_AGENT || replies.some((m) => m.info?.agent !== ZDR_AGENT)) {
    throw new HarnessError(`Session ${sessionId} is not a de-identified zdr session and cannot be read here. Open it with zdr_open.`)
  }
  const question = textOf(messages.find((m) => m.info?.role === 'user'))
  const answer = textOf(replies.findLast((m) => textOf(m)))
  return (
    `question: ${scrub(question || '(none)')}\n\nanswer: ${scrub(answer || '(no final answer yet)')}\n\n` +
    `session_id: ${sessionId}\ntitle: ${scrub(session?.title || '')}`
  )
}

export async function abortSession(sessionId, signal) {
  checkId(sessionId)
  await harness('POST', `/session/${encodeURIComponent(sessionId)}/abort`, { signal })
  return `Asked the harness to stop session ${sessionId}.`
}
