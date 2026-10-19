// Child process that hosts one service module. Talks to the anchor core over
// Node IPC: {type:'call', id, op, args} in; {type:'result'|'progress'} out.
// A crash here takes down only this service, never the core.

// Two kinds of service:
// - module: services/<id>/index.mjs exports ops (handlers run in this process);
// - gateway: services/<id>/gateway.json names a command that starts the
//   service's own MCP server. This host is its MCP client: each operation is
//   one of its tools, with progress and cancellation passed through. That is
//   how an existing fleet server, or any MCP, joins without being rewritten.

import { pathToFileURL } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { connectStdio } from './mcp-client.mjs'

const dir = process.argv[2]
let mod = {}
let ops = {}
let sources = {}
if (existsSync(join(dir, 'gateway.json'))) {
  const g = JSON.parse(readFileSync(join(dir, 'gateway.json'), 'utf8'))
  // The service's server dying is this service crashing: exit, so the
  // supervisor's restart policy and crash fingerprints apply.
  const client = await connectStdio(g.command, { startTimeoutMs: g.startTimeoutMs || 30_000, onExit: (code, signal) => { process.stderr.write(`Error: gateway server exited (${signal || code})\n`); process.exit(1) } })
  // A gateway serves exactly the operations its manifest declares: a subset
  // of the server's tools (say, only its reads), each mapped to its tool by
  // name or by the declaration's "tool" (tool names need not be snake_case).
  const decls = JSON.parse(readFileSync(join(dir, 'service.json'), 'utf8')).operations || {}
  const opOfTool = new Map(Object.entries(decls).map(([op, d]) => [d?.tool || op, op]))
  for (const t of await client.listTools()) {
    const op = opOfTool.get(t.name)
    if (!op) continue
    sources[op] = JSON.stringify(t)
    ops[op] = {
      description: t.description,
      inputSchema: t.inputSchema,
      handler: async (args, ctx) => {
        const r = await client.callTool(t.name, args, { onProgress: (p) => ctx.progress(p.message || `progress ${p.progress}`), signal: ctx.signal })
        const text = (r.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n')
        if (r.isError) throw new Error(text || `${t.name} failed`)
        if (r.structuredContent !== undefined) return r.structuredContent
        const onlyText = (r.content || []).every((c) => c.type === 'text')
        return onlyText ? text : { content: r.content }
      },
    }
  }
} else {
  mod = await import(pathToFileURL(join(dir, 'index.mjs')).href)
  ops = mod.ops || {}
  sources = Object.fromEntries(Object.entries(ops).map(([name, op]) => [name, typeof op?.handler === 'function' ? String(op.handler) : null]))
}
// Release check: report what the service implements, then exit without
// serving. For a gateway, a tool's definition stands in for its source.
if (process.argv[3] === '--inspect') {
  process.stdout.write(JSON.stringify({ handlers: sources }))
  process.exit(0)
}
const inflight = new Map()
// The core is gone (daemon killed or restarted): never linger as an orphan.
process.on('disconnect', () => process.exit(0))

process.on('message', async (msg) => {
  if (msg.type === 'cancel') return inflight.get(msg.id)?.abort()
  if (msg.type === 'sessionContext') {
    try {
      const text = typeof mod.sessionContext === 'function' ? await mod.sessionContext(msg.ctx) : ''
      process.send({ type: 'result', id: msg.id, ok: true, value: text || '' })
    } catch (err) {
      process.send({ type: 'result', id: msg.id, ok: false, error: String(err?.message || err) })
    }
    return
  }
  if (msg.type !== 'call') return
  const op = ops[msg.op]
  if (!op) return process.send({ type: 'result', id: msg.id, ok: false, error: `unknown operation ${msg.op}` })
  const controller = new AbortController()
  inflight.set(msg.id, controller)
  const ctx = {
    signal: controller.signal,
    session: msg.session,
    idempotencyKey: msg.idempotencyKey,
    progress: (message, fraction) => process.send({ type: 'progress', id: msg.id, message, fraction }),
  }
  try {
    const value = await op.handler(msg.args || {}, ctx)
    process.send({ type: 'result', id: msg.id, ok: true, value })
  } catch (err) {
    process.send({ type: 'result', id: msg.id, ok: false, error: String(err?.message || err) })
  } finally {
    inflight.delete(msg.id)
  }
})

const meta = Object.fromEntries(
  Object.entries(ops).map(([name, op]) => [name, {
    description: op.description,
    inputSchema: op.inputSchema || { type: 'object' },
    strategy: op.strategy || 'immediate',
    class: op.class || 'read',
  }]),
)
process.send({ type: 'ready', ops: meta })
