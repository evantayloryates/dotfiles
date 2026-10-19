// Independent AI code review before a change goes live without a person:
// a separate headless session, read only (Read, Grep, Glob), sandboxed and on
// the subscription, filled from review/TEMPLATE.md. It sees the files before
// and after, the diff and what the change is for, never the author's
// reasoning. Fails closed: no clear "approve" is a rejection.
//   const v = await reviewChange({ ws, change, context, files })
//   v.verdict: 'approve' | 'reject' | 'none'; v.risk; v.reasons; v.where

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runHeadless } from './headless.mjs'

const TEMPLATE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'review', 'TEMPLATE.md'), 'utf8')
const VERDICTS = new Set(['approve', 'reject'])

// files: [{ name, before: Buffer | null, after: Buffer }]
// The review folder is created fresh, outside any workspace an author could
// write to, and every file in it is created new ('wx'): nothing the author
// planted (a symlink, an extra note) can reach the reviewer.
const ROOT = process.env.ANCHOR_REVIEW_WORKSPACES || join(homedir(), '.cache/anchor-lab/reviews')
export async function reviewChange({ change, context, files, custom = null, sandbox = true, timeoutMs = 10 * 60_000, label = 'review' }) {
  mkdirSync(ROOT, { recursive: true })
  const dir = mkdtempSync(join(ROOT, `${String(label).replace(/[^a-zA-Z0-9_-]/g, '-')}-`))
  for (const sub of ['before', 'after']) mkdirSync(join(dir, sub))
  const diffs = []
  for (const f of files) {
    if (!/^[A-Za-z0-9._-]+$/.test(f.name) || f.name.startsWith('.')) throw new Error(`refusing to review a file named ${JSON.stringify(f.name)}`)
    if (f.before !== null) writeFileSync(join(dir, 'before', f.name), f.before, { flag: 'wx' })
    writeFileSync(join(dir, 'after', f.name), f.after, { flag: 'wx' })
    try {
      execFileSync('/usr/bin/diff', ['-u', f.before === null ? '/dev/null' : `before/${f.name}`, `after/${f.name}`], { cwd: dir })
    } catch (err) {
      diffs.push(String(err.stdout)) // diff exits 1 when the files differ
    }
  }
  writeFileSync(join(dir, 'diff.txt'), diffs.join('\n'), { flag: 'wx' })
  writeFileSync(join(dir, 'context.md'), context, { flag: 'wx' })
  const brief = TEMPLATE.replace('{{change}}', change)
  const r = await runHeadless({ ws: dir, brief, tools: 'Read,Grep,Glob', custom, sandbox, timeoutMs, label: 'review' })
  const base = { where: r.where, authSource: r.authSource, cost: r.session?.total_cost_usd ?? null }
  if (r.stoppedForAuth) return { ...base, verdict: 'none', reasons: [`reviewer was not on the subscription (apiKeySource ${r.authSource})`] }
  if (!r.session || r.session.is_error) return { ...base, verdict: 'none', reasons: [`reviewer failed: ${String(r.session?.result || r.run.err.trim().split('\n').pop() || r.run.signal || r.run.code).slice(0, 200)}`] }
  // Strictly the last line: anything else there, or a second verdict-shaped
  // object earlier in the answer, is no verdict.
  const lines = String(r.session.result || '').trim().split('\n').map((l) => l.trim()).filter(Boolean)
  let v = null
  try { v = JSON.parse(lines.at(-1)) } catch {}
  const verdictLines = lines.filter((l) => /^\{.*"verdict"/.test(l)).length
  if (verdictLines > 1) v = null
  if (!v || !VERDICTS.has(v.verdict)) return { ...base, verdict: 'none', reasons: ['the reviewer gave no verdict in the required form'] }
  return { ...base, verdict: v.verdict, risk: ['low', 'medium', 'high'].includes(v.risk) ? v.risk : 'unknown', reasons: (Array.isArray(v.reasons) ? v.reasons : []).map((x) => String(x).slice(0, 300)).slice(0, 10) }
}
