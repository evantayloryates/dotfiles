// Harness-only staging and independently approved release. Never registers outside ZDR.
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, lstatSync, realpathSync, readFileSync, writeFileSync, readdirSync, renameSync } from 'node:fs'
import { join, resolve, parse, dirname } from 'node:path'
import { diagnoseBundle } from './fixture-diagnostics.mjs'

const token = /^[a-z][a-z0-9_-]{0,63}$/i
const validToken = value => typeof value === 'string' && token.test(value)
const packageId = /^fp_[a-f0-9]{24}$/
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x)
const hash = x => createHash('sha256').update(x).digest('hex')
const encode = x => JSON.stringify(x, null, 2) + '\n'
const requireThat = (x, code) => { if (!x) throw new Error(code) }

// Walk every ancestor: a symlink must never turn protected staging into egress.
export function protectedDirectory(path) {
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
export function protectedRead(path) {
  requireThat(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(), 'fixture_file_refused')
  return JSON.parse(readFileSync(path, 'utf8'))
}
export function protectedWrite(path, value) {
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
  try { approval = protectedRead(approvalPath) } catch { throw new Error('fixture_release_approval_required') }
  const manifestBytes = readFileSync(join(dir, 'manifest.json'))
  const manifest = protectedRead(join(dir, 'manifest.json'))
  requireThat(approval.manifestSha256 === hash(manifestBytes) && approval.destination === destination && approval.method === 'qualified-independent-review' && approval.transferAuthorized === true && approval.allPackageBytesCleared === true && typeof approval.clearanceReference === 'string' && approval.clearanceReference.length > 0, 'fixture_release_approval_required')
  const expectedBundles = manifest.packageKind === 'supplement' ? 1 : 10
  requireThat(manifest.formatVersion === 1 && manifest.bundles.length === expectedBundles, 'fixture_manifest_invalid')
  if (manifest.packageKind === 'supplement') {
    requireThat(packageId.test(manifest.baseline?.packageId) && /^[a-f0-9]{64}$/.test(manifest.baseline?.manifestSha256), 'fixture_baseline_invalid')
    requireThat(approval.baselineManifestSha256 === manifest.baseline.manifestSha256 && approval.jointPackageContextCleared === true, 'fixture_release_approval_required')
    const prior = join(destination, manifest.baseline.packageId)
    requireThat(lstatSync(prior).isDirectory() && !lstatSync(prior).isSymbolicLink(), 'fixture_baseline_release_required')
    protectedDirectory(prior)
    requireThat(hash(readFileSync(join(prior, 'manifest.json'))) === manifest.baseline.manifestSha256 && protectedRead(join(prior, 'release.json')).released === true, 'fixture_baseline_release_required')
  }
  const snapshot = new Map([['manifest.json', manifestBytes]])
  let catalog = null
  if (manifest.catalog) {
    requireThat(manifest.catalog.path === 'catalog.json', 'fixture_filename_invalid')
    catalog = protectedRead(join(dir, 'catalog.json'))
    const bytes = readFileSync(join(dir, 'catalog.json'))
    requireThat(hash(bytes) === manifest.catalog.sha256, 'fixture_release_hash_mismatch')
    validateBundle(catalog, [])
    snapshot.set('catalog.json', bytes)
  }
  for (const bundle of manifest.bundles) {
    requireThat(/^customers\/[a-z][a-z0-9_-]{0,63}\.json$/i.test(bundle.path), 'fixture_filename_invalid')
    const path = join(dir, bundle.path)
    const data = protectedRead(path)
    const bytes = readFileSync(path)
    requireThat(hash(bytes) === bundle.sha256 && data.bundleId === bundle.bundleId && JSON.stringify(validateBundle(data, manifest.references, catalog)) === JSON.stringify(bundle.rowCounts), 'fixture_release_hash_mismatch')
    snapshot.set(bundle.path, bytes)
  }
  requireThat(snapshot.size === expectedBundles + (manifest.catalog ? 2 : 1), 'fixture_bundle_invalid')
  requireThat(['schema', 'transformation', 'loss', 'categories', 'parity', 'privacy'].every(x => Object.hasOwn(manifest.reports, x + '.json')), 'fixture_incomplete')
  for (const [name, sha256] of Object.entries(manifest.reports)) {
    requireThat(/^(schema|transformation|loss|categories|parity|privacy)\.json$/.test(name), 'fixture_report_invalid')
    const path = join(dir, 'reports', name)
    protectedRead(path)
    const bytes = readFileSync(path)
    requireThat(hash(bytes) === sha256, 'fixture_release_hash_mismatch')
    snapshot.set('reports/' + name, bytes)
  }
  const dest = protectedDirectory(destination)
  const id = dir.split('/').at(-1)
  requireThat(packageId.test(id), 'fixture_package_id_invalid')
  const final = join(dest, id)
  // Never overwrite a prior release. A failed partial copy stays hidden and
  // cannot be mistaken for a finalized release or overwritten on retry.
  requireThat(!readdirSync(dest).includes(id), 'fixture_release_already_exists')
  const tmp = join(dest, '.' + id + '-' + randomBytes(8).toString('hex'))
  protectedDirectory(tmp); protectedDirectory(join(tmp, 'customers')); protectedDirectory(join(tmp, 'reports'))
  for (const [name, bytes] of snapshot) writeFileSync(join(tmp, name), bytes, { flag: 'wx', mode: 0o600 })
  for (const [name, bytes] of snapshot) requireThat(hash(readFileSync(join(tmp, name))) === hash(bytes), 'fixture_release_readback_failed')
  protectedWrite(join(tmp, 'release.json'), { manifestSha256: hash(manifestBytes), clearanceReference: approval.clearanceReference, released: true })
  renameSync(tmp, final)
  return { state: 'released', released: true, outputPath: final, manifestSha256: hash(manifestBytes), bundles: expectedBundles }
}

export function validateBundle(bundle, refs, catalog = null) {
  requireThat(plain(bundle) && validToken(bundle.bundleId) && plain(bundle.tables), 'fixture_bundle_invalid')
  const ids = new Map()
  for (const [table, rows] of Object.entries(bundle.tables)) {
    requireThat(validToken(table) && Array.isArray(rows), 'fixture_table_invalid')
    const keys = new Set()
    for (const row of rows) {
      requireThat(plain(row) && (typeof row.id === 'string' || Number.isSafeInteger(row.id)), 'fixture_primary_key_invalid')
      const key = String(row.id)
      requireThat(key.length > 0 && !keys.has(key), 'fixture_primary_key_duplicate')
      keys.add(key)
    }
    ids.set(table, keys)
  }
  const catalogIds = new Map(Object.entries(catalog?.tables || {}).map(([table, rows]) => [table, new Set(rows.map(row => String(row.id)))]))
  for (const ref of refs) {
    requireThat(plain(ref) && validToken(ref.table) && validToken(ref.targetTable) && (ref.targetScope == null || ['bundle', 'catalog'].includes(ref.targetScope)) && typeof ref.field === 'string' && /^[a-zA-Z0-9_]+(?:\.(?:[a-zA-Z0-9_]+|\*))*$/.test(ref.field), 'fixture_reference_invalid')
    for (const row of bundle.tables[ref.table] || []) {
      for (const value of valuesAt(row, ref.field.split('.'))) {
        requireThat(value === null ? ref.nullable === true : (ref.targetScope === 'catalog' ? catalogIds : ids).get(ref.targetTable)?.has(String(value)), 'fixture_reference_unresolved')
      }
    }
  }
  return Object.fromEntries(Object.entries(bundle.tables).map(([t, rows]) => [t, rows.length]))
}

export const fixtureTool = {
  name: 'fixture_package',
  title: 'Stage a Call Guidance fixture package inside ZDR',
  description: 'Restricted protected-file writer for Data Loader. create; put_bundle (one complete transformed customer at a time); put_report (schema, transformation, loss, categories, parity or privacy); finalize; status. list/resume/checkpoint provide durable recovery; read_bundle/read_report page sensitive staged content only inside ZDR. add_rows stages idempotent table chunks, seal_bundle validates/assembles a customer. put_catalog saves shared catalog tables; references targetScope:catalog resolves their keys. Primary packages require exactly ten bundles. create with baseline_package_id makes a separate exactly-one-bundle supplement; primary stays immutable. Supplement finalize binds the finalized primary manifest hash; release requires baseline release plus independent approval of joint package context. Validates declared primary/foreign keys including nested dot paths and array *. Does NOT deidentify or certify source parity. release requires an operator-written approval receipt bound to all package bytes and transfers only to the fixed Taylor-requested Desktop/zdr-dump destination. No caller-selected paths; summaries only. diagnose returns schema-only failed reference declarations and duplicate-key counts from staged chunks or a sealed bundle, with no records or identifier values. Package contents and reports remain sensitive inside ZDR.',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['action'],
    properties: {
      action: { type: 'string', enum: ['create', 'put_bundle', 'put_report', 'finalize', 'status', 'release', 'list', 'checkpoint', 'resume', 'read_bundle', 'read_report', 'add_rows', 'seal_bundle', 'put_catalog', 'read_catalog', 'read_chunk', 'diagnose'] },
      package_id: { type: 'string' }, baseline_package_id: { type: 'string' },
      references: { type: 'array', items: { type: 'object', required: ['table', 'field', 'targetTable'], additionalProperties: false, properties: { table: { type: 'string' }, field: { type: 'string' }, targetTable: { type: 'string' }, nullable: { type: 'boolean' }, targetScope: { type: 'string', enum: ['bundle', 'catalog'] } } } },
      bundle: { type: 'object', required: ['bundleId', 'tables'], properties: { bundleId: { type: 'string' }, tables: { type: 'object' } }, additionalProperties: false },
      report: { type: 'string', enum: ['schema', 'transformation', 'loss', 'categories', 'parity', 'privacy'] },
      content: { type: 'object' },
      bundle_id: { type: 'string' }, table: { type: 'string' }, chunk_id: { type: 'string' }, rows: { type: 'array', items: { type: 'object' }, maxItems: 1000 },
      offset: { type: 'integer', minimum: 0 }, max_chars: { type: 'integer', minimum: 1, maximum: 16000 },
    },
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}
export function fixturePackage(args, root) {
  try {
    requireThat(plain(args) && typeof root === 'string' && root.startsWith('/'), 'fixture_arguments_invalid')
    const base = protectedDirectory(root)
    requireThat((lstatSync(base).mode & 0o077) === 0, 'fixture_directory_permissions')
    if (args.action === 'list') return encode({ packages: readdirSync(base).filter(x => packageId.test(x)).sort().slice(-100), released: false })
    if (args.action === 'create') {
      requireThat(Array.isArray(args.references), 'fixture_references_required')
      // Validate reference declarations even before a bundle exists.
      validateBundle({ bundleId: 'validation', tables: {} }, args.references)
      let baseline = null
      if (args.baseline_package_id != null) {
        requireThat(packageId.test(args.baseline_package_id), 'fixture_baseline_invalid')
        const baselinePath = join(base, args.baseline_package_id)
        requireThat(lstatSync(baselinePath).isDirectory() && !lstatSync(baselinePath).isSymbolicLink(), 'fixture_baseline_invalid')
        const baselineDir = protectedDirectory(baselinePath)
        const baselineContract = protectedRead(join(baselineDir, 'contract.json'))
        requireThat(baselineContract.expectedBundles === 10 && !baselineContract.baselinePackageId, 'fixture_baseline_invalid')
        baseline = args.baseline_package_id
      }
      const id = 'fp_' + randomBytes(12).toString('hex')
      const dir = protectedDirectory(join(base, id))
      protectedDirectory(join(dir, 'customers'))
      protectedDirectory(join(dir, 'reports'))
      protectedWrite(join(dir, 'contract.json'), { formatVersion: 1, references: args.references, expectedBundles: baseline ? 1 : 10, ...(baseline ? { baselinePackageId: baseline } : {}) })
      return encode({ package_id: id, state: 'staging', released: false })
    }
    requireThat(packageId.test(args.package_id), 'fixture_package_id_invalid')
    const dir = join(base, args.package_id)
    requireThat(lstatSync(dir).isDirectory() && !lstatSync(dir).isSymbolicLink(), 'fixture_package_not_found')
    protectedDirectory(dir)
    const contract = protectedRead(join(dir, 'contract.json'))
    const expectedBundles = contract.baselinePackageId ? 1 : 10
    requireThat(contract.expectedBundles === expectedBundles, 'fixture_contract_invalid')
    const finalized = readdirSync(dir).includes('manifest.json')
    if (args.action === 'release') {
      requireThat(finalized, 'fixture_incomplete')
      return encode(releaseFixture(dir, join(dirname(base), 'fixture-approvals', args.package_id + '.json')))
    }
    const catalog = readdirSync(dir).includes('catalog.json') ? protectedRead(join(dir, 'catalog.json')) : null
    if (args.action === 'checkpoint') {
      requireThat(!finalized && plain(args.content) && Buffer.byteLength(encode(args.content)) <= 2_000_000, 'fixture_checkpoint_invalid')
      const cp = protectedDirectory(join(dir, 'checkpoints'))
      const names = readdirSync(cp).sort()
      const timestamp = Math.max(Date.now(), names.length ? Number(names.at(-1).slice(0, 13)) + 1 : 0)
      const name = timestamp.toString().padStart(13, '0') + '-' + randomBytes(8).toString('hex') + '.json'
      protectedWrite(join(cp, name), args.content)
      return encode({ package_id: args.package_id, checkpointSaved: true, released: false })
    }
    if (args.action === 'resume') {
      const names = readdirSync(dir).includes('checkpoints') ? readdirSync(protectedDirectory(join(dir, 'checkpoints'))).sort() : []
      requireThat(names.every(x => /^\d{13}-[a-f0-9]{16}\.json$/.test(x)), 'fixture_checkpoint_invalid')
      return encode({ package_id: args.package_id, checkpoint: names.length ? protectedRead(join(dir, 'checkpoints', names.at(-1))) : null, bundles: readdirSync(protectedDirectory(join(dir, 'customers'))).map(x => x.replace(/\.json$/, '')), reports: readdirSync(protectedDirectory(join(dir, 'reports'))), released: false })
    }
    if (['read_bundle', 'read_report', 'read_catalog', 'read_chunk'].includes(args.action)) {
      const isBundle = args.action === 'read_bundle'
      const isCatalog = args.action === 'read_catalog'
      const isChunk = args.action === 'read_chunk'
      requireThat(isCatalog || isChunk || (isBundle ? validToken(args.bundle_id) : ['schema', 'transformation', 'loss', 'categories', 'parity', 'privacy'].includes(args.report)), 'fixture_read_invalid')
      if (isChunk) requireThat(validToken(args.bundle_id) && validToken(args.table) && validToken(args.chunk_id), 'fixture_read_invalid')
      const path = isCatalog ? join(dir, 'catalog.json') : isChunk ? join(protectedDirectory(join(dir, 'chunks', args.bundle_id, args.table)), args.chunk_id + '.json') : join(protectedDirectory(join(dir, isBundle ? 'customers' : 'reports')), (isBundle ? args.bundle_id : args.report) + '.json')
      const text = encode(protectedRead(path))
      const offset = args.offset ?? 0, size = args.max_chars ?? 12000
      requireThat(Number.isInteger(offset) && offset >= 0 && Number.isInteger(size) && size > 0 && size <= 16000, 'fixture_read_invalid')
      return encode({ package_id: args.package_id, offset, totalChars: text.length, nextOffset: offset + size < text.length ? offset + size : null, content: text.slice(offset, offset + size), sensitive: true })
    }
    if (args.action === 'put_catalog') {
      requireThat(!finalized, 'fixture_package_finalized')
      validateBundle(args.bundle, [])
      requireThat(Buffer.byteLength(encode(args.bundle)) <= 8_000_000, 'fixture_bundle_too_large')
      return encode({ stored: true, sha256: protectedWrite(join(dir, 'catalog.json'), args.bundle), released: false })
    }
    if (args.action === 'add_rows') {
      requireThat(!finalized && validToken(args.bundle_id) && validToken(args.table) && validToken(args.chunk_id) && Array.isArray(args.rows) && args.rows.length <= 1000 && Buffer.byteLength(encode(args.rows)) <= 2_000_000, 'fixture_chunk_invalid')
      validateBundle({ bundleId: args.bundle_id, tables: { [args.table]: args.rows } }, [])
      requireThat(!readdirSync(protectedDirectory(join(dir, 'customers'))).includes(args.bundle_id + '.json'), 'fixture_bundle_sealed')
      const chunkRoot = protectedDirectory(join(dir, 'chunks'))
      const names = readdirSync(chunkRoot)
      requireThat(names.includes(args.bundle_id) || names.length < expectedBundles, 'fixture_bundle_limit')
      const chunkDir = protectedDirectory(join(chunkRoot, args.bundle_id, args.table))
      requireThat(readdirSync(chunkDir).length < 1000 || readdirSync(chunkDir).includes(args.chunk_id + '.json'), 'fixture_chunk_limit')
      return encode({ stored: true, sha256: protectedWrite(join(chunkDir, args.chunk_id + '.json'), args.rows), released: false })
    }
    if (['seal_bundle', 'diagnose'].includes(args.action)) {
      requireThat((args.action === 'diagnose' || !finalized) && validToken(args.bundle_id), 'fixture_chunk_invalid')
      if (args.action === 'diagnose' && readdirSync(join(dir, 'customers')).includes(args.bundle_id + '.json')) return encode({ package_id: args.package_id, ...diagnoseBundle(protectedRead(join(dir, 'customers', args.bundle_id + '.json')), contract.references, catalog), released: false })
      const chunkDir = protectedDirectory(join(dir, 'chunks', args.bundle_id))
      const tables = {}
      requireThat(readdirSync(chunkDir).length > 0, 'fixture_chunk_missing')
      for (const table of readdirSync(chunkDir).sort()) {
        requireThat(validToken(table), 'fixture_chunk_invalid')
        const tableDir = protectedDirectory(join(chunkDir, table))
        tables[table] = []
        for (const name of readdirSync(tableDir).sort()) {
          requireThat(/^[a-z][a-z0-9_-]{0,63}\.json$/i.test(name), 'fixture_chunk_invalid')
          const rows = protectedRead(join(tableDir, name))
          requireThat(Array.isArray(rows), 'fixture_chunk_invalid')
          tables[table].push(...rows)
          requireThat(Buffer.byteLength(encode(tables)) <= 8_000_000, 'fixture_bundle_too_large')
        }
      }
      if (args.action === 'diagnose') return encode({ package_id: args.package_id, ...diagnoseBundle({ bundleId: args.bundle_id, tables }, contract.references, catalog), released: false })
      return fixturePackage({ action: 'put_bundle', package_id: args.package_id, bundle: { bundleId: args.bundle_id, tables } }, root)
    }
    if (args.action === 'put_bundle') {
      requireThat(!finalized, 'fixture_package_finalized')
      const rowCounts = validateBundle(args.bundle, contract.references, catalog)
      requireThat(Buffer.byteLength(encode(args.bundle)) <= 8_000_000, 'fixture_bundle_too_large')
      const files = readdirSync(join(dir, 'customers'))
      const name = args.bundle.bundleId + '.json'
      requireThat(files.includes(name) || files.length < expectedBundles, 'fixture_bundle_limit')
      const sha256 = protectedWrite(join(protectedDirectory(join(dir, 'customers')), name), args.bundle)
      return encode({ package_id: args.package_id, stored: true, sha256, rowCounts, released: false })
    }
    if (args.action === 'put_report') {
      requireThat(!finalized && ['schema', 'transformation', 'loss', 'categories', 'parity', 'privacy'].includes(args.report) && plain(args.content), 'fixture_report_invalid')
      requireThat(Buffer.byteLength(encode(args.content)) <= 2_000_000, 'fixture_report_too_large')
      const sha256 = protectedWrite(join(protectedDirectory(join(dir, 'reports')), args.report + '.json'), args.content)
      return encode({ stored: true, sha256, released: false })
    }
    requireThat(['status', 'finalize'].includes(args.action), 'fixture_action_invalid')
    const files = readdirSync(protectedDirectory(join(dir, 'customers'))).sort()
    const reports = readdirSync(protectedDirectory(join(dir, 'reports'))).sort()
    if (args.action === 'finalize') {
      requireThat(files.length === expectedBundles && ['schema', 'transformation', 'loss', 'categories', 'parity', 'privacy'].every(x => reports.includes(x + '.json')), 'fixture_incomplete')
      const bundles = files.map(name => {
        requireThat(/^[a-z][a-z0-9_-]{0,63}\.json$/i.test(name), 'fixture_filename_invalid')
        const path = join(dir, 'customers', name)
        const bundle = protectedRead(path)
        requireThat(name === bundle.bundleId + '.json', 'fixture_bundle_filename_mismatch')
        return { bundleId: bundle.bundleId, path: 'customers/' + name, sha256: hash(readFileSync(path)), rowCounts: validateBundle(bundle, contract.references, catalog) }
      })
      const reportHashes = Object.fromEntries(reports.map(name => {
        requireThat(/^(schema|transformation|loss|categories|parity|privacy)\.json$/.test(name), 'fixture_report_invalid')
        const path = join(dir, 'reports', name)
        requireThat(plain(protectedRead(path)), 'fixture_report_invalid')
        return [name, hash(readFileSync(path))]
      }))
      let baseline = null
      if (contract.baselinePackageId) {
        const prior = protectedDirectory(join(base, contract.baselinePackageId))
        const priorManifest = protectedRead(join(prior, 'manifest.json'))
        requireThat(priorManifest.bundles?.length === 10 && !priorManifest.baseline, 'fixture_baseline_invalid')
        requireThat(!bundles.some(b => priorManifest.bundles.some(p => p.bundleId === b.bundleId)), 'fixture_baseline_bundle_collision')
        baseline = { packageId: contract.baselinePackageId, manifestSha256: hash(readFileSync(join(prior, 'manifest.json'))) }
      }
      const digest = protectedWrite(join(dir, 'manifest.json'), { formatVersion: 1, ...(baseline ? { packageKind: 'supplement', baseline } : {}), bundles, references: contract.references, reports: reportHashes, ...(catalog ? { catalog: { path: 'catalog.json', sha256: hash(readFileSync(join(dir, 'catalog.json'))), rowCounts: validateBundle(catalog, []) } } : {}), privacyStatus: 'requires-independent-review', released: false })
      return encode({ package_id: args.package_id, state: 'staged-for-review', bundles: expectedBundles, manifestSha256: digest, protectedPath: dir, released: false, privacyCertified: false })
    }
    return encode({ package_id: args.package_id, state: finalized ? 'staged-for-review' : 'staging', bundleCount: files.length, reportCount: reports.length, released: false })
  } catch (e) {
    // Never echo data, names, caller content or raw filesystem errors.
    throw new Error(/^fixture_[a-z_]+$/.test(e.message) ? e.message : 'fixture_operation_failed')
  }
}
