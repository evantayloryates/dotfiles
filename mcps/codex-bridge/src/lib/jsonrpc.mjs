// JSON-RPC peer over a line/message transport, shaped for Codex app-server:
// the server sends responses, notifications AND requests (approvals,
// elicitations, dynamic tool calls), so both directions are handled here.
//
// Wire format: one JSON object per message. app-server omits the "jsonrpc"
// field; it accepts messages with or without it.

import { EventEmitter } from 'node:events'

export class RpcError extends Error {
  constructor(method, error) {
    super(`${method}: ${error?.message || JSON.stringify(error)}`)
    this.code = error?.code
    this.data = error?.data
  }
}

export class JsonRpcPeer extends EventEmitter {
  #transport
  #nextId = 1
  #pending = new Map()
  #closed = false

  // transport: { send(text), close(), on('message'|'close'|'error') }
  constructor(transport, { log = () => {} } = {}) {
    super()
    this.#transport = transport
    this.log = log
    transport.on('message', (raw) => this.#onMessage(raw))
    transport.on('close', (why) => this.#onClose(why))
    transport.on('error', (err) => {
      this.log(`transport error: ${err.message}`)
      this.#onClose(err.message)
    })
  }

  get closed() {
    return this.#closed
  }

  #onMessage(raw) {
    let msg
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'))
    } catch {
      this.log(`unparseable message (${raw.length} bytes)`)
      return
    }
    if (msg.method !== undefined && msg.id !== undefined) {
      // Server -> client request.
      const respond = (result) => this.#send({ id: msg.id, result })
      const fail = (code, message) => this.#send({ id: msg.id, error: { code, message } })
      this.emit('request', { id: msg.id, method: msg.method, params: msg.params ?? {}, respond, fail })
      return
    }
    if (msg.method !== undefined) {
      this.emit('notification', msg.method, msg.params ?? {})
      return
    }
    if (msg.id !== undefined) {
      const entry = this.#pending.get(msg.id)
      if (!entry) return
      this.#pending.delete(msg.id)
      clearTimeout(entry.timer)
      if (msg.error) entry.reject(new RpcError(entry.method, msg.error))
      else entry.resolve(msg.result)
    }
  }

  #onClose(why) {
    if (this.#closed) return
    this.#closed = true
    for (const [id, entry] of this.#pending) {
      clearTimeout(entry.timer)
      entry.reject(new Error(`${entry.method}: connection closed (${why}) before a response arrived`))
      this.#pending.delete(id)
    }
    this.emit('close', why)
  }

  #send(obj) {
    if (this.#closed) throw new Error('JSON-RPC connection is closed')
    this.#transport.send(JSON.stringify(obj))
  }

  request(method, params, { timeoutMs = 120_000 } = {}) {
    const id = this.#nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`${method}: no response within ${timeoutMs} ms`))
      }, timeoutMs)
      this.#pending.set(id, { method, resolve, reject, timer })
      try {
        this.#send({ id, method, params })
      } catch (err) {
        clearTimeout(timer)
        this.#pending.delete(id)
        reject(err)
      }
    })
  }

  notify(method, params) {
    this.#send({ method, params })
  }

  close() {
    this.#transport.close()
    this.#onClose('closed by client')
  }
}
