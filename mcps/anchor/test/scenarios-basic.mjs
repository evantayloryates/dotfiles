// Round 1: the happy paths and the obvious edges of the three tools.
import './env.mjs'
import { execSync } from 'node:child_process'
import { rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { startHarness } from './client.mjs'
import { paths } from '../src/paths.mjs'

const P = paths()
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: ok ? '' : detail })
const freshState = () => {
  try { execSync(`pkill -f "${P.daemon} --state ${P.stateDir}"`) } catch {}
  rmSync(P.stateDir, { recursive: true, force: true })
  mkdirSync(P.stateDir, { recursive: true })
}

freshState()
const h = await startHarness({ name: 'claude-code-sim' })
check('cold start under 3 s (front end + daemon spawn)', h.startMs < 3000, `${h.startMs} ms`)
check('exactly three tools', h.tools.map((t) => t.name).join() === 'anchor_discover,anchor_describe,anchor_run', h.tools.map((t) => t.name).join())
check('instructions carry the notes-channel preamble', h.init.instructions.includes('[anchor notes]'))
check('instructions list every service', ['echo', 'flaky', 'slow'].every((s) => new RegExp(`^- ${s}( [0-9.-]+)?:`, 'm').test(h.init.instructions)) && h.init.instructions.includes('claude-code-sim'), h.init.instructions)

let r = await h.call('anchor_discover', { list: true })
check('discover list returns every service', ['echo','flaky','slow'].every((id) => r.data.services?.some((s) => s.id === id)), JSON.stringify(r.data))
r = await h.call('anchor_discover', { need: 'I need to add some numbers' })
check('discover by need ranks echo first', r.data.matches?.[0]?.id === 'echo', JSON.stringify(r.data))

r = await h.call('anchor_describe', { targets: [{ target: 'echo' }, { target: 'echo:add' }, { target: 'slow:work' }, { target: 'nope' }, { target: 'echo:missing' }] })
const d = r.data
check('describe is bulk: 5 items back', d.length === 5, JSON.stringify(d))
check('describe service lists ops', d[0]?.ops?.add && d[0]?.ops?.echo)
check('describe op returns schema', d[1]?.inputSchema?.required?.includes('a'))
check('describe unknown service is a per-item error', d[3]?.error?.includes('no service'))
check('describe unknown op lists alternatives', d[4]?.available?.includes('echo'), JSON.stringify(d[4]))

r = await h.call('anchor_run', { calls: [
  { target: 'echo:echo', args: { text: 'hi' } },
  { target: 'echo:add', args: { a: 2, b: 'three' } },
  { target: 'echo:pixel' },
  { target: 'ghost:op' },
  { target: 'echo:guide' },
  { target: 'echo:status' },
  { target: 'echo' },
] })
const it = r.data
check('bulk run returns 7 items in order', it.length === 7 && it.every((x, i) => x.index === i), JSON.stringify(it))
check('item 1 ok', it[0].ok && it[0].value === 'hi')
check('bad args rejected with schema', it[1].code === 'bad_args' && it[1].schema, JSON.stringify(it[1]))
check('image passed through as an image block', r.images.length === 1 && r.images[0].mimeType === 'image/png', JSON.stringify(r.raw).slice(0, 300))
check('unknown service is per-item, lists available', it[3].code === 'unknown_service' && it[3].available?.includes('echo'))
check('standard guide op served from GUIDE.md', it[4].ok && /echo:add/.test(it[4].value))
check('standard status op', it[5].ok && ['ready', 'starting', 'stopped'].includes(it[5].value.state), JSON.stringify(it[5]))
check('target without operation is a clear error', it[6].code === 'bad_target')

r = await h.call('anchor_run', { calls: [{ target: 'slow:work', args: { ms: 1500 } }], deadline_ms: 300 }, { progressToken: 'p1' })
const job = r.data[0]
check('slow call past deadline returns a job handle', job.state === 'running' && job.handle, JSON.stringify(job))
r = await h.call('anchor_run', { calls: [{ target: 'anchor:job.wait', args: { handles: [job.handle], timeout_ms: 5000 } }] })
check('job.wait returns the finished result', r.data[0].value?.[0]?.state === 'done' && r.data[0].value[0].result?.value?.worked === 1500, JSON.stringify(r.data))

r = await h.call('anchor_run', { calls: [{ target: 'slow:work', args: { ms: 4000 } }], deadline_ms: 200 })
const j2 = r.data[0].handle
await h.call('anchor_run', { calls: [{ target: 'anchor:job.cancel', args: { handles: [j2] } }] })
r = await h.call('anchor_run', { calls: [{ target: 'anchor:job.wait', args: { handles: [j2], timeout_ms: 3000 } }] })
check('job.cancel stops the work', r.data[0].value?.[0]?.state === 'failed' && /cancel/.test(r.data[0].value[0].result?.error), JSON.stringify(r.data))

r = await h.call('anchor_run', { calls: [{ target: 'slow:work', args: { ms: 600 } }] }, { progressToken: 'p2' })
check('progress notifications reach the harness', h.progress.some((p) => p.progressToken === 'p2' && /step/.test(p.message)), JSON.stringify(h.progress.slice(-3)))

const h2 = await startHarness({ name: 'codex-sim' })
r = await h2.call('anchor_run', { calls: [{ target: 'anchor:status' }] })
check('second chat shares the daemon (2 sessions)', r.data[0].value?.sessions === 2, JSON.stringify(r.data[0]))
check('warm start is faster than cold', h2.startMs < h.startMs, `${h2.startMs} vs ${h.startMs}`)
check('hello reused generated session context', /generated for/.test(h2.init.instructions), h2.init.instructions.split('\n').filter((l) => l.startsWith('- echo')).join())

await h.close()
await h2.close()
// First run: a state folder that does not exist yet is created.
{
  const fresh = join(P.stateDir, '..', 'test-state-fresh-' + process.pid)
  rmSync(fresh, { recursive: true, force: true })
  const f = await startHarness({ name: 'first-run', env: { ANCHOR_STATE_DIR: fresh } })
  const r = await f.call('anchor_run', { calls: [{ target: 'echo:echo', args: { text: 'first' } }] })
  check('a first run creates its state folder and works', r.data[0].ok && r.data[0].value === 'first', JSON.stringify(r.data[0]))
  await f.close()
  try { execSync(`pkill -f "${P.daemon} --state ${fresh}"`) } catch {}
  rmSync(fresh, { recursive: true, force: true })
}
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `\n      ${r.detail.slice(0, 400)}` : ''}`)
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`)
try { execSync(`pkill -f "${P.daemon} --state ${P.stateDir}"`) } catch {}
process.exit(results.every((r) => r.ok) ? 0 : 1)
