// MCP discovery only: no status call, app-server connection or model turn.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
const launcher = fileURLToPath(new URL('../../codex-bridge/bin/codex-bridge-mcp', import.meta.url));
const child = spawn(launcher, [], { stdio: ['pipe', 'pipe', 'pipe'] });
child.stderr.resume(); // Drain logs without exposing task content.
const pending = new Map(); let id = 0;
const lines = createInterface({ input: child.stdout });
const timeout = setTimeout(() => { child.kill('SIGTERM'); process.exitCode = 1; }, 10000);
lines.on('line', line => {
  try {
    const message = JSON.parse(line); const p = pending.get(message.id);
    if (p) { pending.delete(message.id); message.error ? p.reject(new Error('MCP request rejected')) : p.resolve(message.result); }
  } catch { /* Ignore nonprotocol lines without publishing their contents. */ }
});
child.on('error', () => { console.error('Bridge launcher unavailable'); process.exitCode = 1; });
child.on('exit', () => { clearTimeout(timeout); for (const p of pending.values()) p.reject(new Error('Bridge exited')); pending.clear(); });
function request(method, params) {
  return new Promise((resolve, reject) => {
    const next = ++id; pending.set(next, { resolve, reject });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: next, method, params }) + '\n');
  });
}
try {
  const hello = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'capture-qualification', version: '1' } });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const roster = await request('tools/list', {});
  console.log(JSON.stringify({ server: hello.serverInfo, tools: roster.tools.map(t => t.name), limit: 'Discovery only; delegated computer-use execution remains unqualified.' }));
} catch { console.error('Bridge discovery failed'); process.exitCode = 1; }
finally { child.stdin.end(); child.kill('SIGTERM'); }
