// Both MCP eras against the kernel, including real captured sessions from
// Claude Code 2.1.292 (modern, and its legacy fallback) and Codex 0.159.3.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const K = 'io.modelcontextprotocol/'
const modernMeta = (extra = {}) => ({ [`${K}protocolVersion`]: '2026-07-28', [`${K}clientInfo`]: { name: 'modern-client', version: '1' }, [`${K}clientCapabilities`]: {}, ...extra })

function server() {
  const child = spawn(process.execPath, [join(here, 'fixture-server.mjs')], { stdio: ['pipe', 'pipe', 'pipe'] })
  const byId = new Map()
  const notes = []
  createInterface({ input: child.stdout }).on('line', (l) => {
    const m = JSON.parse(l)
    if (m.id === undefined) return notes.push(m)
    byId.get(m.id)?.(m)
  })
  const send = (m) => child.stdin.write(JSON.stringify(m) + '\n')
  const req = (m, ms = 3000) => new Promise((resolve, reject) => {
    const t = setTimeout(() => { byId.delete(m.id); resolve(null) }, ms)
    byId.set(m.id, (r) => { clearTimeout(t); resolve(r) })
    send(m)
  })
  return { child, send, req, notes, close: () => child.stdin.end() }
}
const clientLines = (file) => readFileSync(join(here, 'fixtures', file), 'utf8').trim().split('\n').filter((l) => !l.startsWith('< ')).map((l) => JSON.parse(l.replace(/^> /, '')))

test('replays Claude Code 2.1.292 modern session', async () => {
  const s = server()
  const [discover, list, call] = clientLines('claude-code-2.1.292-modern.log')
  const d = await s.req(discover)
  assert.equal(d.result.resultType, 'complete')
  assert.ok(d.result.supportedVersions.includes('2026-07-28'))
  assert.equal(d.result.instructions, 'instructions for claude-code')
  assert.equal(d.result._meta[`${K}serverInfo`].name, 'fixture')
  const l = await s.req(list)
  assert.equal(l.result.resultType, 'complete')
  assert.equal(l.result.ttlMs, 60000)
  assert.ok(l.result.tools.some((t) => t.name === 'add'))
  const c = await s.req(call)
  assert.deepEqual(c.result.content, [{ type: 'text', text: '5' }])
  assert.equal(c.result.resultType, 'complete')
  s.close()
})

test('replays Claude Code legacy fallback and Codex legacy sessions unchanged', async () => {
  for (const [file, expectVersion, name] of [['claude-code-2.1.292-legacy-fallback.log', '2025-06-18', 'claude-code'], ['codex-0.159.3-legacy.log', '2025-06-18', 'codex-mcp-client']]) {
    const s = server()
    for (const m of clientLines(file)) {
      if (m.method === 'server/discover') continue // the stub refused it; here we test the fallback path only
      if (m.id === undefined) { s.send(m); continue }
      const r = await s.req(m)
      if (m.method === 'initialize') {
        assert.equal(r.result.protocolVersion, expectVersion, file)
        assert.equal(r.result.instructions, `instructions for ${name}`)
        assert.equal(r.result.resultType, undefined, 'legacy results are unchanged')
      }
      if (m.method === 'tools/list') {
        assert.equal(r.result.resultType, undefined)
        assert.equal(r.result.ttlMs, undefined)
      }
    }
    s.close()
  }
})

test('both eras on one process keep their own client identity', async () => {
  const s = server()
  await s.req({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'legacy-client', version: '1' } } })
  s.send({ jsonrpc: '2.0', method: 'notifications/initialized' })
  const [a, b] = await Promise.all([
    s.req({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'who', arguments: {} } }),
    s.req({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'who', arguments: {}, _meta: modernMeta() } }),
  ])
  assert.equal(a.result.content[0].text, 'legacy:legacy-client')
  assert.equal(b.result.content[0].text, 'modern:modern-client')
  assert.equal(a.result.resultType, undefined)
  assert.equal(b.result.resultType, 'complete')
  s.close()
})

test('unsupported modern version is refused with the supported list', async () => {
  const s = server()
  const r = await s.req({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: modernMeta({ [`${K}protocolVersion`]: '1900-01-01' }) } })
  assert.equal(r.error.code, -32022)
  assert.deepEqual(r.error.data.requested, '1900-01-01')
  assert.ok(r.error.data.supported.includes('2026-07-28') && r.error.data.supported.includes('2025-06-18'))
  s.close()
})

test('era-specific methods and error codes', async () => {
  const s = server()
  assert.deepEqual((await s.req({ jsonrpc: '2.0', id: 1, method: 'ping' })).result, {})
  assert.equal((await s.req({ jsonrpc: '2.0', id: 2, method: 'ping', params: { _meta: modernMeta() } })).error.code, -32601)
  assert.equal((await s.req({ jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: 'fixture://nope' } })).error.code, -32002)
  assert.equal((await s.req({ jsonrpc: '2.0', id: 4, method: 'resources/read', params: { uri: 'fixture://nope', _meta: modernMeta() } })).error.code, -32602)
  assert.equal((await s.req({ jsonrpc: '2.0', id: 5, method: 'resources/read', params: { uri: 'fixture://doc', _meta: modernMeta() } })).result.contents[0].text, 'hello')
  assert.equal((await s.req({ jsonrpc: '2.0', id: 6, method: 'initialize', params: { _meta: modernMeta() } })).error.code, -32601)
  s.close()
})

test('modern progress and cancellation', async () => {
  const s = server()
  const r = await s.req({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'slow', arguments: {}, _meta: modernMeta({ progressToken: 'p1' }) } })
  assert.equal(r.result.content[0].text, 'done')
  assert.ok(s.notes.filter((n) => n.method === 'notifications/progress' && n.params.progressToken === 'p1').length >= 5)
  const pending = s.req({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'slow', arguments: {}, _meta: modernMeta() } }, 1500)
  setTimeout(() => s.send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 2 } }), 150)
  assert.equal(await pending, null, 'a cancelled call gets no response')
  s.close()
})
