// Signals: anchor's one event stream and the current state it implies, so any
// client (a digest, the dashboard, a chat) asks "what changed since my cursor,
// and where does everything stand now" and does no backend work of its own.
//
// events.jsonl, schema v1, one event per line:
//   { v: 1, seq, at, kind, service?, op?, version?, session?, code?, ms?, ...facts }
// kind: call, error, fallback, crash, start, backoff, quarantined,
//   op_quarantined, recycled, drift, release, nightly_overdue, hotfix_needed,
//   pin_move, ticket_opened, ticket_<state>, discover, discovery_miss,
//   session_start, daemon_start, upgrade.
// Counts, codes, versions and ids only: never arguments, results, error text
// or ticket titles (those can carry a service's output). Sessions are hashed.
// The stream rotates at 5 MB, keeping three old files; `since` reads across
// them. The snapshot (per service: state, releases, call and error counts,
// last error, crashes, active tickets) is rebuilt from the stream on start.

import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const SCHEMA = 1
const ROTATE_BYTES = Number(process.env.ANCHOR_SIGNALS_ROTATE_BYTES || 5 * 1024 * 1024)
const KEEP_OLD = 3
const SAFE = ['service', 'op', 'version', 'code', 'ms', 'ticket', 'ticketKind', 'lane', 'state', 'channel', 'from', 'to', 'settledBy', 'matches', 'build', 'previous', 'attempts', 'client']
const hashSession = (h) => (h ? createHash('sha256').update(String(h)).digest('hex').slice(0, 10) : undefined)

export class Signals {
  constructor(stateDir) {
    this.dir = stateDir
    this.file = join(stateDir, 'events.jsonl')
    this.services = {}
    this.seq = 0
    for (const e of this.#read(0)) this.#apply(e)
  }

  // Older rotated files first, then the live one.
  #files() {
    const old = existsSync(this.dir) ? readdirSync(this.dir).filter((f) => /^events-\d+\.jsonl$/.test(f)).sort((a, b) => Number(a.slice(7, -6)) - Number(b.slice(7, -6))) : []
    return [...old.map((f) => join(this.dir, f)), this.file].filter((f) => existsSync(f))
  }

  #read(since) {
    const out = []
    for (const f of this.#files()) {
      for (const line of readFileSync(f, 'utf8').split('\n')) {
        if (!line) continue
        let e
        try { e = JSON.parse(line) } catch { continue }
        if (e.seq > since) out.push(e)
      }
    }
    return out
  }

  emit(kind, facts = {}) {
    const e = { v: SCHEMA, seq: ++this.seq, at: new Date().toISOString(), kind }
    for (const k of SAFE) if (facts[k] !== undefined && facts[k] !== null) e[k] = facts[k]
    if (facts.session) e.session = hashSession(facts.session)
    appendFileSync(this.file, JSON.stringify(e) + '\n')
    this.#apply(e)
    this.#rotate()
    return e
  }

  #rotate() {
    let size = 0
    try { size = statSync(this.file).size } catch { return }
    if (size < ROTATE_BYTES) return
    renameSync(this.file, join(this.dir, `events-${this.seq}.jsonl`))
    const old = this.#files().filter((f) => f !== this.file)
    for (const f of old.slice(0, Math.max(0, old.length - KEEP_OLD))) rmSync(f, { force: true })
  }

  #svc(id) {
    return (this.services[id] ||= { service: id, state: 'unknown', stable: null, nightly: null, calls: 0, errors: 0, fallbacks: 0, crashes: 0, lastCallAt: null, lastError: null, activeTickets: [] })
  }

  #apply(e) {
    this.seq = Math.max(this.seq, e.seq || 0)
    if (!e.service) return
    const s = this.#svc(e.service)
    if (e.kind === 'call' || e.kind === 'error') { s.calls++; s.lastCallAt = e.at }
    if (e.kind === 'error') { s.errors++; s.lastError = { code: e.code, op: e.op, at: e.at } }
    if (e.kind === 'fallback') s.fallbacks++
    if (e.kind === 'crash') { s.crashes++; s.state = 'crashed' }
    if (e.kind === 'start') s.state = 'running'
    if (['backoff', 'quarantined'].includes(e.kind)) s.state = e.kind
    if (e.kind === 'release') { if (e.channel === 'stable') s.stable = e.to; if (e.channel === 'nightly') s.nightly = e.to }
    if (e.kind?.startsWith('ticket_') && e.ticket) {
      const active = ['open', 'dispatched', 'reopened', 'escalated'].includes(e.state)
      s.activeTickets = s.activeTickets.filter((t) => t !== e.ticket)
      if (active) s.activeTickets.push(e.ticket)
    }
  }

  // What a client asks: the events after its cursor (oldest first, up to
  // limit), the cursor to use next, and where everything stands now.
  since(cursor = 0, { limit = 500, kinds } = {}) {
    let events = this.#read(Number(cursor) || 0)
    if (kinds?.length) events = events.filter((e) => kinds.includes(e.kind))
    const page = events.slice(0, Math.min(Number(limit) || 500, 5000))
    return { schema: SCHEMA, cursor: events.length > page.length ? page.at(-1).seq : this.seq, latest: this.seq, more: events.length > page.length, events: page, state: { services: Object.values(this.services) } }
  }
}
