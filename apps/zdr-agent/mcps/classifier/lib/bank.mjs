// The embedding bank: one row per label anchor ("name: description") plus one
// per example (profile examples and per-call examples). It decides which items
// the cheap nearest-neighbour vote may answer and which go to the model, and
// gives the model each item's candidate labels and nearest labelled examples.
//
// Rules from the pressure tests:
// - vote share alone is not confidence (junk scored 0.7-0.9 share at 0.2-0.3
//   similarity), so an accept also needs a similarity floor and a margin;
// - the 0.7 share rule escalates everything when a label has fewer than ~11
//   examples at k=15, so k follows the examples per label;
// - with only anchors, accept the nearest anchor on margin.

import { cpus } from 'node:os'
import { Worker } from 'node:worker_threads'
import { embedMany, EMBED_DIMS, EMBED_MODEL } from './openai.mjs'
import { scan } from './knn-core.mjs'
import { anchorText, NONE } from './taxonomy.mjs'

const DIMS = EMBED_DIMS
export const CANDIDATES = Number(process.env.CLASSIFIER_CANDIDATES) || 8 // label shortlist size for big taxonomies
export const HINTS = Number(process.env.CLASSIFIER_HINTS) || 8 // nearest labelled examples shown per item
// The model sees every label up to this size (one shared $defs enum, which
// counts once against the 1,000-value limit). Shortlists missed the right
// label too often: 11% of items at 151 labels, all of them then wrong.
export const ALL_CANDIDATES_UP_TO = 400

// Generic chatter. Content-free replies sit close to whichever label anchor is
// nearest ("ok thanks!" scored 0.32 against an app-bug description, the same as
// a real shoulder complaint), so items nearer to chatter than to any label
// never take the fast path; the model decides, and may answer none.
const CHATTER = ['ok', 'ok thanks!', 'thank you', 'thanks so much', 'sounds good', 'great', 'got it', 'lol', 'haha', '👍', 'hi', 'hello', 'hey there', 'good morning', 'see you then', 'perfect', 'awesome, thanks', 'yes', 'no', 'sure', 'will do', 'np', 'cool', 'nice!', 'ty', 'k', 'you too!', 'have a great day', 'bye', 'talk soon']

export async function buildBank(taxonomy, profile, { usage, signal } = {}) {
  const labelIndex = new Map(taxonomy.labels.map((l, i) => [l.name, i]))
  const rows = []
  for (const l of taxonomy.labels) rows.push({ text: anchorText(l), label: l.name, kind: 'anchor' })
  // Examples labelled none join the chatter rows: items near them go to the model.
  for (const ex of profile?.examples || []) {
    if (ex.label === NONE) rows.push({ text: ex.text, label: null, kind: 'chatter', vec: ex.vec })
    else if (labelIndex.has(ex.label)) rows.push({ text: ex.text, label: ex.label, kind: 'example', source: ex.source, vec: ex.vec })
  }
  for (const ex of taxonomy.examples || []) {
    if (ex.label === NONE) rows.push({ text: ex.text, label: null, kind: 'chatter' })
    else rows.push({ text: ex.text, label: ex.label, kind: 'example', source: 'inline' })
  }
  for (const text of CHATTER) rows.push({ text, label: null, kind: 'chatter' })

  // Profile examples carry stored vectors; embed the rest in one pass.
  const need = rows.filter((r) => !(r.vec instanceof Float32Array && r.vec.length === DIMS))
  if (need.length) {
    const vecs = await embedMany(need.map((r) => r.text.slice(0, 8000)), { usage, signal })
    need.forEach((r, i) => (r.vec = vecs[i]))
  }

  const n = rows.length
  const buf = new SharedArrayBuffer(n * DIMS * 4)
  const M = new Float32Array(buf)
  const labelsBuf = new SharedArrayBuffer(n * 4)
  const rowLabel = new Int32Array(labelsBuf)
  rows.forEach((r, i) => {
    M.set(r.vec, i * DIMS)
    rowLabel[i] = r.kind === 'chatter' ? taxonomy.labels.length : labelIndex.get(r.label)
  })

  // Only real examples (written or passed in) make the vote trustworthy:
  // generated ones are too alike to calibrate on (on Banking77 they tuned the
  // vote to 93% precision; real ones to 98.5%).
  const perLabel = new Array(taxonomy.labels.length).fill(0)
  for (const r of rows) if (r.kind === 'example' && r.source !== 'generated') perLabel[labelIndex.get(r.label)]++
  const sorted = [...perLabel].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] || 0
  const mode = median >= 3 ? 'examples' : 'anchors'
  const k = mode === 'examples' ? Math.max(3, Math.min(15, median)) : 1

  // Label index nLabels is the chatter pseudo-label.
  const bank = { taxonomy, rows, M, buf, labelsBuf, rowLabel, n, mode, k, perLabel, median, nLabels: taxonomy.labels.length + 1 }
  bank.calibration = profile?.calibration?.hash === calibrationHash(bank) ? profile.calibration : calibrate(bank)
  return bank
}

