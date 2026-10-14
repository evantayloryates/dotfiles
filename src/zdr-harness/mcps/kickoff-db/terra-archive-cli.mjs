#!/usr/bin/env node
// Runner for the Terra webhook archive (terra-archive.mjs).
//
//   run    [--max-minutes 50] [--overlap-days 3] [--days d1,d2] [--concurrency 32] [--max-concurrency 128] [--min-free-gb 15] [--trigger t]
//          Foreground run under the archive lock. Exits 0 when the run ends
//          cleanly (budget, disk floor and signals included), 3 when another
//          run holds the lock, 1 on a failure.
//   start  [same flags]   Start `run` detached and return at once (idempotent:
//          reports the live run when one holds the lock).
//   stop                  SIGTERM the live run; it finishes its batch and records itself.
//   status                One compact JSON summary (no client data).
//   runs   [--n 10]       Past runs, newest first, one line each.
//   log    [run_id] [--n 15]  The last lines of a run's log (counts and errors only).
//   export                Write each Terra user's latest archived state to a ts_ export.
//   tick   [run flags]    What launchd runs every 30 min: decides (decideTick) whether
//          the archive is behind, runs if so, and otherwise exits at once with no
//          network call. Safe to run any time, any number of times.
//
// Self-repair: the lock records the boot session and is ignored after a reboot
// or once its process is gone; runs a crash left 'running' are marked crashed;
// a run that makes no progress for 10 min exits (watchdog) and the next tick
// resumes it; network outages pause the run instead of failing payloads; and
// troubled runs back off 15 min, 30, 60 … 4 h before the next try.
//
// Paths: the database lives in <ZH>/archives/terra-payloads (700/600; holds Terra
// user ids, Kickoff reference ids and connection events, so treat it like an
// export). Run logs live in <ZH>/logs/terra-archive and hold counts, days,
// rates and error codes only, never keys' contents or ids.

import { execFileSync, spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, statfsSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { archiveStatus, decideTick, finishRun, latestStates, openArchive, reconcileCrashed, runArchive, runLogger } from './terra-archive.mjs'
import { terraClient, writeScopesFile } from './terra-payloads.mjs'

const HOME = process.env.HOME || ''
const ZH = process.env.ZDR_HARNESS_ROOT || (HOME.endsWith('/home') ? HOME.slice(0, -5) : join(HOME, '.zdr-harness'))
export const ARCHIVE_DIR = process.env.ZDR_TERRA_ARCHIVE_DIR || join(ZH, 'archives', 'terra-payloads')
export const LOG_DIR = process.env.ZDR_TERRA_ARCHIVE_LOG_DIR || join(ZH, 'logs', 'terra-archive')
const EXPORT_DIR = process.env.ZDR_HARNESS_EXPORT_DIR || join(ZH, 'exports')
const DB_PATH = join(ARCHIVE_DIR, 'archive.db')
const LOCK = join(ARCHIVE_DIR, 'run.lock')
const TICK = join(LOG_DIR, 'tick.json')
const WATCHDOG_MS = 10 * 60_000
const LOG_KEEP_DAYS = 30

function flags(argv) {
  const o = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) o[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
    else o._.push(argv[i])
  }
  return o
}

const alive = (pid) => { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }

// Changes on every boot, so a lock written before a reboot is never mistaken
// for a live run even when its PID has been reused.
const bootId = () => { try { return execFileSync('/usr/sbin/sysctl', ['-n', 'kern.bootsessionuuid'], { encoding: 'utf8' }).trim() } catch { return '' } }
const isRunner = (pid) => { try { return /terra-archive-cli\.mjs/.test(execFileSync('/bin/ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' })) } catch { return false } }

export function lockHolder() {
  try {
    const l = JSON.parse(readFileSync(LOCK, 'utf8'))
    if (!l.pid || !alive(l.pid)) return null
    if (l.boot && l.boot !== bootId()) return null
    return isRunner(l.pid) ? l : null
  } catch {
    return null
  }
}

