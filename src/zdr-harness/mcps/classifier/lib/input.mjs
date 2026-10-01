// Reading items: inline lists or a file (JSONL, JSON array, CSV with a header,
// or plain text with one item per line), then filter / offset / limit.
// Bad rows are skipped and counted, never fatal; the file is fatal only when
// nothing in it is usable.

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { extname, isAbsolute, join, resolve, sep } from 'node:path'
import { SCOPE } from './paths.mjs'
import { UserError } from './taxonomy.mjs'
import { normalizeText } from './text.mjs'

export const MAX_ITEMS = 200_000
const MAX_FILE_BYTES = 500 * 1024 * 1024

// Resolves a caller path against the caller's working directory. Paths are
// echoed back exactly as given, never as resolved.
export function callerPath(p, cwd) {
  if (typeof p !== 'string' || !p.trim()) return null
  const expanded = p.startsWith('~/') ? resolve(process.env.CLASSIFIER_REAL_HOME || process.env.HOME, p.slice(2)) : p
  return isAbsolute(expanded) ? expanded : resolve(cwd || process.cwd(), expanded)
}

// Only data files, never anything hidden or credential-shaped. Inside the
// ZDR harness this is what keeps the classifier from becoming a general file
// reader (the harness has no file tools on purpose); elsewhere it is defence
// in depth.
const DATA_EXT = new Set(['.jsonl', '.ndjson', '.csv', '.tsv', '.json', '.txt'])
const SECRET = /(^|[._-])(env|secrets?|credentials?|tokens?|passwords?|id_rsa|id_ed25519|key|pem)([._-]|$)/i
export function checkDataPath(abs, given, { write = false } = {}) {
  // Judge the real target: a symlink named data.jsonl may point anywhere.
  let real = abs
  try {
    real = existsSync(abs) ? realpathSync(abs) : resolve(realpathSync(dirname(abs)), abs.split(sep).at(-1))
  } catch {}
  for (const p of new Set([abs, real])) checkOne(p, given, write)
}
// Inside the harness, transcript exports (kickoffdb_transcript_export) live in
// the harness's own private folder; that one folder is readable.
const HARNESS_EXPORTS = join(process.env.CLASSIFIER_REAL_HOME || '', '.zdr-harness', 'exports') + sep
function checkOne(abs, given, write) {
  if (SCOPE === 'zdr' && !write && process.env.CLASSIFIER_REAL_HOME && abs.startsWith(HARNESS_EXPORTS) && extname(abs) === '.jsonl') return
  const parts = abs.split(sep).filter(Boolean)
  const what = write ? 'output_path' : 'input_file'
  if (parts.some((p) => p.startsWith('.')) || parts.includes('Library')) throw new UserError(`${what} cannot be inside a hidden folder or Library: ${given}. Put the file in a normal folder.`)
  if (!DATA_EXT.has(extname(abs).toLowerCase())) throw new UserError(`${what} must be a .jsonl, .csv, .tsv, .json or .txt file: ${given}.`)
  if (SECRET.test(parts.at(-1).replace(extname(abs), ''))) throw new UserError(`${what} looks like a credentials file: ${given}. Rename the data file.`)
  if (write && SCOPE === 'zdr' && existsSync(abs)) throw new UserError(`output_path already exists: ${given}. Choose a new file name; results never overwrite a file here.`)
}

export function readRowsFromFile(path, given) {
  checkDataPath(path, given)
  let st
  try {
    st = statSync(path)
  } catch {
    throw new UserError(`input_file not found: ${given}. Pass an absolute path, or a path relative to your working directory.`)
  }
  if (!st.isFile()) throw new UserError(`input_file is not a file: ${given}.`)
  if (st.size > MAX_FILE_BYTES) throw new UserError(`input_file is ${Math.round(st.size / 1e6)} MB; the most is ${MAX_FILE_BYTES / 1e6} MB. Split it into parts.`)
  let src
  try {
    src = readFileSync(path, 'utf8').replace(/^﻿/, '')
  } catch {
    throw new UserError(`input_file could not be read: ${given}. Check that it exists and is readable.`)
  }
  const ext = extname(path).toLowerCase()
  if (ext === '.csv') return parseCsv(src, given, ',')
  if (ext === '.tsv') return parseCsv(src, given, '\t')
  if (ext === '.json' || (ext !== '.jsonl' && src.trimStart().startsWith('['))) {
    try {
      const arr = JSON.parse(src)
      if (Array.isArray(arr)) return { rows: arr.map((v, i) => ({ line: i + 1, value: v })), bad: 0, format: 'json' }
    } catch {
      if (ext === '.json') throw new UserError(`input_file is not valid JSON: ${given}. For one item per line use .jsonl.`)
    }
  }
  const lines = src.split(/\r?\n/)
  const looksJsonl = ext === '.jsonl' || ext === '.ndjson' || lines.find((l) => l.trim())?.trim().startsWith('{')
  if (!looksJsonl) return { rows: lines.map((l, i) => ({ line: i + 1, value: l })).filter((r) => r.value.trim()), bad: 0, format: 'text' }
  const rows = []
  let bad = 0
  lines.forEach((l, i) => {
    if (!l.trim()) return
    try {
      rows.push({ line: i + 1, value: JSON.parse(l) })
    } catch {
      bad++
    }
  })
  return { rows, bad, format: 'jsonl' }
}

