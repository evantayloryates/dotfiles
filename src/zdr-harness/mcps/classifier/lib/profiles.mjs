// Profiles: saved label sets that get better with use. Shared by every scope
// and kept forever, so everything stored here must be free of real data:
//
// - examples are short generic texts written by the agent or generated here,
//   never text from the data, even edited. In testing, agents copied 23 of 24
//   examples verbatim when nothing stopped them, a "these are synthetic" flag
//   was set by an agent that was copying, and exact-match checks let 17 of 32
//   near-copies through. So the guard compares every example with the items
//   of recent jobs (token overlap and shared five-word runs), rejects
//   identifiers, and lists every rejected example with its reason.
// - notes are scrubbed of identifiers on the way in.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildBank } from './bank.mjs'
import { chatJson, embedMany, EMBED_DIMS, EMBED_MODEL } from './openai.mjs'
import { JOBS_DIR, PROFILES_DIR, RETENTION_DAYS } from './paths.mjs'
import { buildTaxonomy, humanize, NONE, UserError } from './taxonomy.mjs'
import { dedupeKey, findIdentifiers, jaccard, normalizeText, scrub, sha, shingles, tokens } from './text.mjs'

const NAME = /^[a-z0-9][a-z0-9-]{1,40}$/
export const MAX_WRITTEN_PER_LABEL = 8
const MAX_EXAMPLE_CHARS = 200
const MAX_NOTES = 1500
export const DEFAULT_GENERATED = 20
const MAX_GENERATED = 40

