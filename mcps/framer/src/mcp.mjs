#!/opt/homebrew/bin/node
// Thin MCP stdio adapter. Framer sessions and learnings live in one per-user broker.
import { createConnection } from 'node:net'
import { createInterface } from 'node:readline'
import { homedir } from 'node:os'
import { join } from 'node:path'

const socket = join(homedir(), 'Library', 'Application Support', 'taylor-framer', 'framer.sock')
const protocolVersion = '2025-06-18'
const schemas = {
  framer_status: { description: 'Check the shared Framer CLI broker and its pinned CLI version.', inputSchema: { type: 'object', properties: {} } },
  framer_projects: { description: 'List Framer projects already authorized for the CLI. Discovery only; no project changes.', inputSchema: { type: 'object', properties: {} } },
  framer_branches: { description: 'List branches and the active branch for one explicit project ID.', inputSchema: { type: 'object', properties: { project_id: { type: 'string' } }, required: ['project_id'] } },
  framer_select_branch: { description: 'Explicitly switch the Framer editor to a branch ID in a project. Verify the ID with framer_branches first.', inputSchema: { type: 'object', properties: { project_id: { type: 'string' }, branch_id: { type: 'string' } }, required: ['project_id', 'branch_id'] } },
  framer_exec: { description: 'Execute Framer Server API JavaScript in a project session only when its active branch matches the explicit branch ID. Code may change or publish the project; use only within the user-authorized scope. Prefer framer.agent APIs for edits and read back changes.', inputSchema: { type: 'object', properties: { project_id: { type: 'string' }, branch_id: { type: 'string' }, code: { type: 'string' } }, required: ['project_id', 'branch_id', 'code'] } },
  framer_learning: { description: 'Read or record verified Framer CLI/Server API learnings shared by Claude and Codex. Omit record to read.', inputSchema: { type: 'object', properties: { record: { type: 'object', properties: { topic: { type: 'string' }, lesson: { type: 'string' }, project_id: { type: 'string' } }, required: ['topic', 'lesson'] } } } },
  framer_guidance: { description: 'Read shared Framer workflow notes, archived code-component guidance by heading, or a project task map. List headings first for components.', inputSchema: { type: 'object', properties: { topic: { type: 'string', enum: ['workflow', 'components', 'project'] }, heading: { type: 'string' }, project_id: { type: 'string' } }, required: ['topic'] } },
}
let nextId = 1
function broker(method, params = {}) {
  return new Promise((resolve, reject) => {
    const peer = createConnection(socket)
    const id = nextId++
    let buffer = ''
    const timer = setTimeout(() => { peer.destroy(); reject(new Error('Framer broker timed out')) }, 125_000)
    peer.on('connect', () => peer.write(JSON.stringify({ id, method, params }) + '\n'))
    peer.on('data', chunk => {
      buffer += chunk.toString()
      const pos = buffer.indexOf('\n')
      if (pos < 0) return
      clearTimeout(timer); peer.end()
      try { const reply = JSON.parse(buffer.slice(0, pos)); reply.error ? reject(new Error(reply.error)) : resolve(reply.result) }
      catch (error) { reject(error) }
    })
    peer.on('error', error => { clearTimeout(timer); reject(new Error(`Framer broker unavailable: ${error.message}. Check launchctl gui/$UID/com.taylor.framer-broker`)) })
  })
}
function send(message) { process.stdout.write(JSON.stringify(message) + '\n') }
async function call(request) {
  const { id, method, params = {} } = request
  if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'taylor-framer', version: '0.1.0' } } })
  if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} })
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: Object.entries(schemas).map(([name, schema]) => ({ name, ...schema })) } })
  if (method === 'notifications/initialized' || method?.startsWith('notifications/')) return
  if (method !== 'tools/call') return send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } })
  try {
    const map = { framer_status: 'status', framer_projects: 'projects', framer_branches: 'branches', framer_select_branch: 'select_branch', framer_exec: 'exec', framer_learning: 'learning', framer_guidance: 'guidance' }
    if (!(params.name in map)) throw new Error('Unknown Framer tool')
    const result = await broker(map[params.name], params.arguments || {})
    send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result) }] } })
  } catch (error) {
    send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: error.message }] } })
  }
}
createInterface({ input: process.stdin }).on('line', line => {
  try { void call(JSON.parse(line)) }
  catch (error) { console.error('[framer-mcp]', error.message) }
})
