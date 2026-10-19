// A small MCP stdio server: newline-delimited JSON-RPC 2.0 on stdin/stdout,
// logs on stderr. Tools with progress notifications and cancellation, plus
// optional static resources; no SDK dependency. Shared by the fleet.
//
// Speaks both protocol eras on one process:
// - legacy (2024-11-05 .. 2025-06-18): initialize handshake, client identity
//   remembered for the connection;
// - modern (2026-07-28): no handshake; every request carries its protocol
//   version, client info and capabilities in _meta; server/discover answers
//   capability and instruction queries. Claude Code 2.1.292 probes
//   server/discover first and uses this mode when it is answered.
// A request is modern exactly when its params._meta names a protocol version.
//
// resources: [{ uri, name, description?, mimeType?, read: () => string }]
// instructions: a string, or a function of the client's clientInfo.
// Tool handlers get ctx.client: the request's clientInfo (modern) or the
// initialize request's (legacy), and ctx.era: 'modern' | 'legacy'.

import { createInterface } from 'node:readline'

const LEGACY_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05']
const MODERN_PROTOCOLS = ['2026-07-28']
const K = 'io.modelcontextprotocol/'
const LIST_TTL_MS = 60_000

export function serveMcp({ name, version, instructions, tools, resources = [], log = () => {} }) {
  const byName = new Map(tools.map((t) => [t.name, t]))
  const byUri = new Map(resources.map((r) => [r.uri, r]))
  let legacyClient = null
  const inflight = new Map()
  const capabilities = resources.length ? { tools: {}, resources: {} } : { tools: {} }
  const serverInfoMeta = { [`${K}serverInfo`]: { name, version } }

  const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`)
  const fail = (id, code, message, data) => send({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } })

  // Modern results say they are complete and who answered; list results also
  // say how long they may be cached. Legacy results are unchanged.
  const replyFor = (modern) => (id, result, { list = false } = {}) => {
    if (!modern) return send({ jsonrpc: '2.0', id, result })
    send({
      jsonrpc: '2.0',
      id,
      result: {
        resultType: 'complete',
        ...result,
        ...(list ? { ttlMs: LIST_TTL_MS, cacheScope: 'private' } : {}),
        _meta: { ...serverInfoMeta, ...(result?._meta || {}) },
      },
    })
  }

  function computeInstructions(client) {
    if (typeof instructions !== 'function') return Promise.resolve(instructions)
    return Promise.resolve()
      .then(() => instructions(client))
      .catch((err) => { log(`instructions failed: ${err.message}`); return undefined })
  }

  async function callTool(id, params, { client, era, reply }) {
    const { name: toolName, arguments: args = {}, _meta } = params || {}
    const tool = byName.get(toolName)
    if (!tool) return fail(id, -32602, `Unknown tool: ${toolName}`)
    const controller = new AbortController()
    inflight.set(id, controller)
    const token = _meta?.progressToken
    let progressCount = 0
    const ctx = {
      signal: controller.signal,
      client,
      era,
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
    const meta = params?._meta || {}
    const requested = meta[`${K}protocolVersion`]
    const modern = requested !== undefined || method === 'server/discover'
    if (requested !== undefined && !MODERN_PROTOCOLS.includes(requested)) {
      return fail(id, -32022, 'Unsupported protocol version', { supported: [...MODERN_PROTOCOLS, ...LEGACY_PROTOCOLS], requested })
    }
    const reply = replyFor(modern)
    const client = modern ? meta[`${K}clientInfo`] || null : legacyClient
    const era = modern ? 'modern' : 'legacy'

    switch (method) {
      case 'server/discover':
        return void computeInstructions(client).then((text) =>
          reply(id, { supportedVersions: [...MODERN_PROTOCOLS, ...LEGACY_PROTOCOLS], capabilities, ...(text !== undefined ? { instructions: text } : {}) }, { list: true }),
        )
      case 'initialize': {
        if (modern) return fail(id, -32601, 'initialize is not part of protocol 2026-07-28')
        const asked = params?.protocolVersion
        legacyClient = params?.clientInfo || null
        return void computeInstructions(legacyClient).then((text) =>
          reply(id, {
            protocolVersion: LEGACY_PROTOCOLS.includes(asked) ? asked : LEGACY_PROTOCOLS[0],
            capabilities,
            serverInfo: { name, version },
            instructions: text,
          }),
        )
      }
      case 'ping':
        if (modern) return fail(id, -32601, 'Method not found: ping (removed in 2026-07-28)')
        return reply(id, {})
      case 'tools/list':
        return reply(id, { tools: tools.map(({ handler, ...t }) => t) }, { list: true })
      case 'tools/call':
        return void callTool(id, params, { client, era, reply })
      case 'resources/list':
        return reply(id, { resources: resources.map(({ read, ...r }) => r) }, { list: true })
      case 'resources/templates/list':
        return reply(id, { resourceTemplates: [] }, { list: true })
      case 'resources/read': {
        const r = byUri.get(params?.uri)
        if (!r) return fail(id, modern ? -32602 : -32002, `Resource not found: ${params?.uri}`)
        return reply(id, { contents: [{ uri: r.uri, mimeType: r.mimeType || 'text/markdown', text: r.read() }] }, { list: true })
      }
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
