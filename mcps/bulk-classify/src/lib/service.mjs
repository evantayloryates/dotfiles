// The operations behind every entry point (MCP tools and the CLI), and the
// text they return. Response rules from the agent tests (2026-10-01):
// - stay under ~8k characters (Codex truncates silently and its model then
//   invents the missing part; Claude Code spills to a file);
// - summary first, with "none" on its own line;
// - every response and error names the exact next call;
// - never mention where the service keeps anything: agents follow any path
//   they are shown, and read whatever is there.

import { createHash } from 'node:crypto'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { buildBank } from './bank.mjs'
import { classifyItems } from './classify.mjs'
import { callerPath, checkDataPath, fieldsOf, readRowsFromFile, toItems } from './input.mjs'
import { createJob, findDuplicate, findJob, jobDir, liveWorker, newJobId, prune, readInput, readResults, readState, requestCancel, restart, startWorker, waitFor, writeJson } from './jobs.mjs'
import { newUsage } from './openai.mjs'
import { ensureDirs, RETENTION_DAYS } from './paths.mjs'
import { compareWithHistory, describeProfile, listProfiles, loadProfile, recordRun, saveProfile } from './profiles.mjs'
import { summarize } from './summary.mjs'
import { buildTaxonomy, NONE, UserError } from './taxonomy.mjs'
import { clip, dedupeKey } from './text.mjs'
import { writeOutput } from './output.mjs'

export const MAX_TEXTS = 50
export const MAX_INLINE_JOB_ITEMS = 500
const MAX_PAGE = 50

export function init() {
  ensureDirs()
  try {
    prune(RETENTION_DAYS)
  } catch {}
}

export function callerFrom(clientName, cwd) {
  const name = clientName || 'unknown'
  return { key: createHash('sha256').update(`${name}|${cwd}`).digest('hex').slice(0, 12), client: name, cwd }
}

// ---------------------------------------------------------------------------
// Label sets

function resolveTaxonomy(args) {
  if (args.profile && args.labels) {
    const p = loadProfile(args.profile)
    throw new UserError(`Pass profile or labels, not both. Profile "${p.name}" already defines: ${p.labels.map((l) => l.name).join(', ')}.`)
  }
  if (args.profile) {
    const p = loadProfile(args.profile)
    return { profile: p, taxonomy: buildTaxonomy({ labels: p.labels, examples: args.examples }) }
  }
  if (!args.labels) throw new UserError('Pass labels (for example ["billing", "scheduling"] or [{"name": "billing", "description": "charges, refunds"}]) or the name of a saved profile. List profiles with classify_profiles.')
  return { profile: null, taxonomy: buildTaxonomy({ labels: args.labels, examples: args.examples }) }
}

function options(args) {
  const maxLabels = args.max_labels == null ? 1 : Number(args.max_labels)
  if (![1, 2].includes(maxLabels)) throw new UserError('max_labels is 1 (one label per item, the default) or 2 (a main label plus an optional second one).')
  const prefer = args.prefer || 'speed'
  if (!['speed', 'accuracy'].includes(prefer)) throw new UserError('prefer is "speed" (the default: confident items skip the model) or "accuracy" (every item goes to the model).')
  return { maxLabels, prefer }
}

function inlineRows(items, max, tool) {
  if (!Array.isArray(items) || !items.length) return null
  if (items.length > max) {
    throw new UserError(
      tool === 'classify_texts'
        ? `items has ${items.length} entries; classify_texts takes at most ${MAX_TEXTS}. Call classify_start instead, with input_file (a JSONL or CSV path; the service reads it) or up to ${MAX_INLINE_JOB_ITEMS} items.`
        : `items has ${items.length.toLocaleString()} entries; at most ${MAX_INLINE_JOB_ITEMS} inline. Write them to a JSONL file and pass input_file instead; the service reads it.`
    )
  }
  return items.map((v, i) => ({ line: i + 1, value: v }))
}

// ---------------------------------------------------------------------------
// classify_texts: up to 50 texts, answered in this call

