// Focus policy (Taylor's hard rule): snapshot immediately before every
// navigating op, never reuse a snapshot across ops, and after the op restore
// only if the main window still shows what the op navigated to. If Taylor
// moved meanwhile, leave it alone. Then give the front back to whatever app
// was frontmost if it was not Claude.
//
// Modes: "restore" (default), "show" (leave the result in view, Claude in
// front), "leave" (do nothing after the op).

import { CLAUDE_BUNDLE_ID, openUrl, sh, sleep } from './paths.mjs'
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

export async function snapshot() {
  const [app] = await Promise.all([frontApp()])
  const disk = diskFocus()
  return { at: Date.now(), frontApp: app, mainSession: disk.primarySession || disk.lastFocused?.sessionId || null, source: 'disk' }
}

// Wait (bounded) for the disk view to report the op's target in front.
async function waitMain(target, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let cur = null
  while (Date.now() < deadline) {
    const d = diskFocus()
    cur = d.primarySession
    if (cur === target || d.lastFocused?.sessionId === target) return target
    await sleep(200)
  }
  return cur
}

// Run fn (which navigates to `target`, or returns { target }) under a mode.
export async function withFocus(mode = 'restore', fn, { settleMs = 3000 } = {}) {
  if (!FOCUS_MODES.includes(mode)) mode = 'restore'
  const before = mode === 'leave' ? null : await snapshot()
  const result = await fn()
  const target = result?.navigatedTo || null
  const report = { mode, before }
  if (mode === 'leave' || !target) return { result, focus: { ...report, action: 'none' } }
  if (mode === 'show') {
    await waitMain(target, settleMs)
    return { result, focus: { ...report, action: 'shown', target } }
  }
  const now = await waitMain(target, settleMs)
  const actions = []
  if (now === target && before.mainSession && before.mainSession !== target) {
    await openUrl(sessionUrl(before.mainSession))
    actions.push(`main window → ${before.mainSession}`)
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
  return { result, focus: { ...report, action: actions.join('; ') || 'nothing to restore', target } }
}
