// Per-operation idempotency, declared in service.json:
//   "natural": repeating it is harmless (reads, set-to-value). Anchor may
//              rerun it whenever the first outcome is unknown, key or not.
//   "keyed":   the service dedupes side effects on ctx.idempotencyKey. Anchor
//              reruns an interrupted call only when it carried a key.
//   "none":    it cannot be safely repeated. Anchor never reruns an
//              interrupted call; the caller must check and choose.
// Default when undeclared: "natural" for class "read" (the default class),
// "none" for anything that writes.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const IDEMPOTENCY = ['natural', 'keyed', 'none']
export const CLASSES = ['read', 'write', 'destructive']

const ANCHOR_NATURAL = /^anchor:(job\.(status|wait|result)|status)$/

export function idempotencyOf(decl) {
  if (!decl) return 'none'
  if (decl.idempotency) return decl.idempotency
  return (decl.class || 'read') === 'read' ? 'natural' : 'none'
}

// Can a call whose outcome is unknown be sent again?
export function mayRerun(policy, hasKey) {
  return policy === 'natural' || (policy === 'keyed' && hasKey)
}

export function policyForTarget(servicesDir, target) {
  if (ANCHOR_NATURAL.test(target)) return 'natural'
  const [id, op] = String(target || '').split(':')
  if (id === 'anchor') return 'none'
  const p = join(servicesDir, id, 'service.json')
  if (!existsSync(p)) return 'none'
  try {
    return idempotencyOf(JSON.parse(readFileSync(p, 'utf8')).operations?.[op])
  } catch {
    return 'none'
  }
}

// Structural check of a manifest; returns a list of problems.
export function manifestProblems(man) {
  const problems = []
  if (!man || typeof man !== 'object') return ['manifest is not an object']
  if (!man.description) problems.push('missing "description"')
  if (man.keywords !== undefined && (!Array.isArray(man.keywords) || !man.keywords.every((k) => typeof k === 'string'))) problems.push('"keywords" must be a list of words')
  if (man.sensitive !== undefined && typeof man.sensitive !== 'boolean') problems.push('"sensitive" must be true or false')
  if (!/^\d{4}-\d{2}-\d{2}\.\d{3}$/.test(man.version || '')) problems.push(`"version" must be a slug like 2026-10-19.001, got ${JSON.stringify(man.version)}`)
  if (!man.operations || typeof man.operations !== 'object' || !Object.keys(man.operations).length) {
    problems.push('declares no "operations"')
    return problems
  }
  for (const [name, d] of Object.entries(man.operations)) {
    if (!/^[a-z][a-z0-9_]*$/.test(name)) problems.push(`operation "${name}": name must be snake_case`)
    if (['guide', 'status'].includes(name)) problems.push(`operation "${name}": reserved for the standard operation`)
    if (!d?.description) problems.push(`operation "${name}": missing description`)
    if (d?.class && !CLASSES.includes(d.class)) problems.push(`operation "${name}": class must be one of ${CLASSES.join(', ')}`)
    if (d?.idempotency && !IDEMPOTENCY.includes(d.idempotency)) problems.push(`operation "${name}": idempotency must be one of ${IDEMPOTENCY.join(', ')}`)
    if (d?.idempotency === 'natural' && d?.class && d.class !== 'read') problems.push(`operation "${name}": a ${d.class} operation cannot be "natural"; declare "keyed" if it dedupes on the key, else "none"`)
    if (d?.notice !== undefined && (typeof d.notice !== 'string' || !d.notice.trim())) problems.push(`operation "${name}": notice must be non-empty text`)
    if (d?.inputSchema && (typeof d.inputSchema !== 'object' || d.inputSchema.type !== 'object')) problems.push(`operation "${name}": inputSchema must be an object schema`)
  }
  return problems
}
