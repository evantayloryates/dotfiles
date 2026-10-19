// Scores anchor_discover against harness/discovery/eval.jsonl over the pilot
// services. Recall: every needed service is among the matches (a need no
// service covers: no matches). Precision: needed matches / matches.
//   node harness/discovery/eval.mjs [--verbose]
import '../env.mjs'
import { mkdirSync, readFileSync, rmSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createAnchor } from '../../src/core.mjs'
import { paths } from '../../src/paths.mjs'

const P = paths()
const services = join(homedir(), '.cache/anchor-lab/pilot/services')
const stateDir = join(homedir(), '.cache/anchor-lab/discovery-eval')
rmSync(stateDir, { recursive: true, force: true }); mkdirSync(stateDir, { recursive: true })
const anchor = createAnchor({ servicesDir: services, stateDir })
const items = readFileSync(join(P.lab, 'test/discovery/eval.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const rows = []
for (const it of items) {
  const t0 = process.hrtime.bigint()
  const r = await anchor.discover({ need: it.need })
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  const got = r.matches.map((m) => m.id)
  const hit = it.services.length ? it.services.every((x) => got.includes(x)) : got.length === 0
  const precision = got.length ? got.filter((x) => it.services.includes(x)).length / got.length : it.services.length ? 0 : 1
  rows.push({ ...it, got, hit, precision, settledBy: r.settledBy, ms })
}
const median = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)]
const by = (k) => Object.entries(rows.reduce((a, r) => ((a[r[k]] ||= []).push(r), a), {}))
const pct = (n, d) => Math.round((1000 * n) / d) / 10
console.log(`recall ${pct(rows.filter((r) => r.hit).length, rows.length)}%  precision ${pct(rows.reduce((a, r) => a + r.precision, 0), rows.length)}%  median ${median(rows.map((r) => r.ms)).toFixed(2)} ms  n=${rows.length}`)
for (const [k, rs] of by('source')) console.log(`  ${k.padEnd(15)} recall ${pct(rs.filter((r) => r.hit).length, rs.length)}%  precision ${pct(rs.reduce((a, r) => a + r.precision, 0), rs.length)}%  n=${rs.length}`)
for (const [k, rs] of by('settledBy')) console.log(`  settled ${k.padEnd(20)} ${rs.length}  recall ${pct(rs.filter((r) => r.hit).length, rs.length)}%`)
for (const r of rows.filter((r) => !r.hit || process.argv.includes('--verbose'))) console.log(`${r.hit ? 'ok  ' : 'MISS'} [${r.services.join(',')}] got [${r.got.join(',')}] ${r.settledBy}: ${r.need.slice(0, 80)}`)
// Log hygiene: no request text in any file anchor wrote.
const files = readdirSync(stateDir, { recursive: true }).map((f) => join(stateDir, f))
const leaks = files.filter((f) => { try { const t = readFileSync(f, 'utf8'); return items.some((it) => it.need.length > 12 && t.includes(it.need)) } catch { return false } })
console.log(`plaintext requests in logs: ${leaks.length}${leaks.length ? ' ' + leaks.join(', ') : ''}`)
rmSync(stateDir, { recursive: true, force: true })
process.exit(0)
