// Terra webhook archive: a durable, compact, incremental copy of what only the
// raw Terra webhook payloads hold, built before the bucket's 30-day lifecycle
// deletes them.
//
// A day of payloads is far more than this Mac's free disk, so this never mirrors it.
// For every payload it reads only the first 4 KB (HTTP Range; the header and
// the `user` block always sit there, checked on 400 objects across the size
// range) and keeps:
//   - user_day:    per Terra user, per day, per event type: count and bytes
//   - user_states: one row per distinct (provider, scopes, active) state of a
//                  connection, with first/last seen: the scope history
//   - conn_events: connection events in full (auth, deauth, reauth, permission
//                  changes, errors), which are small and rare
// Data rows themselves are already stored in the database (client_integration_*).
//
// Idempotent and resumable: every run re-lists unsealed days (the overlap
// window catches late-arriving keys), fetches only keys not yet done, and seals
// a day once it is older than the overlap window and fully processed (its key
// list is then dropped). Oldest days go first because they expire first.
// Throughput adapts: concurrency grows while requests succeed and halves on
// throttling, timeouts or connection errors; failed keys retry next run.
//
// Outages: a payload that still fails with a network error after its retries is
// deferred (left pending, no attempt counted). When requests stop succeeding the
// run pauses and probes S3 with backoff, resumes when it answers, and ends with
// "network down" if it does not within `outageMinutes`. decideTick() says whether
// a scheduled tick should run at all, so a current archive costs nothing.

