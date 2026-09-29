#!/usr/bin/env node
// End-to-end smoke test through the MCP launcher: handshake, tools/list,
// codex_status, then one read-only Computer Use turn against Finder.
// Exits non-zero if the turn does not complete.

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const launcher = join(HERE, '..', 'bin', 'codex-bridge-mcp')
const child = spawn(launcher, [], { stdio: ['pipe', 'pipe', 'inherit'] })
const rl = createInterface({ input: child.stdout })
const pending = new Map()
let nextId = 1
rl.on('line', (line) => {
  if (!line.trim()) return
  const msg = JSON.parse(line)
  if (msg.method === 'notifications/progress') {
    console.log(`  progress: ${msg.params.message}`)
    return
  }
  const p = pending.get(msg.id)
  if (!p) return
  pending.delete(msg.id)
  msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result)
})
const send = (msg) => child.stdin.write(JSON.stringify(msg) + '\n')
const request = (method, params) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    send({ jsonrpc: '2.0', id, method, params })
  })
const callTool = (name, args) => request('tools/call', { name, arguments: args, _meta: { progressToken: `t${nextId}` } })

const t0 = Date.now()
const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`
let failed = false
try {
  const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } })
  send({ jsonrpc: '2.0', method: 'notifications/initialized' })
  console.log(`[${elapsed()}] initialized: ${init.serverInfo.name} ${init.serverInfo.version}`)
  const tools = await request('tools/list', {})
  console.log(`[${elapsed()}] tools: ${tools.tools.map((t) => t.name).join(', ')}`)
  const status = await callTool('codex_status', {})
  console.log(`[${elapsed()}] status:\n${status.content[0].text.split('\n').map((l) => '  ' + l).join('\n')}`)
  const run = await callTool('codex_computer_use', {
    task: 'Read-only check, never click or type: using Computer Use, get the Finder app state, report the title of its key window, and take one screenshot of it with emit enabled. Call report_progress once before the screenshot.',
    session: 'smoke',
    apps: ['Finder'],
    screenshots: 'last',
    timeout_sec: 180,
  })
  const text = run.content.find((c) => c.type === 'text')?.text || ''
  const images = run.content.filter((c) => c.type === 'image')
  console.log(`[${elapsed()}] codex_computer_use isError=${run.isError} images=${images.length}\n${text.split('\n').map((l) => '  ' + l).join('\n')}`)
  if (run.isError || !/status: completed/.test(text)) failed = true
  const steerCheck = await callTool('codex_steer', { session: 'smoke', message: 'noop' }).catch((e) => ({ content: [{ type: 'text', text: String(e.message) }], isError: true }))
  console.log(`[${elapsed()}] codex_steer on idle session → ${steerCheck.isError ? 'error as expected' : 'UNEXPECTED success'}: ${steerCheck.content[0].text.slice(0, 120)}`)
  if (!steerCheck.isError) failed = true
} catch (err) {
  console.error(`smoke failed: ${err.message}`)
  failed = true
} finally {
  child.stdin.end()
  await new Promise((r) => child.on('exit', r))
}
console.log(failed ? 'SMOKE FAILED' : 'SMOKE OK')
process.exit(failed ? 1 : 0)
