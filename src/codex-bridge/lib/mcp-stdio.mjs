// A small MCP stdio server (spec 2025-06-18): newline-delimited JSON-RPC 2.0
// on stdin/stdout, logs on stderr. Just enough for tools with progress
// notifications and cancellation; no SDK dependency.

import { createInterface } from 'node:readline'

const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05']

export function serveMcp({ name, version, instructions, tools, log = () => {} }) {
  const byName = new Map(tools.map((t) => [t.name, t]))
  const inflight = new Map()

  const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`)
  const reply = (id, result) => send({ jsonrpc: '2.0', id, result })
  const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } })

  async function callTool(id, params) {
    const { name: toolName, arguments: args = {}, _meta } = params || {}
    const tool = byName.get(toolName)
    if (!tool) return fail(id, -32602, `Unknown tool: ${toolName}`)
    const controller = new AbortController()
    inflight.set(id, controller)
    const token = _meta?.progressToken
    let progressCount = 0
    const ctx = {
      signal: controller.signal,
      progress(message) {
        log(`progress: ${message}`)
        if (token === undefined) return
        send({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: token, progress: ++progressCount, message } })
      },
    }
    try {
      const out = await tool.handler(args, ctx)
      if (controller.signal.aborted) return
      const result = typeof out === 'string' ? { content: [{ type: 'text', text: out }], isError: false } : out
      reply(id, result)
    } catch (err) {
      if (controller.signal.aborted) return
      log(`${toolName} failed: ${err.expected ? err.message : err.stack || err.message}`)
      reply(id, { content: [{ type: 'text', text: `${toolName} failed: ${err.message}` }], isError: true })
    } finally {
      inflight.delete(id)
    }
  }

  function handle(message) {
    if (Array.isArray(message) || typeof message !== 'object' || message === null || message.jsonrpc !== '2.0') {
      return fail(message?.id ?? null, -32600, 'Invalid Request')
    }
    const { id, method, params } = message
    if (id === undefined) {
      if (method === 'notifications/cancelled') inflight.get(params?.requestId)?.abort()
      return
    }
    switch (method) {
      case 'initialize': {
        const requested = params?.protocolVersion
        return reply(id, {
          protocolVersion: SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0],
          capabilities: { tools: {} },
          serverInfo: { name, version },
          instructions,
        })
      }
      case 'ping':
        return reply(id, {})
      case 'tools/list':
        return reply(id, {
          tools: tools.map(({ handler, ...t }) => t),
        })
      case 'tools/call':
        return void callTool(id, params)
      default:
        return fail(id, -32601, `Method not found: ${method}`)
    }
  }

  const rl = createInterface({ input: process.stdin })
  rl.on('line', (line) => {
    if (!line.trim()) return
    let message
    try {
      message = JSON.parse(line)
    } catch {
      return fail(null, -32700, 'Parse error')
    }
    try {
      handle(message)
    } catch (err) {
      log(err)
      if (message?.id !== undefined) fail(message.id, -32603, 'Internal error')
    }
  })
  return new Promise((resolve) => {
    rl.on('close', () => {
      for (const c of inflight.values()) c.abort()
      resolve()
    })
  })
}
