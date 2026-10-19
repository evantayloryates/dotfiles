// Anchor daemon: the core behind a private Unix socket, shared by every chat.
// Protocol: one JSON object per line.
//   request  {id, method, params}       method: hello | discover | describe | run | ping
//   progress {id, progress: {...}}
//   response {id, result} | {id, error: {message}}

import { createServer } from 'node:net'
import { chmodSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { createAnchor } from './core.mjs'
import { Dispatcher } from './dispatch.mjs'
import { Alerts } from './alerts.mjs'
import { spawn } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { paths } from './paths.mjs'
import { buildId } from './build.mjs'

if (process.env.ANCHOR_DAEMON_BROKEN === '1') { console.error('[anchord] test hook: refusing to start'); process.exit(1) }
const { servicesDir, stateDir, socket, pidFile } = paths()
const log = (...a) => console.error(new Date().toISOString(), '[anchord]', ...a)
const embeddedRoot = join(stateDir, 'embedded')
const anchor = createAnchor({
  servicesDir, stateDir, mode: 'daemon', log,
  peerStateDirs: () => { try { return readdirSync(embeddedRoot).map((d) => join(embeddedRoot, d)) } catch { return [] } },
})

// Alerts: one per episode, repeated until acknowledged, resolved once.
const alerts = new Alerts(stateDir, { log }).start()
const notify = (kind, text, ticketId) => {
  if (kind === 'ESCALATED' && ticketId) alerts.raise(`ticket:${ticketId}`, 'Anchor: a ticket needs you', text)
  else alerts.raise(`${kind}:${text.slice(0, 60)}`, `Anchor: ${kind.toLowerCase()}`, text)
}
const dispatcher = new Dispatcher({
  book: anchor.book,
  stateDir,
  servicesDir,
  cmd: process.env.ANCHOR_DISPATCH_CMD ? JSON.parse(process.env.ANCHOR_DISPATCH_CMD) : null,
  standardLane: process.env.ANCHOR_STANDARD_LANE === '1',
  maxAttempts: Number(process.env.ANCHOR_DISPATCH_MAX_ATTEMPTS || 3),
  timeoutMs: Number(process.env.ANCHOR_DISPATCH_TIMEOUT_MS || 120_000),
  backoffMs: (process.env.ANCHOR_DISPATCH_BACKOFF_MS || '0,2000,10000').split(',').map(Number),
  log,
  notify,
}).start()
anchor.hooks.ticketOpened = (t) => {
  if (t.lane !== 'hotfix') return
  if (dispatcher.cmd) dispatcher.kick()
  else alerts.raise(`hotfix:${t.id}`, 'Anchor: hotfix needed, no fixer configured', `${t.service}: ${t.title} (${t.id}). No fixer is configured, so nothing will fix it automatically.`)
}
anchor.hooks.ticketChanged = (type, t) => {
  if (['fixed', 'verified'].includes(type)) {
    alerts.resolve(`ticket:${t.id}`, `${t.id} ${t.service} is fixed in ${t.fixedIn}.`)
    alerts.resolve(`hotfix:${t.id}`, `${t.id} ${t.service} is fixed in ${t.fixedIn}.`)
  }
}

// Build id (build.mjs) and draining: a front end that finds this daemon on
// code no longer on disk asks it to drain. It then refuses new work, lets
// in-flight requests and running jobs finish (up to DRAIN_MS), and exits; the
// front end starts a daemon on the current code. Journals carry sessions,
// pins, notes, records and tickets across.
const BUILD = buildId()
const DRAIN_MS = Number(process.env.ANCHOR_DRAIN_MS || 30_000)
let draining = false
let inflight = 0
function drain(to) {
  if (draining) return
  draining = true
  anchor.signal('upgrade', { previous: BUILD, build: to || 'unknown' })
  log('draining: build', BUILD, 'is no longer on disk')
  const until = Date.now() + DRAIN_MS
  const t = setInterval(() => {
    if ((inflight === 0 && anchor.activeJobs() === 0) || Date.now() > until) {
      clearInterval(t)
      log('drained', inflight === 0 && anchor.activeJobs() === 0 ? 'cleanly' : `with ${inflight} requests and ${anchor.activeJobs()} jobs still running`)
      stop()
    }
  }, 100)
}

// The daemon also watches the code itself: chats hold long-lived
// connections and only a new connection makes a front end check, so without
// this an update would wait for someone to open a new chat.
const BUILD_CHECK_MS = Number(process.env.ANCHOR_BUILD_CHECK_MS || 30_000)
setInterval(() => {
  let disk
  try { disk = buildId() } catch { return }
  if (disk !== BUILD) { log('code on disk changed:', BUILD, '->', disk); drain(disk) }
}, BUILD_CHECK_MS).unref()

const server = createServer((conn) => {
  const send = (m) => conn.writable && conn.write(JSON.stringify(m) + '\n')
  createInterface({ input: conn }).on('line', async (line) => {
    let req
    try {
      req = JSON.parse(line)
    } catch {
      return send({ id: null, error: { message: 'parse error' } })
    }
    const { id, method, params = {} } = req
    // Draining: refuse new work before acknowledging it, so the front end
    // knows it never ran and resends it to the next daemon.
    if (draining && !['ping', 'drain'].includes(method)) return send({ id, error: { message: 'draining: the anchor daemon is restarting on new code', draining: true } })
    // Receipt first: a request lost before this ack never ran and may be retried.
    send({ id, ack: true })
    inflight++
    try {
      let result
      if (method === 'ping') result = { ok: true, pid: process.pid, build: BUILD, draining }
      else if (method === 'drain') { drain(params.build); result = { draining: true, inflight: inflight - 1, jobs: anchor.activeJobs() } }
      else if (method === 'hello') result = await anchor.hello(params)
      else if (method === 'discover') result = await anchor.discover(params)
      else if (method === 'describe') result = await anchor.describe(params)
      else if (method === 'run') result = await anchor.run(params, (p) => send({ id, progress: p }))
      else throw new Error(`unknown method ${method}`)
      send({ id, result })
    } catch (err) {
      log(err)
      send({ id, error: { message: err.message } })
    } finally {
      inflight--
    }
  })
  conn.on('error', () => {})
})
// Single instance. A lock directory decides who serves: mkdir is atomic, and
// a dead holder's lock is taken over by renaming it away (only one rename can
// win), so two daemons starting together, even after a crash left stale
// files, never both listen. The lock holder alone may replace the socket.
const lockDir = socket + '.lock'
function alive(pid) {
  try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' }
}
function takeLock(retry = true) {
  try {
    mkdirSync(lockDir)
    writeFileSync(join(lockDir, 'pid'), String(process.pid))
    return true
  } catch (err) {
    if (err.code !== 'EEXIST') throw err
  }
  let holder = 0
  try { holder = Number(readFileSync(join(lockDir, 'pid'), 'utf8')) } catch {}
  if (holder && alive(holder)) return false
  if (!holder) {
    // Lock being created right now by someone else: give it a moment.
    const t = Date.now(); while (Date.now() - t < 50) {}
    try { holder = Number(readFileSync(join(lockDir, 'pid'), 'utf8')) } catch {}
    if (holder && alive(holder)) return false
  }
  const grave = `${lockDir}.stale.${process.pid}`
  try { renameSync(lockDir, grave) } catch { return retry ? takeLock(false) : false }
  rmSync(grave, { recursive: true, force: true })
  return retry ? takeLock(false) : false
}
if (!takeLock()) {
  log('another daemon holds', lockDir, '- exiting')
  process.exit(0)
}
try { unlinkSync(socket) } catch {}
server.listen(socket, () => {
  chmodSync(socket, 0o600)
  writeFileSync(pidFile, String(process.pid))
  log('listening', socket)
})
const stop = () => {
  try { rmSync(lockDir, { recursive: true, force: true }) } catch {}
  dispatcher.stop()
  clearInterval(alerts.timer)
  anchor.shutdown()
  server.close()
  process.exit(0)
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
