// node --test src/zdr-harness/mcps/exports/test/
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { archive, list, prune, remove, unarchive } from '../lib.mjs'

const DAY = 86_400_000
const hex = (n, c) => c.repeat(n)

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'exports-test-'))
  writeFileSync(join(root, `tx_${hex(8, 'a')}.jsonl`), '{"x":1}\n')
  writeFileSync(join(root, `tx_${hex(8, 'b')}.jsonl`), '{"x":2}\n')
  mkdirSync(join(root, 'fixture-packages', `fp_${hex(24, 'c')}`, 'chunks'), { recursive: true })
  writeFileSync(join(root, 'fixture-packages', `fp_${hex(24, 'c')}`, 'chunks', 'a.json'), '{}')
  writeFileSync(join(root, 'fixture-packages', `fp_${hex(24, 'c')}`, 'manifest.json'), '{}')
  mkdirSync(join(root, 'fixture-source-pages'), { recursive: true })
  writeFileSync(join(root, 'fixture-source-pages', `sp_${hex(24, 'd')}.json`), '{}')
  mkdirSync(join(root, 'operational-review'), { recursive: true })
  writeFileSync(join(root, 'operational-review', 'latest-analyst-response.json'), '{}')
  mkdirSync(join(root, 'fixture-approvals'), { recursive: true })
  writeFileSync(join(root, 'fixture-approvals', `fp_${hex(24, 'c')}.json`), '{}')
  writeFileSync(join(root, 'notes.txt'), 'unmanaged')
  return root
}
const ids = (r) => r.items.map((i) => i.id).sort()

test('list: every managed kind, sizes, unmanaged reported, no contents', () => {
  const root = fixture()
  const r = list(root)
  assert.deepEqual(ids(r), [`fp_${hex(24, 'c')}`, 'rv_latest-analyst-response', `sp_${hex(24, 'd')}`, `tx_${hex(8, 'a')}`, `tx_${hex(8, 'b')}`].sort())
  const fp = r.items.find((i) => i.kind === 'fixture-package')
  assert.equal(fp.files, 2)
  assert.deepEqual(r.unmanaged, ['notes.txt'])
  assert.ok(!JSON.stringify(r).includes('"x"'), 'no contents')
  assert.equal(list(root, { kind: 'transcripts' }).total, 2)
})

test('archive/unarchive: bulk, idempotent, status and delete date', () => {
  const root = fixture()
  const now = Date.parse('2026-10-12T12:00:00Z')
  const a = archive(root, { ids: [`tx_${hex(8, 'a')}`, `fp_${hex(24, 'c')}`, 'tx_ffffffff', 'bogus'] }, now)
  assert.deepEqual(a.counts, { archived: 2, absent: 1, invalid_id: 1 })
  assert.equal(archive(root, { ids: [`tx_${hex(8, 'a')}`] }, now).counts.already_archived, 1)
  const arch = list(root, { status: 'archived' })
  assert.deepEqual(ids(arch), [`fp_${hex(24, 'c')}`, `tx_${hex(8, 'a')}`])
  assert.equal(arch.items[0].deletes_after, '2026-10-19T12:00:00.000Z')
  assert.equal(unarchive(root, { ids: [`tx_${hex(8, 'a')}`, `tx_${hex(8, 'b')}`] }).counts.unarchived, 1)
  assert.equal(list(root, { status: 'archived' }).total, 1)
})

test('select: kind/status/modified_before, refuses an empty selector', () => {
  const root = fixture()
  utimesSync(join(root, `tx_${hex(8, 'a')}.jsonl`), new Date('2026-01-01'), new Date('2026-01-01'))
  assert.equal(archive(root, { select: { kind: 'transcripts', modified_before: '2026-06-01' } }).counts.archived, 1)
  assert.throws(() => archive(root, { select: {} }), /at least one/)
  assert.throws(() => archive(root, {}), /ids|select/)
  assert.throws(() => archive(root, { ids: [], select: { kind: 'transcripts' } }), /not both/)
  assert.equal(archive(root, { select: { kind: 'source-page' }, dry_run: true }).counts.archived, 1)
  assert.equal(list(root, { kind: 'source-page', status: 'archived' }).total, 0, 'dry run changed nothing')
})

test('delete: immediate, whitelisted, idempotent, leaves approvals and unmanaged files', () => {
  const root = fixture()
  const fp = `fp_${hex(24, 'c')}`
  assert.equal(remove(root, { ids: [fp], dry_run: true }).counts.would_delete, 1)
  assert.ok(existsSync(join(root, 'fixture-packages', fp)))
  assert.equal(remove(root, { ids: [fp, `sp_${hex(24, 'd')}`] }).counts.deleted, 2)
  assert.ok(!existsSync(join(root, 'fixture-packages', fp)))
  assert.equal(remove(root, { ids: [fp] }).counts.absent, 1)
  assert.ok(existsSync(join(root, 'fixture-approvals', `${fp}.json`)), 'approvals untouched')
  assert.ok(existsSync(join(root, 'notes.txt')), 'unmanaged untouched')
  assert.equal(remove(root, { ids: ['../notes', 'fixture-approvals'] }).counts.invalid_id, 2)
})

test('delete refuses symlinks; listing skips them', () => {
  const root = fixture()
  const outside = mkdtempSync(join(tmpdir(), 'exports-outside-'))
  writeFileSync(join(outside, 'secret.jsonl'), 'keep')
  symlinkSync(join(outside, 'secret.jsonl'), join(root, `tx_${hex(8, 'e')}.jsonl`))
  assert.ok(!ids(list(root)).includes(`tx_${hex(8, 'e')}`))
  const r = remove(root, { ids: [`tx_${hex(8, 'e')}`] })
  assert.equal(r.counts.refused, 1)
  assert.equal(readFileSync(join(outside, 'secret.jsonl'), 'utf8'), 'keep')
})

test('prune: only archived exports older than the window; active ones never', () => {
  const root = fixture()
  const t0 = Date.parse('2026-10-01T00:00:00Z')
  archive(root, { ids: [`tx_${hex(8, 'a')}`] }, t0)
  archive(root, { ids: [`tx_${hex(8, 'b')}`] }, t0 + 5 * DAY)
  const r = prune(root, {}, t0 + 7 * DAY + 1)
  assert.deepEqual(r.counts, { deleted: 1 })
  assert.ok(!existsSync(join(root, `tx_${hex(8, 'a')}.jsonl`)))
  assert.ok(existsSync(join(root, `tx_${hex(8, 'b')}.jsonl`)))
  assert.ok(existsSync(join(root, 'fixture-packages', `fp_${hex(24, 'c')}`)), 'active package kept however old')
  assert.equal(prune(root, { dry_run: true }, t0 + 30 * DAY).counts.would_delete, 1)
})

test('state survives a corrupt state file (treated as nothing archived)', () => {
  const root = fixture()
  mkdirSync(join(root, '.state'), { recursive: true })
  writeFileSync(join(root, '.state', 'archive.json'), '{not json')
  assert.equal(list(root, { status: 'archived' }).total, 0)
  assert.equal(archive(root, { ids: [`tx_${hex(8, 'a')}`] }).counts.archived, 1)
})
