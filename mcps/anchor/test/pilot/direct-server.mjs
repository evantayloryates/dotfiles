// Baseline for the pilot: a service exposed directly as an MCP server, the
// way it would be registered without anchor.
//   node harness/pilot/direct-server.mjs <service-dir>            lab service
//   node harness/pilot/direct-server.mjs --fleet <id> [--only a,b]  fleet server, optionally
//     limited to the listed tools (zdr-agent: only tools that carry no client data)
import '../env.mjs'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { serveMcp } from '../../../_shared/kernel/mcp-stdio.mjs'
import { connectStdio } from '../../src/mcp-client.mjs'
import { paths } from '../../src/paths.mjs'

const argv = process.argv.slice(2)
if (argv[0] === '--fleet') {
  const id = argv[1]
  const only = argv[2] === '--only' ? argv[3].split(',') : null
  const up = await connectStdio([join(paths().lab, '../../mcps/_shared/bin/run'), id], { startTimeoutMs: 60000 })
  const tools = (await up.listTools()).filter((t) => !only || only.includes(t.name)).map((t) => ({
    ...t,
    handler: (args, ctx) => up.callTool(t.name, args, { signal: ctx.signal, onProgress: (p) => ctx.progress(p.message ?? '') }),
  }))
  await serveMcp({ name: up.init.serverInfo?.name || id, version: up.init.serverInfo?.version || '0', instructions: up.init.instructions, tools })
  up.close()
} else {
  const dir = resolve(argv[0])
  const man = JSON.parse(readFileSync(join(dir, 'service.json'), 'utf8'))
  const { ops } = await import(pathToFileURL(join(dir, 'index.mjs')).href)
  const id = dir.split('/').at(-1)
  const tools = Object.entries(man.operations).map(([name, d]) => ({
    name,
    // Without anchor, a deprecation can only live in the tool's description.
    description: d.notice ? `${d.description} NOTE: ${d.notice}` : d.description,
    inputSchema: d.inputSchema || { type: 'object' },
    annotations: { readOnlyHint: (d.class || 'read') === 'read' },
    handler: async (args, ctx) => {
      const v = await ops[name].handler(args, { ...ctx, progress: (m) => ctx.progress(String(m)) })
      return typeof v === 'string' ? v : JSON.stringify(v)
    },
  }))
  let guide = ''
  try { guide = readFileSync(join(dir, 'GUIDE.md'), 'utf8') } catch {}
  await serveMcp({ name: id, version: man.version, instructions: `${id} ${man.version}: ${man.description}${guide ? `\n\n${guide}` : ''}`, tools })
}