function takeLock(runId) {
  mkdirSync(ARCHIVE_DIR, { recursive: true, mode: 0o700 })
  for (let i = 0; i < 2; i++) {
    try {
      const fd = openSync(LOCK, 'wx', 0o600)
      writeFileSync(fd, JSON.stringify({ pid: process.pid, run_id: runId, started: new Date().toISOString(), boot: bootId() }))
      closeSync(fd)
      return true
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      if (lockHolder()) return false
      try { unlinkSync(LOCK) } catch {} // the holder died without releasing it
    }
  }
  return false
}

function client() {
  return terraClient({
    region: process.env.KICKOFF_ZDR_AWS_REGION || 'us-west-1',
    accessKeyId: process.env.KICKOFF_ZDR_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.KICKOFF_ZDR_AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.KICKOFF_ZDR_AWS_SESSION_TOKEN,
    endpoint: process.env.ZDR_TERRA_S3_ENDPOINT, // tests only
  })
}

async function run(o) {
  process.umask(0o077) // database, WAL and logs: owner only
  const runId = `tr_${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}_${process.pid}`
  if (!takeLock(runId)) {
    const h = lockHolder()
    console.log(JSON.stringify({ result: 'already_running', run_id: h?.run_id, pid: h?.pid, since: h?.started }))
    return 3
  }
  const { log: write, path: logPath } = runLogger(LOG_DIR, runId)
  let stop = false
  let lastBeat = Date.now()
  const log = (e) => { lastBeat = Date.now(); write(e) }
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { stop = true; log({ event: 'signal', sig }) })
  const db = openArchive(DB_PATH)
  const crashed = reconcileCrashed(db, runId)
  if (crashed) log({ event: 'reconciled', crashed_runs: crashed })
  // Watchdog: no progress for 10 min means something hung below us. Record it
  // and exit; the next tick resumes from what is already committed.
  const watchdog = setInterval(() => {
    if (Date.now() - lastBeat < WATCHDOG_MS) return
    const why = `watchdog: no progress for ${Math.round((Date.now() - lastBeat) / 60_000)} min`
    write({ event: 'watchdog', stop: why })
    try { finishRun(db, runId, 'crashed', { run_id: runId, stop: why }) } catch {}
    try { unlinkSync(LOCK) } catch {}
    process.exit(75)
  }, 30_000)
  watchdog.unref()
  let status = 'failed'
  let summary = {}
  try {
    summary = await runArchive({
      db,
      client: client(),
      log,
      beat: () => { lastBeat = Date.now() },
      runId,
      trigger: o.trigger || 'manual',
      maxMinutes: Number(o['max-minutes'] || 50),
      overlapDays: Number(o['overlap-days'] ?? 3),
      days: typeof o.days === 'string' ? o.days.split(',') : undefined,
      startConcurrency: Number(o.concurrency || 32),
      maxConcurrency: Number(o['max-concurrency'] || 128),
      minFreeGb: Number(o['min-free-gb'] ?? 15),
      shouldStop: () => stop,
    })
    status = 'ok'
    return 0
  } catch (e) {
    summary = { ...summary, error: String(e.message || e).slice(0, 200) }
    log({ event: 'error', error: summary.error })
    return 1
  } finally {
    clearInterval(watchdog)
    finishRun(db, runId, status, summary)
    log({ event: 'end', status, ...summary })
    db.close()
    try { unlinkSync(LOCK) } catch {}
    console.log(JSON.stringify({ run_id: runId, status, log: logPath, ...summary }))
  }
}

function start(argv) {
  const h = lockHolder()
  if (h) return { result: 'already_running', run_id: h.run_id, pid: h.pid, since: h.started }
  mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 })
  const out = openSync(join(LOG_DIR, 'detached.log'), 'a', 0o600)
  // The runner gets the S3 key and paths only, never the caller's other secrets.
  const env = { HOME: process.env.HOME, PATH: '/usr/bin:/bin', ZDR_HARNESS_ROOT: ZH, ZDR_HARNESS_EXPORT_DIR: EXPORT_DIR }
  for (const k of ['KICKOFF_ZDR_AWS_ACCESS_KEY_ID', 'KICKOFF_ZDR_AWS_SECRET_ACCESS_KEY', 'KICKOFF_ZDR_AWS_SESSION_TOKEN', 'KICKOFF_ZDR_AWS_REGION', 'ZDR_TERRA_ARCHIVE_DIR', 'ZDR_TERRA_ARCHIVE_LOG_DIR']) if (process.env[k]) env[k] = process.env[k]
  const child = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', new URL(import.meta.url).pathname, 'run', ...argv], { detached: true, stdio: ['ignore', out, out], env })
  child.unref()
  return { result: 'started', pid: child.pid, note: 'status: terra-archive status; logs: terra-archive log' }
}

