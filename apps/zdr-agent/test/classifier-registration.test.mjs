// The harness refuses to start when the classifier is not launched exactly as
// its PHI routing expects (bin/zdr-harness check_classifier_registration):
// directly, from {env:ZDR_HARNESS_CLASSIFIER_MCP}, no extra environment, and
// no other server (anchor, mcps/_shared/bin/run) reaching it.
// Run: node --test apps/zdr-agent/test/   (also run by mcps/bulk-classify's test command)
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = join(APP, 'bin', 'zdr-harness')
const REAL = join(APP, 'opencode', 'opencode.json')
const LAUNCH = join(APP, '..', '..', 'mcps', 'bulk-classify', 'src', 'launch')
const fn = readFileSync(SCRIPT, 'utf8').match(/^check_classifier_registration\(\) \{[\s\S]*?^\}/m)[0]
const scratch = mkdtempSync(join(tmpdir(), 'zdr-reg-'))

function check(config, launcher = LAUNCH) {
  const file = join(scratch, `cfg-${Math.random().toString(16).slice(2)}.json`)
  writeFileSync(file, JSON.stringify(config))
  const script = `set -euo pipefail\ndie() { printf 'REFUSED: %s\\n' "$*" >&2; exit 1; }\nCONFIG_FILE=${JSON.stringify(file)}\nCLASSIFIER_MCP=${JSON.stringify(launcher)}\n${fn}\ncheck_classifier_registration && echo OK`
  return spawnSync('/bin/bash', ['-c', script], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } })
}
const real = JSON.parse(readFileSync(REAL, 'utf8'))
const clone = () => JSON.parse(JSON.stringify(real))

test('the real opencode.json passes', () => {
  const r = check(real)
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /OK/)
})

test('refused: classifier through the shared fleet runner or anchor', () => {
  for (const command of [['/x/mcps/_shared/bin/run', 'bulk-classify'], ['/x/mcps/anchor/bin/anchor', 'bulk-classify'], ['/x/mcps/bulk-classify/src/launch']]) {
    const c = clone()
    c.mcp.classifier.command = command
    assert.equal(check(c).status, 1, JSON.stringify(command))
  }
})

test('refused: extra environment on the classifier entry', () => {
  const c = clone()
  c.mcp.classifier.environment = { HOME: '/tmp/x' }
  assert.equal(check(c).status, 1)
})

test('refused: another server that reaches the classifier', () => {
  for (const m of [{ type: 'local', command: ['/x/mcps/anchor/bin/anchor'] }, { type: 'local', command: ['/x/_shared/bin/run', 'bulk-classify'] }, { type: 'local', command: ['{env:ZDR_HARNESS_CLASSIFIER_MCP}'] }]) {
    const c = clone()
    c.mcp.shared = m
    assert.equal(check(c).status, 1, JSON.stringify(m))
  }
})

test('refused: a launcher other than mcps/bulk-classify/src/launch, or missing', () => {
  assert.equal(check(real, '/usr/bin/true').status, 1)
  assert.equal(check(real, '/nonexistent/mcps/bulk-classify/src/launch').status, 1)
})

test('preflight runs the check before anything else', () => {
  assert.match(readFileSync(SCRIPT, 'utf8'), /^preflight\(\) \{\n  check_classifier_registration\n/m)
  assert.match(readFileSync(SCRIPT, 'utf8'), /ZDR_HARNESS_CLASSIFIER_MCP="\$CLASSIFIER_MCP"/)
})
