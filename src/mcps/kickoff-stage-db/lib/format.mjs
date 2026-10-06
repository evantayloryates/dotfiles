// Turning rows into text for an agent (compact) and into files (complete).
// Pure functions, unit-tested in ../test/format.test.mjs.

// One cell as a JSON-safe value. Buffers become hex when short (ids, uuids)
// and a size note when long; JSON columns arrive as objects from mysql2.
export function cell(v, maxChars) {
  if (v === null || v === undefined) return null
  if (Buffer.isBuffer(v)) return v.length <= 32 ? `0x${v.toString('hex')}` : `<${v.length} bytes>`
  if (typeof v === 'object') v = JSON.stringify(v)
  if (typeof v === 'string' && maxChars && v.length > maxChars) return `${v.slice(0, maxChars)}…<+${v.length - maxChars} chars>`
  return v
}

// Duplicate column names (SELECT a.id, b.id) get a suffix so file rows keep both.
export function uniqueNames(fields) {
  const seen = new Map()
  return fields.map((f) => {
    const base = f.name || '?column?'
    const n = (seen.get(base) || 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base}_${n}`
  })
}

// Compact text: the column list once, then one JSON array per row. About
// half the tokens of an array of objects for the same rows.
export function renderRows(names, rows, { maxCell, maxChars }) {
  const lines = [`columns: ${JSON.stringify(names)}`]
  let chars = lines[0].length
  let shown = 0
  let cutCells = 0
  for (const row of rows) {
    const out = row.map((v) => {
      const c = cell(v, maxCell)
      if (typeof c === 'string' && c.includes('…<+')) cutCells++
      return c
    })
    const line = JSON.stringify(out)
    if (chars + line.length + 1 > maxChars && shown > 0) break
    lines.push(line)
    chars += line.length + 1
    shown++
  }
  return { text: lines.join('\n'), shown, cutCells }
}

const csvQuote = (s) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
const tsvEscape = (s) => s.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r')

// A file writer for one export format, chosen by the path's extension.
export function fileFormat(path) {
  const ext = (path.match(/\.(jsonl|ndjson|csv|tsv)$/i) || [])[1]?.toLowerCase()
  if (!ext) return null
  if (ext === 'jsonl' || ext === 'ndjson') {
    return {
      name: 'jsonl',
      header: () => '',
      row: (names, row) => {
        const o = {}
        names.forEach((n, i) => { o[n] = cell(row[i], 0) })
        return `${JSON.stringify(o)}\n`
      },
    }
  }
  const sep = ext === 'csv' ? ',' : '\t'
  const enc = ext === 'csv' ? csvQuote : tsvEscape
  const str = (v) => {
    const c = cell(v, 0)
    return c === null ? '' : enc(String(c))
  }
  return {
    name: ext,
    header: (names) => `${names.map((n) => enc(n)).join(sep)}\n`,
    row: (_names, row) => `${row.map(str).join(sep)}\n`,
  }
}
