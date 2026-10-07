import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, statSync, symlinkSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fixturePackage, validateBundle, releaseFixture } from '../fixture-package.mjs'

function setup(t) {
  const temp = mkdtempSync(join(realpathSync(tmpdir()), 'zdr-fixture-test-'))
  t.after(() => rmSync(temp, { recursive: true, force: true }))
  const root = join(temp, 'exports')
  const call = args => JSON.parse(fixturePackage(args, root))
  const references = [{ table: 'calls', field: 'payload.people.*.clientId', targetTable: 'clients' }]
  const id = call({ action: 'create', references }).package_id
  const bundle = n => ({ bundleId: 'fictional_' + n, tables: { clients: [{ id: 'fictional_client_' + n }], calls: [{ id: 'fictional_call_' + n, payload: { people: [{ clientId: 'fictional_client_' + n }] } }] } })
  return { temp, root, call, id, bundle, references }
}
test('ten bundles survive a new tool instance, are hashed, private and remain unreleased', t => {
  const { root, call, id, bundle } = setup(t)
  for (let n = 0; n < 10; n++) call({ action: 'put_bundle', package_id: id, bundle: bundle(n) })
  for (const report of ['schema', 'transformation', 'loss', 'categories', 'parity', 'privacy']) call({ action: 'put_report', package_id: id, report, content: { syntheticTest: true } })
  const result = call({ action: 'finalize', package_id: id })
  assert.equal(result.privacyCertified, false)
  assert.equal(result.released, false)
  assert.equal(call({ action: 'status', package_id: id }).bundleCount, 10)
  assert.deepEqual(call({ action: 'finalize', package_id: id }), result)
  const manifest = JSON.parse(readFileSync(join(root, id, 'manifest.json')))
  assert.equal(manifest.bundles.length, 10)
  assert.equal(manifest.bundles[0].rowCounts.calls, 1)
  assert.equal(statSync(join(root, id)).mode & 0o777, 0o700)
  assert.equal(statSync(join(root, id, 'manifest.json')).mode & 0o777, 0o600)
  assert.throws(() => call({ action: 'put_bundle', package_id: id, bundle: bundle(0) }), /fixture_package_finalized/)
})
test('exact retry succeeds; changed retry and eleventh bundle fail', t => {
  const { call, id, bundle } = setup(t)
  const args = { action: 'put_bundle', package_id: id, bundle: bundle(0) }
  assert.deepEqual(call(args), call(args))
  args.bundle.tables.clients[0].note = 'changed'
  assert.throws(() => call(args), /fixture_conflicting_retry/)
  for (let n = 1; n < 10; n++) call({ action: 'put_bundle', package_id: id, bundle: bundle(n) })
  assert.throws(() => call({ action: 'put_bundle', package_id: id, bundle: bundle(10) }), /fixture_bundle_limit/)
  assert.throws(() => call({ action: 'finalize', package_id: id }), /fixture_incomplete/)
})
test('broken nested joins, missing nullable fields and duplicate ids fail without echoing content', t => {
  const { references, bundle } = setup(t)
  const b = bundle(0)
  b.tables.calls[0].payload.people[0].clientId = 'SENSITIVE_TEST_SENTINEL'
  assert.throws(() => validateBundle(b, references), { message: 'fixture_reference_unresolved' })
  delete b.tables.calls[0].payload.people[0].clientId
  assert.throws(() => validateBundle(b, [{ ...references[0], nullable: true }]), /fixture_reference_field_missing/)
  b.tables.clients.push(b.tables.clients[0])
  assert.throws(() => validateBundle(b, references), /fixture_primary_key_duplicate/)
})
test('path traversal, root and child symlinks are refused', t => {
  const { temp, root, call, id, bundle } = setup(t)
  assert.throws(() => call({ action: 'status', package_id: '../elsewhere' }), /fixture_package_id_invalid/)
  const b = bundle(0); b.bundleId = '../../leak'
  assert.throws(() => call({ action: 'put_bundle', package_id: id, bundle: b }), /fixture_bundle_invalid/)
  const other = join(temp, 'outside'); mkdirSync(other)
  const link = join(temp, 'link'); symlinkSync(other, link)
  assert.throws(() => fixturePackage({ action: 'create', references: [] }, link), /fixture_symlink_refused/)
  symlinkSync(join(temp, 'outside'), join(root, id, 'customers', 'fictional_0.json'))
  assert.throws(() => call({ action: 'put_bundle', package_id: id, bundle: bundle(0) }), /fixture_conflicting_retry/)
})

