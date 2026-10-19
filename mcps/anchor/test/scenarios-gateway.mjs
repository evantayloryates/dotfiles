// Phase 2: real fleet services behind anchor through the gateway, compared
// call for call with the service reached directly.
//   node harness/scenarios-gateway.mjs [service-id ...]   (default db-kickoff-stage and zdr-agent)
import './env.mjs'
import { execSync, execFileSync } from 'node:child_process'
import { rmSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { startHarness } from './client.mjs'
import { connectStdio } from '../src/mcp-client.mjs'
import { paths } from '../src/paths.mjs'

const P = paths()
const RUN = join(P.lab, '../_shared/bin/run')
const PLANS = {
  'db-kickoff-stage': [
    ['stage_query', { sql: 'SELECT 1+1 AS two' }],
    ['stage_tables', { like: 'coach%' }],
    ['stage_guide', {}],
  ],
  'zdr-agent': [
    ['zdr_whats_new', {}],
    ['zdr_guide', {}],
    ['zdr_status', {}],
  ],
}
// Services whose results must never reach anchor's disk. Never zdr_ask,
// zdr_read, zdr_sessions or zdr_exports here: those can carry client data.
const SENSITIVE = new Set(['zdr-agent'])
const filesUnder = (d) => readdirSync(d, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath ?? e.path, e.name))
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['db-kickoff-stage', 'zdr-agent']
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: ok ? '' : String(detail) })
const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const killDaemon = () => { try { execSync(`pkill -9 -f "${P.daemon} --state ${P.stateDir}"`) } catch {} }
// Timings inside answers differ on every call; compare everything else.
const norm = (t) => String(t).replace(/\d+(\.\d+)? ?ms\b/g, 'N ms').replace(/\d+ (min|s) ago/g, 'N ago')
const firstDiff = (x, y) => { const xl = x.split('\n'), yl = y.split('\n'); const i = xl.findIndex((l, k) => l !== yl[k]); return i < 0 ? (xl.length !== yl.length ? `line counts ${xl.length} vs ${yl.length}` : '') : `line ${i + 1}: anchor=${xl[i]} | direct=${yl[i]}` }
const textOf = (r) => (r.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n')
killDaemon()
rmSync(P.stateDir, { recursive: true, force: true }); mkdirSync(P.stateDir, { recursive: true })
const regsBefore = JSON.stringify(JSON.parse(readFileSync(join(process.env.HOME, '.claude.json'), 'utf8')).mcpServers)

for (const id of ids) {
  execFileSync(process.execPath, ['src/import-service.mjs', id, ...(SENSITIVE.has(id) ? ['--sensitive'] : [])], { stdio: 'ignore', timeout: 120000 })
  if (SENSITIVE.has(id)) check(`${id}: imported as sensitive`, JSON.parse(readFileSync(`test/services/${id}/service.json`, 'utf8')).sensitive === true)
  const answers = []
  const rel = JSON.parse(execFileSync(process.execPath, ['src/release.mjs', 'release', id]).toString())
  JSON.parse(execFileSync(process.execPath, ['src/release.mjs', 'promote', id]).toString())
  check(`${id}: imported manifest passes the release check and releases`, rel.ok, JSON.stringify(rel))
  const direct = await connectStdio([RUN, id], { startTimeoutMs: 60000 })
  const h = await startHarness({ name: 'gateway-parity', env: { ANCHOR_ALERT_BACKEND: 'log' } })
  for (const [tool, args] of PLANS[id]) {
    const d = textOf(await direct.callTool(tool, args))
    answers.push(d)
    const a = (await h.call('anchor_run', { calls: [{ target: `${id}:${tool}`, args }] })).data[0]
    const av = typeof a.value === 'string' ? a.value : JSON.stringify(a.value)
    // Live state (a health check) can change between the two calls: on a
    // mismatch, ask directly again and accept a match with either answer.
    const d2 = norm(av) === norm(d) ? d : textOf(await direct.callTool(tool, args))
    check(`${id}:${tool} gives the same answer through anchor`, a.ok && (norm(av) === norm(d) || norm(av) === norm(d2)), firstDiff(norm(av), norm(d)) || JSON.stringify(a).slice(0, 300))
  }
  if (SENSITIVE.has(id)) {
    // A distinctive line of each answer must appear in no file anywhere under anchor's state.
    const probes = answers.map((a) => a.split('\n').map((l) => l.trim()).filter((l) => l.length > 30).sort((x, y) => y.length - x.length)[0]).filter(Boolean)
    const leaked = filesUnder(P.stateDir).filter((f) => { const t = readFileSync(f, 'utf8'); return probes.some((q) => t.includes(q) || t.includes(JSON.stringify(q).slice(1, -1))) })
    check(`${id}: no result reached anchor's disk (${probes.length} probes)`, probes.length === PLANS[id].length && !leaked.length, `leaked into ${leaked.join(', ')}; probes ${probes.length}`)
  }
  const [tool, args] = PLANS[id][0]
  // Latency is measured on an operation answered locally (its guide): a
  // database round trip varies by hundreds of ms and would drown anchor's cost.
  const [ltool, largs] = PLANS[id].find(([t]) => /guide/.test(t))
  const dt = []; const at = []
  for (let i = 0; i < 10; i++) {
    let t = Date.now(); await direct.callTool(ltool, largs); dt.push(Date.now() - t)
    t = Date.now(); await h.call('anchor_run', { calls: [{ target: `${id}:${ltool}`, args: largs }] }); at.push(Date.now() - t)
  }
  const added = median(at) - median(dt)
  check(`${id}: added median latency under 50 ms`, added < 50, `direct ${median(dt)} ms, anchor ${median(at)} ms, added ${added} ms`)
  const st = (await h.call('anchor_run', { calls: [{ target: 'anchor:status' }] })).data[0].value.services
  const sup = Object.entries(st).find(([k]) => k.startsWith(`${id}@`))?.[1]
  check(`${id}: cold start is measured and reported`, sup?.coldStartMs > 0, JSON.stringify(st))
  console.log(`  ${id} (${ltool}): direct median ${median(dt)} ms, anchor median ${median(at)} ms, cold start ${sup?.coldStartMs} ms`)
  // The service's own server dies: anchor restarts it on the next call.
  try { execSync(`pkill -f "mcps/anchor/src/service-host.mjs .*${id}/dist"`) } catch {}
  await new Promise((r) => setTimeout(r, 500))
  const again = (await h.call('anchor_run', { calls: [{ target: `${id}:${tool}`, args }] })).data[0]
  check(`${id}: anchor recovers when the service's server dies`, again.ok, JSON.stringify(again).slice(0, 300))
  direct.close()
  await h.close()
  killDaemon()
}
// A gateway serves only what its manifest declares, under snake_case names
// mapped to the server's own tool names (notion-kickoff's are "API-...").
{
  execFileSync(process.execPath, ['src/import-service.mjs', 'notion-kickoff'], { stdio: 'ignore', timeout: 120000 })
  const mp = 'test/services/notion-kickoff/service.json'
  const m = JSON.parse(readFileSync(mp, 'utf8'))
  check('notion-kickoff: tool names become snake_case operations that keep their tool', m.operations.api_get_self?.tool === 'API-get-self' && m.operations.api_post_page?.tool === 'API-post-page', JSON.stringify(Object.keys(m.operations).slice(0, 4)))
  m.operations = { api_get_self: m.operations.api_get_self }
  writeFileSync(mp, JSON.stringify(m, null, 2))
  const rel = JSON.parse(execFileSync(process.execPath, ['src/release.mjs', 'release', 'notion-kickoff']).toString())
  execFileSync(process.execPath, ['src/release.mjs', 'promote', 'notion-kickoff'])
  check('a gateway trimmed to a subset of its tools passes the release check', rel.ok, JSON.stringify(rel))
  const h = await startHarness({ name: 'gateway-subset', env: { ANCHOR_ALERT_BACKEND: 'log' } })
  const r = (await h.call('anchor_run', { calls: [{ target: 'notion-kickoff:api_get_self' }, { target: 'notion-kickoff:api_post_page', args: {} }] })).data
  check('the declared operation reaches its tool', r[0].ok && /"object":"user"/.test(String(r[0].value)), JSON.stringify(r[0]).slice(0, 300))
  check('a tool the manifest leaves out cannot be called', r[1].code === 'unknown_op', JSON.stringify(r[1]))
  await h.close()
  killDaemon()
}
check('live registrations are untouched', JSON.stringify(JSON.parse(readFileSync(join(process.env.HOME, '.claude.json'), 'utf8')).mcpServers) === regsBefore)
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.detail ? `\n      ${x.detail.slice(0, 500)}` : ''}`)
console.log(`\n${results.filter((x) => x.ok).length}/${results.length} passed`)
killDaemon()
process.exit(results.every((x) => x.ok) ? 0 : 1)