const fileFor = (name) => join(PROFILES_DIR, `${name}.json`)
const since = (iso) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  return m < 90 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`
}

export function checkName(name) {
  if (typeof name !== 'string' || !NAME.test(name)) throw new UserError('Profile names are 2-41 characters: lowercase letters, digits and hyphens, for example "coach-inbox".')
}

export function loadProfile(name) {
  checkName(name)
  const path = fileFor(name)
  if (!existsSync(path)) {
    const names = listProfiles().map((p) => p.name)
    throw new UserError(`No profile "${name}".${names.length ? ` Saved profiles: ${names.join(', ')}.` : ' No profiles are saved yet.'} Or pass labels instead.`)
  }
  const p = JSON.parse(readFileSync(path, 'utf8'))
  for (const ex of p.examples || []) if (ex.vec && p.embed?.model === EMBED_MODEL && p.embed?.dims === EMBED_DIMS) ex.vec = decodeVec(ex.vec)
  else delete ex.vec
  return p
}

export function listProfiles() {
  mkdirSync(PROFILES_DIR, { recursive: true, mode: 0o700 })
  return readdirSync(PROFILES_DIR)
    .filter((f) => f.endsWith('.json') && !f.startsWith('.'))
    .map((f) => {
      try {
        const p = JSON.parse(readFileSync(join(PROFILES_DIR, f), 'utf8'))
        return p
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name))
}

function writeProfile(p) {
  mkdirSync(PROFILES_DIR, { recursive: true, mode: 0o700 })
  const out = { ...p, examples: p.examples.map(({ vec, ...ex }) => ({ ...ex, vec: vec ? encodeVec(vec) : undefined })) }
  const path = fileFor(p.name)
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(out, null, 1), { mode: 0o600 })
  renameSync(tmp, path)
}

const clipText = (t) => {
  const s = String(t ?? '').replace(/\s+/g, ' ')
  return s.length > 60 ? `${s.slice(0, 59)}…` : s
}

const encodeVec = (v) => Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64')
function decodeVec(s) {
  const b = Buffer.from(s, 'base64')
  return Float32Array.from(new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4))
}

// ---------------------------------------------------------------------------
// The guard

// Token and five-word-run index over the items of recent jobs in this scope.
function recentItemIndex(maxItems = 300_000) {
  const byToken = new Map()
  const runs = new Set()
  const texts = []
  if (!existsSync(JOBS_DIR)) return { byToken, runs, texts }
  const cutoff = Date.now() - RETENTION_DAYS * 86_400_000
  for (const id of readdirSync(JOBS_DIR)) {
    const path = join(JOBS_DIR, id, 'input.jsonl')
    try {
      if (statSync(path).mtimeMs < cutoff) continue
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (!line) continue
        const t = JSON.parse(line).text
        if (!t || t.length > 2000) continue
        const tk = tokens(t)
        const at = texts.push(tk) - 1
        for (const w of new Set(tk)) {
          if (!byToken.has(w)) byToken.set(w, [])
          byToken.get(w).push(at)
        }
        for (const s of shingles(tk)) runs.add(s)
        if (texts.length >= maxItems) return { byToken, runs, texts }
      }
    } catch {}
  }
  return { byToken, runs, texts }
}

// Returns [{ index, reason }] for every example that may not be stored.
export function screenExamples(examples, extraTexts = []) {
  const problems = []
  const index = recentItemIndex()
  for (const t of extraTexts) {
    const tk = tokens(t)
    const at = index.texts.push(tk) - 1
    for (const w of new Set(tk)) {
      if (!index.byToken.has(w)) index.byToken.set(w, [])
      index.byToken.get(w).push(at)
    }
    for (const s of shingles(tk)) index.runs.add(s)
  }
  examples.forEach((ex, i) => {
    const ids = findIdentifiers(ex.text)
    if (ids.length) return problems.push({ index: i, reason: `contains ${ids.map((k) => (/^[aeiou]/.test(k) ? `an ${k}` : `a ${k}`)).join(' and ')}; write a generic sentence without it` })
    const tk = tokens(ex.text)
    if (shingles(tk).some((s) => index.runs.has(s))) return problems.push({ index: i, reason: 'shares a five-word run with an item that was classified; write your own wording' })
    const counts = new Map()
    for (const w of new Set(tk)) for (const at of index.byToken.get(w) || []) counts.set(at, (counts.get(at) || 0) + 1)
    // Under ~7 words every natural phrasing collides with something; the
    // five-word-run rule and the model screen cover those.
    if (tk.length < 7) return
    for (const [at, shared] of counts) {
      if (shared < Math.max(2, Math.ceil(tk.length / 2))) continue
      if (jaccard(tk, index.texts[at]) >= 0.5) return problems.push({ index: i, reason: 'too close to an item that was classified (even edited); write a generic paraphrase in your own words' })
    }
  })
  return problems
}

// The model screen: regexes cannot see a city, a medication, a name or a
// date written in words (11 of 14 such examples got past them in testing), so
// everything kept forever is also read by the model before it is stored.
// Fails closed: if the screen cannot run, nothing is saved.
const SCREEN_SYSTEM = `You check short texts before they are stored permanently in a shared label set used to train a classifier. A text is allowed only if it is generic: it could have been written by anyone, about a typical situation.
Flag a text if it contains anything specific to a real person or case, in any form (including spelled out, abbreviated or in another language):
- names of people, businesses, gyms, clinics or products tied to a person; usernames or handles
- places more specific than a country (cities, neighbourhoods, streets, addresses, venues, schools)
- calendar dates, birthdays, ages, or clock times of a specific event (relative times like "tomorrow", "next week" or "10 minutes late", weekday names and parts of the day like "Thursday" or "afternoon" are generic)
- contact details, account, card, member or order numbers, ids, amounts of money
- named diagnoses, named medications, doses, test results, procedures or other health details beyond a generic mention ("my knee hurts", "I started a new medication" and "I have a chronic condition" are generic; "my metformin dose went up" and "my A1C is 7.2" are not)
- any other detail that could point at one person or one record.
Do not flag generic topics, generic symptoms, generic requests, generic feelings, relative times, rough quantities ("a few pounds", "twice this month"), names of labels, profiles or categories in this classifier, or run numbers, week numbers, percentages and counts that describe how labels behaved.`

// Verdicts are remembered per text (by hash), so a text that passed once
// passes again: agents were told "the rest were fine" and then saw the same
// example flagged on the next attempt.
const VERDICTS = () => join(PROFILES_DIR, '.screen-verdicts.json')
function loadVerdicts() {
  try {
    return JSON.parse(readFileSync(VERDICTS(), 'utf8'))
  } catch {
    return {}
  }
}
export async function screenWithModel(texts, { usage, signal } = {}) {
  if (!texts.length) return []
  const verdicts = loadVerdicts()
  const key = (t) => sha(`${SCREEN_VERSION}:${dedupeKey(t)}`).slice(0, 24)
  const flagged = []
  const todo = []
  texts.forEach((t, i) => {
    const v = verdicts[key(t)]
    if (v === undefined) todo.push(i)
    else if (v) flagged.push({ index: i, what: v })
  })
  for (let c = 0; c < todo.length; c += 60) {
    const idx = todo.slice(c, c + 60)
    const chunk = idx.map((i) => texts[i])
    const props = Object.fromEntries(chunk.map((_, j) => [`t${j + 1}`, { type: 'object', properties: { specific: { type: 'boolean' }, what: { type: 'string' } }, required: ['specific', 'what'], additionalProperties: false }]))
    let out
    try {
      out = await chatJson({ kind: 'batch', system: SCREEN_SYSTEM, user: `${JSON.stringify(chunk.map((text, j) => ({ key: `t${j + 1}`, text })))}\n\nFor each key, is the text specific? If so, say what in a few words (the kind of detail, not the detail itself).`, schema: { type: 'object', properties: props, required: Object.keys(props), additionalProperties: false }, tier: 'priority', usage, signal })
    } catch {
      throw new UserError('Nothing was saved: the examples could not be checked right now. Try again in a minute.')
    }
    chunk.forEach((t, j) => {
      const r = out[`t${j + 1}`]
      const what = r?.specific ? String(r.what || 'a specific detail').slice(0, 60) : ''
      verdicts[key(t)] = what
      if (what) flagged.push({ index: idx[j], what })
    })
  }
  if (todo.length) {
    try {
      mkdirSync(PROFILES_DIR, { recursive: true, mode: 0o700 })
      const tmp = `${VERDICTS()}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify(verdicts), { mode: 0o600 })
      renameSync(tmp, VERDICTS())
    } catch {}
  }
  return flagged.sort((a, b) => a.index - b.index)
}
const SCREEN_VERSION = 5

