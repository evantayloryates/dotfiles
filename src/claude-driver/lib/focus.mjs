// Focus policy (Taylor's hard rule): snapshot immediately before every
// navigating op, never reuse a snapshot across ops, and after the op restore
// only if the main window still shows what the op navigated to. If Taylor
// moved meanwhile, leave it alone. Then give the front back to whatever app
// was frontmost if it was not Claude.
//
// Modes: "restore" (default), "show" (leave the result in view, Claude in
// front), "leave" (do nothing after the op).
//
// Which session the main window shows comes from main.log's
// "LocalSessions.setFocusedSession: sessionId=…" lines (exact and
// timestamped), falling back to the pane store / lastFocusedAt on disk.
// Both matched get_window_layout; see docs/findings.md.

import { closeSync, openSync, readSync, statSync } from 'node:fs'

import { CLAUDE_BUNDLE_ID, MAIN_LOG, openUrl, sh, sleep } from './paths.mjs'
import { diskFocus } from './sessions.mjs'

export const FOCUS_MODES = ['restore', 'show', 'leave']

export async function frontApp() {
  try {
    const asn = (await sh('/usr/bin/lsappinfo', ['front'])).trim()
    const info = await sh('/usr/bin/lsappinfo', ['info', '-only', 'bundleid', asn])
    return info.match(/"CFBundleIdentifier"="([^"]+)"/)?.[1] || null
  } catch {
    return null
  }
}

export function sessionUrl(localId) {
  return `claude://claude.ai/epitaxy/${localId}`
}

export function tailFile(file, bytes = 96 * 1024) {
  let fd
  try {
    const size = statSync(file).size
    const start = Math.max(0, size - bytes)
    const buf = Buffer.alloc(size - start)
    fd = openSync(file, 'r')
    readSync(fd, buf, 0, buf.length, start)
    return buf.toString('utf8')
  } catch {
    return ''
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

const logTime = (line) => {
  const m = line.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/)
  return m ? new Date(`${m[1]}T${m[2]}`).getTime() : 0
}

// Latest non-null focused session per main.log, or null if none in the tail.
export function logFocus() {
  const lines = tailFile(MAIN_LOG).split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/LocalSessions\.setFocusedSession: sessionId=(local_[0-9a-f-]+)/)
    if (m) return { sessionId: m[1], at: logTime(lines[i]) }
  }
  return null
}

// main.log lines since a wall-clock time (second resolution), for signals like
// "[CliGovernor] at cap; yielding warm spawn".
export function logSince(sinceMs, pattern) {
  const floor = Math.floor(sinceMs / 1000) * 1000
  return tailFile(MAIN_LOG)
    .split('\n')
    .filter((l) => logTime(l) >= floor && (!pattern || pattern.test(l)))
}

export function currentMain() {
  const lf = logFocus()
  if (lf) return { sessionId: lf.sessionId, source: 'main.log' }
  const d = diskFocus()
  return { sessionId: d.primarySession || d.lastFocused?.sessionId || null, source: 'disk' }
}

export async function snapshot() {
  const app = await frontApp()
  const main = currentMain()
  return { at: Date.now(), frontApp: app, mainSession: main.sessionId, source: main.source }
}

async function waitMain(target, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let cur = null
  while (Date.now() < deadline) {
    cur = currentMain().sessionId
    if (cur === target) return cur
    await sleep(150)
  }
  return cur
}

// Restore after a navigation to `target`, given the pre-op snapshot.
export async function restoreFrom(before, target, { settleMs = 3000 } = {}) {
  const now = await waitMain(target, settleMs)
  const actions = []
  if (now === target && before.mainSession && before.mainSession !== target) {
    await openUrl(sessionUrl(before.mainSession))
    // Wait for the app to land it, so the next op's snapshot is not stale.
    const landed = (await waitMain(before.mainSession, settleMs)) === before.mainSession
    actions.push(`main window → ${before.mainSession}${landed ? '' : ' (not confirmed)'}`)
  } else if (now !== target && now !== before.mainSession) {
    actions.push(`left alone: main window shows ${now}, not the op's target (Taylor moved)`)
  } else if (now !== target) {
    actions.push('main window never moved to the target')
  }
  if (before.frontApp && before.frontApp !== CLAUDE_BUNDLE_ID) {
    const nowFront = await frontApp()
    if (nowFront === CLAUDE_BUNDLE_ID) {
      await sh('/usr/bin/open', ['-b', before.frontApp]).catch(() => {})
      actions.push(`front app → ${before.frontApp}`)
    } else if (nowFront !== before.frontApp) actions.push(`front app left alone: ${nowFront}`)
  }
  return actions.join('; ') || 'nothing to restore'
}

// Run fn (which returns { navigatedTo, ... }) under a focus mode.
export async function withFocus(mode = 'restore', fn, opts = {}) {
  if (!FOCUS_MODES.includes(mode)) mode = 'restore'
  const before = mode === 'leave' ? null : await snapshot()
  const result = await fn()
  const target = result?.navigatedTo || null
  if (mode === 'leave' || !target) return { result, focus: { mode, before, action: 'none' } }
  if (mode === 'show') {
    await waitMain(target, opts.settleMs ?? 3000)
    return { result, focus: { mode, before, action: 'shown', target } }
  }
  const action = await restoreFrom(before, target, opts)
  return { result, focus: { mode, before, action, target } }
}
