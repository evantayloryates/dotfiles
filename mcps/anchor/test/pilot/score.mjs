// Pilot scorer: reads runs/<out>/<harness>-<mode>/<task>/ and scores each task
// against harness/pilot/tasks.json, then compares each harness's anchor run
// with its direct baseline against the plan's acceptance targets.
//   node harness/pilot/score.mjs <out>
import '../env.mjs'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PILOT } from './setup.mjs'
import { paths } from '../../src/paths.mjs'
import { checkArgs } from '../../../_shared/kernel/service.mjs'

// Several runs (r5,r6) pool their rows: one row per task per run.
const out = process.argv[2]
const bases = out.split(',').map((o) => join(PILOT, 'runs', o))
const base = bases[0]
const P = paths()
const tasks = JSON.parse(readFileSync(process.env.PILOT_TASKS || join(P.lab, 'test/pilot/tasks.json'), 'utf8'))
const expected = JSON.parse(readFileSync(join(PILOT, 'expected.json'), 'utf8'))
const fill = (re) => new RegExp(re.replace(/\{(\w+)\}/g, (_, k) => String(expected[k]).replace(/\./g, '\\.')), 'i')
const lines = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)] } catch { return [] } }) : [])
const labSchema = (server, tool) => {
  const f = join(PILOT, 'services', server, 'service.json')
  return existsSync(f) && existsSync(join(PILOT, 'services', server, 'index.mjs')) ? JSON.parse(readFileSync(f, 'utf8')).operations?.[tool]?.inputSchema : undefined
}

// One shape for both harnesses: calls [{server, tool, args, error, text}], answer.
function transcript(file, harness) {
  const calls = []
  let answer = ''
  if (harness === 'claude') {
    const byId = new Map()
    for (const m of lines(file)) {
      if (m.type === 'assistant') for (const c of m.message.content) if (c.type === 'tool_use') {
        const [, server, tool] = c.name.split('__')
        const call = { server, tool, args: c.input, error: false, text: '' }
        byId.set(c.id, call); calls.push(call)
      }
      if (m.type === 'user' && Array.isArray(m.message.content)) for (const c of m.message.content) if (c.type === 'tool_result' && byId.has(c.tool_use_id)) {
        const call = byId.get(c.tool_use_id)
        call.error = !!c.is_error
        call.text = typeof c.content === 'string' ? c.content : (c.content || []).map((x) => x.text || '').join('\n')
      }
      if (m.type === 'result') answer = m.result || ''
    }
  } else {
    for (const m of lines(file)) {
      const it = m.item || {}
      if (m.type === 'item.completed' && it.type === 'mcp_tool_call' && it.server !== 'codex') {
        const text = (it.result?.content || []).map((x) => x.text || '').join('\n')
        calls.push({ server: it.server, tool: it.tool, args: it.arguments, error: !!it.error || !!it.result?.isError, text: text || it.error?.message || '' })
      }
      if (m.type === 'item.completed' && it.type === 'agent_message') answer = it.text
    }
  }
  return { calls, answer }
}