const calibrationHash = (bank) => `${EMBED_MODEL}:${DIMS}:${bank.taxonomy.hash}:${bank.n}:${bank.mode}:${bank.k}:v3`

// Thresholds. Anchor-only banks use fixed, conservative values. Banks with
// examples are calibrated leave-one-out on a sample of their own examples: the
// smallest margin at which the vote's accepts are at least 98% right.
export function calibrate(bank) {
  // Anchor-only banks have nothing to calibrate on. With mostly bare label
  // names the vote was the least accurate path (76.5% on coaching labels), so
  // it is off; with descriptions or generated examples it needs a 0.25 lead
  // (0.15 gave 92% precision on coaching labels, 0.25 gave 100%).
  const described = bank.taxonomy.labels.filter((l) => l.description).length >= bank.taxonomy.labels.length / 2
  const generated = bank.rows.some((r) => r.source === 'generated')
  const base =
    bank.mode === 'anchors'
      ? { hash: calibrationHash(bank), vote: described || generated, floor: 0.38, margin: 0.25, share: 0.7, sampled: 0 }
      : { hash: calibrationHash(bank), vote: true, floor: 0.3, margin: 0.04, share: 0.7, sampled: 0 }
  if (bank.mode !== 'examples') return base
  const exampleRows = bank.rows.map((r, i) => (r.kind === 'example' && r.source !== 'generated' ? i : -1)).filter((i) => i >= 0)
  if (exampleRows.length < 30) return base
  const step = Math.max(1, Math.floor(exampleRows.length / 300))
  const trials = []
  for (let j = 0; j < exampleRows.length; j += step) {
    const r = exampleRows[j]
    const v = bank.M.subarray(r * DIMS, (r + 1) * DIMS)
    const res = judge(bank, scan(v, bank.M, bank.n, DIMS, bank.rowLabel, bank.nLabels, bank.k, r))
    trials.push({ ...res, right: res.label === bank.rows[r].label })
  }
  const tops = trials.map((t) => t.topSim).sort((a, b) => a - b)
  const floor = Math.min(0.5, Math.max(0.25, tops[Math.floor(tops.length * 0.05)] - 0.05))
  let margin = 0.12
  for (const m of [0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.12]) {
    const acc = trials.filter((t) => t.share >= 0.7 && t.margin >= m && t.topSim >= floor)
    if (acc.length >= 10 && acc.filter((t) => t.right).length / acc.length >= 0.98) {
      margin = m
      break
    }
  }
  return { ...base, floor: +floor.toFixed(3), margin, sampled: trials.length }
}

