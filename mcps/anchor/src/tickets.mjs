// Ticket book: every failure signal becomes an occurrence of a ticket, and
// similar occurrences cluster into one ticket so the fleet fixes problems,
// not individual events. Single writer (the core); journal-backed.
//
// Kinds and lanes:
//   hotfix      stable failing with nothing to fall back to   lane "hotfix"
//   crash       a service crashed, backed off or was quarantined
//   drift       manifest and handlers disagree
//   overdue     a nightly passed its maximum age
//   report      filed by an agent (anchor:ticket.report)
//   root_cause  follow-up opened when a hotfix lands
// Everything except hotfix goes to lane "standard".
//
// States: open -> dispatched -> fixed (in a release) -> verified
//         dispatched -> open (attempt failed) -> ... -> escalated
//         fixed/verified -> reopened (same failure on a release >= the fix)

import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { Journal } from './store.mjs'

// Kinds whose fingerprint names exactly one thing (a nightly and an
// operation): they never cluster by similarity.
const EXACT = new Set(['fallback'])
const SEVERITY = { hotfix: 10, crash: 3, drift: 2, report: 2, root_cause: 1, overdue: 1 }
const ACTIVE = new Set(['open', 'dispatched', 'reopened', 'escalated'])
const tokens = (s) => new Set(String(s || '').toLowerCase().split(/[^a-z#]+/).filter((t) => t.length > 2))
const similar = (a, b) => {
  const A = tokens(a)
  const B = tokens(b)
  if (!A.size || !B.size) return false
  const inter = [...A].filter((t) => B.has(t)).length
  return inter / (A.size + B.size - inter) >= 0.75
}

export class TicketBook {
  constructor(stateDir, { onChange = () => {}, now = () => Date.now() } = {}) {
    mkdirSync(stateDir, { recursive: true })
    this.log = new Journal(join(stateDir, 'tickets.jsonl'))
    this.onChange = onChange
    this.now = now
    this.tickets = new Map()
    this.seq = 0
    for (const r of this.log.replay()) this.#apply(r)
  }

  #apply(r) {
    if (r.t === 'open') {
      this.tickets.set(r.id, { id: r.id, kind: r.kind, lane: r.lane, service: r.service, op: r.op, fingerprint: r.fingerprint, title: r.title, state: 'open', openedAt: r.at, occurrences: [], sessions: new Set(), attempts: 0, history: [], links: r.links || [] })
      this.seq = Math.max(this.seq, Number(r.id.slice(2)))
    }
    const t = this.tickets.get(r.id)
    if (!t) return
    if (r.t === 'hit') {
      t.occurrences.push({ at: r.at, version: r.version, session: r.session, detail: r.detail })
      if (t.occurrences.length > 50) t.occurrences.shift()
      t.count = (t.count || 0) + 1
      if (r.session) t.sessions.add(r.session)
      t.lastAt = r.at
    }
    if (r.t === 'state') {
      Object.assign(t, { state: r.state, ...(r.fixedIn ? { fixedIn: r.fixedIn } : {}), ...(r.attempts != null ? { attempts: r.attempts } : {}) })
      t.history.push({ at: r.at, state: r.state, note: r.note })
    }
  }

  #write(r) {
    r.at ||= new Date(this.now()).toISOString()
    this.log.append(r)
    this.#apply(r)
    return this.tickets.get(r.id)
  }

  priority(t) {
    const ageH = (this.now() - Date.parse(t.openedAt)) / 3600_000
    const regression = t.history.some((h) => h.state === 'reopened') ? 2 : 1
    return Math.round((SEVERITY[t.kind] || 1) * Math.log2(1 + (t.count || 1)) * Math.max(1, t.sessions.size) * regression * 10 + Math.min(ageH, 72)) / 10
  }

  // One signal. Joins an active ticket of the same kind and service whose
  // fingerprint matches or is similar; else opens a new one. A failure on a
  // release at or after a ticket's fix reopens it as a regression.
  record({ kind, service, op, fingerprint, title, detail, session, version, links }) {
    const lane = kind === 'hotfix' ? 'hotfix' : 'standard'
    const key = fingerprint || title
    // A crash of a service with an active hotfix ticket is more of the same.
    let t = kind === 'crash' ? [...this.tickets.values()].find((x) => x.kind === 'hotfix' && x.service === service && ACTIVE.has(x.state) && (x.fingerprint === key || similar(x.fingerprint, key))) : null
    t ||= [...this.tickets.values()].find((x) => x.kind === kind && x.service === service && ACTIVE.has(x.state) && (x.fingerprint === key || (!EXACT.has(kind) && similar(x.fingerprint, key))))
    if (!t) {
      const resolved = [...this.tickets.values()].find((x) => x.kind === kind && x.service === service && ['fixed', 'verified'].includes(x.state) && (x.fingerprint === key || (!EXACT.has(kind) && similar(x.fingerprint, key))))
      if (resolved && version && resolved.fixedIn && version >= resolved.fixedIn) {
        t = this.#write({ t: 'state', id: resolved.id, state: 'reopened', note: `same failure on ${version}, at or after the fix in ${resolved.fixedIn}` })
        this.onChange({ type: 'reopened', ticket: t })
      }
    }
    let opened = false
    if (!t) {
      t = this.#write({ t: 'open', id: `T-${++this.seq}`, kind, lane, service, op, fingerprint: key, title: title || `${service}: ${key}`, links })
      opened = true
    }
    this.#write({ t: 'hit', id: t.id, session, version, detail: detail ? String(detail).slice(-600) : undefined })
    if (opened && kind === 'hotfix') {
      // The crashes that led here are the same problem: fold them in.
      for (const c of [...this.tickets.values()]) {
        if (c.kind !== 'crash' || c.service !== service || !ACTIVE.has(c.state) || !(c.fingerprint === key || similar(c.fingerprint, key))) continue
        for (const h of c.sessions) this.#write({ t: 'hit', id: t.id, session: h, version, detail: `merged from ${c.id}` })
        this.#write({ t: 'state', id: c.id, state: 'merged', note: `merged into ${t.id}` })
      }
    }
    if (opened) this.onChange({ type: 'opened', ticket: t })
    return t
  }

  setState(id, state, extra = {}) {
    const t = this.#write({ t: 'state', id, state, ...extra })
    this.onChange({ type: state, ticket: t })
    return t
  }

  // A successful call on a release that includes a fix verifies it.
  verify(service, op, version) {
    const out = []
    for (const t of this.tickets.values()) {
      if (t.state !== 'fixed' || t.service !== service || !t.fixedIn || version < t.fixedIn) continue
      if (t.op && op && t.op !== op) continue
      out.push(this.setState(t.id, 'verified', { note: `${service}:${op} succeeded on ${version}` }))
    }
    return out
  }

  get(id) {
    return this.tickets.get(id)
  }

  list({ session, service, state, lane, active } = {}) {
    return [...this.tickets.values()]
      .filter((t) => (state === 'merged' || t.state !== 'merged') && (!session || t.sessions.has(session)) && (!service || t.service === service) && (!state || t.state === state) && (!lane || t.lane === lane) && (!active || ACTIVE.has(t.state)))
      .map((t) => ({ ...t, priority: this.priority(t) }))
      .sort((a, b) => b.priority - a.priority)
  }

  view(t) {
    if (!t) return null
    const { sessions, occurrences, ...rest } = t
    return { ...rest, priority: this.priority(t), sessions: sessions.size, lastOccurrence: occurrences.at(-1) }
  }
}
