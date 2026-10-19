// Alerts that are hard to miss. One alert per episode (a key such as
// "degraded" or "ticket:T-4"), repeated every ANCHOR_ALERT_REPEAT_MS (default
// one hour) until Taylor clicks it or the episode resolves, then one
// "resolved" alert. State is a journal, so repeats survive restarts.
//
// Backend "notify" (default) uses the notify-macos skill's helper with
// terminal-notifier: --group per episode replaces the previous banner, and a
// click runs a fixed acknowledgement command for that episode only. Whether
// alerts stay on screen until dismissed is Taylor's macOS setting for
// terminal-notifier (Alerts versus Banners). Backend "log" only records.
//
//   node anchor/alerts.mjs ack <episode-id>      (what a click runs)
//   node anchor/alerts.mjs raise <key> <title> <message>
//   node anchor/alerts.mjs resolve <key> <message>
//   node anchor/alerts.mjs list

import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { Journal } from './store.mjs'
import { paths } from './paths.mjs'

const NOTIFY = '/Users/taylor/.claude/skills/notify-macos/scripts/notify.py'
const SELF = fileURLToPath(import.meta.url)

export class Alerts {
  constructor(stateDir, { backend = process.env.ANCHOR_ALERT_BACKEND || 'notify', repeatMs = Number(process.env.ANCHOR_ALERT_REPEAT_MS || 3600_000), log = () => {} } = {}) {
    mkdirSync(stateDir, { recursive: true })
    Object.assign(this, { stateDir, backend, repeatMs, log })
    this.journal = new Journal(join(stateDir, 'alerts.jsonl'))
    this.refresh()
  }

  // Several processes share the journal (the daemon, degraded front ends, a
  // click's ack), so every decision starts from what is on disk.
  refresh() {
    this.episodes = new Map() // key -> {id, key, title, message, raisedAt, lastSentAt, sent, acked}
    for (const r of this.journal.replay()) this.#apply(r)
  }

  #apply(r) {
    if (r.t === 'raise') this.episodes.set(r.key, { id: r.id, key: r.key, title: r.title, message: r.message, raisedAt: r.at, lastSentAt: r.at, sent: 1, acked: false })
    const e = [...this.episodes.values()].find((x) => x.id === r.id)
    if (!e) return
    if (r.t === 'repeat') { e.lastSentAt = r.at; e.sent++ }
    if (r.t === 'ack') e.acked = true
    if (r.t === 'resolve') this.episodes.delete(e.key)
  }

  #write(r) {
    r.at ||= new Date().toISOString()
    this.journal.append(r)
    this.#apply(r)
  }

  #send(kind, e, message) {
    appendFileSync(join(this.stateDir, 'notifications.log'), `${new Date().toISOString()} ${kind} ${e.key} ${e.id} ${message}\n`)
    if (this.backend !== 'notify') return
    const args = [NOTIFY, '--backend', 'terminal-notifier', '--title', kind === 'RESOLVED' ? `Resolved: ${e.title}` : e.title, '--message', message, '--group', `anchor-${e.id}`]
    // Silent by default (Taylor, 2026-10-19: muted until his wireless setup);
    // ANCHOR_ALERT_SOUND=on brings the sounds back.
    if (process.env.ANCHOR_ALERT_SOUND === 'on') args.push('--sound', kind === 'RESOLVED' ? 'Glass' : 'Sosumi')
    // The click acknowledges this episode only: a fixed command, the episode
    // id is ours (hex), nothing from untrusted text.
    if (kind !== 'RESOLVED') args.push('--execute', `/usr/bin/env ANCHOR_STATE_DIR=${this.stateDir} ${process.execPath} ${SELF} ack ${e.id}`)
    // Detached and never killed: with a click action, terminal-notifier stays
    // alive until the alert is clicked or dismissed, and runs the action then.
    const child = spawn('/usr/bin/python3', args, { detached: true, stdio: 'ignore' })
    child.on('error', (err) => this.log(`alert send failed: ${err.message}`))
    child.unref()
  }

  raise(key, title, message) {
    this.refresh()
    const open = this.episodes.get(key)
    if (open) return open // one alert per episode
    const id = randomBytes(6).toString('hex')
    this.#write({ t: 'raise', id, key, title, message })
    const e = this.episodes.get(key)
    this.#send('ALERT', e, message)
    return e
  }

  resolve(key, message) {
    this.refresh()
    const e = this.episodes.get(key)
    if (!e) return null
    this.#write({ t: 'resolve', id: e.id })
    this.#send('RESOLVED', e, message)
    return e
  }

  ack(id) {
    this.refresh()
    const e = [...this.episodes.values()].find((x) => x.id === id)
    if (!e || e.acked) return e
    this.#write({ t: 'ack', id })
    return e
  }

  // Called on a timer: repeat every open, unacknowledged episode that is due.
  // Acks written by another process (a click) are picked up from the journal.
  tick(now = Date.now()) {
    this.refresh()
    for (const e of this.episodes.values()) {
      if (e.acked || now - Date.parse(e.lastSentAt) < this.repeatMs) continue
      this.#write({ t: 'repeat', id: e.id })
      this.#send('REPEAT', e, `${e.message} (still open since ${e.raisedAt.slice(11, 16)} UTC; click to acknowledge)`)
    }
  }

  start() {
    this.timer = setInterval(() => this.tick(), Math.min(30_000, this.repeatMs / 3))
    this.timer.unref()
    return this
  }

  list() {
    this.refresh()
    return [...this.episodes.values()]
  }
}

if (process.argv[1] === SELF) {
  const [cmd, a, b, c] = process.argv.slice(2)
  const alerts = new Alerts(paths().stateDir)
  if (cmd === 'ack') console.log(JSON.stringify(alerts.ack(a) || { error: 'no such open episode' }))
  else if (cmd === 'raise') console.log(JSON.stringify(alerts.raise(a, b, c)))
  else if (cmd === 'resolve') console.log(JSON.stringify(alerts.resolve(a, b) || { error: 'no open episode' }))
  else console.log(JSON.stringify(alerts.list(), null, 1))
}
