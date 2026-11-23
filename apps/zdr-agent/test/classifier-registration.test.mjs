// The harness refuses to start when the classifier is not launched exactly as
// its PHI routing expects (bin/zdr-harness check_classifier_registration):
// directly, from {env:ZDR_HARNESS_CLASSIFIER_MCP}, no extra environment, and
// no other server (anchor, mcps/_shared/bin/run) reaching it.
// Run: node --test apps/zdr-agent/test/   (also run by mcps/bulk-classify's test command)
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
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

const emptyGlobal = join(scratch, 'global-empty')
mkdirSync(emptyGlobal)
writeFileSync(join(emptyGlobal, '.gitignore'), '*\n')
function check(config, launcher = LAUNCH, globalDir = emptyGlobal) {
  const file = join(scratch, `cfg-${Math.random().toString(16).slice(2)}.json`)
  writeFileSync(file, JSON.stringify(config))
  const script = `set -euo pipefail\ndie() { printf 'REFUSED: %s\\n' "$*" >&2; exit 1; }\nCONFIG_FILE=${JSON.stringify(file)}\nCLASSIFIER_MCP=${JSON.stringify(launcher)}\nGLOBAL_CONFIG_DIR=${JSON.stringify(globalDir)}\n${fn}\ncheck_classifier_registration && echo OK`
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

test('refused: anything but .gitignore in the global config dir (merged by OpenCode)', () => {
  const cases = [
    ['opencode.json', JSON.stringify({ mcp: { shared: { type: 'local', command: ['/x/mcps/anchor/bin/anchor'] } } })],
    ['opencode.jsonc', '{}'],
    ['config.json', '{}'],
    ['.hidden.json', '{}'],
  ]
  for (const [name, body] of cases) {
    const d = join(scratch, `global-${name}`)
    mkdirSync(d)
    writeFileSync(join(d, '.gitignore'), '*\n')
    writeFileSync(join(d, name), body)
    const r = check(real, LAUNCH, d)
    assert.equal(r.status, 1, name)
    assert.match(r.stderr, /refusing/)
  }
  const sub = join(scratch, 'global-plugin')
  mkdirSync(join(sub, 'plugin'), { recursive: true })
  assert.equal(check(real, LAUNCH, sub).status, 1, 'a plugin directory')
  const lnk = join(scratch, 'global-link')
  mkdirSync(lnk)
  symlinkSync('/etc/hosts', join(lnk, '.gitignore'))
  assert.equal(check(real, LAUNCH, lnk).status, 1, 'a symlinked .gitignore')
  assert.equal(check(real, LAUNCH, join(scratch, 'no-such-dir')).status, 0, 'a missing dir is fine')
})

test('preflight runs the check before anything else', () => {
  assert.match(readFileSync(SCRIPT, 'utf8'), /^preflight\(\) \{\n  check_classifier_registration\n/m)
  assert.match(readFileSync(SCRIPT, 'utf8'), /ZDR_HARNESS_CLASSIFIER_MCP="\$CLASSIFIER_MCP"/)
})
