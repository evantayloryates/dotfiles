// Anchor core: routing, sessions, jobs, notes, ledger and prompt composition.
// Runs inside the daemon, or inside the front end itself in degraded mode.
//
// - Manifests are re-read on every request (hot reload). A manifest declares
//   its operations, so discovery, description and argument checks never start
//   a service; a started service is checked against its declaration (drift).
// - Sessions, idempotency records and job results live in journals under
//   stateDir, so a daemon restart is invisible to the chats using it.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { checkArgs } from '../../_shared/kernel/service.mjs'
import { ServiceSupervisor } from './supervisor.mjs'
import { Journal } from './store.mjs'
import { idempotencyOf, mayRerun, manifestProblems } from './policy.mjs'
import { resolve as resolveChannels, route, readChannels, releaseInfo, SLUG, INFRA_CODES, PRE_EXEC_CODES } from './channels.mjs'
import { TicketBook } from './tickets.mjs'
import { buildIndex, firstPass, needHash } from './discovery.mjs'

const MAX_NIGHTLY_AGE_MS = Number(process.env.ANCHOR_MAX_NIGHTLY_AGE_MS || 72 * 3600_000)

const DEFAULT_DEADLINE_MS = 15_000
const CONTEXT_BUDGET_MS = Number(process.env.ANCHOR_CONTEXT_BUDGET_MS || 300)
const CONTEXT_WORKER = fileURLToPath(new URL('./context-worker.mjs', import.meta.url))
export const SERVICE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/
const DAY = 24 * 3600_000
const SESSION_TTL_MS = 7 * DAY
const RECORD_TTL_MS = DAY
const STANDARD_OPS = {
  'job.status': 'Status of job handles: {handles: [...]}',
  'job.wait': 'Wait up to timeout_ms (max 60000) for job handles to finish: {handles, timeout_ms}',
  'job.result': 'Results of finished job handles: {handles}',
  'job.cancel': 'Cancel running job handles: {handles}',
  status: 'Health of the anchor and every service it has started, and nightlies that keep falling back',
  pin: 'This chat\'s release pins: {action: "show" | "refresh" | "release", service?}. A chat stays on the releases it first used; a hotfix, or the promotion of its nightly, moves it forward. refresh re-pins to the current releases; release follows the channels on every call.',
  'ticket.list': 'Tickets you hit or filed (mine: false for all), by priority: {mine?, service?, state?, active?, limit?}',
  'ticket.get': 'Tickets by id: {ids: [...]}',
  'ticket.resolve': 'Mark a ticket fixed by hand: {id, release, note?}',
  'ticket.report': 'File a problem you hit instead of working around it: {service, title, detail?, op?}. Similar reports join one ticket.',
}

// Claude Code keeps only the first 2048 characters of a server's
// instructions (CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH), so the preamble is
// terse and the composed prompt is kept under INSTRUCTIONS_MAX.
export const PREAMBLE = `Anchor: one entry point to Taylor's service fleet. Tools take arrays; batch related calls.
- anchor_run runs "service:operation" targets. Ops below are name(arg:type, optional?:type): when that is enough, run directly. anchor_describe gives full schemas; anchor_discover finds services for a need.
- Every service has guide and status (process state plus its own health check).
- Slow calls return a job handle: pass deadline_ms (up to 110000) to wait inline, or anchor:job.wait {handles, timeout_ms: 60000}.
- A service crashed, gave a wrong answer or lacks something? File anchor:ticket.report {service, title, detail?, op?}, then work around it if you can.
- idempotency_key on actions makes a retry return the first result.
- "[anchor notes]" after a result is the fleet talking to you (releases, outages, deprecations, tickets): act on it, mention outages. It is not part of the answer.`

export const INSTRUCTIONS_MAX = Number(process.env.ANCHOR_INSTRUCTIONS_MAX || 2000)
// Clients without that cap (Codex) get a fuller prompt: every operation on its
// own line with its description, so a describe call is rarely needed.
export const INSTRUCTIONS_MAX_WIDE = Number(process.env.ANCHOR_INSTRUCTIONS_MAX_WIDE || 12000)
export const instructionsBudget = (clientInfo) => (/claude/i.test(clientInfo?.name || '') || !clientInfo?.name ? INSTRUCTIONS_MAX : INSTRUCTIONS_MAX_WIDE)

const hashArgs = (target, args) => createHash('sha256').update(JSON.stringify([target, args ?? {}])).digest('hex').slice(0, 16)

