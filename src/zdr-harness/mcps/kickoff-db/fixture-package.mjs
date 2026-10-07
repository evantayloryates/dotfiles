// Harness-only staging. Never registers outside ZDR; never writes to Desktop.
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, lstatSync, realpathSync, readFileSync, writeFileSync, readdirSync, renameSync } from 'node:fs'
import { join, resolve, parse, dirname } from 'node:path'

const token = /^[a-z][a-z0-9_-]{0,63}$/i
const packageId = /^fp_[a-f0-9]{24}$/
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x)
const hash = x => createHash('sha256').update(x).digest('hex')
const encode = x => JSON.stringify(x, null, 2) + '\n'
const requireThat = (x, code) => { if (!x) throw new Error(code) }

// Walk every ancestor: a symlink must never turn protected staging into egress.
function directory(path) {
  const absolute = resolve(path)
  let current = parse(absolute).root
  for (const segment of absolute.slice(current.length).split('/').filter(Boolean)) {
    current = join(current, segment)
    try { mkdirSync(current, { mode: 0o700 }) } catch (e) { if (e.code !== 'EEXIST') throw new Error('fixture_directory_unavailable') }
    const st = lstatSync(current)
    requireThat(st.isDirectory() && !st.isSymbolicLink(), 'fixture_symlink_refused')
  }
  requireThat(realpathSync(absolute) === absolute, 'fixture_path_refused')
  return absolute
}
function read(path) {
  requireThat(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(), 'fixture_file_refused')
  return JSON.parse(readFileSync(path, 'utf8'))
}
function write(path, value) {
  // Immutable writes: retries compare exact content instead of replacing files.
  const bytes = encode(value)
  try { writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 }) }
  catch (e) {
    if (e.code !== 'EEXIST') throw new Error('fixture_write_failed')
    requireThat(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink() && readFileSync(path, 'utf8') === bytes, 'fixture_conflicting_retry')
  }
  return hash(bytes)
}
function valuesAt(value, parts) {
  if (!parts.length) return [value]
  const [key, ...rest] = parts
  if (key === '*') {
    requireThat(Array.isArray(value), 'fixture_reference_array_required')
    return value.flatMap(x => valuesAt(x, rest))
  }
  requireThat(plain(value) && Object.hasOwn(value, key), 'fixture_reference_field_missing')
  return valuesAt(value[key], rest)
}
// Approval receipts are written by the independent reviewer/operator, never by
// this tool. The model's report writer cannot reach this sibling directory.
export function releaseFixture(dir, approvalPath, destination = '/Users/taylor/Desktop/zdr-dump') {
  let approval
  try { approval = read(approvalPath) } catch { throw new Error('fixture_release_approval_required') }
  const manifestBytes = readFileSync(join(dir, 'manifest.json'))
  const manifest = read(join(dir, 'manifest.json'))
  requireThat(approval.manifestSha256 === hash(manifestBytes) && approval.destination === destination && approval.method === 'qualified-independent-review' && approval.transferAuthorized === true && approval.allPackageBytesCleared === true && typeof approval.clearanceReference === 'string' && approval.clearanceReference.length > 0, 'fixture_release_approval_required')
  requireThat(manifest.formatVersion === 1 && manifest.bundles.length === 10, 'fixture_manifest_invalid')
  const snapshot = new Map([['manifest.json', manifestBytes]])
  for (const bundle of manifest.bundles) {
    requireThat(/^customers\/[a-z][a-z0-9_-]{0,63}\.json$/i.test(bundle.path), 'fixture_filename_invalid')
    const path = join(dir, bundle.path)
    const data = read(path)
    const bytes = readFileSync(path)
    requireThat(hash(bytes) === bundle.sha256 && data.bundleId === bundle.bundleId && JSON.stringify(validateBundle(data, manifest.references)) === JSON.stringify(bundle.rowCounts), 'fixture_release_hash_mismatch')
    snapshot.set(bundle.path, bytes)
  }
  requireThat(snapshot.size === 11, 'fixture_bundle_invalid')
  requireThat(['schema', 'transformation', 'loss', 'categories', 'parity', 'privacy'].every(x => Object.hasOwn(manifest.reports, x + '.json')), 'fixture_incomplete')
  for (const [name, sha256] of Object.entries(manifest.reports)) {
    requireThat(/^(schema|transformation|loss|categories|parity|privacy)\.json$/.test(name), 'fixture_report_invalid')
    const path = join(dir, 'reports', name)
    read(path)
    const bytes = readFileSync(path)
    requireThat(hash(bytes) === sha256, 'fixture_release_hash_mismatch')
    snapshot.set('reports/' + name, bytes)
  }
  const dest = directory(destination)
  const id = dir.split('/').at(-1)
  requireThat(packageId.test(id), 'fixture_package_id_invalid')
  const final = join(dest, id)
  // Never overwrite a prior release. A failed partial copy stays hidden and
  // cannot be mistaken for a finalized release or overwritten on retry.
  requireThat(!readdirSync(dest).includes(id), 'fixture_release_already_exists')
  const tmp = join(dest, '.' + id + '-' + randomBytes(8).toString('hex'))
  directory(tmp); directory(join(tmp, 'customers')); directory(join(tmp, 'reports'))
  for (const [name, bytes] of snapshot) writeFileSync(join(tmp, name), bytes, { flag: 'wx', mode: 0o600 })
  for (const [name, bytes] of snapshot) requireThat(hash(readFileSync(join(tmp, name))) === hash(bytes), 'fixture_release_readback_failed')
  write(join(tmp, 'release.json'), { manifestSha256: hash(manifestBytes), clearanceReference: approval.clearanceReference, released: true })
  renameSync(tmp, final)
  return { state: 'released', released: true, outputPath: final, manifestSha256: hash(manifestBytes), bundles: 10 }
}