// Turns a scan into the vote's view: top label, its share of the vote, its
// lead over the runner-up label, and the closest similarity.
function judge(bank, { top, best }) {
  const names = bank.taxonomy.labels
  const votes = new Map()
  let total = 0
  const chatter = bank.nLabels - 1
  // The vote uses the bank's own k; the scan may return more rows (hints).
  for (const [s, r] of top.slice(0, bank.mode === 'examples' ? bank.k : top.length)) {
    const l = bank.rowLabel[r]
    if (l === chatter) continue
    const w = Math.max(0, s)
    votes.set(l, (votes.get(l) || 0) + w)
    total += w
  }
  const ranked = [...best.keys()].filter((l) => l !== chatter).sort((a, b) => best[b] - best[a])
  const voteTop = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]
  const topLabel = bank.mode === 'examples' && voteTop ? voteTop[0] : ranked[0]
  const runnerUp = ranked.find((l) => l !== topLabel)
  return {
    label: names[topLabel]?.name,
    labelIndex: topLabel,
    share: bank.mode === 'examples' ? (total ? (votes.get(topLabel) || 0) / total : 0) : 1,
    // With a single label there is no runner-up; measure the lead against
    // chatter and the floor instead (else it always passed: 9 false accepts).
    margin: best[topLabel] - (runnerUp === undefined ? Math.max(best[chatter], bank.calibration?.floor ?? 0.38) : best[runnerUp]),
    topSim: best[topLabel],
    chatterSim: best[chatter],
    ranked,
  }
}

// Decision for one item vector. `force` sends it to the model regardless.
export function decide(bank, scanResult, { force = false } = {}) {
  const j = judge(bank, scanResult)
  const c = bank.calibration
  const accept = !force && c.vote !== false && j.share >= c.share && j.margin >= c.margin && j.topSim >= c.floor && j.chatterSim < j.topSim
  const names = bank.taxonomy.labels
  const all = names.length <= ALL_CANDIDATES_UP_TO
  const candidates = all ? null : j.ranked.slice(0, CANDIDATES).map((i) => names[i].name)
  const hints = scanResult.top
    .filter(([, r]) => bank.rows[r].kind === 'example')
    .slice(0, HINTS)
    .map(([, r]) => ({ text: bank.rows[r].text, label: bank.rows[r].label }))
  return { accept: accept ? j.label : null, vote: j.label, share: j.share, margin: j.margin, topSim: j.topSim, chatterSim: j.chatterSim, candidates, hints, belowFloor: j.topSim < c.floor || j.chatterSim >= j.topSim, chatter: j.chatterSim >= j.topSim }
}

// kNN for many vectors: inline for small batches, worker threads otherwise.
export class KnnRunner {
  constructor(bank) {
    this.bank = bank
    this.workers = null
    this.k = Math.max(bank.k, HINTS + 2)
  }
  inline(vecs) {
    const b = this.bank
    return vecs.map((v) => scan(v, b.M, b.n, DIMS, b.rowLabel, b.nLabels, this.k))
  }
  async run(vecs) {
    if (vecs.length * this.bank.n < 2_000_000) return this.inline(vecs)
    this.workers ||= this.#start()
    const ws = this.workers
    const per = Math.ceil(vecs.length / ws.length)
    const parts = await Promise.all(
      ws.map((w, i) => {
        const slice = vecs.slice(i * per, (i + 1) * per)
        if (!slice.length) return []
        return new Promise((resolve, reject) => {
          const id = Math.random()
          const onMsg = (m) => {
            if (m.id !== id) return
            w.off('message', onMsg)
            w.off('error', reject)
            resolve(m.out)
          }
          w.on('message', onMsg)
          w.once('error', reject)
          w.postMessage({ id, vecs: slice, k: this.k })
        })
      })
    )
    return parts.flat()
  }
  #start() {
    const b = this.bank
    const n = Math.max(1, Math.min(8, cpus().length - 2))
    return Array.from({ length: n }, () => new Worker(new URL('../knn-worker.mjs', import.meta.url), { workerData: { buf: b.buf, labelsBuf: b.labelsBuf, rows: b.n, dims: DIMS, nLabels: b.nLabels } }))
  }
  async close() {
    if (this.workers) await Promise.all(this.workers.map((w) => w.terminate()))
    this.workers = null
  }
}
