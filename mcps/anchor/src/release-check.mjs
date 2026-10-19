// Release-time check for a service: run before a version is published, so a
// drifted or malformed service never ships.
//   node anchor/release-check.mjs <service-id>... | --all   [--json]
// Errors (exit 1): manifest problems, module fails to load, operations
// declared but not implemented, handlers implemented but not declared.
// Warnings: a "keyed" operation whose handler never reads ctx.idempotencyKey,
// a context generator that fails, is slow or returns too much, no GUIDE.md.

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { paths } from './paths.mjs'
import { manifestProblems, idempotencyOf } from './policy.mjs'
import { checkProfile } from './sandbox.mjs'

const HOST = fileURLToPath(new URL('./service-host.mjs', import.meta.url))

// ANCHOR_CHECK_SANDBOX=1 (set by fixers before releasing their own change):
// the probes that run the service's code run under a no-network sandbox.
// Sandboxed probes get a minimal environment and a private temp folder,
// removed afterwards.
const run = (args, timeout, dir) => new Promise((resolve) => {
  if (!(process.env.ANCHOR_CHECK_SANDBOX === '1' && dir)) {
    return execFile(process.execPath, args, { timeout, maxBuffer: 1 << 20 }, (err, stdout, stderr) => resolve({ err, stdout, stderr }))
  }
  const tmp = mkdtempSync(join(tmpdir(), 'anchor-check-'))
  const env = { HOME: process.env.HOME, PATH: '/usr/bin:/bin', TMPDIR: `${tmp}/` }
  execFile('/usr/bin/sandbox-exec', ['-p', checkProfile(dir, tmp), process.execPath, '--no-addons', ...args], { timeout, maxBuffer: 1 << 20, env }, (err, stdout, stderr) => {
    rmSync(tmp, { recursive: true, force: true })
    resolve({ err, stdout, stderr })
  })
})
const lastError = (stderr) => String(stderr).split('\n').map((l) => l.trim()).filter((l) => /Error/.test(l) && !/^Node\.js v/.test(l)).pop() || String(stderr).trim().split('\n').pop()

// Check one service folder (working copy or a release in dist/). Also
// returns each handler's source hash, which release channels use to tell
// which operations a release changed.
export async function checkService(dir, id = dir.split('/').pop()) {
  const errors = []
  const warnings = []
  let man
  try {
    man = JSON.parse(readFileSync(join(dir, 'service.json'), 'utf8'))
  } catch (err) {
    return { id, errors: [`service.json does not parse: ${err.message}`], warnings }
  }
  errors.push(...manifestProblems(man))
  const declared = Object.keys(man.operations || {})

  const inspect = await run([HOST, dir, '--inspect'], 5000, dir)
  let handlers = null
  let opHashes = {}
  if (inspect.err) errors.push(`module fails to load: ${inspect.err.killed ? 'timed out after 5 s' : lastError(inspect.stderr)}`)
  else {
    try { handlers = JSON.parse(inspect.stdout).handlers } catch { errors.push('module did not report its handlers') }
  }
  if (handlers) {
    const built = Object.keys(handlers).filter((n) => handlers[n] !== null)
    const missing = declared.filter((o) => !built.includes(o))
    const extra = built.filter((o) => !declared.includes(o))
    const noFn = Object.keys(handlers).filter((n) => handlers[n] === null)
    if (missing.length) errors.push(`declared but not implemented: ${missing.join(', ')}`)
    if (extra.length) errors.push(`implemented but not declared: ${extra.join(', ')}`)
    if (noFn.length) errors.push(`handler is not a function: ${noFn.join(', ')}`)
    opHashes = Object.fromEntries(built.map((n) => [n, createHash('sha256').update(handlers[n]).digest('hex').slice(0, 16)]))
    for (const op of declared) {
      if (idempotencyOf(man.operations[op]) === 'keyed' && handlers[op] && !/idempotencyKey/.test(handlers[op])) {
        warnings.push(`${op} is declared "keyed" but its handler never reads ctx.idempotencyKey`)
      }
    }
  }

  if (existsSync(join(dir, 'context.mjs'))) {
    const probe = `const m = await import(${JSON.stringify(pathToFileURL(join(dir, 'context.mjs')).href)}); const t0 = Date.now(); const t = await m.sessionContext?.({ clientInfo: { name: 'release-check' }, session: 'as_check' }); process.stdout.write(JSON.stringify({ type: typeof t, length: String(t ?? '').length, ms: Date.now() - t0 }))`
    const ctx = await run(['--input-type=module', '-e', probe], 3000, dir)
    if (ctx.err) warnings.push(`context.mjs fails: ${ctx.err.killed ? 'timed out' : lastError(ctx.stderr)}`)
    else {
      const c = JSON.parse(ctx.stdout || '{}')
      if (c.type !== 'string') warnings.push(`context.mjs sessionContext returned ${c.type}, not a string`)
      if (c.length > 600) warnings.push(`context.mjs output is ${c.length} chars; only 600 are used`)
      if (c.ms > 150) warnings.push(`context.mjs took ${c.ms} ms; the budget is 300 ms for every service together`)
    }
  }
  if (!existsSync(join(dir, 'GUIDE.md'))) warnings.push('no GUIDE.md; the guide operation will say so')
  return { id, version: man.version, errors, warnings, opHashes }
}

// CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
const P = paths()
const argv = process.argv.slice(2)
const asJson = argv.includes('--json')
// --dir <path>: check a service folder anywhere (a fixer's workspace).
const dirArg = argv.includes('--dir') ? argv[argv.indexOf('--dir') + 1] : null
const ids = dirArg ? [] : argv.includes('--all') ? readdirSync(P.servicesDir).filter((d) => existsSync(join(P.servicesDir, d, 'service.json'))) : argv.filter((a) => !a.startsWith('--'))
const reports = dirArg ? [await checkService(dirArg)] : await Promise.all(ids.map((id) => checkService(join(P.servicesDir, id), id)))
if (asJson) process.stdout.write(JSON.stringify(reports, null, 1) + '\n')
else {
  for (const r of reports) {
    console.log(`${r.errors.length ? 'FAIL' : 'PASS'}  ${r.id} ${r.version || ''}`)
    for (const e of r.errors) console.log(`   error    ${e}`)
    for (const w of r.warnings) console.log(`   warning  ${w}`)
  }
}
process.exit(reports.some((r) => r.errors.length) ? 1 : 0)
}
