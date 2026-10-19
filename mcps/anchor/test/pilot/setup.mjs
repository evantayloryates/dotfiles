// Builds the pilot project in ~/.cache/anchor-lab/pilot/: its services
// (echo, slow, ledger from the lab; db-kickoff-stage and zdr-agent as
// gateways, zdr-agent trimmed to tools that carry no client data) and the
// expected answers that depend on live data.
import '../env.mjs'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { connectStdio } from '../../src/mcp-client.mjs'
import { paths } from '../../src/paths.mjs'
export const PILOT = join(homedir(), '.cache/anchor-lab/pilot')
const P = paths()
const RUN = join(P.lab, '../_shared/bin/run')
// Only these zdr-agent tools exist in the pilot, in both modes.
export const ZDR_SAFE = ['zdr_whats_new', 'zdr_guide', 'zdr_status']

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const svc = join(PILOT, 'services')
  rmSync(svc, { recursive: true, force: true }); mkdirSync(svc, { recursive: true })
  for (const id of ['echo', 'slow']) cpSync(join(P.servicesDir, id), join(svc, id), { recursive: true, filter: (s) => !s.includes('/dist') })
  cpSync(join(P.lab, 'test/pilot/ledger'), join(svc, 'ledger'), { recursive: true })
  for (const id of ['db-kickoff-stage', 'zdr-agent']) {
    if (!existsSync(join(P.servicesDir, id, 'gateway.json'))) throw new Error(`import ${id} first (node anchor/import-service.mjs ${id})`)
    mkdirSync(join(svc, id))
    for (const f of ['service.json', 'gateway.json', 'GUIDE.md']) if (existsSync(join(P.servicesDir, id, f))) cpSync(join(P.servicesDir, id, f), join(svc, id, f))
  }
  // Service-level vocabulary for discovery (the manifest's "keywords").
  const KEYWORDS = {"echo": ["repeat", "say", "text", "math", "arithmetic", "sum", "plus", "numbers", "counter", "pixel", "image", "reference"], "slow": ["job", "long-running", "background", "progress", "handle", "wait", "delay", "duration", "seconds", "slower"], "db-kickoff-stage": ["sql", "database", "db", "mysql", "table", "tables", "columns", "schema", "indexes", "rows", "query", "staging", "stg", "kudos_staging", "health", "healthy", "reachable", "vpn"], "zdr-agent": ["production", "prod", "analytics", "amplitude", "bugsnag", "posthog", "errors", "events", "users", "active", "churn", "clients", "de-identified", "zdr", "harness", "health", "healthy", "release", "releases"]}
  for (const [id, kw] of Object.entries(KEYWORDS)) {
    const f = join(svc, id, 'service.json')
    writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, 'utf8')), keywords: kw }, null, 2))
  }
  const zp = join(svc, 'zdr-agent/service.json')
  const z = JSON.parse(readFileSync(zp, 'utf8'))
  z.operations = Object.fromEntries(Object.entries(z.operations).filter(([k]) => ZDR_SAFE.includes(k)))
  writeFileSync(zp, JSON.stringify(z, null, 2))

  const text = (r) => r.content.map((c) => c.text).join('\n')
  const db = await connectStdio([RUN, 'db-kickoff-stage'], { startTimeoutMs: 60000 })
  const coach = text(await db.callTool('stage_query', { sql: "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name LIKE 'coach%'" }))
  const users = text(await db.callTool('stage_query', { sql: "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name LIKE 'user%'" }))
  db.close()
  const zdr = await connectStdio([RUN, 'zdr-agent'], { startTimeoutMs: 60000 })
  const latest = text(await zdr.callTool('zdr_whats_new', {}))
  zdr.close()
  const expected = {
    coachTables: Number(coach.match(/^\[(\d+)\]$/m)?.[1] ?? NaN),
    userTables: Number(users.match(/^\[(\d+)\]$/m)?.[1] ?? NaN),
    zdrLatest: latest.match(/\d{4}-\d{2}-\d{2}\.\d{3}/)?.[0] ?? null,
  }
  writeFileSync(join(PILOT, 'expected.json'), JSON.stringify({ ...expected, raw: { coach: coach.slice(0, 300), latest: latest.slice(0, 200) } }, null, 2))
  console.log(JSON.stringify(expected))
}
