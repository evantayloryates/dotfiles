// Release tool. Every release passes the release check first.
//   node anchor/release.mjs release <id> [--fix] [--hotfix]
//   node anchor/release.mjs promote <id> [--auto]
//   node anchor/release.mjs status  <id>
//
// release           working folder -> new nightly. Refused when the nightly
//                   is past its maximum age, unless --fix (only fixes until
//                   it is promoted).
// release --hotfix  working folder -> new stable at once (stable is broken
//                   and there is nothing to fall back to). A nightly older
//                   than the hotfix is cleared: it must be rebuilt on top.
// promote           nightly -> stable. --auto only when the gates pass:
//                   enough calls served, low failure rate, minimum age.
// Stable never moves backward: no command can set it to an older release.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { paths } from './paths.mjs'
import { checkService } from './release-check.mjs'
import { nextSlug, readChannels, resolve, writeChannels, INFRA_CODES } from './channels.mjs'
import { withLock } from './lock.mjs'

export const GATES = {
  minCalls: Number(process.env.ANCHOR_PROMOTE_MIN_CALLS || 20),
  maxFailRate: Number(process.env.ANCHOR_PROMOTE_MAX_FAIL_RATE || 0.05),
  minAgeMs: Number(process.env.ANCHOR_PROMOTE_MIN_AGE_MS || 0),
}
export const MAX_NIGHTLY_AGE_MS = Number(process.env.ANCHOR_MAX_NIGHTLY_AGE_MS || 72 * 3600_000)

export function nightlyStats(stateDir, id, slug) {
  let calls = 0
  let failures = 0
  const ledger = join(stateDir, 'ledger.jsonl')
  if (!existsSync(ledger)) return { calls, failures, failRate: 0 }
  for (const line of readFileSync(ledger, 'utf8').split('\n')) {
    if (!line.includes(slug)) continue
    let e
    try { e = JSON.parse(line) } catch { continue }
    for (const a of e.attempts || []) {
      if (a.service !== id || a.version !== slug) continue
      calls++
      if (!a.ok && (INFRA_CODES.has(a.code) || a.code === 'service_error')) failures++
    }
  }
  return { calls, failures, failRate: calls ? failures / calls : 0 }
}

export async function release(opts) {
  mkdirSync(join(opts.stateDir, 'channels'), { recursive: true })
  return withLock(join(opts.stateDir, 'channels', `${opts.id}.lock`), () => releaseLocked(opts))
}

async function releaseLocked({ servicesDir, stateDir, id, fix = false, hotfix = false, now = new Date() }) {
  const src = join(servicesDir, id)
  const res = resolve(servicesDir, stateDir, id, { maxNightlyAgeMs: MAX_NIGHTLY_AGE_MS, now: now.getTime() })
  if (res.overdue && !fix && !hotfix) {
    return { ok: false, refused: 'nightly_overdue', error: `${id} nightly ${res.ch.nightly} is past its maximum age; only fixes (--fix) until it is promoted` }
  }
  const report = await checkService(src, id)
  if (report.errors.length) return { ok: false, refused: 'release_check', errors: report.errors }
  const slug = nextSlug(servicesDir, id, now)
  const dest = join(src, 'dist', slug)
  // Stage, then rename into place: the router never sees a half-copied release.
  const staging = join(src, 'dist', `.staging-${slug}-${process.pid}`)
  try {
    mkdirSync(staging, { recursive: true })
    for (const entry of readdirSync(src)) {
      if (entry === 'dist' || entry === 'CRASH_ON_START') continue
      cpSync(join(src, entry), join(staging, entry), { recursive: true })
    }
    const manPath = join(staging, 'service.json')
    const man = JSON.parse(readFileSync(manPath, 'utf8'))
    man.version = slug
    writeFileSync(manPath, JSON.stringify(man, null, 2))
    writeFileSync(join(staging, 'release.json'), JSON.stringify({ slug, at: now.toISOString(), hotfix, fix, opHashes: report.opHashes }, null, 1))
    renameSync(staging, dest)
  } catch (err) {
    rmSync(staging, { recursive: true, force: true })
    return { ok: false, refused: 'copy_failed', error: err.message }
  }
  const ch = readChannels(stateDir, id)
  const at = now.toISOString()
  if (hotfix) {
    if (ch.stable && slug <= ch.stable) return { ok: false, refused: 'not_forward', error: `hotfix ${slug} is not newer than stable ${ch.stable}` }
    ch.history.push({ at, action: 'hotfix', slug, from: ch.stable })
    ch.stable = slug
    if (ch.nightly && ch.nightly < slug) {
      ch.history.push({ at, action: 'nightly_cleared', slug: ch.nightly, reason: `older than hotfix ${slug}; rebuild it on top of the hotfix` })
      ch.nightly = null
      ch.nightlySince = null
    }
  } else {
    ch.history.push({ at, action: fix ? 'nightly_fix' : 'nightly', slug, from: ch.nightly })
    ch.nightly = slug
    ch.nightlySince ||= at
  }
  writeChannels(stateDir, id, ch)
  return { ok: true, slug, channel: hotfix ? 'stable' : 'nightly', warnings: report.warnings }
}

