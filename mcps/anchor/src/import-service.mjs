// Import a fleet service as an anchor gateway service.
//   node anchor/import-service.mjs <fleet-id>
// Starts the service the way its registration does (mcps/_shared/bin/run),
// reads its tools, and writes services/<fleet-id>/ with:
//   service.json  operations from the tools: read-only tools become class
//                 "read" (idempotency natural), destructive ones "destructive",
//                 everything else "write" (idempotency none), all overridable;
//   gateway.json  the command anchor runs to reach the service;
//   GUIDE.md      the service's guide, or a pointer to its guide tool.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectStdio } from './mcp-client.mjs'
import { paths } from './paths.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const RUN = join(REPO, 'mcps/_shared/bin/run')
const id = process.argv[2]
// --sensitive: never store this service's results on disk (journals keep outcomes only).
const sensitive = process.argv.includes('--sensitive')
if (!id || !existsSync(join(REPO, 'mcps', id, 'mcp.json'))) { console.error(`usage: import-service.mjs <fleet-id>; no mcps/${id}/mcp.json`); process.exit(64) }
const fleet = JSON.parse(readFileSync(join(REPO, 'mcps', id, 'mcp.json'), 'utf8'))
const client = await connectStdio([RUN, id], { startTimeoutMs: 60_000 })
const tools = await client.listTools()
client.close()

const operations = {}
for (const t of tools) {
  const a = t.annotations || {}
  const cls = a.readOnlyHint ? 'read' : a.destructiveHint ? 'destructive' : 'write'
  operations[t.name] = {
    description: t.description || t.title || t.name,
    class: cls,
    idempotency: cls === 'read' ? 'natural' : a.idempotentHint ? 'keyed' : 'none',
    inputSchema: t.inputSchema?.type === 'object' ? t.inputSchema : { type: 'object', properties: {} },
  }
}
const out = join(paths().servicesDir, id)
mkdirSync(out, { recursive: true })
const today = new Date().toISOString().slice(0, 10)
writeFileSync(join(out, 'service.json'), JSON.stringify({ description: fleet.description, version: `${today}.001`, importedFrom: `mcps/${id}`, ...(sensitive ? { sensitive: true } : {}), operations }, null, 2))
writeFileSync(join(out, 'gateway.json'), JSON.stringify({ command: [RUN, id], startTimeoutMs: 60_000 }, null, 2))
const guideTool = tools.find((t) => /_guide$/.test(t.name))
const fleetGuide = join(REPO, 'mcps', id, 'GUIDE.md')
writeFileSync(join(out, 'GUIDE.md'), existsSync(fleetGuide) ? readFileSync(fleetGuide, 'utf8') : `# ${id}\n\n${fleet.description}\n\n${guideTool ? `Read the full guide with \`${id}:${guideTool.name}\`.` : ''}\n`)
console.log(JSON.stringify({ id, operations: Object.fromEntries(Object.entries(operations).map(([k, v]) => [k, `${v.class}/${v.idempotency}`])), dir: out }, null, 1))
