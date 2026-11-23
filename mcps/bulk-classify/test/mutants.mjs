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
  ['Codex process watch off', 'mcps/bulk-classify/src/lib/codex-lockdown.mjs', "  const bad = []\n  for (const r of rows) {", "  const bad = []\n  return bad\n  for (const r of rows) {"],
  ['allow list by basename', 'mcps/bulk-classify/src/lib/codex-lockdown.mjs', "    if (allow.has(path)) continue", "    if (allow.has(path) || /(^|\\/)(git|git-remote-https?|codex)$/.test(path)) continue"],
  ['orphans (process group) not watched', 'mcps/bulk-classify/src/lib/codex-lockdown.mjs', "(tree.has(r.ppid) || r.pgid === pid)", "tree.has(r.ppid)"],
  ['watch only at fixed moments', 'mcps/bulk-classify/src/lib/codex-lockdown.mjs', "  const timer = setInterval(() => check(), intervalMs)", "  const timer = setTimeout(() => check(), 1500)"],
  ['no final check at exit', 'mcps/bulk-classify/src/lib/codex.mjs', "        if (watch && watch.check(true).length) {", "        if (false) {"],
  ['shell snapshot left on', 'mcps/bulk-classify/src/lib/codex.mjs', "const DISABLED_FEATURES = ['shell_snapshot', ", "const DISABLED_FEATURES = ["],
  ['credit reader skips the MCP check', 'mcps/bulk-classify/src/lib/credits.mjs', "if (!m.result || !named || anyOn || (!shaped && mcp.names.length)) return finish(null)", "if (false) return finish(null)"],
  ['credit reader gate vacuous (old shape)', 'mcps/bulk-classify/src/lib/credits.mjs', "if (!m.result || !named || anyOn || (!shaped && mcp.names.length)) return finish(null)", "if (!m.result || anyOn) return finish(null)"],
  ['detached groups not signalled on exit', 'mcps/bulk-classify/src/lib/codex-lockdown.mjs', "          process.kill(-g, 'SIGTERM')", "          void g"],
  ['echo second opinion off', 'mcps/bulk-classify/src/lib/classify.mjs', '        if (options.recheck !== false && echoesLabel(u.text, primary)) return recheck.push(batch[j])', '        // removed'],
  ['ZDR-only profile text shown everywhere', 'mcps/bulk-classify/src/lib/profiles.mjs', "  if (SCOPE !== 'zdr' && zdrOnly(p)) {", '  if (false) {'],
  ['app-server pre-turn check off', 'mcps/bulk-classify/src/lib/codex-app.mjs', '  assertNoPhi(phiContext) // throws PhiRefusal: never send PHI work to the subscription', '  // removed'],
  ['app-server post-acquire check off', 'mcps/bulk-classify/src/lib/codex-app.mjs', '    assertNoPhi(phiContext) // again: acquiring may have taken a server start', '    // removed'],
  ['subscription engine entry check off', 'mcps/bulk-classify/src/lib/codex-app.mjs', "export async function subscriptionCall(opts, { app = codexAppCall, exec = codexCall, status = subscriptionStatus, brk = breaker } = {}) {\n  assertNoPhi(opts.phiContext || {})", "export async function subscriptionCall(opts, { app = codexAppCall, exec = codexCall, status = subscriptionStatus, brk = breaker } = {}) {"],
  ['app health check skips the account', 'mcps/bulk-classify/src/lib/codex-app.mjs', "    if (type === 'apiKey') return", "    if (false) return"],
  ['app health check ignores MCP servers', 'mcps/bulk-classify/src/lib/codex-app.mjs', "    if (names.some((n) => mcp[n]?.enabled !== false)) return", "    if (false) return"],
  ['route lever ignored', 'mcps/bulk-classify/src/lib/route.mjs', '  if (lever) return api(', '  if (false) return api('],
  // Release 2 integration (PE diff r1 point 6)
  ['app-server process watch off', 'mcps/bulk-classify/src/lib/codex-app.mjs', '    child.watch = child.pid\n      ? watchTree(', '    child.watch = false\n      ? watchTree('],
  ['app-server last fresh look off', 'mcps/bulk-classify/src/lib/codex-app.mjs', '        if (this.unsafe || this.child?.watch?.check(true).length) {', '        if (this.unsafe) {'],
  ['unsafe falls back to exec', 'mcps/bulk-classify/src/lib/codex-app.mjs', "    if (kind === 'unsafe') throw appError(", "    if (false) throw appError("],
  ['app-server shell snapshot left on', 'mcps/bulk-classify/src/lib/codex-app.mjs', "export const APP_DISABLED = ['shell_snapshot', ", "export const APP_DISABLED = ["],
  ['ladder route check in classifyItems off', 'mcps/bulk-classify/src/lib/classify.mjs', "  if (ladder) assertLadder(ladder, route || { route: engine === 'codex' ? 'subscription' : 'api' })", '  // removed'],
  ['no run-wide Codex stop', 'mcps/bulk-classify/src/lib/codex.mjs', '    this.shared = opts.shared || { broken: null }', '    this.shared = { broken: null }'],
  ['strong-tier fatal not recorded', 'mcps/bulk-classify/src/lib/classify.mjs', "      if (err?.code === 'phi_refused' || FATAL_KINDS.has(err?.kind)) noteFallback(err, 0)", '      // removed'],
  ['MCP names only from the server', 'mcps/bulk-classify/src/lib/codex-app.mjs', '    const missing = ours.filter((n) => !(n in mcp))', '    const missing = []'],
  ['MCP names not disabled on the first spawn', 'mcps/bulk-classify/src/lib/codex-app.mjs', '      let names = [...new Set([...ours.names, ...(knownMcp || [])])]\n      for (let attempt', '      let names = knownMcp || []\n      for (let attempt'],
  ['missing mcp_servers accepted', 'mcps/bulk-classify/src/lib/codex-app.mjs', "    if ((raw === undefined || raw === null) && ours.length) return", "    if (false) return"],
  ['odd config.toml accepted', 'mcps/bulk-classify/src/lib/codex-app.mjs', '      if (ours.odd) throw appError(', '      if (false) throw appError('],
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
