// Mutation pass over the PHI routing: turns off one signal (or one guard) at a
// time in a scratch copy of the repo parts the tests use, runs the offline
// suite, and requires at least one failing test per mutant. Prints one line
// per mutant and exits 1 if any survives. Run: node test/mutants.mjs
// (about 15 s per mutant). Never copies secrets files.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'))
const parts = ['mcps/bulk-classify/src', 'mcps/bulk-classify/test', 'mcps/bulk-classify/mcp.json', 'mcps/_shared/bin', 'src/lib', 'apps/zdr-agent/bin', 'apps/zdr-agent/opencode', 'apps/zdr-agent/test', 'apps/zdr-agent/mcps/kickoff-db/index.mjs', 'apps/zdr-agent/mcps/kickoff-db/terra-payloads.mjs', 'apps/zdr-agent/mcps/kickoff-db/zdr-tag.mjs']

// [name, file, from, to]; `from` must occur in the file.
const mutants = [
  ['scope signal off', 'mcps/bulk-classify/src/lib/route.mjs', 'export function scopeSignal(env = process.env) {\n  const out = []', 'export function scopeSignal(env = process.env) {\n  return []\n  const out = []'],
  ['env signal off', 'mcps/bulk-classify/src/lib/route.mjs', 'export function envSignal(env = process.env) {\n  const out = []', 'export function envSignal(env = process.env) {\n  return []\n  const out = []'],
  ['env launcher report ignored', 'mcps/bulk-classify/src/lib/route.mjs', "for (const name of (env.CLASSIFIER_ENV_SIGNALS || '')", "for (const name of (''"],
  ['explicit signal off', 'mcps/bulk-classify/src/lib/route.mjs', 'export function explicitSignal({ args = {}, env = process.env, job = null } = {}) {\n  const out = []', 'export function explicitSignal({ args = {}, env = process.env, job = null } = {}) {\n  return []\n  const out = []'],
  ['path signal off', 'mcps/bulk-classify/src/lib/route.mjs', 'export function pathSignal(paths = [], env = process.env) {\n  const out = []', 'export function pathSignal(paths = [], env = process.env) {\n  return []\n  const out = []'],
  ['lexical path resolution', 'mcps/bulk-classify/src/lib/route.mjs', 'const realish = physicalPath', 'const realish = (p) => resolve(p)'],
  ['mark (xattr) signal off', 'mcps/bulk-classify/src/lib/route.mjs', "export function taggedSignal(paths = [], { run = spawnSync } = {}) {\n  const out = []", "export function taggedSignal(paths = [], { run = spawnSync } = {}) {\n  return []\n  const out = []"],
  ['process signal off', 'mcps/bulk-classify/src/lib/route.mjs', "  if (!table.has(pid)) return", "  return []\n  if (!table.has(pid)) return"],
  ['record signal off', 'mcps/bulk-classify/src/lib/route.mjs', 'export function recordSignal({ job = null, profile = null, stamps = stampedScopes } = {}) {\n  const out = []', 'export function recordSignal({ job = null, profile = null, stamps = stampedScopes } = {}) {\n  return []\n  const out = []'],
  ['profile stamps ignored', 'mcps/bulk-classify/src/lib/scopes.mjs', "  if (!NAME.test(String(name || ''))) return ['unknown']\n  const file", "  return []\n  const file"],
  ['zdr use does not stamp', 'mcps/bulk-classify/src/lib/profiles.mjs', "  if (!save && !UPGRADE_ON_USE) return", "  if (!save) return"],
  ['Codex pre-spawn check off', 'mcps/bulk-classify/src/lib/codex.mjs', '  assertNoPhi(phiContext) // throws PhiRefusal: never spawn for PHI work', '  // removed'],
  ['launcher env scan off', 'mcps/bulk-classify/src/launch', 'unset _cls_name _cls_value\n', 'unset _cls_name _cls_value\nENV_SIGNALS=""\n'],
  ['launcher HOME not resolved', 'mcps/bulk-classify/src/launch', 'HOME_REAL="${HOME_REAL:-$HOME}"', 'HOME_REAL="$HOME"'],
  ['launcher path-value resolution off', 'mcps/bulk-classify/src/launch', '"$(_cls_real "$_cls_value")" == *"/.zdr-harness"*', 'false'],
  ['harness registration check off', 'apps/zdr-agent/bin/zdr-harness', 'check_classifier_registration() {\n', 'check_classifier_registration() {\n  return 0\n'],
  ['global config not checked', 'apps/zdr-agent/bin/zdr-harness', 'if [[ -d "$GLOBAL_CONFIG_DIR" ]]; then', 'if false; then'],
  ['Codex process watch off', 'mcps/bulk-classify/src/lib/codex-lockdown.mjs', "  const bad = []\n  for (const [p, , comm] of rows) {", "  const bad = []\n  return bad\n  for (const [p, , comm] of rows) {"],
  ['shell snapshot left on', 'mcps/bulk-classify/src/lib/codex.mjs', "const DISABLED_FEATURES = ['shell_snapshot', ", "const DISABLED_FEATURES = ["],
  ['credit reader skips the MCP check', 'mcps/bulk-classify/src/lib/credits.mjs', "if (!m.result || all.some((v) => v?.enabled !== false)) return finish(null)", "if (false) return finish(null)"],
  ['echo second opinion off', 'mcps/bulk-classify/src/lib/classify.mjs', '        if (options.recheck !== false && echoesLabel(u.text, primary)) return recheck.push(batch[j])', '        // removed'],
  ['ZDR-only profile text shown everywhere', 'mcps/bulk-classify/src/lib/profiles.mjs', "  if (SCOPE !== 'zdr' && zdrOnly(p)) {", '  if (false) {'],
  ['route lever ignored', 'mcps/bulk-classify/src/lib/route.mjs', '  if (lever) return api(', '  if (false) return api('],
]

