// Release channels per service.
//
// Releases are immutable copies in services/<id>/dist/<slug>/ (slug
// YYYY-MM-DD.NNN) with a release.json recording each operation's handler
// hash. Channel pointers live in state/channels/<id>.json:
//   stable   only moves forward: by promotion of nightly, or by a hotfix.
//   nightly  the newest release still in observation; may be cleared, never
//            rolled back to an older release.
// A service with no releases is served from its working folder (dev mode).

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { idempotencyOf } from './policy.mjs'

export const SLUG = /^\d{4}-\d{2}-\d{2}\.\d{3}$/
export const INFRA_CODES = new Set(['crashed', 'start_failed', 'start_timeout', 'quarantined', 'backoff', 'op_quarantined', 'timeout', 'unavailable', 'not_implemented'])
// Failures that happen before the operation could have run.
export const PRE_EXEC_CODES = new Set(['start_failed', 'start_timeout', 'quarantined', 'backoff', 'op_quarantined', 'unavailable', 'not_implemented'])

const readJson = (p, fb) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return fb } }

export function channelsPath(stateDir, id) {
  return join(stateDir, 'channels', `${id}.json`)
}

export function readChannels(stateDir, id) {
  return readJson(channelsPath(stateDir, id), { stable: null, nightly: null, nightlySince: null, history: [] })
}

export function writeChannels(stateDir, id, ch) {
  mkdirSync(join(stateDir, 'channels'), { recursive: true })
  const p = channelsPath(stateDir, id)
  const tmp = `${p}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(ch, null, 1))
  renameSync(tmp, p)
}

export function releases(servicesDir, id) {
  const d = join(servicesDir, id, 'dist')
  return existsSync(d) ? readdirSync(d).filter((s) => SLUG.test(s)).sort() : []
}

export function releaseInfo(servicesDir, id, slug) {
  if (!slug) return null
  const dir = join(servicesDir, id, 'dist', slug)
  const man = readJson(join(dir, 'service.json'), null)
  if (!man) return null
  return { slug, dir, man, ...readJson(join(dir, 'release.json'), {}) }
}

export function nextSlug(servicesDir, id, now = new Date()) {
  const day = now.toISOString().slice(0, 10)
  const used = releases(servicesDir, id).filter((s) => s.startsWith(day)).map((s) => Number(s.slice(11)))
  const n = (used.length ? Math.max(...used) : 0) + 1
  if (n > 999) throw new Error(`${id}: more than 999 releases on ${day}`)
  return `${day}.${String(n).padStart(3, '0')}`
}

export function resolve(servicesDir, stateDir, id, { maxNightlyAgeMs, now = Date.now() } = {}) {
  const ch = readChannels(stateDir, id)
  const stable = releaseInfo(servicesDir, id, ch.stable)
  const nightly = releaseInfo(servicesDir, id, ch.nightly)
  const age = ch.nightlySince ? now - Date.parse(ch.nightlySince) : 0
  return { released: !!(stable || nightly), ch, stable, nightly, nightlyAgeMs: age, overdue: !!nightly && maxNightlyAgeMs != null && age > maxNightlyAgeMs }
}

// Ordered candidates for one call. Each says when the next may be tried:
// "infra" (any infrastructure failure: safe because the operation is natural)
// or "pre_exec" (only failures before the operation ran).
export function route(res, op, { explicit, nightlyDown = false } = {}) {
  const c = (rel, channel, fallbackOn) => ({ channel, slug: rel.slug, dir: rel.dir, man: rel.man, decl: rel.man.operations?.[op], fallbackOn })
  const { stable, nightly } = res
  if (explicit) {
    const rel = explicit === 'stable' ? stable : explicit === 'nightly' ? nightly : [stable, nightly].find((r) => r?.slug === explicit)
    return rel ? [c(rel, rel === stable ? 'stable' : 'nightly', null)] : []
  }
  if (!stable) return nightly ? [c(nightly, 'nightly', null)] : []
  if (!nightly || nightlyDown) return [c(stable, 'stable', null)]
  const sDecl = stable.man.operations?.[op]
  const nDecl = nightly.man.operations?.[op]
  if (!sDecl && nDecl) return [c(nightly, 'nightly', null)] // new in nightly
  if (sDecl && !nDecl) return [c(stable, 'stable', null)] // removed in nightly
  const policy = idempotencyOf(nDecl)
  if (policy === 'natural') return [c(nightly, 'nightly', 'infra'), c(stable, 'stable', null)]
  // Actions run on nightly only where nightly did not change them.
  const unchanged = stable.opHashes?.[op] && stable.opHashes[op] === nightly.opHashes?.[op] && JSON.stringify(sDecl) === JSON.stringify(nDecl)
  return unchanged ? [c(nightly, 'nightly', 'pre_exec'), c(stable, 'stable', null)] : [c(stable, 'stable', null)]
}