// ---------------------------------------------------------------------------
// Generated examples: short generic texts per label, written from the label
// descriptions. Synthetic by construction; still screened for identifiers.

async function generateExamples(taxonomy, perLabel, { usage, signal } = {}) {
  if (!perLabel) return []
  const others = (l) => taxonomy.labels.filter((o) => o.name !== l.name).map((o) => humanize(o.name))
  const results = await Promise.all(
    taxonomy.labels.map(async (l) => {
      const system =
        'You write realistic example texts for training a text classifier. Write generic texts: no names of people or businesses, no places, dates, times, prices, amounts, phone numbers, emails, links or ids. Vary length (3 to 30 words), tone, and phrasing; make a few casual, terse, or misspelled.'
      const user = `Write ${perLabel} different texts that clearly belong to the label "${l.name}"${l.description ? ` (${l.description})` : ''}. They must not fit these other labels: ${others(l).slice(0, 60).join(', ') || '(none)'}.`
      try {
        const out = await chatJson({ kind: 'chat', system, user, schema: { type: 'object', properties: { texts: { type: 'array', items: { type: 'string' } } }, required: ['texts'], additionalProperties: false }, tier: 'priority', usage, signal })
        return (out.texts || []).slice(0, perLabel).map((text) => ({ text, label: l.name, source: 'generated' }))
      } catch {
        return []
      }
    })
  )
  const seen = new Set()
  return results.flat().filter((ex) => {
    const n = normalizeText(ex.text)
    if (n.status !== 'ok' || n.text.length > MAX_EXAMPLE_CHARS || findIdentifiers(n.text).length) return false
    const k = dedupeKey(n.text)
    if (seen.has(k)) return false
    seen.add(k)
    ex.text = n.text
    return true
  })
}

// ---------------------------------------------------------------------------
// Save

