// Machine-local driver state, outside the repo:
//   ledger.jsonl             one row per op (the harness-agnostic usage record)
//   registry.json            sessions and folders the driver itself created
//   capabilities.json        probe results keyed by app+CLI version
//   pending-learnings.jsonl  candidate findings any harness may append
//   broker/                  the broker session's folder (requests/, results/)
//   locks/                   serialize broker ops across processes

import { appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import { sleep } from './paths.mjs'

export const STATE_DIR = process.env.CLAUDE_DRIVER_STATE_DIR || join(homedir(), '.local', 'state', 'claude-driver')
export const LEDGER = join(STATE_DIR, 'ledger.jsonl')
export const REGISTRY = join(STATE_DIR, 'registry.json')
export const CAPABILITIES = join(STATE_DIR, 'capabilities.json')
export const PENDING_LEARNINGS = join(STATE_DIR, 'pending-learnings.jsonl')
export const BROKER_DIR = join(STATE_DIR, 'broker')
export const PROBE_DIR = join(STATE_DIR, 'probe')
export const LOCK_DIR = join(STATE_DIR, 'locks')

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  return dir
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return structuredClone(fallback)
  }
}

export function writeJsonAtomic(file, data) {
  ensureDir(join(file, '..'))
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
  renameSync(tmp, file)
}

export function appendJsonl(file, row) {
  ensureDir(join(file, '..'))
  appendFileSync(file, `${JSON.stringify(row)}\n`, { mode: 0o600 })
}

export function readJsonl(file, { tail = Infinity } = {}) {
  if (!existsSync(file)) return []
  if (Number.isFinite(tail)) {
    const rows = []
    if (tail <= 0) return rows
    for (const row of reverseJsonl(file)) { rows.push(row); if (rows.length >= tail) break }
    return rows.reverse()
  }
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean)
  return lines.slice(-tail).flatMap((l) => {
    try {
      return [JSON.parse(l)]
    } catch {
      return []
    }
  })
}

// Scan shared evidence backwards with bounded memory, so a frequent status
// or memory query does not load months of operation history into RAM.
export function* reverseJsonl(file, { maxRecordBytes = 1024 * 1024 } = {}) {
  if (!existsSync(file)) return
  const fd = openSync(file, 'r')
  let position = fstatSync(fd).size, carry = Buffer.alloc(0), skipping = false
  try {
    while (position > 0) {
      const size = Math.min(position, 64 * 1024), chunk = Buffer.alloc(size)
      position -= size
      const count = readSync(fd, chunk, 0, size, position)
      const data = Buffer.concat([chunk.subarray(0, count), carry])
      let end = data.length
      for (let i = data.lastIndexOf(10, end - 1); i >= 0; i = data.lastIndexOf(10, end - 1)) {
        const line = data.subarray(i + 1, end)
        if (skipping) skipping = false
        else if (line.length && line.length <= maxRecordBytes) {
          try { yield JSON.parse(line.toString('utf8')) } catch {}
        }
        end = i
        if (!end) break
      }
      carry = Buffer.from(data.subarray(0, end))
      if (carry.length > maxRecordBytes) { carry = Buffer.alloc(0); skipping = true }
    }
    if (!skipping && carry.length) { try { yield JSON.parse(carry.toString('utf8')) } catch {} }
  } finally { closeSync(fd) }
}

// Registry: what the driver made, so safety gates can tell "mine" from Taylor's.
const EMPTY_REGISTRY = { sessions: {}, folders: {} }
export function loadRegistry() {
  return { ...structuredClone(EMPTY_REGISTRY), ...readJson(REGISTRY, EMPTY_REGISTRY) }
}
export async function updateRegistry(mutate) {
  return withLock('registry', () => {
    const reg = loadRegistry()
    mutate(reg)
    writeJsonAtomic(REGISTRY, reg)
    return reg
  })
}

// Args worth keeping in the ledger, with message bodies shortened.
export function redactArgs(args = {}) {
  const out = {}
  for (const [k, v] of Object.entries(args)) {
    if (['message', 'first_message', 'bootstrap_prompt', 'prompt', 'text', 'task'].includes(k) && typeof v === 'string') out[k] = `<${v.length} chars>`
    else if (v && typeof v === 'object') out[k] = Array.isArray(v) ? v.map(x => typeof x === 'object' && x ? redactArgs(x) : x) : redactArgs(v)
    else out[k] = v
  }
  return out
}

// Cross-process lock: mkdir is atomic. Stale after staleMs (a crashed holder).
export async function withLock(name, fn, { timeoutMs = 120_000, signal } = {}) {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('invalid lock name')
  ensureDir(LOCK_DIR)
  const dir = join(LOCK_DIR, `${name}.lock`)
  const reaper = join(LOCK_DIR, `${name}.reap`)
  const deadline = Date.now() + timeoutMs
  const token = randomUUID()
  const cancelled = () => { if (signal?.aborted) throw Object.assign(new Error('cancelled before dispatch'), { expected: true, category: 'cancelled' }) }
  for (;;) {
    cancelled()
    if (existsSync(reaper)) {
      // A crashed reaper is only a brief directory-removal critical section.
      try { if (Date.now() - statSync(reaper).mtimeMs > 5000) rmSync(reaper, { recursive: true, force: true }) } catch {}
      if (Date.now() > deadline) throw Object.assign(new Error(`lock ${name} busy for ${timeoutMs} ms`), { expected: true, category: 'lock_timeout' })
      await sleep(50)
      continue
    }
    try {
      mkdirSync(dir)
      writeFileSync(join(dir, 'owner'), JSON.stringify({ pid: process.pid, at: Date.now(), token }), { mode: 0o600 })
      break
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
      try {
        const owner = readJson(join(dir, 'owner'), null)
        let dead = false
        if (owner?.pid) {
          try { process.kill(owner.pid, 0) } catch (e) { dead = e.code === 'ESRCH' }
        }
        // A live holder never loses its lock on age alone. Give a new mkdir
        // time to publish its owner before treating an ownerless lock as dead.
        if (dead || (!owner && Date.now() - statSync(dir).mtimeMs > 5000)) {
          // Serialize reclamation and recheck ownership: another contender
          // may already have recovered this lock since we read its owner.
          try { mkdirSync(reaper) } catch { continue }
          try {
            const current = readJson(join(dir, 'owner'), null)
            let currentDead = false
            if (current?.pid) { try { process.kill(current.pid, 0) } catch(e) { currentDead = e.code === 'ESRCH' } }
            if (currentDead || (!current && Date.now() - statSync(dir).mtimeMs > 5000)) rmSync(dir, { recursive: true, force: true })
          } finally { rmSync(reaper, { recursive: true, force: true }) }
          continue
        }
      } catch {}
      if (Date.now() > deadline) throw Object.assign(new Error(`lock ${name} busy for ${timeoutMs} ms`), { expected: true, category: 'lock_timeout' })
      await sleep(250)
    }
  }
  try {
    cancelled()
    return await fn()
  } finally {
    if (readJson(join(dir, 'owner'), null)?.token === token) rmSync(dir, { recursive: true, force: true })
  }
}