import { DatabaseSync } from 'node:sqlite'
import { appendFileSync, chmodSync, mkdirSync, statfsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { recentDays, RETENTION_DAYS, topLevelFields, TerraError } from './terra-payloads.mjs'

export const CONN_TYPES = new Set(['auth', 'deauth', 'user_reauth', 'permission_change', 'connection_error', 'access_revoked', 'google_no_datasource'])
const HEAD_BYTES = 4096
const HEAD_FALLBACK = 65536
const FULL_LIMIT = 5_000_000
const CONN_RAW_LIMIT = 262_144
const MAX_ATTEMPTS = 5

export function openArchive(path) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(path)
  try { chmodSync(path, 0o600) } catch {}
  // status and tick read while a run writes; wait out a brief write lock.
  db.exec('PRAGMA busy_timeout = 10000')
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS days (day TEXT PRIMARY KEY, listed INTEGER DEFAULT 0, listed_at TEXT, list_complete INTEGER DEFAULT 0,
      done INTEGER DEFAULT 0, failed INTEGER DEFAULT 0, missing INTEGER DEFAULT 0, bytes INTEGER DEFAULT 0, sealed INTEGER DEFAULT 0, sealed_at TEXT);
    CREATE TABLE IF NOT EXISTS keys (key TEXT PRIMARY KEY, day TEXT NOT NULL, size INTEGER, modified TEXT, state TEXT DEFAULT 'pending', attempts INTEGER DEFAULT 0, err TEXT);
    CREATE INDEX IF NOT EXISTS keys_day_state ON keys (day, state);
    CREATE TABLE IF NOT EXISTS user_day (user_id TEXT, day TEXT, type TEXT, events INTEGER, bytes INTEGER, PRIMARY KEY (user_id, day, type));
    CREATE TABLE IF NOT EXISTS user_states (user_id TEXT, provider TEXT, scopes TEXT, active INTEGER, reference_id TEXT,
      first_seen TEXT, last_seen TEXT, events INTEGER, PRIMARY KEY (user_id, provider, scopes, active));
    CREATE TABLE IF NOT EXISTS conn_events (key TEXT PRIMARY KEY, day TEXT, modified TEXT, type TEXT, user_id TEXT, provider TEXT, payload TEXT);
    CREATE TABLE IF NOT EXISTS runs (run_id TEXT PRIMARY KEY, started TEXT, finished TEXT, status TEXT, trigger TEXT, summary TEXT);
  `)
  return db
}

// ---- adaptive concurrency (AIMD)

export class Throttle {
  constructor({ start = 32, min = 4, max = 128, onChange = () => {} } = {}) {
    Object.assign(this, { limit: start, min, max, active: 0, okStreak: 0, changes: [], onChange })
  }
  ok() {
    if (++this.okStreak >= 200 && this.limit < this.max) {
      this.limit = Math.min(this.max, this.limit + 8)
      this.okStreak = 0
      this.changes.push(['up', this.limit])
      this.onChange('up', this.limit)
    }
  }
  backoff(reason) {
    this.okStreak = 0
    const next = Math.max(this.min, Math.floor(this.limit / 2))
    if (next !== this.limit) {
      this.limit = next
      this.changes.push([`down:${reason}`, next])
      this.onChange(`down:${reason}`, next)
    }
  }
}

const TRANSIENT = /SlowDown|ServiceUnavailable|InternalError|RequestTimeout|HTTP 5\d\d|HTTP 429|not reachable|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|ETIMEDOUT|EPIPE|socket|fetch failed|abort|timed? ?out/i
const DEFER_LIMIT = 3 // network failures one key may defer in a run before it counts as failed
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- one object -> summary

export async function summarizeObject(client, item) {
  if (!item.size) return { type: 'empty', user_id: null, provider: null, reference_id: null, active: null, scopes: '', raw: null }
  let { buf, total } = await client.head(item.key, HEAD_BYTES)
  let f = topLevelFields(buf.toString('utf8'), ['type', 'user', 'version', 'status'])
  if (!f.fields.user && !f.complete && (total || item.size) > HEAD_BYTES) {
    ;({ buf } = await client.head(item.key, HEAD_FALLBACK))
    f = topLevelFields(buf.toString('utf8'), ['type', 'user', 'version', 'status'])
    if (!f.fields.user && !f.complete && item.size <= FULL_LIMIT) {
      buf = await client.get(item.key)
      f = topLevelFields(buf.toString('utf8'), ['type', 'user', 'version', 'status'])
    }
  }
  const type = typeof f.fields.type === 'string' ? f.fields.type : 'unknown'
  const u = f.fields.user && typeof f.fields.user === 'object' ? f.fields.user : null
  let raw = null
  if (CONN_TYPES.has(type) && item.size <= CONN_RAW_LIMIT) raw = item.size <= buf.length ? buf.toString('utf8') : (await client.get(item.key)).toString('utf8')
  const scopes = u ? (typeof u.scopes === 'string' ? u.scopes.split(',').map((s) => s.trim()).filter(Boolean) : Array.isArray(u.scopes) ? u.scopes : []) : []
  return {
    type,
    user_id: u?.user_id == null ? null : String(u.user_id),
    provider: u?.provider == null ? null : String(u.provider),
    reference_id: u?.reference_id == null ? null : String(u.reference_id),
    active: typeof u?.active === 'boolean' ? (u.active ? 1 : 0) : null,
    scopes: scopes.slice().sort().join(','),
    raw,
  }
}

// ---- the run

export async function runArchive({ db, client, log = () => {}, now = Date.now(), maxMinutes = 50, overlapDays = 3, days: onlyDays, startConcurrency = 32, maxConcurrency = 128, runId, trigger = 'manual', minFreeGb = 15, shouldStop = () => false, beat = () => {}, outageMinutes = 20, probeMs = 15_000 }) {
  const deadline = Date.now() + maxMinutes * 60_000 // wall clock; `now` only fixes which days count
  // Listing and sealing times are compared with `now`-based dates, so stamp them on the run's clock.
  const wall0 = Date.now()
  const clock = () => new Date(now + (Date.now() - wall0)).toISOString()
  const today = new Date(now).toISOString().slice(0, 10)
  const sealBefore = new Date(now - overlapDays * 86_400_000).toISOString().slice(0, 10)
  const throttle = new Throttle({ start: startConcurrency, max: maxConcurrency, onChange: (dir, limit) => log({ event: 'concurrency', dir, limit }) })
  const s = { run_id: runId, days_listed: 0, keys_new: 0, done: 0, failed: 0, missing: 0, deferred: 0, retries: 0, throttles: 0, outages: 0, bytes_read: 0, sealed: [], stop: 'all days current' }
  db.prepare("INSERT OR REPLACE INTO runs (run_id, started, status, trigger) VALUES (?, ?, 'running', ?)").run(runId, new Date(now).toISOString(), trigger)

  const q = {
    day: db.prepare('INSERT OR IGNORE INTO days (day) VALUES (?)'),
    sealedDays: db.prepare('SELECT day FROM days WHERE sealed = 1'),
    addKey: db.prepare('INSERT OR IGNORE INTO keys (key, day, size, modified) VALUES (?, ?, ?, ?)'),
    listed: db.prepare('UPDATE days SET listed = ?, listed_at = ?, list_complete = 1 WHERE day = ?'),
    todo: db.prepare(`SELECT key, size, modified FROM keys WHERE day = ? AND (state = 'pending' OR (state = 'failed' AND attempts < ${MAX_ATTEMPTS})) ORDER BY state = 'failed', size LIMIT 2000`),
    keyDone: db.prepare("UPDATE keys SET state = ?, attempts = attempts + 1, err = ? WHERE key = ?"),
    userDay: db.prepare('INSERT INTO user_day (user_id, day, type, events, bytes) VALUES (?, ?, ?, 1, ?) ON CONFLICT (user_id, day, type) DO UPDATE SET events = events + 1, bytes = bytes + excluded.bytes'),
    state: db.prepare(`INSERT INTO user_states (user_id, provider, scopes, active, reference_id, first_seen, last_seen, events) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT (user_id, provider, scopes, active) DO UPDATE SET events = events + 1, reference_id = excluded.reference_id,
      first_seen = MIN(first_seen, excluded.first_seen), last_seen = MAX(last_seen, excluded.last_seen)`),
    conn: db.prepare('INSERT OR IGNORE INTO conn_events (key, day, modified, type, user_id, provider, payload) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    counts: db.prepare(`SELECT SUM(state = 'done') done, SUM(state = 'failed') failed, SUM(state = 'missing') missing, SUM(state = 'pending') pending,
      SUM(state = 'failed' AND attempts >= ${MAX_ATTEMPTS}) dead, SUM(size) bytes, COUNT(*) total FROM keys WHERE day = ?`),
    dayStats: db.prepare('UPDATE days SET done = ?, failed = ?, missing = ?, bytes = ? WHERE day = ?'),
    seal: db.prepare("UPDATE days SET sealed = 1, sealed_at = ? WHERE day = ?"),
    dropKeys: db.prepare('DELETE FROM keys WHERE day = ?'),
  }
  const tx = (fn) => { db.exec('BEGIN'); try { fn(); db.exec('COMMIT') } catch (e) { db.exec('ROLLBACK'); throw e } }

  const sealed = new Set(q.sealedDays.all().map((r) => r.day))
  // Oldest first: they leave the bucket first. Never look past the lifecycle window.
  const days = (onlyDays || recentDays(31, now)).filter((d) => !sealed.has(d)).sort()
  log({ event: 'start', days: days.length, oldest: days[0], newest: days[days.length - 1], overlapDays, maxMinutes })

  // Free disk on the archive's volume; the run stops cleanly below the floor.
  const freeGb = () => { try { const f = statfsSync(dirname(db.location?.() || '.')); return (f.bavail * f.bsize) / 1e9 } catch { return Infinity } }
  let stopWhy = null
  let lastDiskCheck = 0
  const timeLeft = () => {
    if (stopWhy) return false
    if (shouldStop()) stopWhy = 'stopped by signal'
    else if (Date.now() >= deadline) stopWhy = `time budget (${maxMinutes} min)`
    else if (Date.now() - lastDiskCheck > 30_000) {
      lastDiskCheck = Date.now()
      const g = freeGb()
      if (g < minFreeGb) stopWhy = `disk floor (${g.toFixed(1)} GB free < ${minFreeGb} GB)`
    }
    return !stopWhy
  }
  // Pause on an outage: probe S3 with backoff until it answers (true) or the
  // outage outlasts outageMinutes or the run's budget (false, run stops).
  const pause = async (ms) => { for (const end = Date.now() + ms; Date.now() < end && !shouldStop(); ) await sleep(Math.min(1000, end - Date.now())) }
  const waitForNetwork = async (day, why) => {
    s.outages++
    const t0 = Date.now()
    log({ event: 'outage_start', day, error: String(why).slice(0, 80) })
    for (let i = 0; ; i++) {
      const wait = Math.min(300_000, probeMs * 2 ** i)
      if (Date.now() + wait - t0 > outageMinutes * 60_000 || Date.now() + wait > deadline || !timeLeft()) {
        stopWhy = stopWhy || `network down (no answer from S3 for ${Math.round((Date.now() - t0) / 60_000)} min)`
        log({ event: 'outage_giveup', day, minutes: Math.round((Date.now() - t0) / 60_000) })
        return false
      }
      await pause(wait)
      beat()
      try {
        await client.listPage(day)
        log({ event: 'outage_end', day, seconds: Math.round((Date.now() - t0) / 1000) })
        // The outage, not S3 load, pushed concurrency down: start over from the start value.
        if (throttle.limit < startConcurrency) { throttle.limit = startConcurrency; log({ event: 'concurrency', dir: 'reset after outage', limit: startConcurrency }) }
        return true
      } catch (e) {
        if (/AccessDenied/.test(e.message)) throw e
        log({ event: 'outage_probe', day, attempt: i + 1, error: e.message.slice(0, 80) })
      }
    }
  }
  const deferrals = new Map()
  const erredThisRun = new Set() // a failed key gets one try per run, not five in a row

  const listedDays = new Map(db.prepare('SELECT day, list_complete, listed_at FROM days').all().map((r) => [r.day, r]))
  for (const day of days) {
    if (!timeLeft()) break
    q.day.run(day)
    // Re-list a day until a listing has been taken after the overlap window
    // closed on it: late keys are the reason for the window.
    const prev = listedDays.get(day)
    const settledListing = prev?.list_complete && prev.listed_at > new Date(Date.parse(day) + (overlapDays + 1) * 86_400_000).toISOString()
    let token, n = 0
    let listCut = false
    if (!settledListing) try {
      do {
        // A dropped connection retries the page, not the whole day; a longer
        // outage pauses the run until S3 answers, then carries on from this page.
        let page
        for (let attempt = 0; ; attempt++) {
          try { page = await client.listPage(day, token); beat(); break } catch (e) {
            if (!TRANSIENT.test(e.message)) throw e
            if (attempt < 4) {
              s.retries++
              log({ event: 'list_retry', day, attempt: attempt + 1, error: e.message.slice(0, 80) })
              await sleep(Math.min(16_000, 1000 * 2 ** attempt) * (0.5 + Math.random()))
              continue
            }
            if (!(await waitForNetwork(day, e.message))) break
            attempt = -1
          }
        }
        if (!page) { listCut = true; break }
        tx(() => { for (const it of page.items) { const r = q.addKey.run(it.key, day, it.size, it.modified); s.keys_new += Number(r.changes) } })
        n += page.items.length
        token = page.next
      } while (token && timeLeft())
    } catch (e) {
      if (/AccessDenied/.test(e.message)) throw e
      log({ event: 'list_error', day, error: e.message.slice(0, 120) })
      continue
    }
    if (token || listCut) break
    if (!settledListing) {
      q.listed.run(n, clock(), day)
      s.days_listed++
      log({ event: 'day_listed', day, objects: n })
    }

    // Drain this day's to-do list with a pool sized by the throttle.
    for (;;) {
      const batch = q.todo.all(day).filter((k) => !erredThisRun.has(k.key))
      if (!batch.length || !timeLeft()) break
      const results = []
      const t0 = Date.now()
      let next = 0
      let netFails = 0 // network failures in a row across workers; any success resets it
      let lastNetError = ''
      const worker = async () => {
        while (next < batch.length && timeLeft() && netFails < 16) {
          if (throttle.active >= throttle.limit) { await sleep(5); continue }
          const it = batch[next++]
          throttle.active++
          let attempt = 0
          for (;;) {
            try {
              const r = await summarizeObject(client, it)
              results.push({ it, r })
              throttle.ok()
              netFails = 0
              beat()
              break
            } catch (e) {
              const msg = e instanceof TerraError || e instanceof Error ? e.message : String(e)
              if (/AccessDenied/.test(msg)) { throttle.active--; throw e }
              if (/No such payload/.test(msg)) { results.push({ it, missing: true }); break }
              if (TRANSIENT.test(msg) && attempt < 3) {
                attempt++
                s.retries++
                if (/SlowDown|429|503/.test(msg)) s.throttles++
                throttle.backoff(/SlowDown|429|503/.test(msg) ? 'throttled' : 'transient')
                await sleep(Math.min(8000, 250 * 2 ** attempt) * (0.5 + Math.random()))
                continue
              }
              if (TRANSIENT.test(msg)) {
                // Still failing on the network: leave it pending rather than spend
                // an attempt, unless this one key keeps failing while others succeed.
                netFails++
                lastNetError = msg
                const d = (deferrals.get(it.key) || 0) + 1
                deferrals.set(it.key, d)
                if (d < DEFER_LIMIT) { results.push({ it, deferred: true }); break }
              }
              results.push({ it, error: msg.slice(0, 100) })
              break
            }
          }
          throttle.active--
        }
      }
      await Promise.all(Array.from({ length: maxConcurrency }, worker))
      tx(() => {
        for (const x of results) {
          if (x.deferred) { s.deferred++; continue }
          if (x.missing) { q.keyDone.run('missing', null, x.it.key); s.missing++; continue }
          if (x.error) { q.keyDone.run('failed', x.error, x.it.key); erredThisRun.add(x.it.key); s.failed++; continue }
          const r = x.r
          s.bytes_read += Math.min(x.it.size, HEAD_BYTES)
          // Events without a user (healthchecks, empty objects) count under ''.
          q.userDay.run(r.user_id ?? '', day, r.type, x.it.size)
          if (r.user_id) {
            q.state.run(r.user_id, r.provider ?? '', r.scopes, r.active ?? -1, r.reference_id, x.it.modified || day, x.it.modified || day)
          }
          if (r.raw) q.conn.run(x.it.key, day, x.it.modified, r.type, r.user_id, r.provider, r.raw)
          q.keyDone.run('done', null, x.it.key)
          s.done++
        }
      })
      const secs = (Date.now() - t0) / 1000
      log({ event: 'progress', day, batch: results.length, per_sec: Math.round(results.length / Math.max(secs, 0.001)), done: s.done, failed: s.failed, deferred: s.deferred, retries: s.retries, throttles: s.throttles, concurrency: throttle.limit })
      // Nothing got through: treat it as an outage and wait for S3 to answer.
      if (netFails >= 16 || (results.length && results.every((x) => x.deferred))) {
        if (!(await waitForNetwork(day, lastNetError))) break
      }
    }

    const c = q.counts.get(day)
    q.dayStats.run(c.done || 0, c.failed || 0, c.missing || 0, c.bytes || 0, day)
    const settled = (c.pending || 0) === 0 && (c.failed || 0) === (c.dead || 0)
    if (day < sealBefore && settled) {
      tx(() => { q.seal.run(clock(), day); q.dropKeys.run(day) })
      s.sealed.push(day)
      log({ event: 'day_sealed', day, done: c.done, failed: c.failed || 0, missing: c.missing || 0 })
    }
  }
  timeLeft()
  if (stopWhy) s.stop = stopWhy
  s.concurrency_changes = throttle.changes.length
  s.final_concurrency = throttle.limit
  s.today = today
  return s
}

export function finishRun(db, runId, status, summary) {
  db.prepare('UPDATE runs SET finished = ?, status = ?, summary = ? WHERE run_id = ?').run(new Date().toISOString(), status, JSON.stringify(summary), runId)
}

// ---- compact views for tools (all aggregate)

export function archiveStatus(db) {
  const d = db.prepare(`SELECT COUNT(*) n, SUM(sealed) sealed, MIN(CASE WHEN sealed = 1 THEN day END) first_sealed, MAX(CASE WHEN sealed = 1 THEN day END) last_sealed,
    SUM(done) done, SUM(failed) failed, SUM(missing) missing FROM days`).get()
  const open = db.prepare('SELECT day, listed, done, failed FROM days WHERE sealed = 0 ORDER BY day').all()
  const users = db.prepare('SELECT COUNT(DISTINCT user_id) n FROM user_states').get().n
  const states = db.prepare('SELECT COUNT(*) n FROM user_states').get().n
  const conn = db.prepare('SELECT COUNT(*) n FROM conn_events').get().n
  const last = db.prepare('SELECT run_id, started, finished, status, summary FROM runs ORDER BY started DESC LIMIT 1').get()
  return { days: d, open, users, states, conn_events: conn, last_run: last ? { ...last, summary: last.summary ? JSON.parse(last.summary) : null } : null }
}

export function latestStates(db) {
  // Each user's most recently seen state.
  return db.prepare(`SELECT s.user_id, s.reference_id, s.provider, s.scopes, s.active, s.first_seen, s.last_seen, s.events FROM user_states s
    JOIN (SELECT user_id, MAX(last_seen) m FROM user_states GROUP BY user_id) l ON l.user_id = s.user_id AND l.m = s.last_seen`).all()
}

export function runLogger(dir, runId) {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const path = join(dir, `${runId}.jsonl`)
  return { path, log: (e) => appendFileSync(path, `${JSON.stringify({ t: new Date().toISOString(), ...e })}\n`, { mode: 0o600 }) }
}

// ---- scheduling: should a tick run now?

// Runs left 'running' by a process that no longer holds the lock (crash,
// reboot, kill) are marked crashed so the record and the backoff see them.
export function reconcileCrashed(db, exceptRunId = '') {
  return Number(db.prepare("UPDATE runs SET status = 'crashed', finished = COALESCE(finished, started) WHERE status = 'running' AND run_id != ?").run(exceptRunId).changes)
}

const HOUR = 3_600_000
const parseRun = (r) => ({ ...r, summary: r.summary ? JSON.parse(r.summary) : {} })
const troubled = (r) => r.status === 'failed' || r.status === 'crashed' || /^(network down|watchdog)/.test(r.summary.stop || '')

// The whole policy in one pure function. A tick (launchd, every 30 min) runs
// only when the archive is behind; after trouble it backs off 15 min, 30, 60 …
// up to 4 h (6 h for AccessDenied, which needs a human).
export function decideTick(db, { now = Date.now(), freeGb = Infinity, minFreeGb = 15, freshHours = 6, overlapDays = 3 } = {}) {
  const at = (ms) => new Date(ms).toISOString().slice(0, 16) + 'Z'
  if (freeGb < minFreeGb) return { run: false, reason: `paused: disk floor (${freeGb.toFixed(1)} GB free < ${minFreeGb} GB)` }
  const runs = db.prepare('SELECT run_id, started, finished, status, summary FROM runs ORDER BY started DESC LIMIT 12').all().map(parseRun)
  let k = 0
  while (k < runs.length && troubled(runs[k])) k++
  if (k) {
    const last = runs[0]
    const denied = /AccessDenied/.test(last.summary.error || '')
    const wait = denied ? 6 * HOUR : Math.min(4 * HOUR, 0.25 * HOUR * 2 ** (k - 1))
    const end = Date.parse(last.finished || last.started)
    const what = denied ? 'AccessDenied (check the IAM policy)' : last.summary.stop || last.summary.error || last.status
    if (now - end < wait) return { run: false, reason: `backing off after ${k} troubled run${k > 1 ? 's' : ''} (${what}); next try after ${at(end + wait)}` }
    return { run: true, reason: `retry after ${k} troubled run${k > 1 ? 's' : ''} (${what})` }
  }
  const sealBefore = new Date(now - overlapDays * 86_400_000).toISOString().slice(0, 10)
  const sealed = new Set(db.prepare('SELECT day FROM days WHERE sealed = 1').all().map((r) => r.day))
  const backlog = recentDays(RETENTION_DAYS + 1, now).filter((d) => d < sealBefore && !sealed.has(d)).sort()
  const full = runs.find((r) => r.status === 'ok' && r.summary.stop === 'all days current')
  const since = full ? now - Date.parse(full.finished) : Infinity
  // A complete pass that still left days unsealed would loop; give it an hour.
  if (backlog.length && since > HOUR) return { run: true, reason: `catching up: ${backlog.length} unsealed day${backlog.length > 1 ? 's' : ''} from ${backlog[0]}` }
  if (since > freshHours * HOUR) return { run: true, reason: full ? `refresh: last complete pass ${(since / HOUR).toFixed(1)} h ago` : 'first complete pass' }
  return { run: false, reason: `current: last complete pass ${Math.round(since / 60_000)} min ago` }
}