// args: { name, purpose?, labels?, add_labels?, examples?, notes?, generate_examples?, replace?, replace_version?, append? }
export async function saveProfile(args, { usage, signal, extraScreenTexts = [] } = {}) {
  checkName(args.name)
  const exists = existsSync(fileFor(args.name))
  if (args.replace && args.append) throw new UserError('Pass replace or append, not both.')
  if (exists && !args.append) {
    const p = loadProfile(args.name)
    const about = `Profile "${args.name}" already exists (v${p.version}, ${p.labels.length} labels, ${p.examples.length} examples, saved ${since(p.updated)}).`
    if (!args.replace) throw new UserError(`${about} If you did not save it in this conversation, it belongs to someone else: use it as it is ({"profile": "${args.name}"}), add to it with append: true, choose another name, or ask the user before replacing it. Replacing needs replace: true and replace_version: ${p.version}.`)
    if (Number(args.replace_version) !== p.version) throw new UserError(`${about} Replacing needs replace_version: ${p.version} (the current version), and the user's yes if you did not create it in this conversation.`)
  }
  if (!exists && args.append) throw new UserError(`No profile "${args.name}" to append to. Save it first without append.`)
  if (!exists && args.labels && !args.distinct) {
    // Same label set under new names counts too: labels match on name and
    // description words, and purposes are compared.
    const mine = buildTaxonomy({ labels: args.labels }).labels.map((l) => tokens(`${humanize(l.name)} ${l.description}`))
    for (const other of listProfiles()) {
      const theirs = other.labels.map((l) => tokens(`${humanize(l.name)} ${l.description}`))
      const shared = mine.filter((m) => theirs.some((t) => jaccard(m, t) >= 0.5)).length
      const samePurpose = args.purpose && other.purpose && jaccard(tokens(args.purpose), tokens(other.purpose)) >= 0.5
      if (shared / Math.max(mine.length, theirs.length) >= 0.6 || samePurpose) {
        throw new UserError(`Profile "${other.name}"${other.purpose ? ` (${other.purpose})` : ''} already covers this (${shared} of ${mine.length} labels match). Reuse it ({"profile": "${other.name}"}), or add to it with append: true (and add_labels for new ones). Only if this is a different use, pass distinct: true.`)
      }
    }
  }
  const prior = exists ? loadProfile(args.name) : null

  if (args.add_labels && !args.append) throw new UserError('add_labels goes with append: true (or pass the full list as labels with replace).')
  let labels = args.append ? prior.labels : args.labels
  if (args.append && args.labels && JSON.stringify(buildTaxonomy({ labels: args.labels }).labels) !== JSON.stringify(prior.labels)) {
    throw new UserError(`append keeps the profile's labels; add new ones with add_labels, or pass replace: true with the full new label list.`)
  }
  if (args.add_labels) labels = [...prior.labels, ...args.add_labels]
  const taxonomy = buildTaxonomy({ labels })
  const added = args.add_labels ? taxonomy.labels.slice(prior.labels.length) : []
  const byKey = new Map(taxonomy.labels.map((l) => [l.name.toLowerCase(), l.name]))

  // Written examples.
  const written = []
  const problems = []
  const perLabel = {}
  for (const [i, ex] of (args.examples || []).entries()) {
    if (!ex || typeof ex.text !== 'string' || typeof ex.label !== 'string') {
      problems.push({ index: i, reason: 'must be {"text": "...", "label": "..."}' })
      continue
    }
    const label = ex.label.trim().toLowerCase() === NONE ? NONE : byKey.get(ex.label.trim().toLowerCase())
    if (!label) {
      problems.push({ index: i, reason: `label "${ex.label}" is not one of the profile's labels` })
      continue
    }
    const n = normalizeText(ex.text)
    if (n.status !== 'ok') {
      problems.push({ index: i, reason: 'is empty' })
      continue
    }
    if (n.text.length > MAX_EXAMPLE_CHARS) {
      problems.push({ index: i, reason: `is ${n.text.length} characters; keep examples under ${MAX_EXAMPLE_CHARS}` })
      continue
    }
    const already = (prior?.examples || []).filter((e) => e.label === label && e.source === 'written').length
    if ((perLabel[label] = (perLabel[label] || 0) + 1) + (args.append ? already : 0) > MAX_WRITTEN_PER_LABEL) {
      problems.push({ index: i, reason: `"${label}" already has ${MAX_WRITTEN_PER_LABEL} written examples` })
      continue
    }
    written.push({ index: i, text: n.text, label, source: 'written' })
  }
  for (const p of screenExamples(written, extraScreenTexts)) problems.push({ index: written[p.index].index, reason: p.reason })
  const clean = written.filter((w) => !problems.some((p) => p.index === w.index))
  for (const f of await screenWithModel(clean.map((w) => w.text), { usage, signal })) {
    problems.push({ index: clean[f.index].index, reason: `is too specific (${f.what}); write a generic sentence anyone could have written` })
  }
  const extras = []
  if (args.notes) extras.push({ where: 'notes', text: String(args.notes) })
  for (const l of args.append ? added : taxonomy.labels) if (l.description) extras.push({ where: `the description of "${l.name}"`, text: l.description })
  if (args.purpose) extras.push({ where: 'purpose', text: String(args.purpose) })
  const extraFlags = await screenWithModel(extras.map((e) => e.text), { usage, signal })
  if (extraFlags.length || problems.length) {
    problems.sort((a, b) => a.index - b.index)
    const lines = [
      ...extraFlags.map((f) => `- ${extras[f.index].where} is too specific (${f.what}); describe the pattern, not a case`),
      ...problems.slice(0, 40).map((p) => `- examples[${p.index}] ("${clipText((args.examples || [])[p.index]?.text)}") ${p.reason}`),
    ]
    throw new UserError(`Nothing was saved. Fix everything listed and call again; anything not listed passed:\n${lines.join('\n')}\nProfiles are kept forever and shared, so examples must be generic sentences you write yourself and notes must describe patterns, not cases.`)
  }

  let notes = args.notes == null ? '' : scrub(String(args.notes).trim()).slice(0, MAX_NOTES)
  // Notes are the profile's memory: append adds to them, replace keeps them
  // unless new notes are given.
  if (prior?.notes && (args.append || (args.replace && args.notes == null))) notes = notes ? `${prior.notes}\n${notes}`.slice(-MAX_NOTES) : prior.notes

  const genCount = args.generate_examples == null ? (args.append && !added.length ? 0 : DEFAULT_GENERATED) : Math.max(0, Math.min(MAX_GENERATED, Number(args.generate_examples) || 0))
  // Appending new labels generates examples for those labels only.
  const genTaxonomy = args.append && added.length ? { ...taxonomy, labels: added } : taxonomy
  let generated = await generateExamples(genTaxonomy, genCount, { usage, signal })
  if (generated.length) {
    const flags = new Set((await screenWithModel(generated.map((g) => g.text), { usage, signal })).map((f) => f.index))
    generated = generated.filter((_, i) => !flags.has(i))
  }

  const keep = args.append ? prior.examples : []
  const all = [...keep, ...written.map(({ index, ...ex }) => ex), ...generated]
  const fresh = all.filter((ex) => !(ex.vec instanceof Float32Array))
  if (fresh.length) {
    const vecs = await embedMany(fresh.map((e) => e.text), { usage, signal })
    fresh.forEach((e, i) => (e.vec = vecs[i]))
  }

  const now = new Date().toISOString()
  const profile = {
    name: args.name,
    version: (prior?.version || 0) + 1,
    created: prior?.created || now,
    updated: now,
    purpose: args.purpose != null ? scrub(String(args.purpose).trim()).slice(0, 200) : prior?.purpose || '',
    labels: taxonomy.labels,
    history: args.replace ? [] : prior?.history || [],
    examples: all.map(({ text, label, source, vec }) => ({ text, label, source, vec })),
    notes,
    embed: { model: EMBED_MODEL, dims: EMBED_DIMS },
    stats: args.replace ? { runs: 0, items: 0 } : prior?.stats || { runs: 0, items: 0 },
  }
  if (args.seed) {
    const same = !args.seed.labels || labelKey(args.seed.labels) === labelKey(taxonomy.labels)
    if (same) addHistory(profile, args.seed.summary, args.seed.fingerprint)
  }
  const bank = await buildBank({ ...taxonomy, examples: [] }, profile, { usage, signal })
  profile.calibration = bank.calibration
  writeProfile(profile)
  return { profile, written: written.length, generated: generated.length, bank }
}

