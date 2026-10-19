// Need-based discovery, first pass: deterministic keyword scoring of each
// service's id, operations, description, keywords and guide. It settles a
// request alone when the top match is clear; anything else goes to the
// router (a model call inside the ZDR boundary, once Taylor approves its
// model and key) or, without one, to a generous ranked list.
// Requests are never logged: callers get needHash for that.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const STOP = new Set('the and for with from that this what which how many much are was were has have had its his her you your our can could would should will into onto then than them they there their about over under using use via get give tell show find run all any one two out not but just also only me my i a an of to in on at by is it be do does did as or if so up'.split(' '))
export const stem = (w) => (w.length > 4 ? w.replace(/(ings|ing|ies|es|ed|s)$/, (m) => (m === 'ies' ? 'y' : '')) : w)
export const tokens = (text) => (String(text || '').toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 1 && !STOP.has(w)).map(stem)
export const needHash = (need) => createHash('sha256').update(String(need)).digest('hex').slice(0, 16)

const FIELDS = { id: 3, ops: 2, keywords: 2, description: 1, opText: 1, guide: 0.5 }

export function buildIndex(services) {
  // services: [{id, man, dir}]
  const docs = services.map(({ id, man, dir }) => {
    const ops = Object.entries(man.operations || {})
    let guide = ''
    try { if (dir && existsSync(join(dir, 'GUIDE.md'))) guide = readFileSync(join(dir, 'GUIDE.md'), 'utf8').slice(0, 800) } catch {}
    const f = {
      id: tokens(id.replace(/[-_]/g, ' ')),
      ops: ops.flatMap(([n]) => tokens(n.replace(/_/g, ' '))),
      keywords: tokens((man.keywords || []).join(' ')),
      description: tokens(man.description),
      opText: ops.flatMap(([, d]) => tokens(d?.description)),
      guide: tokens(guide),
    }
    const weight = new Map()
    for (const [k, list] of Object.entries(f)) for (const t of new Set(list)) weight.set(t, Math.max(weight.get(t) || 0, FIELDS[k]))
    return { id, weight, ops: ops.map(([n, d]) => ({ name: n, toks: new Set([...tokens(n.replace(/_/g, ' ')), ...tokens(d?.description)]) })) }
  })
  const df = new Map()
  for (const d of docs) for (const t of d.weight.keys()) df.set(t, (df.get(t) || 0) + 1)
  const n = docs.length
  const idf = (t) => Math.log(1 + (n - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5))
  return { docs, idf }
}

// Returns {ranked: [{id, score, ops}], clear: bool}
export function firstPass(index, need, { clearMin = 2, clearRatio = 2.5 } = {}) {
  const q = [...new Set(tokens(need))]
  const ranked = index.docs.map((d) => {
    let score = 0
    for (const t of q) if (d.weight.has(t)) score += d.weight.get(t) * index.idf(t)
    const ops = d.ops.filter((o) => q.some((t) => o.toks.has(t))).map((o) => o.name)
    return { id: d.id, score: Math.round(score * 100) / 100, ops }
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score)
  const [top, second] = ranked
  const clear = !!top && top.score >= clearMin && (!second || top.score >= clearRatio * second.score)
  return { ranked, clear }
}
