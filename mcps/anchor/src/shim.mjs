// Anchor front end: the MCP stdio server a harness spawns, one per chat.
// Three frozen tools. It forwards to the shared daemon, restarts it when it
// is gone, and falls back to an embedded core (degraded mode) when it cannot.

import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, openSync } from 'node:fs'
import { createConnection } from 'node:net'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { randomBytes } from 'node:crypto'
import { serveMcp } from '../../_shared/kernel/mcp-stdio.mjs'
import { paths } from './paths.mjs'
import { buildId } from './build.mjs'
import { PREAMBLE } from './core.mjs'
import { mayRerun, policyForTarget } from './policy.mjs'
import { Alerts } from './alerts.mjs'

const P = paths()
const log = (...a) => console.error('[anchor-shim]', ...a)
const HELLO_BUDGET_MS = Number(process.env.ANCHOR_HELLO_BUDGET_MS || 1500)
const DAEMON_START_MS = Number(process.env.ANCHOR_DAEMON_START_MS || 3000)
let sessionHandle = 'as_' + randomBytes(6).toString('hex')
let conn = null
let embedded = null
let seq = 0
const waiting = new Map()

// Degraded mode is one fleet-wide episode: every degraded chat shares it.
let alerts = null
function notify(kind, text) {
  alerts ||= new Alerts(P.stateDir, { log })
  if (kind === 'DEGRADED') { alerts.raise('degraded', 'Anchor is degraded', text); alerts.start() }
  if (kind === 'RECOVERED') { alerts.resolve('degraded', text); clearInterval(alerts.timer) }
}

function connect() {
  return new Promise((resolve, reject) => {
    const c = createConnection(P.socket)
    c.once('connect', () => {
      createInterface({ input: c }).on('line', (line) => {
        let m
        try {
          m = JSON.parse(line)
        } catch {
          return
        }
        const w = waiting.get(m.id)
        if (!w) return
        if (m.ack) return void (w.acked = true)
        if (m.progress) return w.onProgress?.(m.progress)
        waiting.delete(m.id)
        m.error ? w.reject(Object.assign(new Error(m.error.message), { remote: true, draining: !!m.error.draining })) : w.resolve(m.result)
      })
      c.on('close', () => {
        if (conn === c) conn = null
        for (const [id, w] of waiting) {
          waiting.delete(id)
          w.reject(Object.assign(new Error('daemon connection lost'), { lost: true, delivered: !!w.acked }))
        }
      })
      resolve(c)
    })
    c.once('error', reject)
  })
}

// Updates without restarts. The disk is the source of truth: a daemon whose
// build is no longer on disk is drained and replaced by one started from the
// current code. A front end older than the disk never touches the daemon (a
// daemon only ever starts from disk, so nothing can go back to old code); it
// tells its chat once that a new chat picks up the update.
const MY_BUILD = buildId()
const DRAIN_WAIT_MS = Number(process.env.ANCHOR_DRAIN_WAIT_MS || 35_000)
let staleNote = null
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitGone() {
  const until = Date.now() + DRAIN_WAIT_MS
  while (Date.now() < until) {
    try { const c = await connect(); c.destroy(); await sleep(200) } catch { return true }
  }
  return false
}
// True when the connected daemon runs the code on disk; false when it was
// drained (the caller then starts a new one).
async function upToDate() {
  const disk = buildId()
  let info
  try { info = await request('ping', {}) } catch { return true }
  if (!info?.build || info.build === disk) {
    if (MY_BUILD !== disk && staleNote === null) staleNote = 'This chat started on an older anchor front end. The installed update reaches it in a new chat.'
    return true
  }
  log(`daemon build ${info.build} is not the code on disk (${disk}): draining it`)
  try { await request('drain', { build: disk }) } catch {}
  conn?.destroy()
  conn = null
  await waitGone()
  return false
}

async function ensureDaemon() {
  if (conn) return true
  try {
    conn = await connect()
    if (await upToDate()) return true
  } catch {}
  // Not running: start it (launchd does this in production), then wait.
  // First run: the state folder may not exist yet.
  mkdirSync(P.stateDir, { recursive: true })
  const out = openSync(join(P.stateDir, 'anchord.log'), 'a')
  // --state names the state folder on the command line, so tooling can stop
  // one anchor without touching others (suites, pilot runs).
  spawn(process.execPath, [P.daemon, '--state', P.stateDir], { detached: true, stdio: ['ignore', out, out], env: process.env }).unref()
  const until = Date.now() + DAEMON_START_MS
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 100))
    try {
      conn = await connect()
      return true
    } catch {}
  }
  return false
}

async function enterDegraded(reason) {
  if (embedded) return
  const { createAnchor } = await import('./core.mjs')
  embedded = createAnchor({ servicesDir: P.servicesDir, stateDir: join(P.stateDir, 'embedded', sessionHandle), mode: 'embedded', log, peerStateDirs: () => [P.stateDir] })
  notify('DEGRADED', `entered degraded mode: ${reason}`)
  const timer = setInterval(async () => {
    try {
      conn = await connect()
    } catch {
      return
    }
    clearInterval(timer)
    embedded.shutdown()
    embedded = null
    notify('RECOVERED', 'left degraded mode: daemon reachable again')
  }, 5000)
  timer.unref()
}

