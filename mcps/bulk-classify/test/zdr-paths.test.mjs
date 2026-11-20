import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Inside the harness: paths.mjs and input.mjs read the scope when first imported.
const home = realpathSync(mkdtempSync(join(tmpdir(), 'classifier-zdr-')))
process.env.CLASSIFIER_SCOPE = 'zdr'
process.env.CLASSIFIER_REAL_HOME = home
const { checkDataPath } = await import('../src/lib/input.mjs')

const file = (rel) => {
  const p = join(home, rel)
  mkdirSync(join(p, '..'), { recursive: true })
  writeFileSync(p, '{"id":1,"text":"x"}\n')
  return p
}

test('harness exports are readable: query, transcript and source-page files', () => {
  for (const rel of ['.zdr-harness/exports/qx_0123abcd.jsonl', '.zdr-harness/exports/tx_0123abcd.jsonl', '.zdr-harness/exports/fixture-source-pages/sp_0123456789abcdef01234567.json']) {
    const p = file(rel)
    assert.doesNotThrow(() => checkDataPath(p, p), rel)
  }
})

test('anything else in the harness is refused, with the supported route named', () => {
  for (const rel of ['.zdr-harness/xdg/data/opencode/tool-output/tool_1cec8831b0013', '.zdr-harness/work/bootstrap_test.jsonl', '.zdr-harness/.env.jsonl', '.zdr-harness/exports/notes.csv']) {
    const p = file(rel)
    assert.throws(() => checkDataPath(p, p), /query_export|hidden|must be/, rel)
  }
})

test('exports are never writable as output', () => {
  const p = join(home, '.zdr-harness/exports/results.jsonl')
  assert.throws(() => checkDataPath(p, p, { write: true }), /hidden/)
})
