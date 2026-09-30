// Tier B: a desktop session the driver owns ("claude-driver-broker") runs the
// app's own ccd_* tools on request. Only desktop-hosted sessions have those
// tools, so every non-desktop harness goes through here.
//
// Request path: write requests/<id>.json → deliver "claude-driver request
// <id>" into the broker's live process (peer protocol) → poll results/<id>.json
// (bounded) → the caller verifies against disk ground truth.

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DriverError, sleep } from './paths.mjs'
import { getRecord, liveByHost } from './sessions.mjs'
import { BROKER_DIR, ensureDir, readJson, withLock, writeJsonAtomic } from './state.mjs'
import { deliver } from './peer.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const TEMPLATE = join(HERE, '..', 'broker-template', 'CLAUDE.md')
export const BROKER_TITLE = 'claude-driver-broker'
export const BROKER_MODEL = process.env.CLAUDE_DRIVER_BROKER_MODEL || 'claude-haiku-4-5-20251001'
const BROKER_FILE = join(BROKER_DIR, 'broker.json')
const REQ_DIR = join(BROKER_DIR, 'requests')
const RES_DIR = join(BROKER_DIR, 'results')

export const BROKER_OPS = [
  'set_session_title', 'archive_session', 'unarchive_session', 'set_session_model', 'set_session_effort', 'set_session_permission_mode',
  'send_message', 'stop_session', 'get_session', 'list_sessions', 'delete_session', 'export_transcript',
  'set_pinned', 'list_groups', 'create_group', 'rename_group', 'move_sessions', 'set_unread', 'mark_completed', 'get_window_layout',
]

export function protocolVersion() {
  return readFileSync(TEMPLATE, 'utf8').match(/^Protocol version: (\d+)/m)?.[1] || '1'
}

// The template names absolute paths so the broker's Bash never depends on PATH.
function renderTemplate() {
  const stable = join(homedir(), 'dotfiles', 'src', 'claude-driver', 'scripts', 'broker-wait.mjs')
  const wait = existsSync(stable) ? stable : join(HERE, '..', 'scripts', 'broker-wait.mjs')
  const node = existsSync('/opt/homebrew/bin/node') ? '/opt/homebrew/bin/node' : process.execPath
  return readFileSync(TEMPLATE, 'utf8').replaceAll('{{NODE}}', node).replaceAll('{{WAIT}}', wait)
}

export function prepareBrokerDir() {
  ensureDir(REQ_DIR)
  ensureDir(RES_DIR)
  writeFileSync(join(BROKER_DIR, 'CLAUDE.md'), renderTemplate())
  return BROKER_DIR
}

// Resident = the broker's wait loop wrote a heartbeat in the last few seconds.
export function heartbeat() {
  const hb = readJson(join(BROKER_DIR, 'heartbeat.json'), null)
  if (!hb) return { resident: false }
  const age = Date.now() - hb.at
  // "working" is written once at pickup, so it stays valid while the broker runs a long request.
  const resident = (['waiting', 'rearming'].includes(hb.state) && age < 6000) || (hb.state === 'working' && age < 180_000)
  return { resident, state: hb.state, ageMs: age }
}

export function brokerInfo() {
  const info = readJson(BROKER_FILE, null)
  if (!info?.sessionId) return { configured: false }
  const rec = getRecord(info.sessionId)
  const live = liveByHost().get(info.sessionId)
  const templateCurrent = existsSync(join(BROKER_DIR, 'CLAUDE.md')) && readFileSync(join(BROKER_DIR, 'CLAUDE.md'), 'utf8') === renderTemplate()
  return {
    configured: true,
    sessionId: info.sessionId,
    exists: !!rec,
    archived: rec?.isArchived ?? null,
    title: rec?.title ?? null,
    titleSource: rec?.titleSource ?? null,
    model: rec?.model ?? null,
    permissionMode: rec?.permissionMode ?? null,
    live: live ? { pid: live.pid, status: live.status, socket: live.messagingSocketPath } : null,
    resident: live ? heartbeat() : { resident: false },
    templateCurrent,
  }
}

export function saveBrokerInfo(info) {
  writeJsonAtomic(BROKER_FILE, info)
}

export function newRequestId() {
  return `r${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`
}