function request(method, params, onProgress) {
  const id = ++seq
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject, onProgress })
    const ok = conn.write(JSON.stringify({ id, method, params: { ...params, session: sessionHandle } }) + '\n', (err) => {
      if (!err || !waiting.has(id)) return
      waiting.delete(id)
      reject(Object.assign(new Error('daemon connection lost'), { lost: true, delivered: false }))
    })
    void ok
  })
}

// Safe to repeat after a lost connection: reads, and runs where every call is
// a standard read or carries an idempotency key.
// A delivered call whose connection was lost may have run. Resend it only if
// its operation may be repeated: "natural" always; "keyed" when it carries a
// key (the daemon's record then decides); never "none".
function retryable(method, params) {
  if (method !== 'run') return true
  return [].concat(params.calls || []).every((c) => mayRerun(policyForTarget(P.servicesDir, c.target), !!c.idempotency_key))
}

async function call(method, params, onProgress) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!embedded && !(await ensureDaemon())) await enterDegraded('daemon could not be started')
    if (embedded) {
      const fn = embedded[method]
      return fn({ ...params, session: sessionHandle }, onProgress)
    }
    try {
      const result = await request(method, params, onProgress)
      if (method === 'run' && staleNote) {
        result.notes = result.notes ? `${result.notes}\n- ${staleNote}` : `[anchor notes]\n- ${staleNote}`
        staleNote = false
      }
      return result
    } catch (err) {
      // Refused by a draining daemon before it was acknowledged: it never ran.
      // Wait for that daemon to go, then send it to the next one.
      if (err.draining && attempt === 0) {
        conn?.destroy()
        conn = null
        await waitGone()
        continue
      }
      if (!err.lost) throw err
      conn?.destroy()
      conn = null
      // Never received by the daemon: nothing ran, so retrying is always safe.
      if (attempt === 0 && (!err.delivered || retryable(method, params))) continue
      if (method === 'run') {
        return {
          items: [].concat(params.calls || []).map((c, index) => ({ index, target: c.target, ok: false, code: 'outcome_unknown', error: 'the anchor daemon restarted during this call; its outcome is unknown. Check whether it took effect before repeating it.' })),
          notes: '[anchor notes]\n- The anchor daemon restarted during your last call.',
        }
      }
      throw err
    }
  }
}

function toMcp(result) {
  const blocks = []
  const items = result.items ?? result
  const images = []
  const clean = JSON.parse(JSON.stringify(items, (k, v) => {
    if (v && typeof v === 'object' && v.type === 'image' && v.data) {
      images.push(v)
      return `[image ${images.length}]`
    }
    return v
  }))
  blocks.push({ type: 'text', text: JSON.stringify(clean, null, 1) })
  blocks.push(...images)
  if (result.notes) blocks.push({ type: 'text', text: result.notes })
  return { content: blocks, isError: false }
}

// Instructions: built by the daemon from the harness's own identity, within a
// time budget; the static preamble if the daemon is not reachable in time, so
// a slow daemon never stalls a chat's start.
async function instructions(clientInfo) {
  try {
    const hello = await Promise.race([
      (async () => (await ensureDaemon()) && request('hello', { clientInfo }))(),
      new Promise((r) => setTimeout(() => r(null), HELLO_BUDGET_MS)),
    ])
    if (hello) {
      sessionHandle = hello.session
      return hello.instructions
    }
  } catch (err) {
    log('hello failed:', err.message)
  }
  return PREAMBLE
}

const targetsSchema = {
  type: 'array',
  items: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] },
}

await serveMcp({
  name: 'anchor',
  version: '2026-10-19.001',
  instructions,
  log,
  tools: [
    {
      name: 'anchor_discover',
      description: 'Find fleet services for a need, or list them all. Pass need as one or two sentences about what you are trying to do.',
      inputSchema: { type: 'object', properties: { need: { type: 'string' }, list: { type: 'boolean' } }, additionalProperties: false },
      handler: async (args) => toMcp({ items: await call('discover', args) }),
    },
    {
      name: 'anchor_describe',
      description: 'Describe services or operations: schemas, strategy, class. targets: [{target:"service"} or {target:"service:operation"}].',
      inputSchema: { type: 'object', properties: { targets: targetsSchema }, required: ['targets'], additionalProperties: false },
      handler: async (args) => toMcp(await call('describe', args)),
    },
    {
      name: 'anchor_run',
      description: 'Run operations: calls: [{target:"service:operation", args, idempotency_key?, timeout_ms?}]. Results come back per call; slow calls return a job handle.',
      inputSchema: {
        type: 'object',
        properties: {
          calls: { type: 'array', items: { type: 'object', properties: { target: { type: 'string' }, args: { type: 'object' }, idempotency_key: { type: 'string' }, timeout_ms: { type: 'number' } }, required: ['target'] } },
          deadline_ms: { type: 'number' },
        },
        required: ['calls'],
        additionalProperties: false,
      },
      handler: async (args, ctx) => toMcp(await call('run', args, (p) => ctx.progress(`${p.target}: ${p.message}`))),
    },
  ],
})
process.exit(0)
