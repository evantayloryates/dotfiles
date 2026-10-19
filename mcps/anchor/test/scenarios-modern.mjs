// Phase 1: the anchor front end as a 2026-07-28 client sees it (the way
// Claude Code 2.1.292 talks once server/discover is answered).
import './env.mjs'
import { execSync, spawn } from 'node:child_process'
import { rmSync, mkdirSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { paths } from '../src/paths.mjs'

const P = paths()
const K = 'io.modelcontextprotocol/'
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: ok ? '' : String(detail) })
try { execSync(`pkill -9 -f "${P.daemon} --state ${P.stateDir}"`) } catch {}
rmSync(P.stateDir, { recursive: true, force: true }); mkdirSync(P.stateDir, { recursive: true })
const child = spawn(process.execPath, [join(P.lab, 'src/shim.mjs')], { stdio: ['pipe', 'pipe', 'pipe'] })
const waiting = new Map()
const progress = []
createInterface({ input: child.stdout }).on('line', (l) => { const m = JSON.parse(l); if (m.id === undefined) return progress.push(m); waiting.get(m.id)?.(m) })
let seq = 0
const meta = (extra = {}) => ({ [`${K}protocolVersion`]: '2026-07-28', [`${K}clientInfo`]: { name: 'claude-code', version: '2.1.292' }, [`${K}clientCapabilities`]: {}, ...extra })
const req = (method, params = {}) => new Promise((r) => { const id = ++seq; waiting.set(id, r); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params: { ...params, _meta: { ...meta(), ...(params._meta || {}) } } }) + '\n') })

const d = await req('server/discover')
check('discover answers with modern versions and composed instructions', d.result.supportedVersions.includes('2026-07-28') && /anchor_discover/.test(d.result.instructions) && /generated for claude-code/.test(d.result.instructions), JSON.stringify(d.result).slice(0, 300))
const l = await req('tools/list')
check('tools/list is modern and cacheable', l.result.resultType === 'complete' && l.result.ttlMs > 0 && l.result.tools.length === 3, JSON.stringify(l.result).slice(0, 200))
const r = await req('tools/call', { name: 'anchor_run', arguments: { calls: [{ target: 'echo:add', args: { a: 2, b: 3 } }, { target: 'slow:work', args: { ms: 500 } }] }, _meta: { progressToken: 'm1' } })
const items = JSON.parse(r.result.content[0].text)
check('anchor_run works in modern mode', r.result.resultType === 'complete' && items[0].value === 5 && items[1].ok, JSON.stringify(r.result).slice(0, 300))
check('progress reaches a modern client', progress.some((p) => p.params?.progressToken === 'm1'), JSON.stringify(progress.slice(-2)))
const s1 = (await req('tools/call', { name: 'anchor_run', arguments: { calls: [{ target: 'anchor:status' }] } })).result
const s2 = (await req('tools/call', { name: 'anchor_run', arguments: { calls: [{ target: 'anchor:status' }] } })).result
check('one front-end process keeps one session across modern requests', JSON.parse(s1.content[0].text)[0].value.sessions === 1 && JSON.parse(s2.content[0].text)[0].value.sessions === 1)
child.stdin.end()
await new Promise((r) => child.on('exit', r))
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.detail ? `\n      ${x.detail.slice(0, 500)}` : ''}`)
console.log(`\n${results.filter((x) => x.ok).length}/${results.length} passed`)
try { execSync(`pkill -9 -f "${P.daemon} --state ${P.stateDir}"`) } catch {}
process.exit(results.every((x) => x.ok) ? 0 : 1)