function copyTree() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'classifier-mutant-')))
  for (const p of parts) cpSync(join(REPO, p), join(dir, p), { recursive: true, filter: (src) => !/(^|\/)\.env$/.test(src) && !src.includes('node_modules') })
  return dir
}
function suite(dir) {
  return spawnSync('/bin/sh', ['-c', `"${process.execPath}" --test test/*.test.mjs`], { cwd: join(dir, 'mcps', 'bulk-classify'), encoding: 'utf8', timeout: 300_000, env: { HOME: process.env.HOME, PATH: '/usr/bin:/bin', TMPDIR: tmpdir(), LANG: 'en_US.UTF-8' } })
}
const failing = (r) => Number((r.stdout.match(/ℹ fail (\d+)/) || [])[1] ?? NaN)

const base = copyTree()
const b = suite(base)
rmSync(base, { recursive: true, force: true })
console.log(`baseline: ${b.status === 0 ? 'green' : `RED (${failing(b)} failing)`}`)
if (b.status !== 0) process.exit(2)
let survived = 0
for (const [name, file, from, to] of mutants) {
  const dir = copyTree()
  const f = join(dir, file)
  const src = readFileSync(f, 'utf8')
  if (!src.includes(from)) {
    console.log(`MUTANT NOT APPLIED  ${name} (pattern missing)`)
    survived++
    rmSync(dir, { recursive: true, force: true })
    continue
  }
  writeFileSync(f, src.replace(from, to))
  const r = suite(dir)
  const n = failing(r)
  const killed = r.status !== 0
  if (!killed) survived++
  console.log(`${killed ? 'killed  ' : 'SURVIVED'} ${name}${killed ? ` (${n} failing)` : ''}`)
  rmSync(dir, { recursive: true, force: true })
}
console.log(`${mutants.length - survived} of ${mutants.length} mutants killed`)
process.exit(survived ? 1 : 0)