export async function classifyTexts(args, { signal } = {}) {
  const rows = inlineRows(args.items, MAX_TEXTS, 'classify_texts')
  if (!rows) throw new UserError(`Pass items: a list of up to ${MAX_TEXTS} texts, or of {"id": "...", "text": "..."} objects.`)
  const { taxonomy, profile } = resolveTaxonomy(args)
  const opts = options(args)
  const { items } = toItems(rows, { textField: 'text', idField: 'id' })
  const t0 = Date.now()
  const usage = newUsage()
  const bank = await buildBank(taxonomy, profile, { usage, signal })
  const results = new Map()
  const ok = items.map((it, n) => ({ ...it, n })).filter((it) => it.status === 'ok')
  for (const it of items.map((x, n) => ({ ...x, n }))) if (it.status !== 'ok') results.set(it.n, { n: it.n, status: it.status, reason: it.reason })
  await classifyItems(ok, bank, (i, r) => results.set(ok[i].n, { n: ok[i].n, ...r }), { ...opts, usage, signal })
  const summary = summarize(items, results, taxonomy, usage, Date.now() - t0)
  if (profile) recordRun(profile.name, summary, createHash('sha256').update(items.map((i) => i.text || '').join('\n')).digest('hex').slice(0, 32))

  const hasIds = args.items.some((v) => v && typeof v === 'object' && v.id != null)
  const lines = [`${items.length} text${items.length === 1 ? '' : 's'}, ${taxonomy.labels.length} labels (${summary.seconds}s):`]
  items.forEach((it, n) => {
    const r = results.get(n) || { status: 'error', reason: 'model_error' }
    const who = hasIds ? `${it.id}` : `${n + 1}`
    const what = r.status === 'ok' ? `${r.label}${r.secondary ? ` + ${r.secondary}` : ''} (${r.confidence})` : `not labelled: ${reasonText(r.reason)}`
    lines.push(`${who}. ${what}${it.text ? ` — "${clip(it.text, 60)}"` : ''}`)
  })
  const none = summary.counts[NONE] || 0
  if (none) lines.push(`Fit no label: ${none}. Report these separately; do not merge them into a label.`)
  if (summary.low_confidence) lines.push(`Low confidence: ${summary.low_confidence}. Worth a human look.`)
  return { text: lines.join('\n'), data: { results: items.map((it, n) => ({ id: it.id, ...strip(results.get(n)) })), summary } }
}

const strip = (r) => {
  if (!r) return { status: 'error', reason: 'model_error' }
  const { n, path, ...rest } = r
  return rest
}

const REASONS = {
  empty: 'empty',
  placeholder: 'a placeholder like "N/A"',
  no_content: 'no words or numbers',
  too_long: 'too long (over 3 million characters)',
  missing_text: 'no text field',
  text_not_string: 'text is not a string',
  model_declined: 'the model declined to label it',
  model_error: 'the model call failed',
  cancelled: 'cancelled',
}
const reasonText = (r) => REASONS[r] || r || 'unknown'

// ---------------------------------------------------------------------------
// classify_start

