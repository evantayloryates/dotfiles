// One connection to a Codex app-server, with thread-scoped routing.
//
// Preferred transport is the managed daemon (`codex app-server daemon`):
// it outlives this process, several bridges can share it, and its threads
// show up in Codex's own history. Fallback is a private stdio child.
//
// Notifications and server requests carry a threadId; each is routed to the
// handler registered for that thread. Anything for a thread we do not own
// (another client's thread on the shared daemon) is dropped.

import { EventEmitter } from 'node:events'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { cliVersion, daemonRestart, daemonSocketPath, daemonStart, daemonStatus, daemonUpdate, resolveCodexBinary } from './codex-paths.mjs'
import { JsonRpcPeer } from './jsonrpc.mjs'
import { STATE_DIR } from './state.mjs'
import { connectDaemonTransport, installExitHooks, onExitCleanup, spawnStdioTransport } from './transport.mjs'

export const BRIDGE_VERSION = '0.1.0'

// Semver-ish compare on the numeric prefix (0.158.0-alpha.2.1 > 0.149.0).
export function newerThan(a, b) {
  const pa = String(a).split(/[.-]/).map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n))
  const pb = String(b).split(/[.-]/).map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n))
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x > y
  }
  return false
}

const isBundled = (bin) => String(bin).includes('.app/Contents/')

// What to do about the shared daemon's build. Pure, so it can be tested.
//   connect  versions match (or the daemon does not say): use it
//   refuse   it differs and this binary may not replace it
//   skip     an upgrade to this bundled version was already tried: use the daemon as it is
//   check    an upgrade is wanted: count running turns first (busy still unknown)
//   defer    turns are running, or could not be counted: use the daemon as it is
//   upgrade  idle daemon on an older build: move it to the bundled CLI
export function planDaemonUpgrade({ cliVersion, bin, daemonVersion, attempted = false, busy }) {
  if (!daemonVersion || daemonVersion === cliVersion) return { action: 'connect' }
  // Never replace a shared daemon with a different build from here: the
  // configured binary may be the wrong one (a standalone CLI cannot drive
  // Computer Use). Upgrade only to a newer bundled CLI, which is known to work.
  if (!newerThan(cliVersion, daemonVersion) || !isBundled(bin)) {
    return { action: 'refuse', reason: `daemon runs ${daemonVersion} but this bridge's codex binary is ${cliVersion} (${bin}); not touching the shared daemon` }
  }
  if (attempted) return { action: 'skip', reason: `daemon runs ${daemonVersion}, bundled CLI is ${cliVersion}; an upgrade to ${cliVersion} was already tried, so using the daemon as it is` }
  if (busy === undefined) return { action: 'check' }
  if (busy === null || busy > 0) {
    const why = busy === null ? 'could not check it for running turns' : `${busy} turn(s) running on it`
    return { action: 'defer', reason: `daemon runs ${daemonVersion}, bundled CLI is ${cliVersion}; deferring the upgrade (${why}) and using the daemon as it is` }
  }
  return { action: 'upgrade' }
}

// After an upgrade step: is the daemon serving the bundled build yet?
// `relaunch` means the package is pinned but the old process still serves.
export function upgradeOutcome(cliVersion, status) {
  if (status?.appServerVersion === cliVersion) return 'upgraded'
  if (status?.managedCodexVersion === cliVersion) return 'relaunch'
  return 'failed'
}

// Turns running on the daemon, across every client: a loaded thread whose
// status is `active` has one. `request(method, params)` is a JSON-RPC call.
export async function countActiveThreads(request) {
  let active = 0
  let cursor = null
  do {
    const page = await request('thread/loaded/list', cursor ? { cursor } : {})
    for (const threadId of page?.data || []) {
      const { thread } = await request('thread/read', { threadId, includeTurns: false })
      if (!thread?.status) throw new Error(`thread/read ${threadId} reports no status`)
      if (thread.status.type === 'active') active++
    }
    cursor = page?.nextCursor || null
  } while (cursor)
  return active
}

