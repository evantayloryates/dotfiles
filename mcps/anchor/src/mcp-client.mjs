// Minimal MCP client over stdio, used by the gateway (a fleet service's own
// server as a child of its anchor service host) and by the importer. Speaks
// the legacy handshake, which every fleet server answers.

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

export async function connectStdio(command, { env = process.env, cwd, startTimeoutMs = 30_000, onExit } = {}) {
  const [bin, ...args] = command
  const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'], env, cwd })
  child.stderr.on('data', (d) => process.stderr.write(d)) // crash fingerprints come from here
  const pending = new Map()
  let seq = 0
  let closed = false
  createInterface({ input: child.stdout }).on('line', (line) => {
    let m
    try { m = JSON.parse(line) } catch { return }
    if (m.method === 'notifications/progress') return pending.get(m.params?.progressToken)?.onProgress?.(m.params)
    if (m.id === undefined) return
    const p = pending.get(m.id)
    if (!p) return
    pending.delete(m.id)
    m.error ? p.reject(Object.assign(new Error(m.error.message), { code: m.error.code })) : p.resolve(m.result)
  })
  child.on('exit', (code, signal) => {
    closed = true
    for (const p of pending.values()) p.reject(new Error(`service server exited (${signal || code})`))
    pending.clear()
    onExit?.(code, signal)
  })
  const request = (method, params = {}, { onProgress, timeoutMs, id = `g${++seq}` } = {}) => new Promise((resolve, reject) => {
    if (closed) return reject(new Error('service server is not running'))
    let timer
    pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v) },
      reject: (e) => { clearTimeout(timer); reject(e) },
      onProgress,
    })
    if (timeoutMs) timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out after ${timeoutMs} ms`)) }, timeoutMs)
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params: onProgress ? { ...params, _meta: { ...(params._meta || {}), progressToken: id } } : params }) + '\n')
  })
  const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'anchor-gateway', version: '0.1.0' } }, { timeoutMs: startTimeoutMs })
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
  return {
    init,
    child,
    listTools: async () => (await request('tools/list', {}, { timeoutMs: startTimeoutMs })).tools || [],
    callTool(name, args, { onProgress, signal } = {}) {
      const id = `g${++seq}`
      const p = request('tools/call', { name, arguments: args }, { onProgress: onProgress || (() => {}), id })
      signal?.addEventListener('abort', () => {
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: id, reason: 'cancelled by anchor' } }) + '\n')
      }, { once: true })
      return p
    },
    close() { if (!closed) child.stdin.end() },
  }
}