export async function startJob(args, { caller }) {
  if (args.resume_job_id) return resumeJob(args.resume_job_id, caller, args.max_usd)
  const { taxonomy, profile } = resolveTaxonomy(args)
  const opts = options(args)
  if (args.input_file && args.items) throw new UserError('Pass input_file or items, not both.')

  let rows
  let source
  let bad = 0
  let suspectLines = null
  if (args.input_file) {
    const abs = callerPath(args.input_file, caller.cwd)
    const read = readRowsFromFile(abs, args.input_file)
    rows = read.rows
    bad = read.bad
    if (read.suspect?.length) suspectLines = read.suspect
    source = { given: args.input_file, abs, format: read.format }
  } else {
    rows = inlineRows(args.items, MAX_INLINE_JOB_ITEMS, 'classify_start')
    if (!rows) throw new UserError('Pass input_file (a JSONL, CSV, JSON or text file; the service reads it, so do not read or paste the rows) or items (up to 500 texts).')
    source = { given: 'inline items' }
  }
  const textField = args.text_field || 'text'
  const idField = args.id_field || 'id'
  if (args.filter && (typeof args.filter !== 'object' || typeof args.filter.field !== 'string')) throw new UserError('filter is {"field": "...", and one or more of "equals", "contains", "gte", "lt"}, for example {"field": "sent_at", "gte": "2026-03-01", "lt": "2026-04-01"}.')
  for (const k of ['offset', 'limit']) if (args[k] != null && !(Number.isInteger(Number(args[k])) && Number(args[k]) >= 0)) throw new UserError(`${k} must be a whole number of 0 or more.`)
  const { items, missingField } = toItems(rows, { textField, idField, filter: args.filter, offset: Number(args.offset) || 0, limit: args.limit == null ? undefined : Number(args.limit) })
  if (!items.length) {
    throw new UserError(args.filter || args.offset || args.limit != null ? 'No rows match the filter, offset and limit.' : `No rows found in ${source.given}.`)
  }
  if (missingField === items.length) {
    const fields = fieldsOf(rows)
    throw new UserError(`Rows have no "${textField}" field. Fields found: ${fields.join(', ') || '(none)'}. Pass text_field with the right one.`)
  }
  const usable = items.filter((i) => i.status === 'ok').length
  if (!usable) throw new UserError(`None of the ${items.length.toLocaleString()} selected rows has text to classify (all empty or placeholders). Check text_field.`)

  const output = args.output_path ? { given: args.output_path, abs: callerPath(args.output_path, caller.cwd), include_text: !!args.include_text } : null
  if (output) checkDataPath(output.abs, output.given, { write: true })
  const estimate = estimateUsd(items, opts)
  const maxUsd = args.max_usd != null ? Number(args.max_usd) : DEFAULT_MAX_USD
  if (!(maxUsd > 0)) throw new UserError('max_usd must be a positive number of dollars.')
  if (estimate > maxUsd) throw new UserError(`This job would cost about $${estimate.toFixed(2)}, over the $${maxUsd} limit. Ask the user, then pass max_usd (for example ${Math.ceil(estimate * 1.5)}), or select fewer rows.`)
  const spec = { labels: profile ? null : taxonomy.labels, examples: taxonomy.examples, profile: profile?.name || null, max_labels: opts.maxLabels, prefer: opts.prefer, tier: process.env.CLASSIFIER_TIER || 'priority', max_usd: maxUsd }
  // By content, not path: a weekly file reused under one name is a new input.
  const contentFp = createHash('sha256').update(items.map((i) => i.text || '').join('\n')).digest('hex').slice(0, 32)
  const fingerprint = createHash('sha256').update(JSON.stringify({ spec, contentFp, out: output?.abs || null })).digest('hex')
  const dup = findDuplicate(fingerprint, caller)
  if (dup) return `An identical job of yours is already running: ${dup.id} (${pct(dup.state)}). Not starting another.\nNext: classify_wait {"job_id": "${dup.id}"}`

  const id = newJobId()
  createJob(id, { id, created: Date.now(), caller, fingerprint, content_fp: contentFp, spec, source: { given: source.given, format: source.format }, output, skipped_rows: bad }, items)
  startWorker(id)

  // Small jobs often finish within a few seconds; answering "finished" here
  // saves the caller a round trip.
  const st = await waitFor(id, 4)
  const est = Math.max(5, Math.round(usable / 1500 + longChars(items) / 400_000))
  const head = `Started job ${id}: ${items.length.toLocaleString()} items, ${taxonomy.labels.length} labels${profile ? ` (profile ${profile.name})` : ''}.`
  const notes = [`Estimated cost about $${Math.max(0.01, estimate).toFixed(2)} (limit $${maxUsd}).`]
  if (suspectLines) notes.push(`A quote that opens near line ${suspectLines[0]} seems to swallow the rows after it; check that line if counts look low.`)
  if (bad) notes.push(`${bad} unreadable row${bad === 1 ? ' was' : 's were'} skipped.`)
  if (items.length - usable) notes.push(`${items.length - usable} row${items.length - usable === 1 ? ' has' : 's have'} no usable text and will be reported as not labelled.`)
  if (args.include_text && !output) notes.push('include_text has no effect without output_path.')
  if (st.status === 'done') return [head.replace('Started job', 'Job'), ...notes, `Finished already.${st.outputError ? ` The results file was not written: ${st.outputError}.` : ''}`, `Next: classify_results {"job_id": "${id}"}`].join('\n')
  return [head, ...notes, `About ${est}s.`, `Next: classify_wait {"job_id": "${id}"}. One call usually suffices. Do not start it again.`].join('\n')
}

