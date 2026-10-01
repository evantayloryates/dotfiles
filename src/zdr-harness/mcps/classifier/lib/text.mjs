// Text handling: normalisation, per-item gates, the injection-shape detector,
// dedupe keys, and the identifier scrubber used on everything kept forever.
// Measured in the 2026-10-01 pressure tests (see ../README.md, "Why it is built
// this way"): lone surrogates crash the chat API, zero-width characters move
// embeddings, and injection text fools the embedding vote but not the model.

import { createHash } from 'node:crypto'

const INVISIBLE = /[​-‏‪-‮⁠-⁩﻿­]/g
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const NULLISH = new Set(['null', 'undefined', 'n/a', 'na', 'none', 'nil', '-', '--', 'nan'])
const CONTENT = /[\p{L}\p{N}\p{Extended_Pictographic}]/u

// Chat accepts ~10.4M characters per message and ~922k tokens of input; stay
// well inside both.
export const MAX_ITEM_CHARS = 3_000_000
// Items longer than this skip the embedding vote: it was confidently wrong on
// 10 of 27 transcripts at ~6k characters, while the model got 27 of 27.
export const LONG_ITEM_CHARS = 800

export function normalizeText(raw) {
  const flags = []
  if (raw === undefined) return { status: 'rejected', reason: 'missing_text' }
  if (raw === null) return { status: 'unclassifiable', reason: 'empty' }
  let t = raw
  if (typeof t === 'number' || typeof t === 'boolean') t = String(t)
  if (typeof t !== 'string') return { status: 'rejected', reason: 'text_not_string' }
  if (!t.isWellFormed()) {
    t = t.toWellFormed()
    flags.push('repaired_characters')
  }
  t = t
    .normalize('NFC')
    .replace(INVISIBLE, '')
    .replace(CONTROL, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!t) return { status: 'unclassifiable', reason: 'empty' }
  if (NULLISH.has(t.toLowerCase())) return { status: 'unclassifiable', reason: 'placeholder' }
  if (!CONTENT.test(t)) return { status: 'unclassifiable', reason: 'no_content' }
  if (t.length > MAX_ITEM_CHARS) return { status: 'rejected', reason: 'too_long' }
  return { status: 'ok', text: t, flags }
}

export const dedupeKey = (text) => text.toLowerCase().replace(/\s+/g, ' ')
export const sha = (s) => createHash('sha256').update(s).digest('hex')

// Text that tries to steer a classifier. A hit never rejects the item; it only
// sends it past the embedding vote to the model, which resisted every attack
// when the message was JSON-encoded and `none` was allowed.
const INJECTION = /\b(ignore|disregard|forget)\b.{0,40}\b(instruction|previous|above|prior|rules?)|\b(system|assistant|developer)\s*:|\b(label|category|classif\w*|intent)\s*[:=]|"label"\s*:|<\/?\w+>|\boverride\b|\b(always|must)\s+(choose|pick|select|answer|label|output|return)\b/i
export const looksLikeInjection = (text) => INJECTION.test(text)

// Identifiers that pin text to a person or a record. Applied to everything the
// service keeps forever (profiles, notes), never to the items it classifies.
const IDENTIFIERS = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, 'email address'],
  [/\bhttps?:\/\/\S+|\bwww\.\S+/gi, 'link'],
  [/(?<![\w.])(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\w.])/g, 'phone number'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, 'id'],
  [/(?<!\w)@[A-Za-z0-9_]{3,}/g, 'handle'],
  [/\b\d{5,}\b/g, 'long number'],
  [/[$£€]\s?\d[\d,]*(?:\.\d+)?|\b\d+(?:\.\d{2})\s?(?:usd|dollars)\b/gi, 'money amount'],
  [/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, 'date'],
  [/\b(?:user|client|customer|account|member|patient|order|session|device|person)[_ -]?(?:id|no|number|#)\s*[:=#]?\s*[A-Za-z0-9_-]{3,}/gi, 'record id'],
  [/\b[\w.-]+\s+(?:at|@)\s+[\w-]+\s+dot\s+(?:com|net|org|edu|io|co)\b/gi, 'email address'],
  [/\b(?:(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)[\s,.-]+){3,}(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/gi, 'number spelled out'],
  [/\b\d{1,6}\s+(?:[A-Z][a-z]+\s+){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl)\b/g, 'street address'],
  [/\b\d{1,3}\s*(?:years?|yrs?)[\s-]*old\b|\b(?:i am|i'm|im)\s+\d{2}\b(?!\s*(?:min|minute|mile|mi\b|lb|pound|kg|km|percent|%|sec|hour|hr|day|week|rep|set|cal))/gi, 'age'],
]

// Returns the kinds of identifier found (empty when clean).
export function findIdentifiers(text) {
  const kinds = new Set()
  for (const [re, kind] of IDENTIFIERS) {
    re.lastIndex = 0
    if (re.test(text)) kinds.add(kind)
  }
  return [...kinds]
}

// Replaces identifiers with placeholders (for free-text notes).
export function scrub(text) {
  let out = text
  for (const [re, kind] of IDENTIFIERS) out = out.replace(re, `<${kind}>`)
  return out
}

// Word tokens for near-duplicate checks.
const STOP = new Set('a an the and or but to of in on at for with my me i im i\'m you your is are was be it this that so do can just we our'.split(' '))
export function tokens(text) {
  return dedupeKey(text)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(' ')
    .filter((w) => w && !STOP.has(w))
}
export function jaccard(a, b) {
  const A = new Set(a)
  const B = new Set(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / (A.size + B.size - inter)
}
export function shingles(toks, n = 5) {
  const out = []
  for (let i = 0; i + n <= toks.length; i++) out.push(toks.slice(i, i + n).join(' '))
  return out
}

export const clip = (text, n) => (text.length > n ? `${text.slice(0, n - 1)}…` : text)