function scoreTask(task, dir, harness, mode) {
  const { calls, answer } = transcript(join(dir, 'transcript.jsonl'), harness)
  const e = task.expect
  const ops = mode === 'anchor'
    ? calls.filter((c) => c.tool === 'anchor_run').flatMap((c) => (c.args?.calls || []).map((x) => x.target))
    : calls.map((c) => `${c.server}:${c.tool}`)
  // Argument validity of each operation call, first try.
  let items = 0; let invalid = 0
  if (mode === 'anchor') {
    for (const r of lines(join(dir, 'state/ledger.jsonl'))) if (r.target && !r.late) { items++; if (r.code === 'bad_args') invalid++ }
  } else {
    for (const c of calls) {
      items++
      const schema = labSchema(c.server, c.tool)
      if (schema ? checkArgs(schema, c.args || {}) : c.error && /invalid|-32602|argument/i.test(c.text)) invalid++
    }
  }
  const tickets = lines(join(dir, 'state/tickets.jsonl'))
  const ticketed = e.ticket ? tickets.some((t) => t.t === 'open' && t.kind === 'report' && t.service === e.ticket) || tickets.some((t) => t.t === 'hit' && t.session && tickets.find((o) => o.t === 'open' && o.id === t.id)?.kind === 'report') : null
  const noteActed = e.noteOp ? ops.includes(e.noteOp) : null
  const answerOk = (e.answer || []).every((re) => fill(re).test(answer)) && !(e.avoid || []).some((re) => fill(re).test(answer))
  const bugOk = !e.ticket || (mode === 'anchor' ? ticketed : fill(e.flag).test(answer))
  const firstRun = calls.findIndex((c) => c.tool === 'anchor_run')
  const res = existsSync(join(dir, 'result.json')) ? JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8')) : {}
  return {
    task: task.id, kind: task.kind, success: answerOk && bugOk && noteActed !== false, answerOk, bugOk, ticketed, noteActed,
    calls: calls.length, items, invalid, describesBeforeRun: mode === 'anchor' ? calls.slice(0, firstRun < 0 ? calls.length : firstRun).filter((c) => c.tool === 'anchor_describe').length : null,
    ms: res.ms, exit: res.exit, answer: answer.slice(0, 400),
  }
}

const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null }
const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : null)
const report = {}
for (const cfg of readdirSync(base).filter((d) => /^(claude|codex)-(anchor|direct)$/.test(d))) {
  const [harness, mode] = cfg.split('-')
  const rows = bases.flatMap((b) => tasks.filter((t) => existsSync(join(b, cfg, t.id, 'transcript.jsonl'))).map((t) => scoreTask(t, join(b, cfg, t.id), harness, mode)))
  const items = rows.reduce((a, r) => a + r.items, 0); const invalid = rows.reduce((a, r) => a + r.invalid, 0)
  const notes = rows.filter((r) => r.noteActed !== null); const bugs = rows.filter((r) => r.ticketed !== null)
  report[cfg] = {
    tasks: rows.length, successPct: pct(rows.filter((r) => r.success).length, rows.length), firstTryValidPct: pct(items - invalid, items),
    medianCalls: median(rows.map((r) => r.calls)), notesActedPct: pct(notes.filter((r) => r.noteActed).length, notes.length),
    bugsTicketedPct: mode === 'anchor' ? pct(bugs.filter((r) => r.ticketed).length, bugs.length) : null,
    meanDescribesBeforeRun: mode === 'anchor' ? Math.round((rows.reduce((a, r) => a + r.describesBeforeRun, 0) / rows.length) * 10) / 10 : null,
    medianSeconds: Math.round(median(rows.map((r) => r.ms)) / 100) / 10, failed: rows.filter((r) => !r.success).map((r) => r.task), rows,
  }
}
const verdict = {}
for (const h of ['claude', 'codex']) {
  const a = report[`${h}-anchor`]; const d = report[`${h}-direct`]
  if (!a) continue
  verdict[h] = {
    'success >= 90% and >= baseline': a.successPct >= 90 && (!d || a.successPct >= d.successPct),
    'first-try valid >= 90%': a.firstTryValidPct >= 90,
    'median calls <= 1.3x baseline': !d || a.medianCalls <= 1.3 * d.medianCalls,
    'notes acted >= 80%': a.notesActedPct >= 80,
    'bugs ticketed 100%': a.bugsTicketedPct === 100,
  }
}
writeFileSync(join(base, bases.length > 1 ? `score-${out.replace(/,/g, '+')}.json` : 'score.json'), JSON.stringify({ report, verdict }, null, 1))
for (const [cfg, r] of Object.entries(report)) console.log(`${cfg.padEnd(14)} success ${r.successPct}%  valid ${r.firstTryValidPct}%  calls ${r.medianCalls}  notes ${r.notesActedPct}%  tickets ${r.bugsTicketedPct ?? '-'}%  describes ${r.meanDescribesBeforeRun ?? '-'}  ${r.medianSeconds} s  failed: ${r.failed.join(',') || 'none'}`)
for (const [h, v] of Object.entries(verdict)) console.log(`${h}: ${Object.entries(v).map(([k, ok]) => `${ok ? 'MET' : 'MISSED'} ${k}`).join(' | ')}`)
