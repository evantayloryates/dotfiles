// Transports that feed JsonRpcPeer: a spawned `codex app-server` child on
// stdio, or the managed daemon over WebSocket-on-unix-socket.

import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createWriteStream, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline'

import { WsUnixClient } from './ws-unix.mjs'

// A private app-server child. Normally it owns a process group for bridge
// cleanup. A private UI worker can instead inherit its supervisor-owned group
// so hard worker loss also reaps the backend and its MCP descendants.
export function spawnStdioTransport(bin, { log = () => {}, stderrPath, detached = true } = {}) {
  const t = new EventEmitter()
  const child = spawn(bin, ['app-server', '--listen', 'stdio://'], {
    stdio: ['pipe', 'pipe', stderrPath ? 'pipe' : 'ignore'],
    detached,
  })
  if (stderrPath) {
    mkdirSync(dirname(stderrPath), { recursive: true })
    child.stderr.pipe(createWriteStream(stderrPath, { flags: 'a' }))
  }
  // readline has no line-length ceiling, unlike asyncio's StreamReader: a
  // single screenshot result is a ~200 KB line.
  const rl = createInterface({ input: child.stdout })
  rl.on('line', (line) => {
    if (line.trim()) t.emit('message', line)
  })
  child.on('exit', (code, signal) => t.emit('close', `app-server exited (${code ?? signal})`))
  child.on('error', (err) => t.emit('error', err))
  t.send = (text) => {
    child.stdin.write(text + '\n')
  }
  t.close = () => {
    // A private UI worker can keep descendants in its supervisor-owned group.
    // That group belongs to the supervisor, so close only our child here; the
    // supervisor also reaps the whole group after normal or hard worker exit.
    if (!detached) { child.kill('SIGTERM'); return }
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      try {
        child.kill('SIGTERM')
      } catch {}
    }
  }
  t.pid = child.pid
  t.kind = 'stdio'
  log(`spawned app-server pid ${child.pid}`)
  return t
}

export async function connectDaemonTransport(socketPath, { log = () => {} } = {}) {
  const ws = await WsUnixClient.connect(socketPath)
  const t = new EventEmitter()
  ws.on('message', (data) => t.emit('message', data))
  ws.on('close', (why) => t.emit('close', why))
  ws.on('error', (err) => t.emit('error', err))
  t.send = (text) => ws.send(text)
  t.close = () => ws.close()
  t.kind = 'daemon'
  log(`connected to daemon at ${socketPath}`)
  return t
}

// The process group kill above only fires if we get to run cleanup, so wire
// it to every exit path once per process.
const cleanups = new Set()
export function onExitCleanup(fn) {
  cleanups.add(fn)
  return () => cleanups.delete(fn)
}
let hooked = false
export function installExitHooks(log = () => {}) {
  if (hooked) return
  hooked = true
  const runAll = () => {
    for (const fn of cleanups) {
      try {
        fn()
      } catch (err) {
        log(`cleanup failed: ${err.message}`)
      }
    }
    cleanups.clear()
  }
  process.on('exit', runAll)
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => {
      runAll()
      process.exit(0)
    })
  }
}