// What launchd calls every 30 minutes. Cheap when there is nothing to do.
async function tick(o) {
  process.umask(0o077)
  mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 })
  pruneLogs()
  const note = (decision) => writeFileSync(TICK, JSON.stringify({ at: new Date().toISOString(), ...decision }), { mode: 0o600 })
  const h = lockHolder()
  if (h) { note({ run: false, reason: `running: ${h.run_id}` }); return 0 }
  const db = openArchive(DB_PATH)
  let d
  try {
    reconcileCrashed(db)
    d = decideTick(db, { freeGb: freeGb(), minFreeGb: Number(o['min-free-gb'] ?? 15), overlapDays: Number(o['overlap-days'] ?? 3) })
  } finally {
    db.close()
  }
  note(d)
  if (!d.run) return 0
  console.log(`[tick ${new Date().toISOString().slice(0, 16)}Z] ${d.reason}`)
  const code = await run({ ...o, trigger: 'tick', 'max-minutes': o['max-minutes'] || 120 })
  // Record where the run left things, so status reads the outcome, not the plan.
  const after = openArchive(DB_PATH)
  try { note(decideTick(after, { freeGb: freeGb(), minFreeGb: Number(o['min-free-gb'] ?? 15), overlapDays: Number(o['overlap-days'] ?? 3) })) } finally { after.close() }
  return code
}

// Run logs are counts only; keep a month of them.
function pruneLogs() {
  const cutoff = Date.now() - LOG_KEEP_DAYS * 86_400_000
  for (const f of readdirSync(LOG_DIR)) {
    if (!/^tr_[0-9T]+_\d+\.jsonl$/.test(f)) continue
    try { if (statSync(join(LOG_DIR, f)).mtimeMs < cutoff) unlinkSync(join(LOG_DIR, f)) } catch {}
  }
}

const freeGb = () => { try { const f = statfsSync(ARCHIVE_DIR); return (f.bavail * f.bsize) / 1e9 } catch { return Infinity } }

// One line on whether the archive is healthy, for status and the harness tool.
function health() {
  const h = lockHolder()
  if (h) return `running (${h.run_id})`
  let t = null
  try { t = JSON.parse(readFileSync(TICK, 'utf8')) } catch {}
  if (!t) return 'no scheduled tick yet (is com.taylor.zdr-harness-terra-archive loaded?)'
  const age = (Date.now() - Date.parse(t.at)) / 60_000
  if (age > 120) return `scheduler silent for ${Math.round(age / 60)} h (Mac asleep or LaunchAgent unloaded); last: ${t.reason}`
  return `${t.run ? 'due, ' : ''}${t.reason} (checked ${Math.round(age)} min ago)`
}

function stopRun() {
  const h = lockHolder()
  if (!h) return { result: 'not_running' }
  process.kill(h.pid, 'SIGTERM')
  return { result: 'stopping', run_id: h.run_id, pid: h.pid }
}

function status() {
  if (!existsSync(DB_PATH)) return { archive: 'empty', health: health(), running: lockHolder() }
  const db = openArchive(DB_PATH)
  try {
    const s = archiveStatus(db)
    const running = lockHolder()
    let live = null
    if (running) live = tailLog(running.run_id, 1)[0] || null
    const d = s.days
    return {
      health: health(),
      running: running ? `${running.run_id} (pid ${running.pid}) since ${running.started}; last: ${live || '-'}` : null,
      sealed: d.sealed ? `${d.sealed} days, ${d.first_sealed} .. ${d.last_sealed}` : 'none',
      open: s.open.map((x) => `${x.day} ${x.done}/${x.listed}${x.failed ? ` (${x.failed} failed)` : ''}`),
      archived: `${d.done ?? 0} payloads, ${d.failed ?? 0} failed, ${d.missing ?? 0} missing; ${s.users} users, ${s.states} scope states, ${s.conn_events} connection events`,
      last_run: runs(1)[0] || null,
      disk: diskUse(),
    }
  } finally {
    db.close()
  }
}

