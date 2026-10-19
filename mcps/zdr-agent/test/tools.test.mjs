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
  assert.deepEqual(tools.map((t) => t.name), ['zdr_ask', 'zdr_open', 'zdr_sessions'])
  for (const t of tools) assert.ok(t.name.startsWith(manifest.toolPrefix))
})