export function validateBundle(bundle, refs) {
  requireThat(plain(bundle) && token.test(bundle.bundleId) && plain(bundle.tables), 'fixture_bundle_invalid')
  const ids = new Map()
  for (const [table, rows] of Object.entries(bundle.tables)) {
    requireThat(token.test(table) && Array.isArray(rows), 'fixture_table_invalid')
    const keys = new Set()
    for (const row of rows) {
      requireThat(plain(row) && (typeof row.id === 'string' || Number.isSafeInteger(row.id)), 'fixture_primary_key_invalid')
      const key = String(row.id)
      requireThat(key.length > 0 && !keys.has(key), 'fixture_primary_key_duplicate')
      keys.add(key)
    }
    ids.set(table, keys)
  }
  for (const ref of refs) {
    requireThat(plain(ref) && token.test(ref.table) && token.test(ref.targetTable) && typeof ref.field === 'string' && /^[a-zA-Z0-9_]+(?:\.(?:[a-zA-Z0-9_]+|\*))*$/.test(ref.field), 'fixture_reference_invalid')
    for (const row of bundle.tables[ref.table] || []) {
      for (const value of valuesAt(row, ref.field.split('.'))) {
        requireThat(value === null ? ref.nullable === true : ids.get(ref.targetTable)?.has(String(value)), 'fixture_reference_unresolved')
      }
    }
  }
  return Object.fromEntries(Object.entries(bundle.tables).map(([t, rows]) => [t, rows.length]))
}

