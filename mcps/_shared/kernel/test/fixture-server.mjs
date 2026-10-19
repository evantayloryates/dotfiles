// A kernel server for protocol tests: one quick tool, one slow tool with
// progress, one resource, instructions computed from the client.
import { serveMcp } from '../mcp-stdio.mjs'
await serveMcp({
  name: 'fixture',
  version: '1.0.0',
  instructions: (client) => `instructions for ${client?.name || 'unknown'}`,
  resources: [{ uri: 'fixture://doc', name: 'doc', read: () => 'hello' }],
  tools: [
    { name: 'add', description: 'Add two numbers', inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] }, handler: ({ a, b }) => String(a + b) },
    { name: 'who', description: 'Who is calling', inputSchema: { type: 'object' }, handler: (_a, ctx) => `${ctx.era}:${ctx.client?.name}` },
    { name: 'slow', description: 'Slow with progress', inputSchema: { type: 'object' }, handler: async (_a, ctx) => { for (let i = 0; i < 5; i++) { ctx.progress(`step ${i}`); await new Promise((r, j) => { const t = setTimeout(r, 100); ctx.signal.addEventListener('abort', () => { clearTimeout(t); j(new Error('aborted')) }) }) } return 'done' } },
  ],
})
