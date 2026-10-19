// Exports sanitized aggregates for the dashboard: counts, codes, timings and
// ticket fields only, never call arguments or results.
//   node anchor/export-dashboard.mjs [out.json]
// Live numbers (process state, tickets) come from the running anchor through
// its own front end, so they match anchor:status and anchor:ticket.list.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { paths } from './paths.mjs'
import { readChannels, releases } from './channels.mjs'
import { startHarness } from '../test/client.mjs'

const P = paths()
const out = process.argv[2] || join(P.stateDir, 'dashboard.json')
const lines = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)] } catch { return [] } }) : [])
const ledger = lines(join(P.stateDir, 'ledger.jsonl'))
const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null }

// Calls per service and operation.
const ops = {}
for (const r of ledger) {
  if (!r.target || r.late) continue
  const k = r.target
  const o = (ops[k] ||= { target: k, calls: 0, errors: 0, fallbacks: 0, codes: {}, ms: [] })
  o.calls++
  if (r.ok === false) { o.errors++; o.codes[r.code || 'error'] = (o.codes[r.code || 'error'] || 0) + 1 }
  if ((r.attempts || []).length > 1) o.fallbacks++
  if (typeof r.ms === 'number') o.ms.push(r.ms)
}
const calls = Object.values(ops).map(({ ms, ...o }) => ({ ...o, medianMs: median(ms), errorRate: o.calls ? o.errors / o.calls : 0, fallbackRate: o.calls ? o.fallbacks / o.calls : 0 })).sort((a, b) => b.calls - a.calls)
const coldStarts = ledger.filter((r) => r.event?.type === 'started').map((r) => ({ service: r.event.service, ms: r.event.coldStartMs, at: r.at }))

// Releases per channel and nightly age.
const channels = existsSync(join(P.stateDir, 'channels')) ? readdirSync(join(P.stateDir, 'channels')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : []
const now = Date.now()
const releaseRows = channels.map((id) => {
  const ch = readChannels(P.stateDir, id)
  return { service: id, stable: ch.stable, nightly: ch.nightly, nightlyAgeHours: ch.nightlySince ? Math.round((now - Date.parse(ch.nightlySince)) / 360000) / 10 : null, releases: releases(P.servicesDir, id).length, history: (ch.history || []).slice(-8).map((h) => ({ at: h.at, action: h.action, slug: h.slug })) }
})

// Live: status and tickets, through the front end like any chat.
const h = await startHarness({ name: 'dashboard-export', env: { ANCHOR_ALERT_BACKEND: 'log' } })
const [st, tl] = (await h.call('anchor_run', { calls: [{ target: 'anchor:status' }, { target: 'anchor:ticket.list', args: { mine: false, limit: 500 } }] })).data.map((d) => d.value)
await h.close()
const tickets = (tl || []).map((t) => ({ id: t.id, kind: t.kind, lane: t.lane, service: t.service, op: t.op, state: t.state, priority: t.priority, title: t.title, sessions: t.sessions, count: t.count, attempts: t.attempts }))
// Fixer outcomes: the ticket journal's fixer notes (outcome and notional cost).
const fixer = lines(join(P.stateDir, 'tickets.jsonl')).filter((r) => r.t === 'state' && ['fixed', 'escalated', 'failed'].includes(r.state) && r.note).map((r) => ({ id: r.id, state: r.state, at: r.at, costUsd: Number(r.note.match(/notional cost \$([\d.]+)/)?.[1] ?? NaN) || null, sandboxed: /sandboxed/.test(r.note), release: r.fixedIn || null }))

const data = {
  exportedAt: new Date().toISOString(),
  status: { mode: st.mode, sessions: st.sessions, jobs: st.jobs, services: st.services, fallingBack: st.fallingBack },
  calls, coldStarts, releases: releaseRows, tickets, fixer,
}
writeFileSync(out, JSON.stringify(data, null, 1))
// Flat row files, one per dataset, for the dashboard page.
const flat = join(dirname(out), 'dashboard')
mkdirSync(flat, { recursive: true })
const rows = {
  ops: calls.map((c) => ({ target: c.target, service: c.target.split(':')[0], op: c.target.split(':')[1], calls: c.calls, errors: c.errors, fallbacks: c.fallbacks, errorRate: c.errorRate, fallbackRate: c.fallbackRate, medianMs: c.medianMs, codes: Object.entries(c.codes).map(([k, v]) => `${k} ${v}`).join(', ') })),
  services: Object.entries(st.services || {}).map(([k, v]) => ({ service: k, state: v.state, coldStartMs: v.coldStartMs, recentCrashes: v.recentCrashes, quarantinedOps: (v.quarantinedOps || []).join(', '), fallingBack: (st.fallingBack || []).filter((f) => k === `${f.service}@${f.nightly}`).map((f) => `${f.op} (${f.fallbacks}/${f.nightlyCalls})`).join(', ') })),
  releases: releaseRows.map(({ history, ...r }) => ({ ...r, lastAction: history.at(-1)?.action || null })),
  tickets,
  fixer,
}
for (const [k, v] of Object.entries(rows)) writeFileSync(join(flat, `${k}.json`), JSON.stringify(v, null, 1))
console.log(`${out}: ${calls.length} operations, ${tickets.length} tickets, ${releaseRows.length} released services, ${fixer.length} fixer outcomes`)
process.exit(0)
