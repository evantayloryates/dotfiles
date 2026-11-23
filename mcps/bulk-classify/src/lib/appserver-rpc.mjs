// A private `codex app-server` child over stdio (JSON-RPC, one object per
// line), shaped like mcps/codex-bridge's transport and peer, cut down to what
// classification needs. Never the shared daemon: its environment and
// ~/.codex/config.toml layers (MCP servers, memories, notify) belong to
// Taylor's interactive Codex, and its threads are shared with other clients.
//
// Rules this file keeps:
// - the child gets HOME, PATH, TMPDIR and LANG only (no API key: Codex would
//   bill the API with OPENAI_API_KEY), and runs in a scratch cwd;
// - it runs in its own process group, killed (TERM, then KILL after a grace)
//   on close, on any exit path of this process, and it exits by itself when
//   this process dies (its stdin closes);
// - server -> client requests (approvals, elicitations, tool calls) are always
//   declined: classification needs none;
// - message text is never logged: errors carry method names and codes only.

import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createInterface } from 'node:readline'

export class RpcError extends Error {
  constructor(method, error) {
    super(`${method}: ${typeof error?.message === 'string' ? error.message.slice(0, 200) : 'error'}`)
    this.code = 'rpc_error'
    this.rpcCode = error?.code
    this.data = error?.data
  }
}

// Exit hooks, once per process: every live child's group is killed.
const live = new Set()
let hooked = false
function hookExit() {
  if (hooked) return
  hooked = true
  const killAll = () => {
    for (const c of live) c.kill('SIGKILL')
    live.clear()
  }
  process.on('exit', killAll)
}

const groupKill = (child, sig) => {
  try {
    process.kill(-child.pid, sig)
  } catch {
    try {
      child.kill(sig)
    } catch {}
  }
}

export class AppServerChild extends EventEmitter {
  // bin: codex binary; args: app-server args; env, cwd: as spawned.
  constructor({ bin, args, env, cwd, spawnFn = spawn, maxLine = 64 * 1024 * 1024 }) {
    super()
    this.closed = false
    this.closeReason = null
    this.nextId = 1
    this.pending = new Map()
    this.protocolErrors = 0
    const child = spawnFn(bin, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached: true })
    this.child = child
    this.pid = child.pid
    hookExit()
    const handle = { kill: (s) => groupKill(child, s) }
    this.handle = handle
    live.add(handle)
    let errTail = ''
    child.stderr?.on('data', (d) => (errTail = (errTail + d).slice(-4000)))
    this.stderrTail = () => errTail
    child.stdin.on('error', () => {})
    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity })
    rl.on('line', (line) => {
      if (line.length > maxLine) return this.protocolError('line too long')
      if (!line.trim()) return
      this.onLine(line)
    })
    child.on('error', (e) => this.shut(`spawn failed (${e.code || 'error'})`, e.code === 'ENOENT' || e.code === 'EACCES' ? 'missing' : 'server_down'))
    child.on('exit', (code, sig) => this.shut(`app-server exited (${sig || code})`, 'server_down'))
  }

  protocolError(why) {
    this.protocolErrors++
    this.emit('protocol_error', why)
  }

  onLine(line) {
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      return this.protocolError('unparseable line')
    }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return this.protocolError('not an object')
    if (msg.method !== undefined && msg.id !== undefined) {
      // Server -> client request: decline. Approval-shaped requests get a
      // decline decision; anything else a JSON-RPC error.
      const decline = /approval/i.test(String(msg.method)) ? { result: { decision: 'decline' } } : { error: { code: -32601, message: 'not supported by this client' } }
      this.send({ id: msg.id, ...decline })
      this.emit('server_request', msg.method)
      return
    }
    if (msg.method !== undefined) return this.emit('notification', msg.method, msg.params ?? {})
    if (msg.id !== undefined) {
      const p = this.pending.get(msg.id)
      if (!p) return this.protocolError('response to an unknown id')
      this.pending.delete(msg.id)
      clearTimeout(p.timer)
      if (msg.error) p.reject(new RpcError(p.method, msg.error))
      else if (!('result' in msg)) p.reject(Object.assign(new Error(`${p.method}: malformed response`), { code: 'protocol' }))
      else p.resolve(msg.result)
      return
    }
    this.protocolError('neither request, notification nor response')
  }

  send(obj) {
    if (this.closed) throw Object.assign(new Error('app-server connection is closed'), { code: 'server_down' })
    this.child.stdin.write(`${JSON.stringify(obj)}\n`)
  }

  request(method, params, { timeoutMs = 30_000 } = {}) {
    if (this.closed) return Promise.reject(Object.assign(new Error(`${method}: app-server is closed (${this.closeReason})`), { code: 'server_down' }))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(Object.assign(new Error(`${method}: no response within ${timeoutMs} ms`), { code: 'timeout' }))
      }, timeoutMs)
      this.pending.set(id, { method, resolve, reject, timer })
      try {
        this.send({ id, method, ...(params !== undefined && { params }) })
      } catch (err) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(err)
      }
    })
  }

  notify(method, params) {
    this.send({ method, ...(params !== undefined && { params }) })
  }

  shut(reason, kind = 'server_down') {
    if (this.closed) return
    this.closed = true
    this.closeReason = reason
    this.closeKind = kind
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(Object.assign(new Error(`${p.method}: ${reason}`), { code: kind }))
      this.pending.delete(id)
    }
    this.emit('close', reason, kind)
  }

  // TERM the group, KILL after the grace; resolves when the child is gone.
  close(graceMs = 2000) {
    this.shut('closed by client', 'closed')
    const child = this.child
    return new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        live.delete(this.handle)
        groupKill(child, 'SIGKILL') // stray descendants
        return resolve()
      }
      const hard = setTimeout(() => groupKill(child, 'SIGKILL'), graceMs)
      child.once('exit', () => {
        clearTimeout(hard)
        groupKill(child, 'SIGKILL')
        live.delete(this.handle)
        resolve()
      })
      try {
        child.stdin.end()
      } catch {}
      groupKill(child, 'SIGTERM')
    })
  }
}
