// One real hotfix: a released "mend" service fails on stable; the daemon
// dispatches a real Claude session through claude-driver to fix it.
import './env.mjs'
import { execSync, execFileSync } from 'node:child_process'
import { rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { startHarness } from './client.mjs'
import { paths } from '../src/paths.mjs'
const P = paths()
const ENV = {
  ANCHOR_DISPATCH_CMD: JSON.stringify([process.execPath, 'src/fixer-headless.mjs']),
  ANCHOR_DISPATCH_TIMEOUT_MS: String(30 * 60_000),
  ANCHOR_FIXER_TIMEOUT_MS: String(25 * 60_000),
  ANCHOR_DISPATCH_MAX_ATTEMPTS: '1',
}
try { execSync(`pkill -9 -f "${P.daemon} --state ${P.stateDir}"`) } catch {}
rmSync(P.stateDir, { recursive: true, force: true }); mkdirSync(P.stateDir, { recursive: true })
rmSync('test/services/mend', { recursive: true, force: true }); mkdirSync('test/services/mend', { recursive: true })
writeFileSync('test/services/mend/service.json', JSON.stringify({ description: 'Returns the value it is given; a lab service for the real hotfix test.', version: '2026-10-19.001', operations: { get: { description: 'Return {x}.', class: 'read', inputSchema: { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] } } } }, null, 2))
writeFileSync('test/services/mend/GUIDE.md', '# mend\n\n`mend:get {x}` returns `{x}`.\n')
writeFileSync('test/services/mend/index.mjs', "// Bug: inputs listed in CRASH crash the process instead of being returned.\nconst CRASH = ['deep']\nexport const ops = { get: { handler: ({ x }) => { if (CRASH.includes(x)) { setImmediate(() => { throw new Error('mend: cannot read ' + x) }); return new Promise(() => {}) } return { x } } } }\n")
const rel = (...a) => JSON.parse(execFileSync(process.execPath, ['src/release.mjs', ...a]).toString())
console.log('release', rel('release', 'mend').slug, 'promote', rel('promote', 'mend').stable)
const h = await startHarness({ name: 'real-e2e', env: ENV })
const r = await h.call('anchor_run', { calls: [{ target: 'mend:get', args: { x: 'deep' } }] })
console.log('trigger:', r.data[0].code, '| notes:', r.notes?.replace(/\n/g, ' '))
const t = await h.call('anchor_run', { calls: [{ target: 'anchor:ticket.list', args: { mine: false } }] })
console.log('tickets:', JSON.stringify(t.data[0].value.map((x) => [x.id, x.kind, x.state])))
await h.close()
