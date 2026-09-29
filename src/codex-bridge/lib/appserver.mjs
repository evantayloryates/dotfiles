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

import { cliVersion, daemonRestart, daemonSocketPath, daemonStart, daemonStatus, resolveCodexBinary } from './codex-paths.mjs'
import { JsonRpcPeer } from './jsonrpc.mjs'
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

export class AppServer extends EventEmitter {
  #peer = null
  #threadHandlers = new Map()
  #removeCleanup = null
  info = null
  transportKind = null
  bin = null
  version = null

  constructor({ log = () => {}, mode = process.env.CODEX_BRIDGE_TRANSPORT || 'auto', stderrPath } = {}) {
    super()
    this.log = log
    this.mode = mode
    this.stderrPath = stderrPath
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

  // Start the daemon if needed and make sure it runs the same build as the
  // bundled CLI: a stale daemon (left by an older app version) would silently
  // serve an old protocol.
  async #daemonTransport() {
    let status = await daemonStatus(this.bin)
    if (status.status !== 'running') {
      this.log('starting managed app-server daemon')
      status = await daemonStart(this.bin)
    }
    if (status.appServerVersion && status.appServerVersion !== this.version) {
      // Never replace a shared daemon with a different build from here: the
      // configured binary may be the wrong one (a standalone CLI cannot
      // drive Computer Use). Restart only when the daemon is older than the
      // bundled CLI that is known to work; otherwise leave it and say so.
      if (newerThan(this.version, status.appServerVersion) && this.bin.includes('.app/Contents/')) {
        this.log(`daemon runs ${status.appServerVersion}, bundled CLI is ${this.version}; restarting daemon on the newer build`)
        status = await daemonRestart(this.bin)
      } else {
        throw new Error(`daemon runs ${status.appServerVersion} but this bridge's codex binary is ${this.version} (${this.bin}); not touching the shared daemon`)
      }
    }
    const sock = daemonSocketPath()
    if (!sock) throw new Error(`daemon reports ${status.status} but no control socket exists`)
    return connectDaemonTransport(sock, { log: this.log })
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