export const fixtureTool = {
  name: 'fixture_package',
  title: 'Stage a Call Guidance fixture package inside ZDR',
  description: 'Restricted protected-file writer for Data Loader. create; put_bundle (one complete transformed customer at a time); put_report (schema, transformation, loss, categories, parity or privacy); finalize; status. Exactly ten bundles. Validates declared primary/foreign keys including nested dot paths and array *. Does NOT deidentify or certify source parity. release requires an operator-written approval receipt bound to all package bytes and transfers only to the fixed Taylor-requested Desktop/zdr-dump destination. No caller-selected paths; summaries only. Package contents and reports remain sensitive inside ZDR.',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['action'],
    properties: {
      action: { type: 'string', enum: ['create', 'put_bundle', 'put_report', 'finalize', 'status', 'release'] },
      package_id: { type: 'string' },
      references: { type: 'array', items: { type: 'object', required: ['table', 'field', 'targetTable'], additionalProperties: false, properties: { table: { type: 'string' }, field: { type: 'string' }, targetTable: { type: 'string' }, nullable: { type: 'boolean' } } } },
      bundle: { type: 'object', required: ['bundleId', 'tables'], properties: { bundleId: { type: 'string' }, tables: { type: 'object' } }, additionalProperties: false },
      report: { type: 'string', enum: ['schema', 'transformation', 'loss', 'categories', 'parity', 'privacy'] },
      content: { type: 'object' },
    },
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}
export function fixturePackage(args, root) {
  try {
    requireThat(plain(args) && typeof root === 'string' && root.startsWith('/'), 'fixture_arguments_invalid')
    const base = directory(root)
    requireThat((lstatSync(base).mode & 0o077) === 0, 'fixture_directory_permissions')
    if (args.action === 'create') {
      requireThat(Array.isArray(args.references), 'fixture_references_required')
      // Validate reference declarations even before a bundle exists.
      validateBundle({ bundleId: 'validation', tables: {} }, args.references)
      const id = 'fp_' + randomBytes(12).toString('hex')
      const dir = directory(join(base, id))
      directory(join(dir, 'customers'))
      directory(join(dir, 'reports'))
      write(join(dir, 'contract.json'), { formatVersion: 1, references: args.references, expectedBundles: 10 })
      return encode({ package_id: id, state: 'staging', released: false })
    }
    requireThat(packageId.test(args.package_id), 'fixture_package_id_invalid')
    const dir = join(base, args.package_id)
    requireThat(lstatSync(dir).isDirectory() && !lstatSync(dir).isSymbolicLink(), 'fixture_package_not_found')
    directory(dir)
    const contract = read(join(dir, 'contract.json'))
    const finalized = readdirSync(dir).includes('manifest.json')
    if (args.action === 'release') {
      requireThat(finalized, 'fixture_incomplete')
      return encode(releaseFixture(dir, join(dirname(base), 'fixture-approvals', args.package_id + '.json')))
    }
    if (args.action === 'put_bundle') {
      requireThat(!finalized, 'fixture_package_finalized')
      const rowCounts = validateBundle(args.bundle, contract.references)
      requireThat(Buffer.byteLength(encode(args.bundle)) <= 8_000_000, 'fixture_bundle_too_large')
      const files = readdirSync(join(dir, 'customers'))
      const name = args.bundle.bundleId + '.json'
      requireThat(files.includes(name) || files.length < 10, 'fixture_bundle_limit')
      const sha256 = write(join(directory(join(dir, 'customers')), name), args.bundle)
      return encode({ package_id: args.package_id, stored: true, sha256, rowCounts, released: false })
    }
    if (args.action === 'put_report') {
      requireThat(!finalized && ['schema', 'transformation', 'loss', 'categories', 'parity', 'privacy'].includes(args.report) && plain(args.content), 'fixture_report_invalid')
      requireThat(Buffer.byteLength(encode(args.content)) <= 2_000_000, 'fixture_report_too_large')
      const sha256 = write(join(directory(join(dir, 'reports')), args.report + '.json'), args.content)
      return encode({ stored: true, sha256, released: false })
    }
    requireThat(['status', 'finalize'].includes(args.action), 'fixture_action_invalid')
    const files = readdirSync(directory(join(dir, 'customers'))).sort()
    const reports = readdirSync(directory(join(dir, 'reports'))).sort()
    if (args.action === 'finalize') {
      requireThat(files.length === 10 && ['schema', 'transformation', 'loss', 'categories', 'parity', 'privacy'].every(x => reports.includes(x + '.json')), 'fixture_incomplete')
      const bundles = files.map(name => {
        requireThat(/^[a-z][a-z0-9_-]{0,63}\.json$/i.test(name), 'fixture_filename_invalid')
        const path = join(dir, 'customers', name)
        const bundle = read(path)
        requireThat(name === bundle.bundleId + '.json', 'fixture_bundle_filename_mismatch')
        return { bundleId: bundle.bundleId, path: 'customers/' + name, sha256: hash(readFileSync(path)), rowCounts: validateBundle(bundle, contract.references) }
      })
      const reportHashes = Object.fromEntries(reports.map(name => {
        requireThat(/^(schema|transformation|loss|categories|parity|privacy)\.json$/.test(name), 'fixture_report_invalid')
        const path = join(dir, 'reports', name)
        requireThat(plain(read(path)), 'fixture_report_invalid')
        return [name, hash(readFileSync(path))]
      }))
      const digest = write(join(dir, 'manifest.json'), { formatVersion: 1, bundles, references: contract.references, reports: reportHashes, privacyStatus: 'requires-independent-review', released: false })
      return encode({ package_id: args.package_id, state: 'staged-for-review', bundles: 10, manifestSha256: digest, protectedPath: dir, released: false, privacyCertified: false })
    }
    return encode({ package_id: args.package_id, state: finalized ? 'staged-for-review' : 'staging', bundleCount: files.length, reportCount: reports.length, released: false })
  } catch (e) {
    // Never echo data, names, caller content or raw filesystem errors.
    throw new Error(/^fixture_[a-z_]+$/.test(e.message) ? e.message : 'fixture_operation_failed')
  }
}
