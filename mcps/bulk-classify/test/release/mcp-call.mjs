// Minimal MCP stdio client: node mcp-call.mjs <tool> <json-args> -- <command...>
// Spawns the command with the inherited environment, does the handshake,
// calls one tool, prints the tool's text result. Synthetic inputs only.
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
const [tool, argsJson, sep, ...cmd] = process.argv.slice(2)
if (sep !== '--') throw new Error('usage')
const child = spawn(cmd[0], cmd.slice(1), { stdio: ['pipe', 'pipe', 'inherit'] })
const pending = new Map()
let id = 0
createInterface({ input: child.stdout }).on('line', (l) => {
  let m
  try { m = JSON.parse(l) } catch { return }
  if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
})
const call = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n') })
await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: process.env.MCP_CLIENT_NAME || 'opencode', version: '1' } })
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
const r = await call('tools/call', { name: tool, arguments: JSON.parse(argsJson) })
console.log(r.error ? `ERROR ${r.error.message}` : r.result.content.map((c) => c.text).join('\n'))
child.kill()
process.exit(0)
