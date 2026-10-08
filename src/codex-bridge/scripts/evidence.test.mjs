// Offline only: no Bridge import, model, native UI or app-server connection.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { test } from 'node:test'
import { EvidenceStore, validateFact, validateReceipt } from '../lib/capability-evidence.mjs'
import { evidenceHandler } from '../lib/evidence-tools.mjs'

const entity = { bundle_id: 'test.fixture', app_version: '1', app_build: '1', os_build: 'test', provider: 'fixture', provider_version: '1', surface: 'native-menu', capture_mode: 'isolated', display_profile: 'test-2x' }
const fact = { entity, capability: 'child-menu', result: 'pass', sample_count: 1, observed_at: '2026-01-01T00:00:00Z', expires_at: '2027-01-01T00:00:00Z', evidence_refs: ['/tmp/fixture-evidence.json'], limits: 'Synthetic; no real app guarantee.' }
const receipt = { session_id: 'test-session', caller: 'test-caller', action_id: 'one', provider: 'fixture', target: { bundle_id: 'test.fixture', pid: 123 }, clock_domain: 'CLOCK_UPTIME_RAW', start_ns: '49000000000001', end_ns: '49000000000021', intent: 'Open a fixture menu', result: 'delivered', evidence_refs: ['/tmp/fixture-evidence.json'] }
function temporary(fn) {
  const root = mkdtempSync(join(tmpdir(), 'computer-use-evidence-'))
  return Promise.resolve().then(() => fn(new EvidenceStore(root), root)).finally(() => rmSync(root, { recursive: true, force: true }))
}

test('strict input rejects accidental text, unknown clocks and malformed bounds', () => {
  for (const input of [{ ...fact, text: 'unrequested' }, { ...fact, entity: { ...entity, extra: true } }, { ...fact, evidence_refs: ['relative'] }, { ...fact, expires_at: fact.observed_at }, { ...fact, sample_count: 0 }]) assert.throws(() => validateFact(input))
  for (const input of [{ ...receipt, clock_domain: 'wall' }, { ...receipt, end_ns: '1' }, { ...receipt, start_ns: 100 }, { ...receipt, start_ns: '18446744073709551616' }, { ...receipt, target: { ...receipt.target, pid: 0 } }, { ...receipt, keys: 'secret' }]) assert.throws(() => validateReceipt(input))
  assert.equal(validateReceipt(receipt).provenance, 'caller_claimed')
})

test('exact version buckets, expiry, contradictory observations and read bounds', () => temporary(store => {
  const one = store.put('facts', fact)
  assert.equal(store.put('facts', fact).id, one.id)
  const reordered = Object.fromEntries(Object.entries(fact).reverse())
  reordered.entity = Object.fromEntries(Object.entries(entity).reverse())
  assert.equal(store.put('facts', reordered).id, one.id)
  store.put('facts', { ...fact, result: 'fail' })
  store.put('facts', { ...fact, observed_at: '2025-01-01T00:00:00Z', expires_at: '2025-02-01T00:00:00Z' })
  store.put('facts', { ...fact, observed_at: '2028-01-01T00:00:00Z', expires_at: '2029-01-01T00:00:00Z' })
  const now = Date.parse('2026-10-08T00:00:00Z')
  assert.deepEqual(store.facts(entity, { now }).map(e => e.value.result).sort(), ['fail', 'pass'])
  assert.equal(store.facts(entity, { now, includeExpired: true }).length, 3)
  assert.equal(store.facts({ ...entity, app_version: '2' }, { now }).length, 0)
  assert.equal(store.facts(entity, { now, limit: 1 }).length, 1)
  assert.throws(() => evidenceHandler('computer_use_facts', store)({ entity, include_expired: 'false' }))
  assert.throws(() => evidenceHandler('computer_use_facts', store)({ entity, secret: true }))
  assert.throws(() => store.facts(entity, { limit: 101 }))
  assert.equal(statSync(one.path).mode & 0o777, 0o600)
  assert.equal(statSync(join(one.path, '..')).mode & 0o777, 0o700)
}))

test('receipts isolate sessions and preserve nanoseconds without floating point loss', () => temporary(store => {
  store.put('receipts', { ...receipt, start_ns: '18446744073709551614', end_ns: '18446744073709551615' })
  store.put('receipts', receipt)
  store.put('receipts', { ...receipt, session_id: 'someone-else' })
  const found = store.receipts('test-session')
  assert.equal(found.length, 2)
  assert.equal(found[0].value.start_ns, '18446744073709551614')
  assert.equal(found[0].value.ownership.startsWith('Not verified'), true)
  assert.equal(store.receipts('unknown').length, 0)
  assert.throws(() => evidenceHandler('computer_use_receipts', store)({ session_id: 'test-session', include_expired: true }))
}))

test('interrupted publication leaves no partial entry; corruption is reported', () => temporary((store, root) => {
  store.publish = () => { throw new Error('injected publication failure') }
  assert.throws(() => store.put('facts', fact), /injected/)
  assert.equal(store.facts(entity).length, 0)
  const bucket = readdirSync(join(root, 'facts'))[0]
  assert.deepEqual(readdirSync(join(root, 'facts', bucket)), [])
  delete store.publish
  const entry = store.put('facts', fact)
  const content = JSON.parse(readFileSync(entry.path))
  content.value.result = 'fail'
  writeFileSync(entry.path, JSON.stringify(content))
  assert.throws(() => store.facts(entity), /corrupt evidence/)
}))

test('four independent writers preserve 32 distinct entries and deduplicate common entries', () => temporary(async (store, root) => {
  const modulePath = new URL('../lib/capability-evidence.mjs', import.meta.url).href
  await Promise.all(Array.from({ length: 4 }, (_, writer) => new Promise((resolve, reject) => {
    const code = `import { EvidenceStore } from ${JSON.stringify(modulePath)}; const s = new EvidenceStore(${JSON.stringify(root)}); const f = ${JSON.stringify(fact)}; s.put('facts', f); for(let n=0;n<8;n++) s.put('facts', {...f, limits: 'writer-${writer}-' + n});`
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'ignore', 'pipe'] })
    let error = ''; child.stderr.on('data', b => { error += b })
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(error)))
  })))
  assert.equal(store.facts(entity, { limit: 100 }).length, 33)
}))