function resumeJob(jobId, caller, maxUsd) {
  const { id, job } = findJob(jobId, caller)
  const st = readState(id)
  if (st.status === 'done') return `Job ${id} already finished.\nNext: classify_results {"job_id": "${id}"}`
  if (st.status === 'running') return `Job ${id} is running (${pct(st)}).\nNext: classify_wait {"job_id": "${id}"}`
  if (maxUsd != null) writeJson(join(jobDir(id), 'job.json'), { ...job, spec: { ...job.spec, max_usd: Number(maxUsd) } })
  ensureCancelCleared(id)
  restart(id, st, 0)
  return `Resumed job ${id} from ${st.done.toLocaleString()} of ${st.total.toLocaleString()} items; finished items are kept.\nNext: classify_wait {"job_id": "${id}"}`
}

function ensureCancelCleared(id) {
  try {
    rmSync(join(jobDir(id), 'cancel'), { force: true })
  } catch {}
}

// Rough spend: short items up to ~$0.06 per 1,000 (measured $0.004-0.08; more
// with two labels or every item to the model); long items ~$0.0001 per 1,000
// characters (real transcripts, standard tier).
export const DEFAULT_MAX_USD = 10
const longChars = (items) => items.reduce((n, it) => n + (it.status === 'ok' && it.text.length > 800 ? it.text.length : 0), 0)
function estimateUsd(items, opts) {
  const short = items.filter((it) => it.status === 'ok' && it.text.length <= 800).length
  const perK = 0.06 * (opts.maxLabels === 2 ? 2 : 1) * (opts.prefer === 'accuracy' ? 1.3 : 1)
  return (short / 1000) * perK + (longChars(items) / 1000) * 0.0001
}

const pct = (st) => (st.total ? `${Math.floor((100 * st.done) / st.total)}%` : '0%')

// ---------------------------------------------------------------------------
// classify_wait

export async function waitJob(args, { caller, signal, onProgress } = {}) {
  const { id } = findJob(args.job_id, caller)
  const seconds = args.wait_seconds == null ? 45 : Number(args.wait_seconds)
  const st = await waitFor(id, seconds, { signal, onProgress })
  return describeState(id, st)
}

function describeState(id, st) {
  switch (st.status) {
    case 'done':
      return `Job ${id} finished: ${st.total.toLocaleString()} items in ${st.summary?.seconds ?? '?'}s.${st.outputError ? ` The results file was not written: ${st.outputError}.` : ''}\nNext: classify_results {"job_id": "${id}"}`
    case 'failed': {
      const at = st.done ? `at ${st.done.toLocaleString()} of ${st.total.toLocaleString()} items` : `before labelling anything (0 of ${st.total.toLocaleString()})`
      if (st.errorKind === 'fatal') return `Job ${id} failed ${at}: ${st.error}. Retrying will not help. Tell the user exactly this cause and the job id; do not classify the texts another way.`
      if (st.errorKind === 'input') return `Job ${id} failed ${at}: ${st.error}`
      if (st.errorKind === 'budget') return `Job ${id} stopped ${at}: ${st.error}. Finished items are kept. Tell the user what it has cost so far ($${(st.usage?.usd ?? 0).toFixed(2)}) and ask before raising the limit: classify_start {"resume_job_id": "${id}", "max_usd": <new limit>}.`
      return `Job ${id} failed ${at}: ${st.error || 'an unknown error'}. Nothing about the file or labels caused it, and finished items are kept. Resume once after a minute: classify_start {"resume_job_id": "${id}"}. If it fails again, stop and tell the user: "The classifier's backend is failing right now; job ${id} is saved and can be resumed later." Do not classify the texts another way and do not look for job files.`
    }
    case 'cancelled':
      return `Job ${id} was cancelled at ${st.done.toLocaleString()} of ${st.total.toLocaleString()} items.\nTo continue it: classify_start {"resume_job_id": "${id}"}`
    case 'crashed':
      return `Job ${id} stopped unexpectedly at ${st.done.toLocaleString()} of ${st.total.toLocaleString()} items and restarting did not help. Tell the user; do not classify the texts another way.\nTo try again later: classify_start {"resume_job_id": "${id}"}`
    default: {
      const left = st.startedAt && st.done ? Math.round(((Date.now() - st.startedAt) / st.done) * (st.total - st.done) / 1000) : null
      return `Job ${id} running: ${st.done.toLocaleString()} of ${st.total.toLocaleString()} (${pct(st)})${left != null ? `, about ${Math.max(1, left)}s left` : ''}.\nNext: classify_wait {"job_id": "${id}"}`
    }
  }
}

