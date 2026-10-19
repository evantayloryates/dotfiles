// Independent AI code review before a change goes live without a person:
// a separate headless session, read only (Read, Grep, Glob), sandboxed and on
// the subscription, filled from review/TEMPLATE.md. It sees the files before
// and after, the diff and what the change is for, never the author's
// reasoning. Fails closed: no clear "approve" is a rejection.
//   const v = await reviewChange({ ws, change, context, files })
//   v.verdict: 'approve' | 'reject' | 'none'; v.risk; v.reasons; v.where

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runHeadless } from './headless.mjs'

const TEMPLATE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'review', 'TEMPLATE.md'), 'utf8')
const VERDICTS = new Set(['approve', 'reject'])

// files: [{ name, before: Buffer | null, after: Buffer }]
export async function reviewChange({ ws, change, context, files, custom = null, sandbox = true, timeoutMs = 10 * 60_000 }) {
  const dir = join(ws, 'review')
  for (const sub of ['before', 'after']) mkdirSync(join(dir, sub), { recursive: true })
  const diffs = []
  for (const f of files) {
    if (f.before !== null) writeFileSync(join(dir, 'before', f.name), f.before)
    writeFileSync(join(dir, 'after', f.name), f.after)
    try {
      execFileSync('/usr/bin/diff', ['-u', f.before === null ? '/dev/null' : `before/${f.name}`, `after/${f.name}`], { cwd: dir })
    } catch (err) {
      diffs.push(String(err.stdout)) // diff exits 1 when the files differ
    }
  }
  writeFileSync(join(dir, 'diff.txt'), diffs.join('\n'))
  writeFileSync(join(dir, 'context.md'), context)
  const brief = TEMPLATE.replace('{{change}}', change)
  const r = await runHeadless({ ws: dir, brief, tools: 'Read,Grep,Glob', custom, sandbox, timeoutMs, label: 'review' })
  const base = { where: r.where, authSource: r.authSource, cost: r.session?.total_cost_usd ?? null }
  if (r.stoppedForAuth) return { ...base, verdict: 'none', reasons: [`reviewer was not on the subscription (apiKeySource ${r.authSource})`] }
  if (!r.session || r.session.is_error) return { ...base, verdict: 'none', reasons: [`reviewer failed: ${String(r.session?.result || r.run.err.trim().split('\n').pop() || r.run.signal || r.run.code).slice(0, 200)}`] }
  const last = String(r.session.result || '').trim().split('\n').reverse().find((l) => l.trim().startsWith('{'))
  let v = null
  try { v = JSON.parse(last) } catch {}
  if (!v || !VERDICTS.has(v.verdict)) return { ...base, verdict: 'none', reasons: ['the reviewer gave no verdict in the required form'] }
  return { ...base, verdict: v.verdict, risk: ['low', 'medium', 'high'].includes(v.risk) ? v.risk : 'unknown', reasons: (Array.isArray(v.reasons) ? v.reasons : []).map((x) => String(x).slice(0, 300)).slice(0, 10) }
}