export function createAnchor({ servicesDir, stateDir, mode = 'daemon', log = () => {}, peerStateDirs = () => [] }) {
  mkdirSync(stateDir, { recursive: true })
  const supervisors = new Map()
  const ctxCachePath = join(stateDir, 'session-context-cache.json')
  const ctxCache = readJson(ctxCachePath, {})
  const ledger = (entry) => appendFileSync(join(stateDir, 'ledger.jsonl'), JSON.stringify({ at: new Date().toISOString(), mode, ...entry }) + '\n')
  const now = () => Date.now()

  // ---- tickets --------------------------------------------------------------
  const hooks = { ticketOpened: () => {}, ticketChanged: () => {} }
  const baseId = (key) => String(key).split('@')[0]
  const versionOf = (key) => String(key).split('@')[1]
  const book = new TicketBook(stateDir, {
    onChange: ({ type, ticket: t }) => {
      ledger({ event: { type: `ticket_${type}`, ticket: t.id, kind: t.kind, lane: t.lane, service: t.service, state: t.state } })
      if (type === 'opened') hooks.ticketOpened(t)
      hooks.ticketChanged(type, t)
      const tell = (text) => { for (const h of t.sessions) { const s = sessions.get(h); if (s) addNote(s, text) } }
      if (type === 'fixed') tell(`Ticket ${t.id} (${t.title}) is fixed in ${t.service} ${t.fixedIn}.`)
      if (type === 'reopened') tell(`Ticket ${t.id} (${t.title}) is back: the failure happened again after the fix. It has priority now.`)
      if (type === 'escalated') tell(`Ticket ${t.id} (${t.title}) could not be fixed automatically and was escalated to Taylor.`)
    },
  })

  // ---- persistent state ---------------------------------------------------
  const sessionLog = new Journal(join(stateDir, 'sessions.jsonl'))
  const recordLog = new Journal(join(stateDir, 'idempotency.jsonl'))
  const jobLog = new Journal(join(stateDir, 'jobs.jsonl'))
  const sessions = new Map() // handle -> {handle, clientInfo, firstSeen, lastSeen, services:Set, notes:[{id,text}], nid, calls}
  const records = new Map() // key -> {hash, target, state:'started'|'done', result, at}
  const jobs = new Map() // handle -> {handle, target, session, state, result, progress, done?, controller?}
  const inflightKeys = new Map() // key -> promise of the run in THIS process

  for (const r of sessionLog.replay()) {
    if (r.t === 's') sessions.set(r.h, { handle: r.h, clientInfo: r.clientInfo, firstSeen: r.at, lastSeen: r.at, services: new Set(), notes: [], nid: 0, calls: 0, pins: {} })
    const s = sessions.get(r.h)
    if (!s) continue
    if (r.t === 'svc') s.services.add(r.service)
    else if (r.t === 'note+') { s.notes.push({ id: r.id, text: r.text }); s.nid = Math.max(s.nid, r.id) }
    else if (r.t === 'note-') s.notes = s.notes.filter((n) => n.id > r.upTo)
    else if (r.t === 'seen') s.lastSeen = r.at
    else if (r.t === 'pin') { if (r.pin) s.pins[r.service] = r.pin; else delete s.pins[r.service] }
  }
  for (const r of recordLog.replay()) {
    if (r.t === 'start') records.set(r.k, { hash: r.hash, target: r.target, state: 'started', at: r.at })
    else if (r.t === 'done' && records.has(r.k)) Object.assign(records.get(r.k), { state: 'done', result: r.result, at: r.at })
  }
  for (const r of jobLog.replay()) {
    const j = jobs.get(r.handle) || { handle: r.handle }
    Object.assign(j, { target: r.target, session: r.session, state: r.state, result: r.result, at: r.at })
    jobs.set(r.handle, j)
  }
  // A job recorded as running belonged to a process that is gone: its
  // outcome is unknown. Say so instead of pretending it finished.
  let lostJobs = 0
  for (const j of jobs.values()) {
    if (j.state !== 'running') continue
    j.state = 'lost'
    j.result = { ok: false, code: 'lost', error: 'the anchor restarted while this job ran; its outcome is unknown' }
    lostJobs++
  }
  // Compact on start: drop expired sessions, records and finished jobs.
  const cutoff = (ttl) => new Date(now() - ttl).toISOString()
  for (const [h, s] of sessions) if (s.lastSeen < cutoff(SESSION_TTL_MS)) sessions.delete(h)
  for (const [k, r] of records) if (r.at < cutoff(RECORD_TTL_MS)) records.delete(k)
  for (const [h, j] of jobs) if (j.at && j.at < cutoff(RECORD_TTL_MS)) jobs.delete(h)
  compactAll()
  if (sessionLog.skipped + recordLog.skipped + jobLog.skipped) {
    ledger({ event: { type: 'journal_skipped_lines', sessions: sessionLog.skipped, records: recordLog.skipped, jobs: jobLog.skipped } })
  }
  ledger({ event: { type: 'restored', sessions: sessions.size, records: records.size, jobs: jobs.size, lostJobs } })

  function compactAll() {
    const sRecs = []
    for (const s of sessions.values()) {
      sRecs.push({ t: 's', h: s.handle, clientInfo: s.clientInfo, at: s.firstSeen })
      if (s.lastSeen !== s.firstSeen) sRecs.push({ t: 'seen', h: s.handle, at: s.lastSeen })
      for (const svc of s.services) sRecs.push({ t: 'svc', h: s.handle, service: svc })
      for (const n of s.notes) sRecs.push({ t: 'note+', h: s.handle, id: n.id, text: n.text })
      for (const [service, pin] of Object.entries(s.pins)) sRecs.push({ t: 'pin', h: s.handle, service, pin })
    }
    sessionLog.compact(sRecs)
    const rRecs = []
    for (const [k, r] of records) {
      rRecs.push({ t: 'start', k, hash: r.hash, target: r.target, at: r.at })
      if (r.state === 'done') rRecs.push({ t: 'done', k, result: r.result, at: r.at })
    }
    recordLog.compact(rRecs)
    jobLog.compact([...jobs.values()].map((j) => ({ handle: j.handle, target: j.target, session: j.session, state: j.state, result: j.result, at: j.at })))
  }
  function maybeCompact() {
    if (sessionLog.needsCompaction() || recordLog.needsCompaction() || jobLog.needsCompaction()) compactAll()
  }
  // A service marked "sensitive" (its manifest) never has a result written to
  // disk: journals keep only the outcome, so a replay after a restart says
  // the result was not retained instead of returning it.
  const isSensitive = (target) => {
    const id = String(target || '').split(':')[0]
    try { return JSON.parse(readFileSync(join(servicesDir, id, 'service.json'), 'utf8')).sensitive === true } catch { return false }
  }
  const retained = (target, result) => (result && isSensitive(target) ? { ok: result.ok, code: result.code, resultNotRetained: true, note: 'this service is marked sensitive: its results are not stored' } : result)
  const journalJob = (j) => {
    j.at = new Date().toISOString()
    jobLog.append({ handle: j.handle, target: j.target, session: j.session, state: j.state, result: j.state === 'running' ? undefined : retained(j.target, j.result), at: j.at })
  }

  // ---- manifests ------------------------------------------------------------
  function manifests() {
    const out = {}
    for (const id of readdirSync(servicesDir)) {
      const p = join(servicesDir, id, 'service.json')
      if (!existsSync(p)) continue
      try {
        const raw = JSON.parse(readFileSync(p, 'utf8'))
        out[id] = { ...raw, id, dir: join(servicesDir, id) }
        const problems = manifestProblems(raw)
        if (problems.length) out[id].broken = `service.json: ${problems.join('; ')}`
      } catch (err) {
        out[id] = { id, broken: `service.json does not parse: ${err.message}` }
      }
    }
    return out
  }
  const opsOf = (man) => man?.operations || {}
  const channelsOf = (id) => resolveChannels(servicesDir, stateDir, id, { maxNightlyAgeMs: MAX_NIGHTLY_AGE_MS })
  // What a service presents to discovery: its stable release, else its
  // nightly, else its working folder. Operations only in nightly are listed too.
  function serving(id, man) {
    const res = channelsOf(id)
    if (!res.released) return { man, res }
    const base = res.stable || res.nightly
    const ops = { ...opsOf(base.man) }
    if (res.stable && res.nightly) for (const [k, v] of Object.entries(opsOf(res.nightly.man))) if (!ops[k]) ops[k] = { ...v, channel: 'nightly' }
    return { man: { ...base.man, id, dir: base.dir, operations: ops }, res }
  }
  function declFor(id, op) {
    const m = manifests()[id]
    return m ? opsOf(serving(id, m).man)[op] : undefined
  }

  // ---- sessions and notes ---------------------------------------------------
  function session(handle, clientInfo) {
    if (!handle) handle = 'as_' + randomBytes(6).toString('hex')
    let s = sessions.get(handle)
    const at = new Date().toISOString()
    if (!s) {
      s = { handle, clientInfo, firstSeen: at, lastSeen: at, services: new Set(), notes: [], nid: 0, calls: 0, pins: {} }
      sessions.set(handle, s)
      sessionLog.append({ t: 's', h: handle, clientInfo, at })
      if (mode === 'embedded') addNote(s, 'DEGRADED: the anchor daemon is unreachable, so this session runs a minimal anchor inside its own process. Operations work; shared jobs and cross-session state do not. Repair is underway.')
    } else if (now() - Date.parse(s.lastSeen) > 60_000) {
      s.lastSeen = at
      sessionLog.append({ t: 'seen', h: handle, at })
    }
    if (clientInfo && !s.clientInfo) s.clientInfo = clientInfo
    return s
  }
  function addNote(s, text) {
    const n = { id: ++s.nid, text }
    s.notes.push(n)
    sessionLog.append({ t: 'note+', h: s.handle, id: n.id, text })
  }
  // ---- release pins ----------------------------------------------------------
  // A chat is pinned, per service, to the stable and nightly it first used.
  // Pins only move forward: past a hotfix, when the pinned nightly is
  // promoted or cleared, or when a pinned release no longer exists. The chat
  // is told when its pin moves. {follow: true} tracks the channels instead.
  function setPin(s, id, pin) {
    if (pin) s.pins[id] = pin
    else delete s.pins[id]
    sessionLog.append({ t: 'pin', h: s.handle, service: id, pin: pin || null })
  }
  function pinnedView(id, res, s) {
    const ch = res.ch
    const pin = s.pins[id]
    const at = new Date(now()).toISOString()
    if (!pin) { setPin(s, id, { stable: ch.stable, nightly: ch.nightly, at }); return res }
    if (pin.follow) return res
    const hist = ch.history || []
    const after = (h) => h.at > pin.at
    const forward = (from, to) => to && (!from || to > from)
    const moves = []
    let { stable, nightly } = pin
    if (stable !== ch.stable && forward(stable, ch.stable)) {
      const why = !stable ? 'no stable when pinned'
        : hist.some((h) => h.action === 'hotfix' && after(h)) ? 'hotfix'
        : pin.nightly && hist.some((h) => h.action === 'promote' && h.slug === pin.nightly) ? `its nightly ${pin.nightly} was promoted`
        : !releaseInfo(servicesDir, id, stable) ? 'release removed' : null
      if (why) { moves.push(`stable ${stable || 'none'} -> ${ch.stable} (${why})`); stable = ch.stable }
    }
    if (nightly && nightly !== ch.nightly) {
      const why = hist.some((h) => h.action === 'promote' && h.slug === nightly) ? 'promoted'
        : hist.some((h) => h.action === 'nightly_cleared' && h.slug === nightly) ? 'cleared'
        : hist.some((h) => h.action === 'hotfix' && after(h)) ? 'superseded by a hotfix'
        : !releaseInfo(servicesDir, id, nightly) ? 'release removed' : null
      if (why) { moves.push(`nightly ${nightly} -> ${ch.nightly && forward(nightly, ch.nightly) ? ch.nightly : 'none'} (${why})`); nightly = ch.nightly && forward(nightly, ch.nightly) ? ch.nightly : null }
    }
    if (moves.length) {
      setPin(s, id, { stable, nightly, at })
      addNote(s, `${id}: this chat's release pin moved forward: ${moves.join('; ')}.`)
    }
    if (stable === ch.stable && nightly === ch.nightly) return res
    return { ...res, stable: releaseInfo(servicesDir, id, stable), nightly: releaseInfo(servicesDir, id, nightly), pinned: { stable, nightly } }
  }

  // ---- nightly fallback reporting -------------------------------------------
  // Per nightly and operation, a sliding window of nightly calls and of those
  // that fell back to stable. Past the threshold: one standard-lane ticket.
  const FB_WINDOW_MS = Number(process.env.ANCHOR_FALLBACK_WINDOW_MS || 3600_000)
  const FB_MAX = Number(process.env.ANCHOR_FALLBACK_MAX || 3)
  const FB_RATE = Number(process.env.ANCHOR_FALLBACK_RATE || 0.1)
  const fallbacks = new Map()
  function trackNightly(id, slug, op, fell, s) {
    const k = `${id}@${slug}:${op}`
    const e = fallbacks.get(k) || { service: id, nightly: slug, op, calls: [], falls: [], ticket: null }
    fallbacks.set(k, e)
    const t = now()
    e.calls.push(t)
    if (fell) e.falls.push(t)
    e.calls = e.calls.filter((x) => t - x <= FB_WINDOW_MS)
    e.falls = e.falls.filter((x) => t - x <= FB_WINDOW_MS)
    if (!fell || e.ticket) return
    if (e.falls.length >= FB_MAX || (e.calls.length >= 10 && e.falls.length / e.calls.length >= FB_RATE)) {
      const tk = book.record({ kind: 'fallback', service: id, op, version: slug, session: s.handle, fingerprint: `nightly ${slug} falls back on ${op}`, title: `${id} nightly ${slug} falls back on ${op}`, detail: `${e.falls.length} of ${e.calls.length} nightly calls fell back to stable within ${Math.round(FB_WINDOW_MS / 60000)} min` })
      e.ticket = tk?.id || true
    }
  }
  function fallbackStatus() {
    const t = now()
    return [...fallbacks.values()].map((e) => ({ service: e.service, nightly: e.nightly, op: e.op, fallbacks: e.falls.filter((x) => t - x <= FB_WINDOW_MS).length, nightlyCalls: e.calls.filter((x) => t - x <= FB_WINDOW_MS).length, ticket: typeof e.ticket === 'string' ? e.ticket : null })).filter((e) => e.fallbacks)
  }

  // An operation's declared notice (a deprecation, a changed meaning) reaches
  // each session once, as a note on the first call that uses it.
  // The notice also travels on the call's own result, beside the value, and
  // says what to do when it names a replacement: chats (Codex above all) act
  // on a warning next to the answer far more than on a trailing notes block.
  function withNotice(result, decl) {
    if (!decl?.notice || !result?.ok) return result
    const use = decl.notice.match(/\buse ([a-z0-9_-]+:[a-z0-9_]+)/i)?.[1]
    return { ...result, notice: `${decl.notice}${use ? ` This result is not the one to give the user: call ${use} and answer with its result, saying why.` : ''}` }
  }
  function notice(s, id, op, decl) {
    if (!decl?.notice) return
    s.noticed ||= new Set()
    if (s.noticed.has(`${id}:${op}`)) return
    s.noticed.add(`${id}:${op}`)
    addNote(s, `${id}:${op}: ${decl.notice}`)
  }
  function useService(s, id) {
    noteMiss(s, id)
    if (s.services.has(id)) return
    s.services.add(id)
    sessionLog.append({ t: 'svc', h: s.handle, service: id })
  }
  // Notes about a service reach only sessions that have used it; fleet-wide
  // notes (service omitted) reach everyone.
  function note(text, { service } = {}) {
    for (const s of sessions.values()) if (!service || s.services.has(service)) addNote(s, text)
  }
  function takeNotes(s) {
    if (!s.notes.length) return null
    const upTo = s.notes.at(-1).id
    const text = `[anchor notes]\n- ${s.notes.map((n) => n.text).join('\n- ')}`
    s.notes = []
    sessionLog.append({ t: 'note-', h: s.handle, upTo })
    return text
  }

  // ---- supervisors ----------------------------------------------------------
  function supervisor(id, manifest) {
    let sup = supervisors.get(id)
    if (!sup) {
      sup = new ServiceSupervisor({
        id,
        dir: manifest.dir,
        declared: manifest.operations,
        onEvent: (e) => {
          ledger({ event: e })
          if (e.type === 'started') checkDrift(id, sup)
          if (['crashed', 'backoff', 'quarantined', 'op_quarantined'].includes(e.type) && e.fingerprint) {
            const t = book.record({ kind: 'crash', service: baseId(id), op: e.op || e.ops?.[0], fingerprint: e.fingerprint, detail: e.stderr, session: e.sessions?.[0], version: versionOf(id) })
            for (const h of e.sessions?.slice(1) || []) book.record({ kind: 'crash', service: baseId(id), fingerprint: t.fingerprint, session: h, version: versionOf(id) })
          }
          if (e.type === 'quarantined') note(`${id} is quarantined (${e.reason}). Its operations fail fast until it is fixed; a hotfix was requested.`, { service: id })
          if (e.type === 'op_quarantined') note(`${id}:${e.op} is disabled after crashing the service twice; other ${id} operations still work.`, { service: id })
          if (e.type === 'backoff') note(`${id} failed the same way twice and is restarting in ${Math.round(e.retryInMs / 1000)} s.`, { service: id })
        },
      })
      supervisors.set(id, sup)
    }
    return sup
  }
  // The manifest is the contract; the handlers are the implementation.
  function checkDrift(id, sup) {
    const declared = Object.keys(sup.declared || opsOf(manifests()[id]))
    const handlers = Object.keys(sup.ops || {})
    const missing = declared.filter((o) => !handlers.includes(o))
    const extra = handlers.filter((o) => !declared.includes(o))
    sup.drift = { missing, extra }
    if (missing.length || extra.length) {
      ledger({ event: { type: 'drift', service: id, missing, extra } })
      book.record({ kind: 'drift', service: baseId(id), fingerprint: `drift missing:${missing.join(',')} extra:${extra.join(',')}`, title: `${baseId(id)} manifest and handlers disagree`, version: versionOf(id) })
      if (missing.length) note(`${id} declares operations it does not implement: ${missing.join(', ')}. They return not_implemented until fixed; a ticket was requested.`, { service: id })
    }
  }

  // ---- prompt composition ---------------------------------------------------
  let ctxWorker = null
  let ctxSeq = 0
  const ctxWaiting = new Map()
  function contextWorker() {
    if (ctxWorker) return ctxWorker
    ctxWorker = new Worker(CONTEXT_WORKER)
    ctxWorker.unref()
    ctxWorker.on('message', ({ id, out }) => ctxWaiting.get(id)?.(out))
    ctxWorker.on('error', (err) => { log('context worker error', err.message); ctxWorker = null })
    ctxWorker.on('exit', () => { ctxWorker = null })
    return ctxWorker
  }
  function generateContexts(list, ctx, { kind, need, budgetMs = CONTEXT_BUDGET_MS } = {}) {
    if (!list.length) return Promise.resolve({})
    const id = ++ctxSeq
    const w = contextWorker()
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        ctxWaiting.delete(id)
        log('context generators missed the budget; replacing worker')
        w.terminate()
        ctxWorker = null
        resolve({ timedOut: true })
      }, budgetMs)
      ctxWaiting.set(id, (out) => { clearTimeout(timer); ctxWaiting.delete(id); resolve(out) })
      w.postMessage({ id, jobs: list, ctx, kind, need, perJobMs: Math.max(20, budgetMs - 50) })
    })
  }

  // Compact operation signatures for the session prompt, so a chat can call
  // anchor_run without a describe first: name(required:type, optional?:type).
  function signatures(man, { rich = false } = {}) {
    const maxOps = rich ? 40 : 12
    const maxLen = rich ? 4000 : 400
    const ops = Object.entries(opsOf(man))
    if (!ops.length || ops.length > maxOps) return ''
    const type = (p) => (p?.enum ? p.enum.map((v) => JSON.stringify(v)).join('|') : p?.type === 'array' ? `${p.items?.type || 'any'}[]` : p?.type || 'any')
    const text = ops.map(([name, d]) => {
      const props = d.inputSchema?.properties || {}
      const req = new Set(d.inputSchema?.required || [])
      const sig = `${name}(${Object.entries(props).map(([k, p]) => `${k}${req.has(k) ? '' : '?'}:${type(p)}`).join(', ')})`
      const use = d.notice?.match(/\buse ([a-z0-9_-]+:[a-z0-9_]+)/i)?.[1]
      const tag = d.notice ? ` [${d.notice.split(/[.:]/)[0].trim()}${use ? `, use ${use}` : ''}]` : ''
      if (rich) return `    ${sig}${tag}${d.description ? `: ${String(d.description).split('\n')[0].slice(0, 160)}` : ''}`
      return `${sig}${tag}`
    }).join(rich ? '\n' : ', ')
    return text.length <= maxLen ? text : ''
  }

  async function hello({ session: handle, clientInfo }) {
    const s = session(handle, clientInfo)
    const m = manifests()
    const list = Object.values(m)
      .filter((man) => !man.broken && existsSync(join(man.dir, 'context.mjs')))
      .map((man) => ({ service: man.id, path: join(man.dir, 'context.mjs') }))
    const t0 = now()
    const generated = await generateContexts(list, { session: s.handle, clientInfo, mode, now: new Date().toISOString() })
    const budget = instructionsBudget(clientInfo)
    const rich = budget >= 6000
    const parts = [PREAMBLE, '', 'Services:']
    const sigLines = []
    for (const [id, man] of Object.entries(m)) {
      if (man.broken) {
        parts.push(`- ${id}: unavailable (${man.broken})`)
        continue
      }
      const g = generated[id]
      if (g?.text) ctxCache[id] = { text: g.text, at: new Date().toISOString() }
      if (g?.error) ledger({ event: { type: 'context_error', service: id, error: g.error } })
      parts.push(`- ${id} ${serving(id, man).man.version || ''}: ${g?.text || ctxCache[id]?.text || man.description}`.replace(' :', ':'))
      const sigs = signatures(serving(id, man).man, { rich })
      if (sigs) { parts.push(rich ? `  ops:\n${sigs}` : `  ops: ${sigs}`); sigLines.push(parts.length - 1) }
    }
    writeFileSync(ctxCachePath, JSON.stringify(ctxCache, null, 1))
    ledger({ event: { type: 'hello', session: s.handle, client: clientInfo?.name, contextMs: now() - t0, timedOut: !!generated.timedOut } })
    // Over budget: drop signatures from the longest first (describe has them),
    // then cut service lines to their first sentence.
    const size = () => parts.filter((x) => x !== null).join('\n').length
    for (const i of sigLines.sort((a, b) => parts[b].length - parts[a].length)) { if (size() <= budget) break; parts[i] = null }
    for (let i = 0; i < parts.length && size() > budget; i++) if (parts[i]?.startsWith('- ')) parts[i] = parts[i].replace(/^(- [^:]+: [^.]{0,80}).*$/, '$1.')
    const instructions = parts.filter((x) => x !== null).join('\n')
    return { session: s.handle, instructions: instructions.length > budget ? instructions.slice(0, budget - 1) + '…' : instructions }
  }

  // ---- discover and describe (never start a service) ------------------------
  // Need-based discovery. The index is rebuilt only when a manifest changes.
  // Requests are never written anywhere: logs carry needHash.
  let discIndex = { key: null, index: null }
  const RELEVANCE_BUDGET_MS = Number(process.env.ANCHOR_RELEVANCE_BUDGET_MS || 200)
  async function discover({ need, list, session: handle } = {}) {
    const t0 = now()
    const m = manifests()
    const live = Object.entries(m).filter(([, man]) => !man.broken).map(([id, man]) => ({ id, ...serving(id, man) }))
    const rows = Object.fromEntries(Object.entries(m).map(([id, man]) => {
      const sv = man.broken ? { man } : serving(id, man)
      return [id, {
        id,
        description: man.broken ? `unavailable: ${man.broken}` : sv.man.description,
        ops: Object.keys(opsOf(sv.man)),
        ...(sv.res?.released ? { stable: sv.res.ch.stable, nightly: sv.res.ch.nightly } : {}),
      }]
    }))
    if (list || !need) return { services: Object.values(rows) }
    const key = createHash('sha256').update(JSON.stringify(live.map((x) => [x.id, x.man.version, x.man.description, x.man.keywords, Object.keys(opsOf(x.man))]))).digest('hex')
    if (discIndex.key !== key) discIndex = { key, index: buildIndex(live.map((x) => ({ id: x.id, man: { ...x.man, operations: opsOf(x.man) }, dir: x.dir || x.man.dir }))) }
    const { ranked, clear } = firstPass(discIndex.index, need)
    // Without a router, an unclear request gets a generous list: every
    // service within a quarter of the top score.
    // A clear winner still brings along services whose operations the request
    // names (a need spanning several services).
    const picked = clear ? [ranked[0], ...ranked.slice(1).filter((r) => r.ops.length && r.score >= ranked[0].score * 0.15)] : ranked.filter((r) => r.score >= ranked[0].score * 0.25)
    const settledBy = !ranked.length ? 'none' : clear ? 'first_pass' : 'first_pass_generous'
    let matches = picked.map((r) => ({ ...rows[r.id], ops: r.ops.length ? r.ops : rows[r.id].ops, ...(r.ops.length ? { allOps: rows[r.id].ops } : {}), score: r.score }))
    // Each picked service may refine its own answer (relevance in its
    // context.mjs), within a short deadline; a late or failing one is ignored.
    const withRel = live.filter((x) => matches.some((mm) => mm.id === x.id) && existsSync(join(x.man.dir, 'context.mjs')))
    if (withRel.length) {
      const rel = await generateContexts(withRel.map((x) => ({ service: x.id, path: join(x.man.dir, 'context.mjs') })), { session: handle, mode }, { kind: 'relevance', need, budgetMs: RELEVANCE_BUDGET_MS })
      matches = matches.flatMap((mm) => {
        const r = rel[mm.id]?.relevance
        if (!r) return [mm]
        if (r.relevant === false) return []
        const ops = r.ops?.filter((o) => rows[mm.id].ops.includes(o))
        return [{ ...mm, ...(ops?.length ? { ops, allOps: rows[mm.id].ops } : {}), ...(r.note ? { hint: r.note } : {}) }]
      })
    }
    const s = handle ? session(handle) : null
    if (s) {
      s.suggested ||= new Set()
      for (const x of matches) s.suggested.add(x.id)
    }
    const h = needHash(need)
    ledger({ event: { type: 'discover', session: s?.handle, needHash: h, settledBy, matches: matches.map((x) => x.id), ms: now() - t0 } })
    return { matches, alsoAvailable: Object.keys(rows).filter((id) => !matches.some((x) => x.id === id)), settledBy, needHash: h }
  }

  // A chat that ran discovery and then used a service it did not suggest is
  // a miss: logged (hash only) for review into the evaluation set.
  function noteMiss(s, id) {
    if (!s.suggested || s.suggested.has(id) || (s.missed ||= new Set()).has(id)) return
    s.missed.add(id)
    appendFileSync(join(stateDir, 'discovery-misses.jsonl'), JSON.stringify({ at: new Date(now()).toISOString(), session: s.handle, service: id }) + '\n')
  }

  function describe({ targets = [] }) {
    const m = manifests()
    const out = []
    for (const t of [].concat(targets)) {
      const [id, op] = String(t.target || t).split(':')
      if (id === 'anchor') {
        out.push({ target: 'anchor', ops: STANDARD_OPS })
        continue
      }
      if (!m[id] || m[id].broken) {
        out.push({ target: t.target || t, error: m[id] ? m[id].broken : `no service "${id}"` })
        continue
      }
      const { man, res } = serving(id, m[id])
      const ops = opsOf(man)
      if (op) out.push(ops[op] ? { target: `${id}:${op}`, ...ops[op] } : { target: `${id}:${op}`, error: `no operation "${op}"`, available: Object.keys(ops) })
      else out.push({ target: id, description: man.description, version: man.version, ...(res?.released ? { stable: res.ch.stable, nightly: res.ch.nightly } : {}), ops })
    }
    return { items: out }
  }

  // ---- run ------------------------------------------------------------------
  async function runOne(call, s, onProgress, signal) {
    const { target, args = {} } = call
    const [id, op] = String(target || '').split(':')
    if (id === 'anchor') return standard(op, args, s)
    const m = manifests()
    const man = m[id]
    if (!man) return { ok: false, code: 'unknown_service', error: `no service "${id}"`, available: Object.keys(m) }
    if (man.broken) return { ok: false, code: 'broken_manifest', error: man.broken }
    if (!op) return { ok: false, code: 'bad_target', error: `target must be "service:operation", got "${target}"` }
    if (op === 'guide') {
      const p = join(man.dir, 'GUIDE.md')
      return existsSync(p) ? { ok: true, value: readFileSync(p, 'utf8') } : { ok: true, value: `${id} has no guide. Use anchor_describe on "${id}" to see its operations.` }
    }
    if (op === 'status') {
      // Anchor's view of the process, not the service's own health: a service
      // that is not running starts on its next call.
      const st = supervisors.get(id)?.status() || { state: 'idle' }
      const idle = ['stopped', 'idle'].includes(st.state)
      const value = { service: id, version: man.version, ...st, ...(idle ? { state: 'idle', meaning: `ready: no process is up between calls; the next call starts version ${man.version}` } : {}) }
      // The service's own health check, when it has a read operation named
      // like one that needs no arguments, answers in the same call.
      const own = Object.entries(opsOf(serving(id, man).man)).find(([n, d]) => /(^|_)(status|health)$/.test(n) && idempotencyOf(d) === 'natural' && !(d.inputSchema?.required || []).length)
      if (own) {
        const r = await runOne({ target: `${id}:${own[0]}`, args: {} }, s)
        value.ownStatus = { op: `${id}:${own[0]}`, ok: r.ok, ...(r.ok ? { value: r.value } : { code: r.code, error: r.error }) }
      }
      return { ok: true, value }
    }
    const chRes = channelsOf(id)
    if (chRes.released) return runReleased(id, op, args, call, s, chRes, onProgress, signal)
    const decl = opsOf(man)[op]
    // Rejected from the manifest alone: no cold start for a typo.
    if (!decl) return { ok: false, code: 'unknown_op', error: `${id} has no operation "${op}"`, available: Object.keys(opsOf(man)) }
    const problem = checkArgs(decl.inputSchema || {}, args)
    if (problem) return { ok: false, code: 'bad_args', error: problem, schema: decl.inputSchema }
    useService(s, id)
    notice(s, id, op, decl)
    const sup = supervisor(id, man)
    const result = await sup.call(op, args, { session: s.handle, onProgress, signal, timeoutMs: call.timeout_ms, idempotencyKey: call.idempotency_key, rerunShared: mayRerun(idempotencyOf(decl), !!call.idempotency_key) })
    blocked(id, op, result, s)
    if (result.code === 'unknown_op') return { ok: false, code: 'not_implemented', error: `${id} declares "${op}" but does not implement it` }
    return withNotice(result, decl)
  }

  // A chat turned away by a quarantine or backoff is affected by that failure
  // too: count it on the crash ticket, so priority reflects who is blocked.
  function blocked(id, op, result, s, version) {
    if (!['op_quarantined', 'quarantined', 'backoff'].includes(result.code) || !result.fingerprint) return
    book.record({ kind: 'crash', service: id, op, fingerprint: result.fingerprint, session: s.handle, version, detail: `blocked: ${result.code}` })
  }

  const overdueNoted = new Set()
  const hotfixNoted = new Set()
  async function runReleased(id, op, args, call, s, res, onProgress, signal) {
    if (res.overdue && !overdueNoted.has(res.ch.nightly)) {
      overdueNoted.add(res.ch.nightly)
      ledger({ event: { type: 'nightly_overdue', service: id, nightly: res.ch.nightly, ageMs: res.nightlyAgeMs } })
      book.record({ kind: 'overdue', service: id, fingerprint: `nightly ${res.ch.nightly} overdue`, title: `${id} nightly ${res.ch.nightly} is past its maximum age`, session: s.handle, version: res.ch.nightly })
      note(`${id} nightly ${res.ch.nightly} is past its maximum age without promotion; new features are frozen until it is promoted or fixed.`, { service: id })
    }
    // An explicit version overrides the pin: "stable"/"nightly" mean the
    // current channels, a slug any release that exists.
    if (!call.version) res = pinnedView(id, res, s)
    else if (SLUG.test(call.version) && ![res.stable?.slug, res.nightly?.slug].includes(call.version)) {
      const rel = releaseInfo(servicesDir, id, call.version)
      if (rel) res = { ...res, stable: rel, nightly: null }
    }
    const nightlyDown = res.nightly && supervisors.get(`${id}@${res.nightly.slug}`)?.state === 'quarantined'
    const cands = route(res, op, { explicit: call.version, nightlyDown })
    if (!cands.length || !cands[0].decl) {
      const known = Object.keys(opsOf(serving(id, manifests()[id]).man))
      return call.version && !cands.length
        ? { ok: false, code: 'unknown_version', error: `${id} has no release "${call.version}"`, stable: res.ch.stable, nightly: res.ch.nightly }
        : { ok: false, code: 'unknown_op', error: `${id} has no operation "${op}"`, available: known }
    }
    const problem = checkArgs(cands[0].decl.inputSchema || {}, args)
    if (problem) return { ok: false, code: 'bad_args', error: problem, schema: cands[0].decl.inputSchema }
    useService(s, id)
    notice(s, id, op, cands[0].decl)
    const attempts = []
    let result
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i]
      const sup = supervisor(`${id}@${c.slug}`, { dir: c.dir, operations: c.man.operations })
      result = await sup.call(op, args, { session: s.handle, onProgress, signal, timeoutMs: call.timeout_ms, idempotencyKey: call.idempotency_key, rerunShared: mayRerun(idempotencyOf(c.decl), !!call.idempotency_key) })
      blocked(id, op, result, s, c.slug)
      if (result.code === 'unknown_op') result = { ok: false, code: 'not_implemented', error: `${id} ${c.slug} declares "${op}" but does not implement it` }
      attempts.push({ service: id, version: c.slug, channel: c.channel, ok: result.ok, code: result.code })
      const next = cands[i + 1]
      const fallback = next && !result.ok && (c.fallbackOn === 'infra' ? INFRA_CODES.has(result.code) : c.fallbackOn === 'pre_exec' ? PRE_EXEC_CODES.has(result.code) : false)
      if (!fallback) break
    }
    const last = attempts.at(-1)
    // A call that would have gone to the nightly but skipped it (the nightly
    // is quarantined) fell back as surely as one that tried it first.
    const skippedNightly = nightlyDown && !call.version && route(res, op, {})[0]?.channel === 'nightly'
    if (skippedNightly) trackNightly(id, res.nightly.slug, op, true, s)
    else if (attempts[0].channel === 'nightly' && !call.version) trackNightly(id, attempts[0].version, op, attempts.length > 1, s)
    result = { ...result, served: { channel: last.channel, version: last.version }, ...(attempts.length > 1 ? { fellBack: attempts.slice(0, -1).map((a) => `${a.channel} ${a.version}: ${a.code}`) } : {}), _attempts: attempts }
    if (result.ok) book.verify(id, op, last.version)
    // Stable itself failing with nothing left to fall back to is the hotfix trigger.
    if (!result.ok && last.channel === 'stable' && INFRA_CODES.has(result.code)) {
      const k = `${id}@${last.version}:${result.fingerprint || result.code}`
      if (!hotfixNoted.has(k)) {
        hotfixNoted.add(k)
        ledger({ event: { type: 'hotfix_needed', service: id, stable: last.version, code: result.code, fingerprint: result.fingerprint } })
        book.record({ kind: 'hotfix', service: id, op, fingerprint: result.fingerprint || result.code, title: `${id} stable ${last.version}: ${op} fails (${result.code})`, session: s.handle, version: last.version, detail: result.error })
        note(`${id} stable ${last.version} is failing (${result.code}) with no release to fall back to; a hotfix was requested.`, { service: id })
      }
    }
    return withNotice(result, cands[0].decl)
  }

  // Idempotency, three cases: a finished key replays its result; a key still
  // running in this process attaches to that run; a key started by a process
  // that died runs again (the caller opted into at-least-once by sending a key,
  // and the service receives the key to dedupe side effects itself).
  // Records written by another anchor process: the daemon's, seen from a
  // degraded front end, or a degraded front end's, seen from the daemon once
  // it is back. Consulted only when this process has never seen the key.
  function peerRecord(key) {
    let found = null
    for (const dir of peerStateDirs()) {
      for (const r of new Journal(join(dir, 'idempotency.jsonl')).replay()) {
        if (r.k !== key) continue
        if (r.t === 'start') found = { hash: r.hash, target: r.target, state: 'started', at: r.at }
        else if (r.t === 'done' && found) Object.assign(found, { state: 'done', result: r.result })
      }
      if (found) return found
    }
    return null
  }

  async function runIdempotent(call, s, onProgress, signal) {
    const key = call.idempotency_key
    if (!key) return runOne(call, s, onProgress, signal)
    const [sid, sop] = String(call.target || '').split(':')
    const policy = sid === 'anchor' ? 'natural' : idempotencyOf(declFor(sid, sop))
    const hash = hashArgs(call.target, call.args)
    let rec = records.get(key)
    if (!rec && !inflightKeys.has(key)) {
      rec = peerRecord(key)
      if (rec) {
        records.set(key, rec)
        recordLog.append({ t: 'start', k: key, hash: rec.hash, target: rec.target, at: rec.at })
        if (rec.state === 'done') recordLog.append({ t: 'done', k: key, result: rec.result, at: rec.at })
      }
    }
    if (rec && rec.hash !== hash) return { ok: false, code: 'idempotency_conflict', error: `idempotency_key "${key}" was used for a different call (${rec.target})` }
    if (rec?.state === 'done') return { ...rec.result, replayed: true }
    if (inflightKeys.has(key)) return { ...(await inflightKeys.get(key)), attached: true }
    const rerun = rec?.state === 'started'
    // Interrupted earlier, outcome unknown: rerun only what may be repeated.
    if (rerun && !mayRerun(policy, true)) {
      return {
        ok: false,
        code: 'outcome_unknown',
        policy,
        error: `${call.target} was interrupted earlier and cannot be safely repeated (idempotency "${policy}"). Check whether it took effect; to run it again anyway, use a new idempotency_key.`,
      }
    }
    records.set(key, { hash, target: call.target, state: 'started', at: new Date().toISOString() })
    recordLog.append({ t: 'start', k: key, hash, target: call.target, at: records.get(key).at })
    const p = runOne(call, s, onProgress, signal)
    inflightKeys.set(key, p)
    const result = await p.finally(() => inflightKeys.delete(key))
    // Only a clear outcome is final; an unknown one may be retried with the key.
    if (result.ok || !['crashed', 'timeout', 'cancelled', 'outcome_unknown'].includes(result.code)) {
      Object.assign(records.get(key), { state: 'done', result })
      recordLog.append({ t: 'done', k: key, result: retained(call.target, result), at: new Date().toISOString() })
    }
    maybeCompact()
    return rerun ? { ...result, rerunAfterRestart: true, policy } : result
  }

  async function standard(op, args, s) {
    if (op === 'ticket.list') {
      const list = book.list({ session: args.mine === false ? undefined : s?.handle, service: args.service, state: args.state, active: args.active })
      return { ok: true, value: list.slice(0, args.limit || 20).map((t) => book.view(t)) }
    }
    if (op === 'ticket.resolve') {
      // A fix made by hand (or by Taylor): record it like a fixer's report.
      const t = book.get(args.id)
      if (!t) return { ok: false, code: 'bad_args', error: `no ticket ${args.id}` }
      if (!/^\d{4}-\d{2}-\d{2}\.\d{3}$/.test(args.release || '')) return { ok: false, code: 'bad_args', error: 'release must be the slug the fix shipped in' }
      return { ok: true, value: book.view(book.setState(t.id, 'fixed', { fixedIn: args.release, note: args.note || `fixed by hand in ${args.release}` })) }
    }
    if (op === 'ticket.get') return { ok: true, value: [].concat(args.ids || []).map((id) => book.view(book.get(id)) || { id, error: 'no such ticket' }) }
    if (op === 'ticket.report') {
      if (!args.service || !args.title) return { ok: false, code: 'bad_args', error: 'ticket.report needs service and title (detail and op optional)' }
      // The service names a folder fixers work in: only a known service id.
      if (!SERVICE_ID.test(String(args.service)) || !manifests()[args.service]) return { ok: false, code: 'bad_args', error: `ticket.report: no service "${String(args.service).slice(0, 80)}"`, available: Object.keys(manifests()) }
      const t = book.record({ kind: 'report', service: args.service, op: args.op, fingerprint: args.title, title: args.title, detail: args.detail, session: s?.handle })
      return { ok: true, value: { ticket: t.id, state: t.state, occurrences: t.count, hint: 'You will get a note here when it is fixed; check with anchor:ticket.get.' } }
    }
    // "handle" (one) is accepted too: a silent empty answer cost a pilot chat
    // four extra calls.
    const handles = [].concat(args.handles || args.handle || [])
    if (op.startsWith('job.') && !handles.length) return { ok: false, code: 'bad_args', error: `${op} needs handles: ["job_..."]` }
    const view = (h) => {
      const j = jobs.get(h)
      if (!j) return { handle: h, state: 'unknown', hint: 'no such job, or it finished more than a day ago' }
      return { handle: h, target: j.target, state: j.state, progress: j.progress, ...(j.state !== 'running' ? { result: j.result } : {}) }
    }
    if (op === 'job.status' || op === 'job.result') return { ok: true, value: handles.map(view) }
    if (op === 'job.wait') {
      const until = now() + Math.min(args.timeout_ms || 30_000, 60_000)
      await Promise.race([
        Promise.all(handles.map((h) => jobs.get(h)?.done)),
        new Promise((r) => setTimeout(r, Math.max(0, until - now()))),
      ])
      return { ok: true, value: handles.map(view) }
    }
    if (op === 'job.cancel') {
      for (const h of handles) jobs.get(h)?.controller?.abort()
      return { ok: true, value: handles.map(view) }
    }
    if (op === 'status') {
      return { ok: true, value: { mode, sessions: sessions.size, records: records.size, jobs: jobs.size, services: Object.fromEntries([...supervisors].map(([id, s]) => [id, { ...s.status(), drift: s.drift }])), fallingBack: fallbackStatus() } }
    }
    if (op === 'pin') {
      const action = args.action || 'show'
      if (!['show', 'refresh', 'release'].includes(action)) return { ok: false, code: 'bad_args', error: 'pin needs action "show", "refresh" or "release" (service optional)' }
      const ids = args.service ? [args.service] : Object.keys(s.pins)
      const at = new Date(now()).toISOString()
      for (const id of ids) {
        if (action === 'refresh') { const ch = readChannels(stateDir, id); setPin(s, id, { stable: ch.stable, nightly: ch.nightly, at }) }
        if (action === 'release') setPin(s, id, { follow: true, at })
      }
      return { ok: true, value: Object.fromEntries(ids.map((id) => [id, s.pins[id] || null])) }
    }
    if (op === 'release') {
      supervisors.get(args.service)?.release()
      return { ok: true, value: `released ${args.service}` }
    }
    return { ok: false, code: 'unknown_op', error: `anchor has no standard operation "${op}"`, available: Object.keys(STANDARD_OPS) }
  }

  // Every call runs as a job. If it finishes within the deadline the caller
  // gets the result inline; otherwise a handle. Bulk calls run in parallel.
  async function run({ session: handle, calls = [], deadline_ms = DEFAULT_DEADLINE_MS }, onProgress) {
    const s = session(handle)
    const list = Array.isArray(calls) ? calls : [calls]
    const items = await Promise.all(list.map(async (call, index) => {
      const t0 = now()
      const job = { handle: 'job_' + randomBytes(5).toString('hex'), target: call.target, session: s.handle, state: 'running', controller: new AbortController() }
      job.done = runIdempotent({ ...call }, s, (p) => {
        job.progress = p.message
        onProgress?.({ index, target: call.target, message: p.message })
      }, job.controller.signal).then((result) => {
        job.state = result.ok ? 'done' : 'failed'
        if (result._attempts && job.journaled) ledger({ session: s.handle, target: call.target, ok: result.ok, code: result.code, attempts: result._attempts, late: true })
        const { _attempts, ...clean } = result
        job.attempts = _attempts
        job.result = clean
        result = clean
        if (job.journaled) journalJob(job)
        return result
      })
      jobs.set(job.handle, job)
      const winner = await Promise.race([job.done, new Promise((r) => setTimeout(() => r(null), Math.min(call.deadline_ms ?? deadline_ms, 110_000)))])
      s.calls++
      ledger({ session: s.handle, target: call.target, ms: now() - t0, ok: winner?.ok ?? null, code: winner?.code, deferred: !winner, attempts: winner ? job.attempts : undefined })
      if (winner) {
        jobs.delete(job.handle)
        const { _attempts, ...clean } = winner
        return { index, target: call.target, ...clean }
      }
      // Only calls that outlive their deadline become durable jobs.
      job.journaled = true
      journalJob(job)
      return { index, target: call.target, state: 'running', handle: job.handle, hint: `still running. Wait for it with {"target":"anchor:job.wait","args":{"handles":["${job.handle}"],"timeout_ms":60000}}` }
    }))
    maybeCompact()
    return { session: s.handle, items, notes: takeNotes(s) }
  }

  function shutdown() {
    ctxWorker?.terminate()
    for (const sup of supervisors.values()) sup.stop()
  }

  return { hello, discover, describe, run, shutdown, sessions, supervisors, mode, book, hooks }
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}
