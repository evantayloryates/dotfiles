// Statement checking for kickoff-stage-db. Pure functions, unit-tested in
// ../test/sql.test.mjs.
//
// The database user is the real wall (SELECT and SHOW VIEW only) and every
// session is read only. This file exists to refuse bad statements early with
// a clear reason, and to remove comments so what runs is what was checked.

export class ToolError extends Error {}

// One pass over the text that knows about quotes. Returns the statement with
// comments removed (what runs) and a copy with every quoted literal blanked
// (what the keyword checks look at, so `LIKE '%sleep(%'` is not a SLEEP call
// and `';'` is not a second statement).
export function scan(sql) {
  let text = ''
  let masked = ''
  const n = sql.length
  let i = 0
  while (i < n) {
    const ch = sql[i]
    const nx = sql[i + 1]
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1
      for (;;) {
        if (j >= n) throw new ToolError(`Unterminated ${ch === '`' ? 'identifier' : 'string'} starting at character ${i + 1}`)
        if (sql[j] === '\\' && ch !== '`') { j += 2; continue }
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) { j += 2; continue }
          break
        }
        j++
      }
      const lit = sql.slice(i, j + 1)
      text += lit
      // Identifiers stay visible to the checks (a table can be named `sms`);
      // string contents never are.
      masked += ch === '`' ? lit.replace(/;/g, ' ') : `${ch}${' '.repeat(Math.max(0, lit.length - 2))}${ch}`
      i = j + 1
      continue
    }
    if (ch === '/' && nx === '*') {
      if (sql[i + 2] === '!') throw new ToolError('Executable comments (/*! ... */) are not allowed')
      const end = sql.indexOf('*/', i + 2)
      if (end < 0) throw new ToolError('Unterminated /* comment')
      // Optimizer hints are comments too and are dropped: they can raise
      // MAX_EXECUTION_TIME or SET_VAR session limits.
      text += ' '
      masked += ' '
      i = end + 2
      continue
    }
    // MySQL starts a -- comment only when a space or control char follows,
    // so `SELECT 5--1` is arithmetic, not a comment.
    if (ch === '#' || (ch === '-' && nx === '-' && (i + 2 >= n || /[\s\x00-\x1f]/.test(sql[i + 2])))) {
      const end = sql.indexOf('\n', i)
      i = end < 0 ? n : end
      text += ' '
      masked += ' '
      continue
    }
    text += ch
    masked += ch
    i++
  }
  return { text, masked }
}

const READ_START = /^\(*\s*(SELECT|WITH|SHOW|EXPLAIN|DESCRIBE|DESC|TABLE|VALUES)\b/i
const FORBIDDEN = [
  [/\bINTO\s+(OUTFILE|DUMPFILE)\b/i, 'INTO OUTFILE/DUMPFILE'],
  [/\bFOR\s+(UPDATE|SHARE)\b/i, 'Locking reads (FOR UPDATE / FOR SHARE)'],
  [/\bLOCK\s+IN\s+SHARE\s+MODE\b/i, 'LOCK IN SHARE MODE'],
  [/\b(SLEEP|BENCHMARK|GET_LOCK|RELEASE_LOCK|RELEASE_ALL_LOCKS|LOAD_FILE)\s*\(/i, null],
  // WITH can lead into a write in MySQL 8 (WITH x AS (...) DELETE ...).
  [/\b(INSERT|UPDATE|DELETE)\b/i, null],
  [/\bREPLACE\b(?!\s*\()/i, 'REPLACE'],
]

// Returns the statement to run (comments removed, one trailing semicolon
// dropped) or throws a ToolError naming the problem.
export function checkSql(sql) {
  if (typeof sql !== 'string' || !sql.trim()) throw new ToolError('"sql" is required')
  if (sql.length > 100_000) throw new ToolError('"sql" is over 100,000 characters; build the statement smaller')
  const { text, masked } = scan(sql)
  const stmt = text.trim().replace(/;\s*$/, '').trim()
  const m = masked.trim().replace(/;\s*$/, '').trim()
  if (!stmt) throw new ToolError('"sql" is empty after removing comments')
  if (!READ_START.test(m)) {
    const first = (m.match(/^\(*\s*([A-Za-z_]+)/) || [])[1] || m.slice(0, 20)
    throw new ToolError(
      `${first.toUpperCase()} cannot run here: this is a read-only STAGING connection. Only SELECT, WITH, SHOW, EXPLAIN, DESCRIBE, TABLE and VALUES statements run.`
    )
  }
  if (m.includes(';')) throw new ToolError('One statement per call (found a second statement after ";")')
  for (const [re, label] of FORBIDDEN) {
    const hit = m.match(re)
    if (hit) throw new ToolError(`${label || hit[1].toUpperCase()} is not allowed here (read-only staging connection)`)
  }
  return stmt
}

// What gets logged about a statement: a short hash and its shape with the
// literals removed, never the literals (they can name a person).
export function shape(stmt) {
  return scan(stmt)
    .masked.replace(/(['"])\s*\1/g, '?')
    .replace(/\b\d+(\.\d+)?\b/g, '?')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
}

export const IDENT = /^[A-Za-z0-9_$]{1,64}$/