export async function promote(opts) {
  mkdirSync(join(opts.stateDir, 'channels'), { recursive: true })
  return withLock(join(opts.stateDir, 'channels', `${opts.id}.lock`), () => promoteLocked(opts))
}

async function promoteLocked({ servicesDir, stateDir, id, auto = false, now = new Date() }) {
  const ch = readChannels(stateDir, id)
  if (!ch.nightly) return { ok: false, refused: 'no_nightly', error: `${id} has no nightly to promote` }
  if (ch.stable && ch.nightly <= ch.stable) return { ok: false, refused: 'not_forward', error: `nightly ${ch.nightly} is not newer than stable ${ch.stable}` }
  const stats = nightlyStats(stateDir, id, ch.nightly)
  const age = ch.nightlySince ? now - Date.parse(ch.nightlySince) : 0
  if (auto) {
    const why = []
    if (stats.calls < GATES.minCalls) why.push(`${stats.calls} calls served, needs ${GATES.minCalls}`)
    if (stats.failRate > GATES.maxFailRate) why.push(`failure rate ${(stats.failRate * 100).toFixed(1)}% exceeds ${GATES.maxFailRate * 100}%`)
    if (age < GATES.minAgeMs) why.push(`age ${age} ms below ${GATES.minAgeMs} ms`)
    if (why.length) return { ok: false, refused: 'gates', error: why.join('; '), stats }
  }
  const recheck = await checkService(join(servicesDir, id, 'dist', ch.nightly), id)
  if (recheck.errors.length) return { ok: false, refused: 'release_check', errors: recheck.errors }
  ch.history.push({ at: now.toISOString(), action: 'promote', slug: ch.nightly, from: ch.stable, stats })
  ch.stable = ch.nightly
  ch.nightly = null
  ch.nightlySince = null
  writeChannels(stateDir, id, ch)
  return { ok: true, stable: ch.stable, stats }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, id, ...flags] = process.argv.slice(2)
  const { servicesDir, stateDir } = paths()
  let out
  if (cmd === 'release') out = await release({ servicesDir, stateDir, id, fix: flags.includes('--fix'), hotfix: flags.includes('--hotfix') })
  else if (cmd === 'promote') out = await promote({ servicesDir, stateDir, id, auto: flags.includes('--auto') })
  else if (cmd === 'status') {
    const res = resolve(servicesDir, stateDir, id, { maxNightlyAgeMs: MAX_NIGHTLY_AGE_MS })
    out = { ok: true, ...res.ch, nightlyAgeMs: res.nightlyAgeMs, overdue: res.overdue, nightlyStats: res.ch.nightly ? nightlyStats(stateDir, id, res.ch.nightly) : null }
  } else out = { ok: false, error: 'usage: release.mjs release|promote|status <id> [--fix] [--hotfix] [--auto]' }
  process.stdout.write(JSON.stringify(out, null, 1) + '\n')
  process.exit(out.ok ? 0 : 1)
}