// ---------------------------------------------------------------------------
// classify_results

export function jobResults(args, { caller }) {
  const { id, job } = findJob(args.job_id, caller)
  const st = readState(id)
  if (st.status !== 'done') {
    if (st.status === 'running' || st.status === 'queued') throw new UserError(`Job ${id} is still running (${pct(st)}). Call classify_wait {"job_id": "${id}"} first.`)
    if (!['cancelled', 'failed', 'crashed'].includes(st.status)) throw new UserError(describeState(id, st))
  }
  const input = readInput(id)
  const results = readResults(id)
  if (args.output_path) {
    const output = { given: args.output_path, abs: callerPath(args.output_path, caller.cwd), include_text: !!args.include_text }
    checkDataPath(output.abs, output.given, { write: true })
    const existed = existsSync(output.abs)
    // label / confidence / status filters apply to the file too.
    const keep = input.filter((it) => {
      const r = results.get(it.n)
      if (!r) return false
      if (args.label != null && !(r.status === 'ok' && (r.label === args.label || r.secondary === args.label))) return false
      if (args.confidence != null && r.confidence !== args.confidence) return false
      if (args.status != null && r.status !== args.status) return false
      return true
    })
    const err = writeOutput(output, job.spec, keep, results)
    if (err) throw new UserError(`The results file was not written: ${err}.`)
    const what = [args.label != null && `label ${args.label}`, args.confidence != null && `${args.confidence} confidence`, args.status != null && `status ${args.status}`].filter(Boolean).join(', ')
    return `Wrote ${keep.length.toLocaleString()} lines${what ? ` (${what})` : ''} to ${output.given}${existed ? ', replacing the file that was there' : ''} (id, label, confidence, status${output.include_text ? ', text' : ''}). Give the user the path and the counts; do not print the rows in chat.`
  }
  const filtering = args.label != null || args.confidence != null || args.status != null || args.cursor != null
  if (!filtering) return summaryText(id, job, st, input, results)
  return pageText(id, job, args, input, results)
}