test('release requires an independent receipt and exact unchanged package hashes', t => {
  const { temp, root, call, id, bundle } = setup(t)
  for (let n = 0; n < 10; n++) call({ action: 'put_bundle', package_id: id, bundle: bundle(n) })
  for (const report of ['schema', 'transformation', 'loss', 'categories', 'parity', 'privacy']) call({ action: 'put_report', package_id: id, report, content: { syntheticTest: true } })
  const finalized = call({ action: 'finalize', package_id: id })
  assert.throws(() => call({ action: 'release', package_id: id }), /fixture_release_approval_required/)
  const receipt = join(temp, 'approval.json')
  const destination = join(temp, 'cleared')
  const approval = { manifestSha256: finalized.manifestSha256, destination, method: 'qualified-independent-review', clearanceReference: 'INVENTED-TEST-ONLY', allPackageBytesCleared: true, transferAuthorized: true }
  writeFileSync(receipt, JSON.stringify({ ...approval, manifestSha256: 'wrong' }))
  assert.throws(() => releaseFixture(join(root, id), receipt, destination), /fixture_release_approval_required/)
  writeFileSync(receipt, JSON.stringify(approval))
  const path = join(root, id, 'customers', 'fictional_0.json')
  const bytes = readFileSync(path)
  writeFileSync(path, JSON.stringify({ altered: true }))
  assert.throws(() => releaseFixture(join(root, id), receipt, destination), /fixture_release_hash_mismatch/)
  writeFileSync(path, bytes)
  const result = releaseFixture(join(root, id), receipt, destination)
  assert.equal(result.released, true)
  assert.deepEqual(readFileSync(join(result.outputPath, 'customers', 'fictional_0.json')), bytes)
  assert.throws(() => releaseFixture(join(root, id), receipt, destination), /fixture_release_already_exists/)
})

test('chunked customer, checkpoints and shared catalog survive resumptions and guarded release', t => {
  const { temp, root, call } = setup(t)
  const id = call({ action: 'create', references: [{ table: 'clients', field: 'planId', targetTable: 'plans', targetScope: 'catalog' }] }).package_id
  call({ action: 'put_catalog', package_id: id, bundle: { bundleId: 'common', tables: { plans: [{ id: 'fictional_plan' }] } } })
  assert.match(call({ action: 'read_catalog', package_id: id }).content, /fictional_plan/)
  for (let n = 0; n < 10; n++) {
    const chunk = { action: 'add_rows', package_id: id, bundle_id: 'client_' + n, table: 'clients', chunk_id: 'part_01', rows: [{ id: 'fictional_' + n, planId: 'fictional_plan' }] }
    assert.deepEqual(call(chunk), call(chunk))
    assert.match(call({ action: 'read_chunk', package_id: id, bundle_id: 'client_' + n, table: 'clients', chunk_id: 'part_01' }).content, /fictional_plan/)
    call({ action: 'seal_bundle', package_id: id, bundle_id: 'client_' + n })
    assert.throws(() => call(chunk), /fixture_bundle_sealed/)
    call({ action: 'checkpoint', package_id: id, content: { lastComplete: n, next: n + 1 } })
    assert.equal(call({ action: 'resume', package_id: id }).checkpoint.lastComplete, n)
  }
  assert.ok(call({ action: 'list' }).packages.includes(id))
  for (const report of ['schema', 'transformation', 'loss', 'categories', 'parity', 'privacy']) call({ action: 'put_report', package_id: id, report, content: { syntheticTest: true } })
  const result = call({ action: 'finalize', package_id: id })
  const receipt = join(temp, 'catalog-approval.json'), destination = join(temp, 'catalog-release')
  writeFileSync(receipt, JSON.stringify({ manifestSha256: result.manifestSha256, destination, method: 'qualified-independent-review', clearanceReference: 'INVENTED-TEST-ONLY', transferAuthorized: true, allPackageBytesCleared: true }))
  const released = releaseFixture(join(root, id), receipt, destination)
  assert.equal(JSON.parse(readFileSync(join(released.outputPath, 'catalog.json'))).tables.plans.length, 1)
  assert.throws(() => call({ action: 'read_chunk', package_id: id, bundle_id: '../../leak', table: 'clients', chunk_id: 'part_01' }), /fixture_read_invalid/)
})
