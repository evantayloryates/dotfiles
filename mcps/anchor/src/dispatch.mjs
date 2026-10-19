// Dispatcher: hands tickets to a fixer and applies what it reports.
//
// The fixer is any command (ANCHOR_DISPATCH_CMD, a JSON array). It gets one
// argument, the path of a work order (the ticket, recent occurrences, where
// the service and release tool live), and must print one JSON line last:
//   {"outcome":"fixed","release":"<slug>","note":"..."}
//   {"outcome":"failed","reason":"..."}
// The daemon stays the only writer of tickets: fixers report, it records.
//
// Lanes: hotfix tickets are dispatched at once, one per service at a time.
// Standard tickets (when enabled) go one at a time fleet-wide, highest
// priority first. A failed or timed-out attempt reopens the ticket with a
// backoff; after maxAttempts it is escalated to Taylor.

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export class Dispatcher {
  constructor({ book, stateDir, servicesDir, cmd, log = () => {}, notify = () => {}, maxAttempts = 3, timeoutMs = 120_000, intervalMs = 1000, standardLane = false, backoffMs = [0, 2000, 10_000] }) {
    Object.assign(this, { book, stateDir, servicesDir, cmd, log, notify, maxAttempts, timeoutMs, intervalMs, standardLane, backoffMs })
    this.busyServices = new Set()
    this.standardRunning = 0
    this.notBefore = new Map() // ticket id -> earliest next attempt
    this.running = new Map() // ticket id -> child
    mkdirSync(join(stateDir, 'dispatch'), { recursive: true })
    // Tickets left "dispatched" by a previous daemon have no worker now.
    for (const t of book.list({ state: 'dispatched' })) book.setState(t.id, 'open', { note: 'dispatcher restarted; attempt abandoned' })
  }

  start() {
    if (!this.cmd) return this
    this.timer = setInterval(() => this.tick(), this.intervalMs)
    this.timer.unref()
    return this
  }

  stop() {
    clearInterval(this.timer)
    for (const c of this.running.values()) c.kill('SIGTERM')
  }

  kick() {
    if (this.cmd) setImmediate(() => this.tick())
  }

  tick() {
    const ready = (t) => ['open', 'reopened'].includes(t.state) && (this.notBefore.get(t.id) || 0) <= Date.now() && !this.running.has(t.id)
    for (const t of this.book.list({ lane: 'hotfix', active: true })) {
      if (ready(t) && !this.busyServices.has(t.service)) this.dispatch(t)
    }
    if (!this.standardLane) return
    for (const t of this.book.list({ lane: 'standard', active: true })) {
      if (this.standardRunning >= 1) break
      if (ready(t) && !this.busyServices.has(t.service)) this.dispatch(t)
    }
  }

  dispatch(ticket) {
    const t = this.book.get(ticket.id)
    const attempt = (t.attempts || 0) + 1
    this.busyServices.add(t.service)
    if (t.lane === 'standard') this.standardRunning++
    this.book.setState(t.id, 'dispatched', { attempts: attempt, note: `attempt ${attempt}` })
    const order = join(this.stateDir, 'dispatch', `${t.id}-${attempt}.json`)
    writeFileSync(order, JSON.stringify({
      ticket: this.book.view(t),
      occurrences: t.occurrences.slice(-5),
      attempt,
      servicesDir: this.servicesDir,
      stateDir: this.stateDir,
      instructions: t.lane === 'hotfix'
        ? 'Restore service: the smallest change that stops this failure. Release it with `release.mjs release <service> --hotfix`. A root-cause ticket is opened for the full fix.'
        : 'Fix the root cause and release it as a nightly with `release.mjs release <service>`.',
    }, null, 1))
    const [bin, ...args] = this.cmd
    const child = spawn(bin, [...args, order], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env })
    this.running.set(t.id, child)
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    const timer = setTimeout(() => child.kill('SIGKILL'), this.timeoutMs)
    child.on('exit', (code, signal) => {
      clearTimeout(timer)
      this.running.delete(t.id)
      this.busyServices.delete(t.service)
      if (t.lane === 'standard') this.standardRunning--
      let report = null
      try { report = JSON.parse(out.trim().split('\n').pop()) } catch {}
      if (report?.outcome === 'fixed' && report.release) {
        this.book.setState(t.id, 'fixed', { fixedIn: report.release, note: report.note || `fixed in ${report.release}`, ...(report.session ? { session: report.session } : {}) })
        if (t.lane === 'hotfix') {
          this.book.record({ kind: 'root_cause', service: t.service, op: t.op, fingerprint: `root cause: ${t.fingerprint}`, title: `Root cause behind hotfix ${t.id} (${report.release})`, links: [t.id] })
        }
      } else {
        const reason = (report?.session && !report.reason?.includes(report.session) ? `${report.reason} (session ${report.session}) ` : '') || report?.reason || (signal ? `fixer killed (${signal}) after ${this.timeoutMs} ms` : `fixer exited ${code}: ${err.trim().split('\n').pop() || 'no report'}`)
        if (attempt >= this.maxAttempts || report?.fatal) {
          this.book.setState(t.id, 'escalated', { note: `gave up after ${attempt} attempts: ${reason}` })
          this.notify('ESCALATED', `${t.id} ${t.service}: ${t.title} (${attempt} attempts failed; last: ${reason})`, t.id)
        } else {
          this.notBefore.set(t.id, Date.now() + (this.backoffMs[attempt] ?? this.backoffMs.at(-1)))
          this.book.setState(t.id, 'open', { note: `attempt ${attempt} failed: ${reason}` })
        }
      }
      this.kick()
    })
  }
}