// ops: [{ op, args }]. Returns the broker's results array.
export async function brokerRequest(ops, { timeoutMs = 90_000, progress = () => {}, signal } = {}) {
  for (const o of ops) if (!BROKER_OPS.includes(o.op)) throw new DriverError(`op ${o.op} is not on the broker allowlist`, { category: 'bad_args' })
  return withLock('broker', async () => {
    const info = brokerInfo()
    if (!info.configured || !info.exists) throw new DriverError('no broker session; run `claude-driver broker init`', { category: 'broker_missing' })
    if (!info.templateCurrent) prepareBrokerDir()
    if (!info.live) throw new DriverError(`broker ${info.sessionId} has no live process (app restarted?); run \`claude-driver broker revive\``, { category: 'broker_dead' })
    const id = newRequestId()
    rmSync(join(BROKER_DIR, 'STOP'), { force: true })
    const request = { id, ops, createdAt: new Date().toISOString() }
    writeJsonAtomic(join(REQ_DIR, `${id}.json`), request)
    progress(`broker request ${id}: ${ops.map((o) => o.op).join(', ')}`)
    const t0 = Date.now()
    let via = { method: 'resident' }
    // A resident broker picks the file up itself; otherwise wake it into its loop.
    if (!info.resident?.resident) {
      via = await deliver(info, `claude-driver request ${id} v${protocolVersion()}`, { signal })
      progress(`delivered via ${via.method} in ${Date.now() - t0} ms; broker enters its resident loop`)
    }
    const resFile = join(RES_DIR, `${id}.json`)
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (signal?.aborted) throw new DriverError('cancelled', { category: 'cancelled' })
      if (existsSync(resFile)) {
        await sleep(100) // let the Write finish
        const res = readJson(resFile, null)
        if (res?.results) return { id, results: res.results, deliveredVia: via.method, ms: Date.now() - t0 }
      }
      await sleep(300)
    }
    throw new DriverError(`broker did not answer request ${id} within ${timeoutMs / 1000} s (delivered via ${via.method})`, { category: 'broker_timeout' })
  })
}

// One op, unwrapped: throws when the broker reports ok:false.
export async function brokerOp(op, args, opts) {
  const r = await brokerRequest([{ op, args }], opts)
  const first = r.results?.[0]
  if (!first) throw new DriverError(`broker returned no result for ${op}`, { category: 'broker_bad_result' })
  if (!first.ok) throw new DriverError(`${op} failed in the broker: ${first.error}`, { category: 'tier_b_failed', detail: first })
  return { result: first.result, deliveredVia: r.deliveredVia, ms: r.ms, requestId: r.id }
}

// Revive a dead broker. 1) Focus it by deep link: the app warm-spawns a
// focused session's process unless its CLI governor is at cap. 2) Otherwise
// Tier C types the wake line into its composer (a real send always spawns).
// Focus is restored right after each navigation; liveness is polled after.
export async function reviveBroker({ focus = 'restore', allowTierC = true, progress = () => {}, signal } = {}) {
  const { snapshot, restoreFrom, logSince, sessionUrl } = await import('./focus.mjs')
  const { openUrl } = await import('./paths.mjs')
  let info = brokerInfo()
  if (!info.configured || !info.exists) throw new DriverError('no broker session; run `claude-driver broker init`', { category: 'broker_missing' })
  if (info.live) return { method: 'already_live', live: info.live }
  const waitLive = async (ms, stopEarly = () => false) => {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
      if (brokerInfo().live) return true
      if (stopEarly()) return false
      await sleep(250)
    }
    return !!brokerInfo().live
  }
  const t0 = Date.now()
  // One snapshot, one restore: the whole revival is a single navigating batch.
  const before = focus === 'leave' ? null : await snapshot()
  const finish = async () => (before && focus === 'restore' ? restoreFrom(before, info.sessionId) : focus)
  progress('revive: focusing broker to trigger a warm spawn')
  await openUrl(sessionUrl(info.sessionId))
  const atCap = () => logSince(t0, /CliGovernor\] at cap; yielding warm spawn/).length > 0
  if (await waitLive(12_000, atCap)) return { method: 'warm_spawn', ms: Date.now() - t0, focus: await finish() }
  const capped = atCap()
  if (!allowTierC) {
    await finish()
    throw new DriverError(`broker did not warm-spawn${capped ? ' (app CLI governor at cap)' : ''}; Tier C disabled`, { category: 'broker_dead' })
  }
  progress(`revive: warm spawn ${capped ? 'blocked (governor at cap)' : 'did not happen'}; typing wake line via Tier C`)
  const { typeIntoComposer } = await import('./tierc.mjs')
  let tc
  let focusAction
  try {
    tc = await typeIntoComposer(BROKER_TITLE, `claude-driver wake v${protocolVersion()}`, { progress, signal, timeoutSec: 150 })
    await waitLive(30_000)
  } finally {
    focusAction = await finish()
  }
  if (brokerInfo().live) return { method: 'tier_c_wake', ms: Date.now() - t0, tierC: tc.status, focus: focusAction }
  throw new DriverError(`broker revival failed (warm spawn ${capped ? 'at cap' : 'none'}; Tier C status ${tc?.status}): ${tc?.text?.slice(0, 400)}`, { category: 'broker_dead' })
}