// One upgrade attempt per bundled version, across every bridge process: the
// marker is created exclusively before the attempt and keeps its outcome.
export function upgradeMarkers(dir = STATE_DIR) {
  const file = (version) => join(dir, `daemon-upgrade-${version}.json`)
  return {
    file,
    read(version) {
      try {
        return JSON.parse(readFileSync(file(version), 'utf8'))
      } catch {
        return null
      }
    },
    claim(version) {
      mkdirSync(dir, { recursive: true })
      try {
        writeFileSync(file(version), JSON.stringify({ version, pid: process.pid, startedAt: new Date().toISOString() }), { flag: 'wx' })
        return true
      } catch (err) {
        if (err.code === 'EEXIST') return false
        throw err
      }
    },
    settle(version, outcome, detail) {
      const prev = this.read(version) || { version }
      writeFileSync(file(version), JSON.stringify({ ...prev, outcome, detail, settledAt: new Date().toISOString() }))
    },
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Bring the shared daemon onto the bundled CLI's build when that is safe,
// at most once per bundled version. Returns the daemon status to connect
// with, or throws when this binary must not use the daemon.
export async function ensureDaemonVersion({ bin, cliVersion, status, ops, busyCount, markers, log = () => {}, pendingWaitMs = 60_000, pollMs = 2_000 }) {
  const input = { cliVersion, bin, daemonVersion: status.appServerVersion }
  let plan = planDaemonUpgrade({ ...input, attempted: !!markers.read(cliVersion) })
  if (plan.action === 'check') {
    const busy = await busyCount().catch((err) => {
      log(`counting running turns on the daemon failed: ${err.message}`)
      return null
    })
    plan = planDaemonUpgrade({ ...input, busy })
  }
  if (plan.action === 'upgrade' && !markers.claim(cliVersion)) {
    plan = planDaemonUpgrade({ ...input, attempted: true })
  }
  switch (plan.action) {
    case 'connect':
      return status
    case 'refuse':
      throw new Error(plan.reason)
    case 'defer':
      log(plan.reason)
      return status
    case 'skip': {
      // Another bridge may be upgrading right now: give it a moment rather
      // than connect to a daemon that is about to restart.
      const marker = markers.read(cliVersion)
      const fresh = marker && Date.now() - Date.parse(marker.startedAt) < 5 * 60_000
      if (fresh && !marker.outcome) {
        for (let waited = 0; waited < pendingWaitMs; waited += pollMs) {
          await sleep(pollMs)
          status = await ops.status()
          if (status.appServerVersion === cliVersion) return status
        }
      }
      log(`${plan.reason} (${marker?.outcome || 'in progress elsewhere'})`)
      return status
    }
  }
  log(`daemon runs ${status.appServerVersion}, bundled CLI is ${cliVersion}; updating the daemon package from the bundled CLI`)
  let outcome = 'failed'
  let detail = ''
  try {
    await ops.update()
    status = await ops.status()
    outcome = upgradeOutcome(cliVersion, status)
    if (outcome === 'relaunch') {
      status = status.status === 'running' ? await ops.restart() : await ops.start()
      status = await ops.status()
      outcome = upgradeOutcome(cliVersion, status) === 'upgraded' ? 'upgraded' : 'failed'
    }
  } catch (err) {
    detail = err.message
    status = await ops.status().catch(() => status)
  }
  markers.settle(cliVersion, outcome, detail || `daemon reports ${status.appServerVersion}`)
  if (outcome === 'upgraded') {
    log(`daemon upgraded to ${cliVersion}`)
  } else {
    log(`daemon upgrade to ${cliVersion} did not take (daemon reports ${status.appServerVersion ?? status.status}${detail ? `; ${detail}` : ''}); using it as it is and not retrying for this version (${markers.file(cliVersion)})`)
  }
  if (status.status !== 'running') status = await ops.start()
  return status
}

export class AppServer extends EventEmitter {
  #peer = null
  #threadHandlers = new Map()
  #removeCleanup = null
  info = null
  transportKind = null
  bin = null
  version = null

  // daemonOps, daemonBusy and markers exist for tests; the defaults drive
  // the real CLI, the real daemon and the state dir.
  constructor({ log = () => {}, mode = process.env.CODEX_BRIDGE_TRANSPORT || 'auto', stderrPath, daemonOps, daemonBusy, markers } = {}) {
    super()
    this.log = log
    this.mode = mode
    this.stderrPath = stderrPath
    this.daemonOps = daemonOps
    this.daemonBusy = daemonBusy || (() => this.#daemonBusyCount())
    this.markers = markers || upgradeMarkers()
    installExitHooks(log)
  }

  get connected() {
    return !!this.#peer && !this.#peer.closed
  }

  async connect() {
    if (this.connected) return this
    this.bin = resolveCodexBinary()
    this.version = await cliVersion(this.bin)
    let transport = null
    if (this.mode === 'auto' || this.mode === 'daemon') {
      try {
        transport = await this.#daemonTransport()
      } catch (err) {
        if (this.mode === 'daemon') throw err
        this.log(`daemon unavailable (${err.message}); falling back to a private app-server child`)
      }
    }
    if (!transport) transport = spawnStdioTransport(this.bin, { log: this.log, stderrPath: this.stderrPath })
    this.transportKind = transport.kind
    this.#removeCleanup?.()
    this.#removeCleanup = onExitCleanup(() => transport.close())

    const peer = new JsonRpcPeer(transport, { log: this.log })
    peer.on('notification', (method, params) => this.#route('notification', method, params))
    peer.on('request', (req) => this.#route('request', req.method, req.params, req))
    peer.on('close', (why) => {
      this.log(`app-server connection closed: ${why}`)
      this.#peer = null
      for (const h of this.#threadHandlers.values()) h.onDisconnect?.(why)
      this.emit('close', why)
    })
    this.#peer = peer
    this.info = await peer.request('initialize', {
      clientInfo: { name: 'codex-bridge', title: 'Claude → Codex bridge', version: BRIDGE_VERSION },
      capabilities: { experimentalApi: true },
    })
    peer.notify('initialized')
    return this
  }

  // Start the daemon if needed and bring it onto the bundled CLI's build: a
  // stale daemon (left by an older app version) would silently serve an old
  // protocol.
  async #daemonTransport() {
    const bin = this.bin
    const ops = this.daemonOps || {
      status: () => daemonStatus(bin),
      start: () => daemonStart(bin),
      restart: () => daemonRestart(bin),
      update: () => daemonUpdate(bin),
    }
    let status = await ops.status()
    if (status.status !== 'running') {
      this.log('starting managed app-server daemon')
      status = await ops.start()
    }
    status = await ensureDaemonVersion({ bin, cliVersion: this.version, status, ops, busyCount: this.daemonBusy, markers: this.markers, log: this.log })
    const sock = daemonSocketPath()
    if (!sock) throw new Error(`daemon reports ${status.status} but no control socket exists`)
    return connectDaemonTransport(sock, { log: this.log })
  }

  // A short side connection to count running turns before an upgrade.
  async #daemonBusyCount() {
    const sock = daemonSocketPath()
    if (!sock) throw new Error('no control socket')
    const peer = new JsonRpcPeer(await connectDaemonTransport(sock), { log: this.log })
    try {
      const opts = { timeoutMs: 15_000 }
      await peer.request('initialize', { clientInfo: { name: 'codex-bridge-probe', title: 'codex-bridge upgrade check', version: BRIDGE_VERSION }, capabilities: { experimentalApi: true } }, opts)
      peer.notify('initialized')
      return await countActiveThreads((method, params) => peer.request(method, params, opts))
    } finally {
      peer.close()
    }
  }

  #route(kind, method, params, req) {
    const threadId = params?.threadId || params?.thread?.id || null
    const handler = threadId ? this.#threadHandlers.get(threadId) : null
    if (handler) {
      if (kind === 'notification') handler.onNotification(method, params)
      else handler.onRequest(req)
      return
    }
    if (kind === 'request') {
      // A question about a thread nobody here owns. Never approve blind.
      this.log(`declining unrouted server request ${method} for thread ${threadId}`)
      req.fail(-32000, 'codex-bridge: no handler for this thread')
      return
    }
    if (!threadId) this.emit('global', method, params)
  }

  attachThread(threadId, handler) {
    this.#threadHandlers.set(threadId, handler)
    return () => this.#threadHandlers.delete(threadId)
  }

  request(method, params, opts) {
    if (!this.connected) throw new Error('not connected to app-server')
    return this.#peer.request(method, params, opts)
  }

  threadStart(params) {
    return this.request('thread/start', params)
  }
  threadResume(params) {
    return this.request('thread/resume', params)
  }
  threadRead(threadId) {
    return this.request('thread/read', { threadId, includeTurns: false })
  }
  threadList(params = {}) {
    return this.request('thread/list', params)
  }
  loadedThreads() {
    return this.request('thread/loaded/list', {})
  }
  turnStart(params) {
    return this.request('turn/start', params)
  }
  turnSteer(params) {
    return this.request('turn/steer', params)
  }
  turnInterrupt(params) {
    return this.request('turn/interrupt', params)
  }
  modelList() {
    return this.request('model/list', {})
  }

  close() {
    this.#peer?.close()
    this.#peer = null
  }
}
