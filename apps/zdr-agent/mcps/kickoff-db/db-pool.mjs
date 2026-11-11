// A small pool of read-replica connections, leased per tool call.
//
// One harness serves many sessions at once, and a single MySQL connection runs
// one statement at a time, so a single shared connection queued every session's
// queries behind each other (2026-11-09: 25 calls stacked on it, schema lookups
// waiting 30 s, calls dying at OpenCode's 120 s tool limit while their queries
// still ran). Each tool call now leases its own connection for the whole call,
// and a call that cannot get one in time fails with a clear message instead of
// sitting in a queue past the tool limit.
//
// The replica serves the product too, so the pool is small on purpose.

import { AsyncLocalStorage } from 'node:async_hooks'

export class PoolBusyError extends Error {}

export function createPool({ open, max = 4, acquireMs = 45_000, idleMs = 5 * 60_000, log = () => {} }) {
  const idle = [] // { c, timer }
  const waiters = [] // { resolve, reject, timer }
  let opened = 0
  const leases = new AsyncLocalStorage()

  const drop = (c) => {
    opened--
    try {
      c.destroy?.()
    } catch {}
    wake()
  }

  // A freed slot goes to the oldest waiter, which opens its own connection.
  function wake() {
    while (waiters.length && opened < max) {
      const w = waiters.shift()
      clearTimeout(w.timer)
      opened++
      openFor(w)
    }
  }

  function openFor(w) {
    open().then(
      (c) => {
        c.on?.('error', () => {
          const i = idle.findIndex((e) => e.c === c)
          if (i >= 0) {
            clearTimeout(idle[i].timer)
            idle.splice(i, 1)
            drop(c)
          }
        })
        w.resolve(c)
      },
      (err) => {
        opened--
        w.reject(err)
        wake()
      }
    )
  }

  function acquire() {
    const ready = idle.pop()
    if (ready) {
      clearTimeout(ready.timer)
      return Promise.resolve(ready.c)
    }
    return new Promise((resolve, reject) => {
      const w = { resolve, reject }
      if (opened < max) {
        opened++
        return openFor(w)
      }
      const started = Date.now()
      w.resolve = (c) => {
        const waited = Date.now() - started
        if (waited > 1000) log(`waited ${waited}ms for a database connection`)
        resolve(c)
      }
      w.timer = setTimeout(() => {
        waiters.splice(waiters.indexOf(w), 1)
        reject(
          new PoolBusyError(
            `The production database is busy with ${max} other harness queries and none freed up within ` +
              `${Math.round(acquireMs / 1000)}s. Try again in a minute, or narrow the question.`
          )
        )
      }, acquireMs)
      waiters.push(w)
    })
  }

  function release(c) {
    if (waiters.length) {
      const w = waiters.shift()
      clearTimeout(w.timer)
      return w.resolve(c)
    }
    const timer = setTimeout(() => {
      const i = idle.findIndex((e) => e.c === c)
      if (i >= 0) idle.splice(i, 1)
      opened--
      c.end?.().catch?.(() => {})
    }, idleMs)
    timer.unref?.()
    idle.push({ c, timer })
  }

  return {
    // Runs fn with a lease: every connection() call inside it gets the same
    // connection, held until fn settles.
    run(fn) {
      const lease = { c: null }
      return leases.run(lease, async () => {
        try {
          return await fn()
        } finally {
          if (lease.c) release(lease.c)
          lease.c = null
        }
      })
    },
    async connection() {
      const lease = leases.getStore()
      if (!lease) throw new Error('connection() called outside a pool lease')
      if (!lease.c) lease.c = await acquire()
      return lease.c
    },
    // Hand the lease's connection back before the call ends, for a call that
    // goes on to wait on something other than the database.
    done() {
      const lease = leases.getStore()
      if (!lease?.c) return
      release(lease.c)
      lease.c = null
    },
    // The lease's connection is broken or mid-result: destroy it. The next
    // connection() in the same call gets a fresh one.
    forget() {
      const lease = leases.getStore()
      if (!lease?.c) return
      const c = lease.c
      lease.c = null
      drop(c)
    },
    closeAll() {
      for (const { c, timer } of idle.splice(0)) {
        clearTimeout(timer)
        c.end?.().catch?.(() => {})
      }
    },
    stats: () => ({ opened, idle: idle.length, waiting: waiters.length, max }),
  }
}
