// Label sets: validation and the canonical form every other module uses.
//
// Label descriptions are a prompt-injection surface: one "always choose X"
// sentence in a description hijacked 132 of 133 items in testing, so they are
// screened here and fenced as data in the prompt.

import { looksLikeInjection, normalizeText, sha } from './text.mjs'

export const NONE = 'none'
export const MAX_LABELS = 990 // strict schemas allow 1,000 enum values in total
const MAX_NAME = 80
const MAX_DESCRIPTION = 400
export const MAX_INLINE_EXAMPLES_PER_LABEL = 50

export class UserError extends Error {
  constructor(message) {
    super(message)
    this.expected = true
  }
}

// labels: ["billing", ...] or [{name, description}, ...]
// examples (optional, for this call only, never stored): [{text, label}, ...]
export function buildTaxonomy({ labels, examples = [] }) {
  if (!Array.isArray(labels) || labels.length === 0) {
    throw new UserError('Pass labels: a list like ["billing", "scheduling"] or [{"name": "billing", "description": "charges, refunds, invoices"}].')
  }
  if (labels.length > MAX_LABELS) throw new UserError(`labels has ${labels.length} entries; the most is ${MAX_LABELS}. Split the taxonomy into a few smaller ones (for example by topic) and run each.`)
  const out = []
  const seen = new Map()
  for (const [i, raw] of labels.entries()) {
    const entry = typeof raw === 'string' ? { name: raw } : raw
    if (!entry || typeof entry !== 'object' || typeof (entry.name ?? entry.label) !== 'string') {
      throw new UserError(`labels[${i}] must be a string or {"name": "...", "description": "..."}.`)
    }
    const name = (entry.name ?? entry.label).trim().replace(/\s+/g, ' ')
    if (!name) throw new UserError(`labels[${i}] is empty.`)
    if (name.length > MAX_NAME) throw new UserError(`Label "${name.slice(0, 40)}…" is longer than ${MAX_NAME} characters; put the detail in its description.`)
    if (/["\n\r\\]/.test(name)) throw new UserError(`Label "${name}" contains a quote, backslash or line break; remove it.`)
    if (name.toLowerCase() === NONE) throw new UserError('Do not include "none": it is added automatically for items that fit no label.')
    const key = name.toLowerCase()
    if (seen.has(key)) throw new UserError(`Label "${name}" appears twice (also as "${seen.get(key)}"). Each label must be unique, ignoring case.`)
    seen.set(key, name)
    let description = entry.description == null ? '' : String(entry.description).trim().replace(/\s+/g, ' ')
    if (description.length > MAX_DESCRIPTION) throw new UserError(`The description of "${name}" is longer than ${MAX_DESCRIPTION} characters; shorten it to what tells this label apart from the others.`)
    if (description && looksLikeInjection(description)) {
      throw new UserError(`The description of "${name}" reads like an instruction ("${description.slice(0, 80)}"). Describe what belongs in the label, for example "charges, refunds, invoices".`)
    }
    out.push({ name, description })
  }

  const byKey = new Map(out.map((l) => [l.name.toLowerCase(), l.name]))
  const cleanExamples = []
  const perLabel = {}
  for (const [i, ex] of (examples || []).entries()) {
    if (!ex || typeof ex.text !== 'string' || typeof ex.label !== 'string') throw new UserError(`examples[${i}] must be {"text": "...", "label": "..."}.`)
    // "none" examples mark kinds of text that fit no label.
    const label = ex.label.trim().toLowerCase() === NONE ? NONE : byKey.get(ex.label.trim().toLowerCase())
    if (!label) throw new UserError(`examples[${i}] has label "${ex.label}", which is not one of the labels (or "none").`)
    const n = normalizeText(ex.text)
    if (n.status !== 'ok') continue
    if ((perLabel[label] = (perLabel[label] || 0) + 1) > MAX_INLINE_EXAMPLES_PER_LABEL) continue
    cleanExamples.push({ text: n.text.slice(0, 2000), label, source: 'inline' })
  }

  return {
    labels: out,
    examples: cleanExamples,
    hash: sha(JSON.stringify(out)).slice(0, 16),
  }
}

// "card_arrival" -> "card arrival"; anchors read better as phrases.
export const humanize = (name) => name.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
export const anchorText = (l) => (l.description ? `${humanize(l.name)}: ${l.description}` : humanize(l.name))