function summaryText(id, job, st, input, results) {
  const s = st.summary || summarize(input, results, { labels: Object.keys(countLabels(results)).filter((l) => l !== NONE).map((name) => ({ name })) }, { usd: st.usage?.usd || 0 }, (st.finishedAt || Date.now()) - (st.startedAt || Date.now()))
  const total = input.length
  const lines = [`Job ${id}: ${total.toLocaleString()} items${st.status !== 'done' ? ` (${st.status}; ${results.size.toLocaleString()} have results)` : ''}${job.spec.profile ? `, profile ${job.spec.profile}` : ''}.`]
  if (job.output) lines.push(job.output && !st.outputError ? `Per-item results: ${job.output.given} (one JSON line per item: id, label, confidence, status).` : `The results file was not written: ${st.outputError}.`)
  lines.push('', 'Label counts:')
  const width = Math.max(8, ...Object.keys(s.counts).map((l) => l.length))
  const entries = Object.entries(s.counts).filter(([l]) => l !== NONE).sort((a, b) => b[1] - a[1])
  for (const [l, n] of entries) lines.push(`  ${l.padEnd(width)} ${String(n).padStart(7)}  ${share(n, total)}`)
  lines.push(`  ${NONE.padEnd(width)} ${String(s.counts[NONE] || 0).padStart(7)}  ${share(s.counts[NONE] || 0, total)}   <- fit no label; report separately, do not merge into a label`)
  const notOk = Object.entries(s.reasons || {})
  if (notOk.length) lines.push(`Not labelled: ${notOk.map(([r, n]) => `${n} ${reasonText(r)}`).join(', ')}.`)
  const conf = { high: 0, medium: 0, low: 0 }
  for (const r of results.values()) if (r.status === 'ok' && r.confidence in conf) conf[r.confidence]++
  lines.push(`Confidence: ${conf.high.toLocaleString()} high, ${conf.medium.toLocaleString()} medium, ${conf.low.toLocaleString()} low. Low = the fast vote and the model disagreed clearly; medium = less certain. List them: classify_results {"job_id": "${id}", "confidence": "low"} (or "medium").`)
  if (s.with_secondary) lines.push(`With a second label: ${s.with_secondary.toLocaleString()}.`)
  if (job.spec.max_labels === 2) {
    const both = {}
    const pairs = {}
    for (const r of results.values()) {
      if (r.status !== 'ok') continue
      for (const l of [r.label, r.secondary]) if (l && l !== NONE) both[l] = (both[l] || 0) + 1
      if (r.secondary) pairs[`${r.label} + ${r.secondary}`] = (pairs[`${r.label} + ${r.secondary}`] || 0) + 1
    }
    lines.push(`Counting both labels: ${Object.entries(both).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} ${n.toLocaleString()}`).join(', ')}.`)
    const all = Object.entries(pairs).sort((a, b) => b[1] - a[1])
    const top = all.slice(0, 5)
    const mean = all.reduce((a, [, n]) => a + n, 0) / Math.max(1, all.length)
    if (top.length) lines.push(`Most common pairs (main + second): ${top.map(([p, n]) => `${p} ${n.toLocaleString()}`).join('; ')}.${top[0][1] < 1.5 * mean ? ' Pairs are spread fairly evenly; no pairing stands out.' : ''}`)
  }
  lines.push(`Took ${s.seconds}s, cost $${(s.usd ?? 0).toFixed(3)}.`)
  // Learning: compare with the profile's history, and say what to save.
  if (job.spec.profile) {
    const cmp = compareWithHistory(job.spec.profile, s.counts, job.content_fp || job.fingerprint)
    if (cmp && !cmp.moves.length) lines.push('', `Compared with ${cmp.runs} earlier run${cmp.runs === 1 ? '' : 's'} of profile ${job.spec.profile} with the same labels: no label moved clearly.`)
    else if (!cmp) lines.push('', `No earlier runs of profile ${job.spec.profile} with these labels to compare with yet.`)
    if (cmp?.moves.length) {
      const pctS = (x) => `${(100 * x).toFixed(1)}%`
      lines.push('', `Compared with ${cmp.runs} earlier run${cmp.runs === 1 ? '' : 's'} of profile ${job.spec.profile} with the same labels: ${cmp.moves.map((m) => `${m.label} ${pctS(m.now)} (usually ${pctS(m.usual)})`).join(', ')}.`)
      const grew = cmp.moves.filter((m) => m.diff > 0 && m.label !== NONE)
      if (grew.length) lines.push(`A label that grew like this often hides a new topic. Look before reporting: classify_results {"job_id": "${id}", "label": "${grew[0].label}"} (or classify_sample {"job_id": "${id}"}). If a new topic is there, add a label: classify_profile_save {"name": "${job.spec.profile}", "append": true, "add_labels": [{"name": "...", "description": "..."}]}, rerun, and tell the user.`)
    }
    lines.push(`Learn: if this run taught something about this label set, record it: classify_profile_save {"name": "${job.spec.profile}", "append": true, "notes": "<what worked or what to watch, no data>"}.`)
  } else if (total >= 50) {
    lines.push('', `Learn: if this label set will be used again, save it now so later runs can reuse it and be compared with this one: classify_profile_save {"name": "<short-name>", "purpose": "<what it is for>", "labels": <the same labels>, "from_job_id": "${id}"}.`)
  }

  // Up to two samples per label.
  const textByN = new Map(input.map((it) => [it.n, it]))
  const samples = []
  const per = {}
  for (const r of results.values()) {
    if (r.status !== 'ok' || (per[r.label] = (per[r.label] || 0) + 1) > 2) continue
    const it = textByN.get(r.n)
    samples.push(`  ${r.label}: ${it.id} "${clip(it.text || '', 70)}"`)
    if (samples.length >= 30) break
  }
  if (samples.length) lines.push('', 'Samples:', ...samples)
  lines.push('', `To list items: classify_results {"job_id": "${id}", "label": "<label>"} (${MAX_PAGE} per page). For every item, write a file instead: classify_results {"job_id": "${id}", "output_path": "./results.jsonl"}.`)
  return clipResponse(lines.join('\n'))
}

function countLabels(results) {
  const c = {}
  for (const r of results.values()) if (r.status === 'ok') c[r.label] = (c[r.label] || 0) + 1
  return c
}

function pageText(id, job, args, input, results) {
  const size = Math.max(1, Math.min(MAX_PAGE, Number(args.page_size) || 20))
  const chars = Math.max(20, Math.min(300, Number(args.text_chars) || 160))
  const start = Number(args.cursor) || 0
  const wanted = (r) =>
    (args.label == null || (r.status === 'ok' && (r.label === args.label || r.secondary === args.label))) &&
    (args.confidence == null || r.confidence === args.confidence) &&
    (args.status == null || r.status === args.status)
  const matching = input.filter((it) => {
    const r = results.get(it.n)
    return r && wanted(r)
  })
  if (args.label != null && args.label !== NONE && !matching.length) {
    const labels = [...new Set([...(job.spec.labels || []).map((l) => l.name), ...Object.keys(countLabels(results))])]
    if (!labels.includes(args.label)) throw new UserError(`"${args.label}" is not a label in this job. Labels: ${labels.join(', ')}, none.`)
  }
  const page = matching.slice(start, start + size)
  const what = [args.label != null && `label ${args.label}`, args.confidence != null && `${args.confidence} confidence`, args.status != null && `status ${args.status}`].filter(Boolean).join(', ') || 'all items'
  const lines = [`Job ${id}, ${what}: ${matching.length.toLocaleString()} item${matching.length === 1 ? '' : 's'}; showing ${matching.length ? start + 1 : 0}-${start + page.length}.`]
  for (const it of page) {
    const r = results.get(it.n)
    const lab = r.status === 'ok' ? `${r.label}${r.secondary ? `+${r.secondary}` : ''} (${r.confidence})` : `not labelled: ${reasonText(r.reason)}`
    lines.push(`${it.id} | ${lab} | "${clip(it.text || '', chars)}"`)
  }
  if (start + page.length < matching.length) {
    const next = { job_id: id, ...(args.label != null && { label: args.label }), ...(args.confidence != null && { confidence: args.confidence }), ...(args.status != null && { status: args.status }), cursor: String(start + page.length) }
    lines.push(`More: classify_results ${JSON.stringify(next)}`)
  }
  if (start >= 150) lines.push(`You have paged ${start + page.length} items. To give the user every item, write a file: classify_results {"job_id": "${id}", "output_path": "./results.jsonl"}. Do not page through more than a few hundred items.`)
  if (Number(args.text_chars) > 300) lines.push('(text_chars is at most 300.)')
  if (Number(args.page_size) > MAX_PAGE) lines.push(`(page_size is at most ${MAX_PAGE}.)`)
  return clipResponse(lines.join('\n'))
}

const share = (n, total) => `${total ? ((100 * n) / total).toFixed(1) : '0.0'}%`.padStart(6)

function clipResponse(text, max = 7800) {
  if (text.length <= max) return text
  const cut = text.lastIndexOf('\n', max - 120)
  return `${text.slice(0, cut)}\n(Response shortened to stay readable. Ask for fewer rows with page_size.)`
}

// ---------------------------------------------------------------------------
// classify_sample: a spread of distinct texts, for designing labels without
// reading the file (the ZDR harness has no file tools at all).

export function sampleTexts(args, { caller }) {
  const n = Math.max(1, Math.min(50, Number(args.n) || 20))
  let items
  if (args.job_id) items = readInput(findJob(args.job_id, caller).id)
  else if (args.input_file) {
    const abs = callerPath(args.input_file, caller.cwd)
    const { rows } = readRowsFromFile(abs, args.input_file)
    items = toItems(rows, { textField: args.text_field || 'text', idField: args.id_field || 'id', filter: args.filter }).items
  } else throw new UserError('Pass input_file (or job_id) to sample from.')
  const seen = new Set()
  const distinct = items.filter((it) => it.status === 'ok' && !seen.has(dedupeKey(it.text)) && seen.add(dedupeKey(it.text)))
  if (!distinct.length) throw new UserError('No usable texts to sample. Check text_field.')
  const step = Math.max(1, distinct.length / n)
  const pick = []
  for (let i = 0; i < distinct.length && pick.length < n; i += step) pick.push(distinct[Math.floor(i)])
  return [`${pick.length} of ${distinct.length.toLocaleString()} distinct texts, spread across the data:`, ...pick.map((it) => `- ${clip(it.text, 200)}`), '', 'Propose a label set from these (with a one-line description each), then classify.'].join('\n')
}

// ---------------------------------------------------------------------------
// classify_cancel

export function cancelJob(args, { caller }) {
  const { id } = findJob(args.job_id, caller)
  const st = readState(id)
  if (!['running', 'queued'].includes(st.status)) return `Job ${id} is not running (${st.status}).`
  requestCancel(id)
  if (!liveWorker(id)) {
    const { stalled, rebuilt, ...rest } = st
    writeJson(join(jobDir(id), 'state.json'), { ...rest, status: 'cancelled', finishedAt: Date.now() })
  }
  return `Cancelling job ${id} at ${st.done.toLocaleString()} of ${st.total.toLocaleString()} items. Finished items are kept.\nTo continue it later: classify_start {"resume_job_id": "${id}"}`
}

// ---------------------------------------------------------------------------
// Profiles

export function profilesText(args) {
  if (args.name) return describeProfile(loadProfile(args.name), { full: true })
  const all = listProfiles()
  if (!all.length) return 'No profiles are saved yet. Save one with classify_profile_save after a label set works well.'
  return ['Saved profiles (use one with classify_texts or classify_start {"profile": "<name>"}):', ...all.map((p) => `- ${describeProfile(p)}`), '', 'Details: classify_profiles {"name": "<name>"}'].join('\n')
}

export async function saveProfileText(args, { signal, caller } = {}) {
  const usage = newUsage()
  if (args.from_job_id) {
    const { id, job } = findJob(args.from_job_id, caller)
    const st = readState(id)
    if (st.status !== 'done' || !st.summary) throw new UserError(`Job ${id} has not finished; save from it once it has.`)
    args = { ...args, seed: { summary: st.summary, fingerprint: job.content_fp || job.fingerprint, labels: job.spec.labels } }
  }
  const { profile, written, generated } = await saveProfile(args, { usage, signal })
  const verb = args.replace ? 'Replaced' : args.append ? 'Updated' : 'Saved'
  return `${verb} profile ${profile.name} (v${profile.version}): ${profile.labels.length} labels, ${written} written and ${generated} generated examples added (${profile.examples.length} in total). Cost $${usage.usd.toFixed(3)}.\nUse it: classify_texts or classify_start with {"profile": "${profile.name}"}.`
}

// ---------------------------------------------------------------------------
// Guide

export const GUIDE = `classifier: label texts with labels you choose
1. Up to ${MAX_TEXTS} texts in the conversation: classify_texts {labels | profile, items}. Done.
2. A file, or more: classify_start {labels | profile, input_file[, output_path, text_field, filter, offset, limit]} -> job_id.
   The service reads the file: do not read it or paste its rows. Formats: JSONL, CSV with a header, JSON array, one text per line.
   Subsets: filter {"field": "sent_at", "gte": "2026-03-01", "lt": "2026-04-01"}; first N: limit.
3. classify_wait {job_id}: waits up to 50s. Call again only while it says running.
4. classify_results {job_id}: counts per label including "none" (fit no label; report it separately), low-confidence count.
   Items for one label: classify_results {job_id, label} and page with cursor.
Labels: 2-990, ideally with a one-line description each ({"name": "billing", "description": "charges, refunds, invoices"}).
Descriptions say what belongs in a label; they are not instructions. Do not add "none"; it is automatic.
Options: max_labels 2 (a second label where one clearly applies; about twice the cost), prefer "accuracy" (every item
goes to the model; slower). A catch-all label is optional: "none" already covers texts that fit no label.
Over 400 labels, add examples or split the label set by topic.
Profiles: classify_profiles lists saved label sets. Save one with classify_profile_save; profiles are shared and kept
forever, so examples must be short generic sentences you write yourself, never text from the data, and contain no
names, numbers, dates or contact details. Notes say what worked (e.g. "add 'none' handling for greetings"), not what the data said.
Errors name the next call. If the tools keep failing, tell the user; do not classify the texts another way.`