// Run statistics: what the profile has seen, for tuning and for the skill.
// Run statistics and a per-label history (last 30 distinct inputs): what the
// profile has seen, so a later run can be compared with it. A rerun of the
// same input (often answered from the cache) is not counted again.
export function recordRun(name, summary, fingerprint) {
  try {
    const p = JSON.parse(readFileSync(fileFor(name), 'utf8'))
    addHistory(p, summary, fingerprint)
    const tmp = `${fileFor(name)}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(p, null, 1), { mode: 0o600 })
    renameSync(tmp, fileFor(name))
  } catch {}
}

const labelKey = (labels) => sha(JSON.stringify(labels.map((l) => l.name).sort())).slice(0, 12)

// History entries carry the label set they were made with. The same input
// run again with the same labels is not counted twice; run again with changed
// labels (after add_labels), it replaces the stale entry.
function addHistory(p, summary, fingerprint) {
  p.history ||= []
  const lk = labelKey(p.labels)
  if (fingerprint) {
    const same = p.history.findIndex((h) => h.fp === fingerprint)
    if (same >= 0 && p.history[same].lk === lk) return
    if (same >= 0) p.history.splice(same, 1)
  }
  const s = (p.stats ||= { runs: 0, items: 0 })
  s.runs++
  s.items += summary.items
  s.vote = (s.vote || 0) + (summary.by_path?.vote || 0)
  s.model = (s.model || 0) + (summary.by_path?.model || 0) + (summary.by_path?.model_long || 0)
  s.none = (s.none || 0) + (summary.counts?.[NONE] || 0)
  s.low = (s.low || 0) + (summary.low_confidence || 0)
  s.last_run = new Date().toISOString()
  const labelled = Object.values(summary.counts || {}).reduce((a, b) => a + b, 0)
  if (labelled >= 30) {
    const shares = Object.fromEntries(Object.entries(summary.counts).map(([l, n]) => [l, +(n / labelled).toFixed(4)]))
    p.history.push({ at: s.last_run, fp: fingerprint || null, lk, items: labelled, shares })
    p.history = p.history.slice(-30)
  }
}

// Labels whose share moved clearly against the profile's earlier runs: the
// usual sign of a new topic being absorbed by a neighbouring label (a new
// insurance topic once inflated "billing" from 10% to 17% unnoticed).
export function compareWithHistory(name, counts, fingerprint) {
  let p
  try {
    p = JSON.parse(readFileSync(fileFor(name), 'utf8'))
  } catch {
    return null
  }
  const lk = labelKey(p.labels)
  const past = (p.history || []).filter((h) => h.fp !== fingerprint && (h.lk ?? lk) === lk)
  if (!past.length) return null
  const labelled = Object.values(counts).reduce((a, b) => a + b, 0)
  if (labelled < 30) return null
  const moves = []
  for (const [label, n] of Object.entries(counts)) {
    // A label added since those runs has no history to compare with.
    if (!past.some((h) => label in h.shares)) continue
    const now = n / labelled
    const usual = past.reduce((a, h) => a + (h.shares[label] || 0), 0) / past.length
    const diff = now - usual
    if (Math.abs(diff) >= 0.04 && (usual === 0 || Math.abs(diff) / usual >= 0.35)) moves.push({ label, now, usual, diff })
  }
  return { runs: past.length, moves: moves.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)) }
}

export function describeProfile(p, { full = false } = {}) {
  const written = p.examples.filter((e) => e.source === 'written').length
  const generated = p.examples.length - written
  const s = p.stats || {}
  const head = `${p.name} (v${p.version})${p.purpose ? ` — ${p.purpose}` : ''}: ${p.labels.length} labels, ${written} written + ${generated} generated examples${s.runs ? `, used ${s.runs} time${s.runs === 1 ? '' : 's'} on ${s.items.toLocaleString()} items` : ', not used yet'}`
  if (!full) return head
  const lines = [head, '', 'Labels:']
  for (const l of p.labels) {
    const n = p.examples.filter((e) => e.label === l.name).length
    lines.push(`- ${l.name}${l.description ? ` — ${l.description}` : ''} (${n} examples)`)
  }
  if (s.items) {
    const pct = (x) => `${Math.round((100 * (x || 0)) / s.items)}%`
    lines.push('', `Track record: ${pct(s.vote)} answered by the fast vote, ${pct(s.model)} by the model, ${pct(s.none)} fit no label, ${pct(s.low)} low confidence.`)
  }
  if (p.notes) lines.push('', 'Notes:', p.notes)
  const sample = []
  for (const l of p.labels) {
    const ex = p.examples.filter((e) => e.label === l.name && e.source === 'written').slice(0, 2)
    for (const e of ex) sample.push(`- ${e.label}: "${e.text}"`)
  }
  if (sample.length) lines.push('', 'Written examples (first two per label):', ...sample.slice(0, 40))
  return lines.join('\n')
}
