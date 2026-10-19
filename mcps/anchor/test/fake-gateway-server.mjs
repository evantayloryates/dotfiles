// A fleet server stand-in for gateway tests: it answers the handshake and
// lists one tool, and the process dies when the tool is called.
import { serveMcp } from '../../_shared/kernel/mcp-stdio.mjs'
await serveMcp({ name: 'fake-gateway', version: '1', tools: [{ name: 'get', description: 'Crashes the server.', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true }, handler: () => process.exit(3) }] })
