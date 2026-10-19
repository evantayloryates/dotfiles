import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadManifest, loadTools } from '../../_shared/kernel/service.mjs'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..')

test('manifest id matches folder and tools carry the prefix', async () => {
  const manifest = await loadManifest(dir)
  assert.equal(manifest.id, 'zdr-agent')
  const tools = await loadTools(dir)
  assert.deepEqual(tools.map((t) => t.name), ['zdr_abort', 'zdr_ask', 'zdr_exports', 'zdr_open', 'zdr_read', 'zdr_sessions', 'zdr_status', 'zdr_terra'])
  for (const t of tools) assert.ok(t.name.startsWith(manifest.toolPrefix))
})

test('kernel rejects arguments outside the schema', async () => {
  const { checkArgs } = await import('../../_shared/kernel/service.mjs')
  const terra = (await loadTools(dir)).find((t) => t.name === 'zdr_terra')
  assert.match(checkArgs(terra.inputSchema, { action: 'export' }), /must be one of/)
  assert.match(checkArgs(terra.inputSchema, {}), /required/)
  assert.match(checkArgs(terra.inputSchema, { action: 'status', extra: 1 }), /unknown argument/)
  assert.equal(checkArgs(terra.inputSchema, { action: 'status' }), null)
})
