const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const COUNTERS = join(process.env.ANCHOR_STATE_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'state'), 'echo-counters.json')
const load = () => { try { return JSON.parse(readFileSync(COUNTERS, 'utf8')) } catch { return {} } }
const save = (c) => writeFileSync(COUNTERS, JSON.stringify(c))
export const ops = {
  // keyed: remembers which keys it has applied, so a rerun is a no-op.
  count: {
    handler: async ({ name }, ctx) => {
      const c = load()
      c.applied ||= {}
      if (ctx.idempotencyKey && c.applied[ctx.idempotencyKey]) return { ...c.applied[ctx.idempotencyKey], deduped: true }
      c[name] = (c[name] || 0) + 1
      const out = { name, count: c[name], key: ctx.idempotencyKey || null }
      if (ctx.idempotencyKey) c.applied[ctx.idempotencyKey] = out
      save(c) // the side effect lands first; the slow part comes after
      if (name.startsWith('slow-')) await new Promise((r) => setTimeout(r, 1500))
      return out
    },
  },
  // none: no deduplication at all.
  bump: {
    handler: async ({ name }) => {
      const c = load()
      c[name] = (c[name] || 0) + 1
      save(c)
      if (name.startsWith('slow-')) await new Promise((r) => setTimeout(r, 1500))
      return { name, count: c[name] }
    },
  },
  slow_echo: { handler: async ({ text, ms = 1500 }) => { await new Promise((r) => setTimeout(r, ms)); return text } },
  echo: { description: 'Return the text.', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false }, handler: ({ text }) => text },
  add: { description: 'Add two numbers.', inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] }, handler: ({ a, b }) => a + b },
  pixel: { description: 'Return a 1x1 image.', handler: () => ({ caption: 'one pixel', image: { type: 'image', data: PNG_1PX, mimeType: 'image/png' } }) },
}
