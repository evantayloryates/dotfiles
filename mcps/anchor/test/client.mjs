// Coerced harness: plays the part of Claude Code or Codex. Spawns the anchor
// front end over stdio, performs the MCP handshake, and calls tools.

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SHIM = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'shim.mjs')

export async function startHarness({ env = {}, name = 'coerced-harness' } = {}) {
  const t0 = Date.now()
  const child = spawn(process.execPath, [SHIM], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } })
  let stderr = ''
  child.stderr.on('data', (d) => (stderr += d))
  const pending = new Map()
  const progress = []
  let seq = 0
  createInterface({ input: child.stdout }).on('line', (line) => {
    const m = JSON.parse(line)
    if (m.method === 'notifications/progress') return progress.push(m.params)
    const p = pending.get(m.id)
    if (p) {
      pending.delete(m.id)
      p(m)
    }
  })
  const rpc = (method, params) =>
    new Promise((resolve) => {
      const id = ++seq
      pending.set(id, resolve)
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    })
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name, version: '0' } })
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
  const startMs = Date.now() - t0
  const tools = (await rpc('tools/list', {})).result.tools
  async function call(name, args, { progressToken } = {}) {
    const t = Date.now()
    const r = await rpc('tools/call', { name, arguments: args, ...(progressToken ? { _meta: { progressToken } } : {}) })
    const content = r.result?.content || []
    const text = content.find((c) => c.type === 'text')?.text
    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
    return { ms: Date.now() - t, raw: r, data, notes: content.filter((c) => c.type === 'text').slice(1).map((c) => c.text).join('\n'), images: content.filter((c) => c.type === 'image') }
  }
  return {
    child,
    init: init.result,
    startMs,
    tools,
    progress,
    call,
    stderr: () => stderr,
    close: () => new Promise((r) => { child.on('exit', r); child.stdin.end() }),
  }
}
