// One supervised child process per service: lazy start, restart policy,
// quarantine. Policy (from the design):
// - a crash gets one immediate restart;
// - the same failure fingerprint twice in a row stops immediate restarts and
//   moves to backoff;
// - more than MAX_RESTARTS within a window (any fingerprints) is flapping:
//   the service is quarantined and calls fail fast;
// - an operation that crashed the process twice is quarantined on its own.

import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HOST = join(dirname(fileURLToPath(import.meta.url)), 'service-host.mjs')
const BACKOFF_MS = [5_000, 30_000, 120_000]
const MAX_RESTARTS = 4
const START_TIMEOUT_MS = 10_000

// The useful line of a crash: the thrown error, not Node's trailing banner.
export function errorLine(stderr) {
  const lines = String(stderr || '').trim().split('\n').map((l) => l.trim()).filter(Boolean)
  return lines.filter((l) => /^(\w*Error|Uncaught|throw )|Error:/.test(l) && !/^Node\.js v/.test(l)).pop() || lines.filter((l) => !/^Node\.js v/.test(l)).pop() || ''
}

export function fingerprint(text) {
  return String(text || 'unknown')
    .replace(/0x[0-9a-f]+/gi, '#')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

export class ServiceSupervisor {
  constructor({ id, dir, declared, onEvent, now = () => Date.now() }) {
    Object.assign(this, { id, dir, declared, onEvent, now })
    this.state = 'stopped' // stopped | starting | ready | backoff | quarantined
    this.child = null
    this.ops = null
    this.pending = new Map() // call id -> {resolve, op, onProgress}
    this.crashes = [] // {at, fp, op}
    this.opCrashes = new Map() // op -> count
    this.quarantinedOps = new Set()
    this.opFp = new Map() // op -> fingerprint that got it quarantined
    this.lastFp = null
    this.sameFpStreak = 0
    this.backoffUntil = 0
    this.startedAt = 0
    this.coldStartMs = null
    this.seq = 0
    this.starting = null
    this.lastStderr = ''
    this.zombies = 0 // timed-out calls whose handlers may still be running
    // Operations in flight together when the process crashed: any of them may
    // be the cause. None gets a strike; each runs alone until it has an
    // outcome of its own, which settles who crashed it.
    this.suspects = new Set()
    this.soloBusy = false
  }

  windowMs() {
    // Adapts to the service: 10x its measured cold start, at least 30 s.
    return Math.max(30_000, (this.coldStartMs || 0) * 10)
  }

  status() {
    return {
      state: this.state,
      coldStartMs: this.coldStartMs,
      recentCrashes: this.crashes.length,
      quarantinedOps: [...this.quarantinedOps],
      backoffUntil: this.state === 'backoff' ? new Date(this.backoffUntil).toISOString() : null,
    }
  }

  async ensureStarted() {
    if (this.state === 'ready') return
    if (this.state === 'quarantined') throw new ServiceError('quarantined', `${this.id} is quarantined after repeated crashes`)
    if (this.state === 'backoff') {
      if (this.now() < this.backoffUntil) {
        throw new ServiceError('backoff', `${this.id} is restarting after a repeated failure; retry after ${new Date(this.backoffUntil).toISOString()}`)
      }
    }
    if (!this.starting) this.starting = this.#start().finally(() => (this.starting = null))
    return this.starting
  }

  #start() {
    this.state = 'starting'
    const t0 = this.now()
    return new Promise((resolve, reject) => {
      const child = fork(HOST, [this.dir], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
      this.child = child
      this.lastStderr = ''
      child.stderr.on('data', (d) => (this.lastStderr = (this.lastStderr + d).slice(-2000)))
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new ServiceError('start_timeout', `${this.id} did not become ready in ${START_TIMEOUT_MS} ms`))
      }, START_TIMEOUT_MS)
      child.on('message', (msg) => {
        if (msg.type === 'ready') {
          clearTimeout(timer)
          this.ops = msg.ops
          this.coldStartMs = this.now() - t0
          this.startedAt = this.now()
          this.state = 'ready'
          this.onEvent?.({ type: 'started', service: this.id, coldStartMs: this.coldStartMs })
          resolve()
        } else if (msg.type === 'result') {
          const p = this.pending.get(msg.id)
          if (p) {
            this.pending.delete(msg.id)
            p.resolve(msg.ok ? { ok: true, value: msg.value } : { ok: false, error: msg.error, code: 'service_error' })
          }
        } else if (msg.type === 'progress') {
          this.pending.get(msg.id)?.onProgress?.(msg)
        }
      })
      child.on('exit', (code, signal) => {
        clearTimeout(timer)
        const wasStarting = this.state === 'starting'
        this.child = null
        this.#onCrash({ code, signal, wasStarting })
        if (wasStarting) reject(new ServiceError('start_failed', `${this.id} exited during start (${signal || code}): ${errorLine(this.lastStderr)}`))
      })
    })
  }

  #onCrash({ code, signal, wasStarting }) {
    if (this.state === 'stopping') {
      this.state = 'stopped'
      return
    }
    const line = errorLine(this.lastStderr) || `exit ${signal || code}`
    const fp = fingerprint(`${wasStarting ? 'start:' : ''}${line}`)
    const inflightOps = [...this.pending.values()].map((p) => p.op)
    const distinct = new Set(inflightOps.filter((op) => op !== '(sessionContext)'))
    const shared = distinct.size > 1
    const inflightSessions = [...new Set([...this.pending.values()].map((p) => p.session).filter(Boolean))]
    const at = this.now()
    this.crashes = this.crashes.filter((c) => at - c.at < this.windowMs())
    this.crashes.push({ at, fp, ops: inflightOps })
    // Fail every call that was in flight: the outcome of an action is unknown.
    for (const [id, p] of this.pending) {
      p.resolve({ ok: false, code: 'crashed', error: `${this.id} crashed while handling ${shared ? [...distinct].join(', ') : p.op}; outcome unknown`, fingerprint: fp, ...(shared ? { shared: true } : {}) })
      this.pending.delete(id)
    }
    // Operation-level quarantine: the op running alone at a crash gets a strike.
    if (shared) for (const op of distinct) this.suspects.add(op)
    for (const op of shared ? [] : distinct) {
      const n = (this.opCrashes.get(op) || 0) + 1
      this.opCrashes.set(op, n)
      if (n >= 2 && !this.quarantinedOps.has(op)) {
        this.quarantinedOps.add(op)
        this.opFp.set(op, fp)
        this.onEvent?.({ type: 'op_quarantined', service: this.id, op, fingerprint: fp })
      }
    }
    // A crash pinned on an operation that is now quarantined is explained:
    // restart the service immediately for its other operations.
    const isolated = inflightOps.length > 0 && inflightOps.every((op) => this.quarantinedOps.has(op))
    // A shared crash is not yet anyone's: it waits for the solo reruns rather
    // than counting toward a same-failure backoff of the whole service.
    if (!shared) {
      this.sameFpStreak = isolated ? 0 : fp === this.lastFp ? this.sameFpStreak + 1 : 1
      this.lastFp = isolated ? null : fp
    }
    const event = { service: this.id, fingerprint: fp, exit: signal || code, restartsInWindow: this.crashes.length, ops: inflightOps, sessions: inflightSessions, stderr: this.lastStderr.slice(-600) }
    if (this.crashes.length > MAX_RESTARTS) {
      this.state = 'quarantined'
      this.onEvent?.({ type: 'quarantined', ...event, reason: `flapping: ${this.crashes.length} crashes in ${Math.round(this.windowMs() / 1000)} s` })
    } else if (this.sameFpStreak >= 2) {
      const step = BACKOFF_MS[Math.min(this.sameFpStreak - 2, BACKOFF_MS.length - 1)]
      this.state = 'backoff'
      this.backoffUntil = at + step
      this.onEvent?.({ type: 'backoff', ...event, retryInMs: step, hotfix: true })
    } else {
      this.state = 'stopped' // next call restarts it immediately
      this.onEvent?.({ type: 'crashed', ...event, restart: 'immediate' })
    }
  }

  // rerunShared: the caller may repeat this operation (its idempotency allows
  // it), so a crash it merely shared is retried once, alone.
  async call(op, args, opts = {}) {
    const r = await this.#call(op, args, opts)
    if (r.code === 'crashed' && r.shared && opts.rerunShared) return { ...(await this.#call(op, args, opts)), rerunAfterSharedCrash: true }
    return r
  }

  async #call(op, args, { session, onProgress, signal, timeoutMs, idempotencyKey }) {
    if (this.quarantinedOps.has(op)) {
      return { ok: false, code: 'op_quarantined', fingerprint: this.opFp.get(op), error: `${this.id}:${op} is disabled after crashing the service twice` }
    }
    const solo = this.suspects.has(op)
    while (this.soloBusy || (solo && this.pending.size)) await new Promise((r) => setTimeout(r, 10))
    if (solo) this.soloBusy = true
    const settle = (r) => {
      if (!solo) return r
      this.soloBusy = false
      if (r.code !== 'crashed') this.suspects.delete(op)
      return r
    }
    try {
      await this.ensureStarted()
    } catch (err) {
      return settle({ ok: false, code: err.code || 'unavailable', fingerprint: this.lastFp || undefined, error: err.message })
    }
    if (this.quarantinedOps.has(op)) return settle({ ok: false, code: 'op_quarantined', fingerprint: this.opFp.get(op), error: `${this.id}:${op} is disabled after crashing the service twice` })
    if (!this.ops[op]) return settle({ ok: false, code: 'unknown_op', error: `${this.id} has no operation "${op}"` })
    const id = ++this.seq
    return new Promise((resolve) => {
      let timer
      const done = (r) => {
        clearTimeout(timer)
        resolve(settle(r))
      }
      this.pending.set(id, { resolve: done, op, onProgress, session })
      if (timeoutMs) {
        timer = setTimeout(() => {
          if (!this.pending.has(id)) return
          this.pending.delete(id)
          this.child?.send({ type: 'cancel', id })
          this.zombies++
          // Handlers that ignore cancellation leak inside the process. After 3,
          // recycle the process as soon as no other call is in flight.
          if (this.zombies >= 3) this.#recycleWhenIdle()
          done({ ok: false, code: 'timeout', error: `${this.id}:${op} timed out after ${timeoutMs} ms` })
        }, timeoutMs)
      }
      signal?.addEventListener('abort', () => {
        if (!this.pending.has(id)) return
        this.pending.delete(id)
        this.child?.send({ type: 'cancel', id })
        done({ ok: false, code: 'cancelled', error: 'cancelled' })
      }, { once: true })
      this.child.send({ type: 'call', id, op, args, session, idempotencyKey })
    })
  }

  async sessionContext(ctx, timeoutMs = 300) {
    try {
      await this.ensureStarted()
    } catch {
      return null
    }
    const id = ++this.seq
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve(null)
      }, timeoutMs)
      this.pending.set(id, { op: '(sessionContext)', resolve: (r) => { clearTimeout(timer); resolve(r.ok ? r.value : null) } })
      this.child.send({ type: 'sessionContext', id, ctx })
    })
  }

  #recycleWhenIdle() {
    if (this.recycling) return
    this.recycling = setInterval(() => {
      if (this.pending.size) return
      clearInterval(this.recycling)
      this.recycling = null
      this.zombies = 0
      this.onEvent?.({ type: 'recycled', service: this.id, reason: 'timed-out handlers' })
      this.stop()
    }, 200)
  }

  release() {
    // Operator or hotfix action: clear quarantine and backoff.
    this.state = this.child ? 'ready' : 'stopped'
    this.crashes = []
    this.sameFpStreak = 0
    this.quarantinedOps.clear()
    this.opCrashes.clear()
  }

  stop() {
    if (this.child) {
      this.state = 'stopping'
      this.child.kill('SIGTERM')
    }
  }
}

export class ServiceError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}
