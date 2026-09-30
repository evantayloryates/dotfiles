// Machine-local driver state, outside the repo:
//   ledger.jsonl             one row per op (the harness-agnostic usage record)
//   registry.json            sessions and folders the driver itself created
//   capabilities.json        probe results keyed by app+CLI version
//   pending-learnings.jsonl  candidate findings any harness may append
//   broker/                  the broker session's folder (requests/, results/)
//   locks/                   serialize broker ops across processes

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
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
  mkdirSync(dir, { recursive: true })
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
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, file)
}

export function appendJsonl(file, row) {
  ensureDir(join(file, '..'))
  appendFileSync(file, `${JSON.stringify(row)}\n`)
}

export function readJsonl(file, { tail = Infinity } = {}) {
  if (!existsSync(file)) return []
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean)
  return lines.slice(-tail).flatMap((l) => {
    try {
      return [JSON.parse(l)]
    } catch {
      return []
    }
  })
}

// Registry: what the driver made, so safety gates can tell "mine" from Taylor's.
const EMPTY_REGISTRY = { sessions: {}, folders: {} }
export function loadRegistry() {
  return { ...structuredClone(EMPTY_REGISTRY), ...readJson(REGISTRY, EMPTY_REGISTRY) }
}
export function updateRegistry(mutate) {
  const reg = loadRegistry()
  mutate(reg)
  writeJsonAtomic(REGISTRY, reg)
  return reg
}

// Args worth keeping in the ledger, with message bodies shortened.
export function redactArgs(args = {}) {
  const out = {}
  for (const [k, v] of Object.entries(args)) {
    if (['message', 'bootstrap_prompt', 'prompt', 'text', 'task'].includes(k) && typeof v === 'string') out[k] = `<${v.length} chars>`
    else out[k] = v
  }
  return out
}

// Cross-process lock: mkdir is atomic. Stale after staleMs (a crashed holder).
export async function withLock(name, fn, { timeoutMs = 120_000, staleMs = 180_000 } = {}) {
  ensureDir(LOCK_DIR)
  const dir = join(LOCK_DIR, `${name}.lock`)
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      mkdirSync(dir)
      writeFileSync(join(dir, 'owner'), JSON.stringify({ pid: process.pid, at: Date.now() }))
      break
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
      try {
        if (Date.now() - statSync(dir).mtimeMs > staleMs) {
          rmSync(dir, { recursive: true, force: true })
          continue
        }
      } catch {}
      if (Date.now() > deadline) throw Object.assign(new Error(`lock ${name} busy for ${timeoutMs} ms`), { expected: true, category: 'lock_timeout' })
      await sleep(250)
    }
  }
  try {
    return await fn()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