// RFC 4180 CSV: quoted fields may hold commas, doubled quotes and newlines.
function parseCsv(src, given, delim = ',') {
  const recs = []
  let rec = []
  let f = ''
  let q = false
  let line = 1
  let start = 1
  let quotedFrom = 0
  const suspect = []
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (q) {
      if (c === '"' && src[i + 1] === '"') {
        f += '"'
        i++
      } else if (c === '"') {
        q = false
        // A quoted field spanning many lines is usually a stray quote that
        // swallowed the rows after it.
        if (line - quotedFrom > 20) suspect.push(quotedFrom)
      } else {
        if (c === '\n') line++
        f += c
      }
      continue
    }
    if (c === '"' && f === '') {
      q = true
      quotedFrom = line
    }
    else if (c === delim) {
      rec.push(f)
      f = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      rec.push(f)
      recs.push({ rec, line: start })
      rec = []
      f = ''
      line++
      start = line
    } else f += c
  }
  if (f || rec.length) {
    rec.push(f)
    recs.push({ rec, line: start, unterminated: q })
  }
  const [header, ...body] = recs.filter((r) => !(r.rec.length === 1 && r.rec[0] === ''))
  if (!header) throw new UserError(`input_file has no rows: ${given}.`)
  const cols = header.rec.map((h) => h.trim())
  let bad = 0
  const rows = []
  for (const r of body) {
    if (r.unterminated || r.rec.length !== cols.length) {
      bad++
      continue
    }
    rows.push({ line: r.line, value: Object.fromEntries(cols.map((c, i) => [c, r.rec[i]])) })
  }
  return { rows, bad, format: delim === ',' ? 'csv' : 'tsv', suspect: q ? [...suspect, quotedFrom] : suspect }
}

// rows -> items. Each item: { n (position), id, text?, status, reason?, flags }
export function toItems(rows, { textField = 'text', idField = 'id', filter, offset = 0, limit } = {}) {
  let selected = rows
  if (filter) selected = selected.filter((r) => matches(r.value, filter))
  if (offset) selected = selected.slice(offset)
  if (limit != null) selected = selected.slice(0, limit)
  if (selected.length > MAX_ITEMS) throw new UserError(`${selected.length.toLocaleString()} items selected; the most per job is ${MAX_ITEMS.toLocaleString()}. Use filter, offset and limit to split it into several jobs.`)

  let missingField = 0
  const items = selected.map((r, n) => {
    const v = r.value
    const isObj = v && typeof v === 'object' && !Array.isArray(v)
    const raw = isObj ? getField(v, textField) : v
    const id = isObj && getField(v, idField) != null ? String(getField(v, idField)) : String(r.line ?? n + 1)
    if (isObj && raw === undefined) missingField++
    const norm = normalizeText(raw)
    return { n, id, ...norm }
  })
  return { items, missingField }
}

// Dotted paths reach nested fields: "message.body".
function getField(obj, path) {
  if (path in obj) return obj[path]
  return path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj)
}

function matches(value, f) {
  if (!value || typeof value !== 'object') return false
  const v = getField(value, f.field)
  if (v === undefined || v === null) return false
  if (f.equals !== undefined && String(v) !== String(f.equals)) return false
  if (f.contains !== undefined && !String(v).toLowerCase().includes(String(f.contains).toLowerCase())) return false
  const cmp = (a, b) => (typeof a === 'number' && !isNaN(Number(b)) ? a - Number(b) : String(a).localeCompare(String(b)))
  if (f.gte !== undefined && cmp(v, f.gte) < 0) return false
  if (f.lt !== undefined && cmp(v, f.lt) >= 0) return false
  return true
}

export function fieldsOf(rows) {
  const first = rows.find((r) => r.value && typeof r.value === 'object' && !Array.isArray(r.value))
  return first ? Object.keys(first.value) : []
}
