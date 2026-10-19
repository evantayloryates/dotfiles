// Schema-only diagnostics. Never return records, IDs, reference values or text.
const token = x => typeof x === 'string' && /^[a-z][a-z0-9_-]{0,63}$/i.test(x)
const field = x => typeof x === 'string' && /^[a-zA-Z0-9_]+(?:\.(?:[a-zA-Z0-9_]+|\*))*$/.test(x)
function valuesAt(value, path) {
  if (!path.length) return [value]
  const [key, ...rest] = path
  if (key === '*') {
    if (!Array.isArray(value)) throw Error('missing')
    return value.flatMap(x => valuesAt(x, rest))
  }
  if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) throw Error('missing')
  return valuesAt(value[key], rest)
}
export function diagnoseBundle(bundle, references, catalog = null) {
  if (!bundle?.tables || !Array.isArray(references)) throw Error('fixture_diagnostics_invalid')
  const tables = new Map(), duplicatePrimaryKeys = []
  for (const [table, rows] of Object.entries(bundle.tables)) {
    if (!token(table) || !Array.isArray(rows)) throw Error('fixture_diagnostics_invalid')
    const ids = new Set(); let duplicates = 0, invalid = 0
    for (const row of rows) {
      if (!row || (typeof row.id !== 'string' && !Number.isSafeInteger(row.id)) || String(row.id).length === 0) { invalid++; continue }
      const id = String(row.id)
      if (ids.has(id)) duplicates++
      ids.add(id)
    }
    tables.set(table, ids)
    if (duplicates || invalid) duplicatePrimaryKeys.push({ table, duplicates, invalid })
  }
  const catalogs = new Map(Object.entries(catalog?.tables || {}).map(([table, rows]) => [table, new Set(rows.map(row => String(row.id)))]))
  const referenceFailures = []
  for (const ref of references) {
    if (!token(ref?.table) || !token(ref.targetTable) || !field(ref.field) || (ref.targetScope != null && !['bundle', 'catalog'].includes(ref.targetScope))) throw Error('fixture_diagnostics_invalid')
    let unresolved = 0, missingFields = 0
    for (const row of bundle.tables[ref.table] || []) {
      let values
      try { values = valuesAt(row, ref.field.split('.')) } catch { missingFields++; continue }
      for (const value of values) {
        if (value === null ? ref.nullable !== true : !(ref.targetScope === 'catalog' ? catalogs : tables).get(ref.targetTable)?.has(String(value))) unresolved++
      }
    }
    if (unresolved || missingFields) referenceFailures.push({ table: ref.table, field: ref.field, targetTable: ref.targetTable, targetScope: ref.targetScope || 'bundle', unresolved, missingFields })
  }
  return { validDeclaredReferences: referenceFailures.length === 0 && duplicatePrimaryKeys.length === 0, referenceFailures, duplicatePrimaryKeys, limitations: ['schema-only declared-reference and primary-key diagnostics; no source parity or privacy certification'] }
}
