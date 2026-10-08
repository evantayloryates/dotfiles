import test from 'node:test'
import assert from 'node:assert/strict'
import { diagnoseBundle } from '../fixture-diagnostics.mjs'
test('diagnostics identify failing declarations without records or identifier values', () => {
  const secret = 'SENSITIVE_SENTINEL'
  const b = { tables: { clients: [{ id: 'c1' }], calls: [{ id: secret, payload: { people: [{ clientId: secret }] } }, { id: secret, payload: {} }] } }
  const result = diagnoseBundle(b, [{ table: 'calls', field: 'payload.people.*.clientId', targetTable: 'clients' }])
  assert.equal(result.validDeclaredReferences, false)
  assert.deepEqual(result.referenceFailures[0], { table: 'calls', field: 'payload.people.*.clientId', targetTable: 'clients', targetScope: 'bundle', unresolved: 1, missingFields: 1 })
  assert.deepEqual(result.duplicatePrimaryKeys, [{ table: 'calls', duplicates: 1, invalid: 0 }])
  assert.equal(JSON.stringify(result).includes(secret), false)
})
test('catalog and nullable nested references pass; unsafe declaration labels never echo', () => {
  const b = { tables: { clients: [{ id: 'c1', planId: 'p1', contact: { coachId: null } }] } }
  const refs = [{ table: 'clients', field: 'planId', targetTable: 'plans', targetScope: 'catalog' }, { table: 'clients', field: 'contact.coachId', targetTable: 'coaches', nullable: true }]
  assert.equal(diagnoseBundle(b, refs, { tables: { plans: [{ id: 'p1' }] } }).validDeclaredReferences, true)
  assert.throws(() => diagnoseBundle(b, [{ table: 'SENSITIVE NAME', field: 'id', targetTable: 'clients' }]), { message: 'fixture_diagnostics_invalid' })
})