// Archive file sizes (database + WAL) and free space on its volume.
function diskUse() {
  const mb = (p) => { try { return statSync(p).size / 1e6 } catch { return 0 } }
  const db = mb(DB_PATH), wal = mb(`${DB_PATH}-wal`)
  let free = null
  try { const f = statfsSync(ARCHIVE_DIR); free = (f.bavail * f.bsize) / 1e9 } catch {}
  return `db ${db.toFixed(0)} MB, wal ${wal.toFixed(0)} MB, ${free == null ? '?' : free.toFixed(1)} GB free`
}

function runs(n = 10) {
  if (!existsSync(DB_PATH)) return []
  const db = openArchive(DB_PATH)
  try {
    return db.prepare('SELECT run_id, started, finished, status, trigger, summary FROM runs ORDER BY started DESC LIMIT ?').all(n).map((r) => {
      const s = r.summary ? JSON.parse(r.summary) : {}
      const mins = r.finished ? ((Date.parse(r.finished) - Date.parse(r.started)) / 60000).toFixed(1) : 'running'
      return `${r.run_id}  ${r.status}  ${r.trigger}  ${mins} min  done ${s.done ?? 0}  failed ${s.failed ?? 0}  throttles ${s.throttles ?? 0}  sealed ${(s.sealed || []).length}  stop: ${s.stop || s.error || '-'}`
    })
  } finally {
    db.close()
  }
}

function tailLog(runId, n = 15) {
  if (!existsSync(LOG_DIR)) return []
  const id = runId || readdirSync(LOG_DIR).filter((f) => /^tr_.*\.jsonl$/.test(f)).sort().pop()?.slice(0, -6)
  if (!id || !/^tr_[0-9T]+_\d+$/.test(id)) return []
  const p = join(LOG_DIR, `${id}.jsonl`)
  if (!existsSync(p)) return []
  return readFileSync(p, 'utf8').trim().split('\n').slice(-n)
}

function exportStates() {
  if (!existsSync(DB_PATH)) throw new Error('archive is empty; run it first')
  const db = openArchive(DB_PATH)
  try {
    const rows = latestStates(db).map((r) => ({
      user_id: r.user_id,
      reference_id: r.reference_id,
      provider: r.provider || null,
      scopes: r.scopes ? r.scopes.split(',') : [],
      active: r.active === -1 ? null : !!r.active,
      state_first_seen: r.first_seen,
      last_seen: r.last_seen,
    }))
    const { id, path } = writeScopesFile(EXPORT_DIR, rows)
    return { id, path, users: rows.length, open: `open -R "${path}"` }
  } finally {
    db.close()
  }
}

const isMain = process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2)
  const o = flags(rest)
  const print = (x) => console.log(typeof x === 'string' ? x : JSON.stringify(x, null, 1))
  try {
    if (cmd === 'run') process.exitCode = await run(o)
    else if (cmd === 'start') print(start(rest))
    else if (cmd === 'stop') print(stopRun())
    else if (cmd === 'status') print(status())
    else if (cmd === 'runs') print(runs(Number(o.n || 10)).join('\n') || 'no runs yet')
    else if (cmd === 'log') print(tailLog(o._[0], Number(o.n || 15)).join('\n') || 'no log')
    else if (cmd === 'export') print(exportStates())
    else if (cmd === 'tick') process.exitCode = await tick(o)
    else {
      console.error('usage: terra-archive run|tick|start|stop|status|runs|log|export [flags]')
      process.exitCode = 2
    }
  } catch (e) {
    console.error(`terra-archive: ${e.message}`)
    process.exitCode = 1
  }
}

export { exportStates, runs, start, status, stopRun, tailLog }
