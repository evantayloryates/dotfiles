// A minimal RFC 6455 WebSocket client over a Unix domain socket.
//
// Codex app-server's `--listen unix://` transport is WebSocket framing (an HTTP
// 101 upgrade on the socket), not raw JSON lines, and Node's global WebSocket
// cannot dial a unix path. This is the subset the bridge needs: text frames,
// client-side masking, fragmentation, ping/pong, close. No extensions.

import { createHash, randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createConnection } from 'node:net'

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const OP = { CONT: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xa }

export class WsUnixClient extends EventEmitter {
  #socket
  #buffer = Buffer.alloc(0)
  #fragments = []
  #fragmentOp = null
  #open = false
  #closed = false

  static connect(path, { timeoutMs = 10_000, maxMessageBytes = 64 * 1024 * 1024 } = {}) {
    return new Promise((resolve, reject) => {
      const client = new WsUnixClient(maxMessageBytes)
      const timer = setTimeout(() => reject(new Error(`WebSocket handshake to ${path} timed out`)), timeoutMs)
      client.once('open', () => {
        clearTimeout(timer)
        resolve(client)
      })
      client.once('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      client.#dial(path)
    })
  }

  constructor(maxMessageBytes) {
    super()
    this.maxMessageBytes = maxMessageBytes
  }

  #dial(path) {
    const key = randomBytes(16).toString('base64')
    const expectAccept = createHash('sha1').update(key + GUID).digest('base64')
    this.#socket = createConnection(path)
    this.#socket.on('error', (err) => {
      if (!this.#closed) this.emit('error', err)
    })
    this.#socket.on('close', () => {
      const wasOpen = this.#open
      this.#open = false
      if (!this.#closed) {
        this.#closed = true
        this.emit('close', wasOpen ? 'socket closed' : 'closed before handshake')
      }
    })
    this.#socket.on('connect', () => {
      this.#socket.write(
        'GET / HTTP/1.1\r\n' +
          'Host: localhost\r\n' +
          'Connection: Upgrade\r\n' +
          'Upgrade: websocket\r\n' +
          'Sec-WebSocket-Version: 13\r\n' +
          `Sec-WebSocket-Key: ${key}\r\n\r\n`
      )
    })
    let handshake = Buffer.alloc(0)
    const onHandshakeData = (chunk) => {
      handshake = Buffer.concat([handshake, chunk])
      const end = handshake.indexOf('\r\n\r\n')
      if (end === -1) return
      const head = handshake.subarray(0, end).toString('latin1')
      const [status, ...headerLines] = head.split('\r\n')
      const headers = Object.fromEntries(
        headerLines.map((l) => {
          const i = l.indexOf(':')
          return [l.slice(0, i).trim().toLowerCase(), l.slice(i + 1).trim()]
        })
      )
      if (!/^HTTP\/1\.1 101/.test(status)) {
        this.emit('error', new Error(`WebSocket upgrade refused: ${status}`))
        this.#socket.destroy()
        return
      }
      if (headers['sec-websocket-accept'] !== expectAccept) {
        this.emit('error', new Error('WebSocket upgrade: bad Sec-WebSocket-Accept'))
        this.#socket.destroy()
        return
      }
      this.#socket.off('data', onHandshakeData)
      this.#socket.on('data', (data) => this.#onData(data))
      this.#open = true
      this.emit('open')
      const rest = handshake.subarray(end + 4)
      if (rest.length) this.#onData(rest)
    }
    this.#socket.on('data', onHandshakeData)
  }

  get isOpen() {
    return this.#open
  }

  #onData(chunk) {
    this.#buffer = this.#buffer.length ? Buffer.concat([this.#buffer, chunk]) : chunk
    for (;;) {
      const frame = this.#readFrame()
      if (!frame) return
      this.#onFrame(frame)
    }
  }

  #readFrame() {
    const buf = this.#buffer
    if (buf.length < 2) return null
    const fin = (buf[0] & 0x80) !== 0
    const op = buf[0] & 0x0f
    const masked = (buf[1] & 0x80) !== 0
    let len = buf[1] & 0x7f
    let offset = 2
    if (len === 126) {
      if (buf.length < 4) return null
      len = buf.readUInt16BE(2)
      offset = 4
    } else if (len === 127) {
      if (buf.length < 10) return null
      const big = buf.readBigUInt64BE(2)
      if (big > BigInt(this.maxMessageBytes)) {
        this.emit('error', new Error(`WebSocket frame too large: ${big} bytes`))
        this.close()
        return null
      }
      len = Number(big)
      offset = 10
    }
    let mask = null
    if (masked) {
      if (buf.length < offset + 4) return null
      mask = buf.subarray(offset, offset + 4)
      offset += 4
    }
    if (buf.length < offset + len) return null
    let payload = buf.subarray(offset, offset + len)
    if (mask) {
      payload = Buffer.from(payload)
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3]
    }
    this.#buffer = buf.subarray(offset + len)
    return { fin, op, payload }
  }

  #onFrame({ fin, op, payload }) {
    switch (op) {
      case OP.PING:
        this.#sendFrame(OP.PONG, payload)
        return
      case OP.PONG:
        return
      case OP.CLOSE: {
        const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005
        const reason = payload.length > 2 ? payload.subarray(2).toString() : ''
        if (this.#open) this.#sendFrame(OP.CLOSE, payload.subarray(0, 2))
        this.#open = false
        this.#closed = true
        this.#socket.end()
        this.emit('close', `server closed (${code}${reason ? ` ${reason}` : ''})`)
        return
      }
      case OP.TEXT:
      case OP.BINARY:
        if (!fin) {
          this.#fragmentOp = op
          this.#fragments = [payload]
          return
        }
        this.#deliver(op, payload)
        return
      case OP.CONT: {
        this.#fragments.push(payload)
        const total = this.#fragments.reduce((n, b) => n + b.length, 0)
        if (total > this.maxMessageBytes) {
          this.emit('error', new Error('WebSocket message too large'))
          this.close()
          return
        }
        if (fin) {
          const full = Buffer.concat(this.#fragments)
          const fop = this.#fragmentOp
          this.#fragments = []
          this.#fragmentOp = null
          this.#deliver(fop, full)
        }
        return
      }
      default:
        this.emit('error', new Error(`WebSocket: unsupported opcode ${op}`))
        this.close()
    }
  }

  #deliver(op, payload) {
    this.emit('message', op === OP.TEXT ? payload.toString('utf8') : payload)
  }

  #sendFrame(op, payload) {
    if (!this.#socket || this.#socket.destroyed) return
    const len = payload.length
    let header
    if (len < 126) {
      header = Buffer.alloc(2)
      header[1] = 0x80 | len
    } else if (len < 65536) {
      header = Buffer.alloc(4)
      header[1] = 0x80 | 126
      header.writeUInt16BE(len, 2)
    } else {
      header = Buffer.alloc(10)
      header[1] = 0x80 | 127
      header.writeBigUInt64BE(BigInt(len), 2)
    }
    header[0] = 0x80 | op
    const mask = randomBytes(4)
    const masked = Buffer.allocUnsafe(len)
    for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i & 3]
    this.#socket.write(Buffer.concat([header, mask, masked]))
  }

  send(text) {
    if (!this.#open) throw new Error('WebSocket is not open')
    this.#sendFrame(OP.TEXT, Buffer.from(text, 'utf8'))
  }

  close() {
    if (this.#closed) return
    this.#closed = true
    if (this.#open) {
      const payload = Buffer.alloc(2)
      payload.writeUInt16BE(1000, 0)
      this.#sendFrame(OP.CLOSE, payload)
      this.#open = false
    }
    this.#socket?.end()
    setTimeout(() => this.#socket?.destroy(), 500).unref()
  }
}
